import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { klaviyo } from "@/lib/klaviyo";
import { createMajorDrawWonEvent } from "@/utils/integrations/klaviyo/klaviyo-events";

/**
 * POST /api/major-draw/select-winner
 * Select a random winner for the major draw
 */
export async function POST() {
  try {
    console.log("🎯 Selecting major draw winner...");

    // Check if user is admin
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // Get user to check role
    await connectDB();
    const user = await User.findById(session.user.id);
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: "Admin access required",
        },
        { status: 403 }
      );
    }

    // Get the active major draw
    const majorDraw = await MajorDraw.findOne({ isActive: true }).sort({ createdAt: -1 });

    if (!majorDraw) {
      return NextResponse.json(
        {
          success: false,
          error: "No active major draw found",
        },
        { status: 404 }
      );
    }

    // Check if there are entries
    if (majorDraw.entries.length === 0 || majorDraw.totalEntries === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No entries found in major draw",
        },
        { status: 400 }
      );
    }

    // Check if winner already selected
    if (majorDraw.winner) {
      return NextResponse.json(
        {
          success: false,
          error: "Winner already selected for this major draw",
        },
        { status: 400 }
      );
    }

    // Generate weighted random selection based on entry counts
    // Create a weighted array where each user appears as many times as they have entries
    const weightedEntries: Array<{ userId: string; totalEntries: number }> = [];

    majorDraw.entries.forEach((entry: { userId: { toString(): string }; totalEntries: number }) => {
      for (let i = 0; i < entry.totalEntries; i++) {
        weightedEntries.push({
          userId: entry.userId.toString(),
          totalEntries: entry.totalEntries,
        });
      }
    });

    // Select random winner from weighted entries
    const randomIndex = Math.floor(Math.random() * weightedEntries.length);
    const winningEntry = weightedEntries[randomIndex];
    const winningEntryNumber = randomIndex + 1; // Entry numbers start from 1

    // Update major draw with winner
    majorDraw.winner = {
      userId: winningEntry.userId,
      entryNumber: winningEntryNumber,
      selectedDate: new Date(),
      notified: false,
    };

    await majorDraw.save();

    // Get winner details
    const winner = await User.findById(winningEntry.userId).select("firstName lastName email");

    console.log(`✅ Winner selected: ${winner?.firstName} ${winner?.lastName} (Entry #${winningEntryNumber})`);

    // Track winner notification in Klaviyo (non-blocking)
    if (winner) {
      klaviyo.trackEventBackground(
        createMajorDrawWonEvent(winner as never, {
          majorDrawId: majorDraw._id.toString(),
          majorDrawName: majorDraw.name,
          prizeName: majorDraw.prize?.name,
          prizeValue: majorDraw.prize?.value,
          entryNumber: winningEntryNumber,
          totalEntries: majorDraw.totalEntries,
        })
      );
    }

    return NextResponse.json({
      success: true,
      message: "Winner selected successfully",
      data: {
        winner: {
          userId: winner?._id,
          firstName: winner?.firstName,
          lastName: winner?.lastName,
          email: winner?.email,
        },
        entryNumber: winningEntryNumber,
        selectedDate: majorDraw.winner.selectedDate,
        totalEntries: majorDraw.totalEntries,
      },
    });
  } catch (error) {
    console.error("❌ Error selecting major draw winner:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
