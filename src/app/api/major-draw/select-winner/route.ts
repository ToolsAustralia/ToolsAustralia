import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import User from "@/models/User";
import Winner from "@/models/Winner";
import { requirePermission } from "@/lib/api-auth-permissions";
import { klaviyo } from "@/lib/klaviyo";
import { createMajorDrawWonEvent } from "@/utils/integrations/klaviyo/klaviyo-events";
import mongoose, { Types } from "mongoose";

/**
 * POST /api/major-draw/select-winner
 * Select a random winner for the major draw
 */
export async function POST() {
  try {
    console.log("🎯 Selecting major draw winner...");

    // Verify staff permission before hitting the database
    const guard = await requirePermission("majorDraw.selectWinner");
    if (guard instanceof NextResponse) return guard;
    const { session } = guard;

    await connectDB();

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

    // Check if winner already selected (from Winner model)
    const existingWinner = await Winner.findOne({
      drawId: majorDraw._id,
      drawType: "major",
    });

    if (existingWinner) {
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

    // Use transaction for atomic operations
    const mongooseSession = await mongoose.startSession();
    mongooseSession.startTransaction();

    try {
      // Create Winner document (like admin route)
      const selectedDate = new Date();
      const [winnerDoc] = await Winner.create(
        [
          {
            drawId: majorDraw._id,
            drawType: "major",
            userId: new Types.ObjectId(winningEntry.userId),
            entryNumber: winningEntryNumber,
            selectedDate,
            selectedBy: new Types.ObjectId(session.user.id),
            selectionMethod: undefined, // Random selection
            notified: false,
            prizeSnapshot: {
              name: majorDraw.prize?.name || "",
              description: majorDraw.prize?.description || "",
              value: majorDraw.prize?.value || 0,
              images: majorDraw.prize?.images || [],
            },
            imageUrl: undefined, // No image for random selection
            cycle: 1, // Major draws are single-cycle
          },
        ],
        { session: mongooseSession }
      );

      // Update major draw status
      majorDraw.status = "completed";
      majorDraw.isActive = false;
      await majorDraw.save({ session: mongooseSession });

      await mongooseSession.commitTransaction();

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
          selectedDate: winnerDoc.selectedDate,
          totalEntries: majorDraw.totalEntries,
        },
      });
    } catch (error) {
      await mongooseSession.abortTransaction();
      throw error;
    } finally {
      mongooseSession.endSession();
    }
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
