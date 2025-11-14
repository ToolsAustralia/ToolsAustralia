/**
 * Admin API: Select Winner for Major Draw
 *
 * POST /api/admin/major-draw/select-winner
 *
 * Allows admin to manually record the winner selected via government app.
 * Can only be done after freeze period starts.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import User from "@/models/User";
import mongoose from "mongoose";
import { z } from "zod";

// Validation schema
const selectWinnerSchema = z.object({
  majorDrawId: z.string(),
  winnerUserId: z.string(),
  entryNumber: z.number().int().positive(),
  selectionMethod: z.enum(["manual", "government-app"]).default("government-app"),
});

/**
 * POST handler for selecting winner
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = selectWinnerSchema.parse(body);

    // Get major draw
    const majorDraw = await MajorDraw.findById(validatedData.majorDrawId);
    if (!majorDraw) {
      return NextResponse.json({ error: "Major draw not found" }, { status: 404 });
    }

    // Check if draw is in correct status (frozen or completed)
    if (majorDraw.status !== "frozen" && majorDraw.status !== "completed") {
      return NextResponse.json(
        {
          error: "Can only select winner after freeze period starts",
          currentStatus: majorDraw.status,
        },
        { status: 400 }
      );
    }

    // Check if winner already selected
    if (majorDraw.winner && 
        majorDraw.winner.userId && 
        majorDraw.winner.entryNumber &&
        majorDraw.winner.userId.toString() !== 'null' &&
        majorDraw.winner.userId.toString() !== 'undefined') {
      return NextResponse.json(
        {
          error: "Winner already selected for this draw",
          existingWinner: {
            userId: majorDraw.winner.userId,
            entryNumber: majorDraw.winner.entryNumber,
            selectedDate: majorDraw.winner.selectedDate,
          },
        },
        { status: 400 }
      );
    }

    // Verify winner user exists
    const winnerUser = await User.findById(validatedData.winnerUserId);
    if (!winnerUser) {
      return NextResponse.json({ error: "Winner user not found" }, { status: 404 });
    }

    // Verify user has entries in this draw
    const userEntry = majorDraw.entries.find(
      (entry: { userId: { toString: () => string } }) => entry.userId.toString() === validatedData.winnerUserId
    );

    if (!userEntry) {
      return NextResponse.json(
        {
          error: "User has no entries in this draw",
          userId: validatedData.winnerUserId,
        },
        { status: 400 }
      );
    }

    // Verify entry number is within valid range
    if (validatedData.entryNumber > majorDraw.totalEntries || validatedData.entryNumber < 1) {
      return NextResponse.json(
        {
          error: `Entry number must be between 1 and ${majorDraw.totalEntries}`,
          providedEntryNumber: validatedData.entryNumber,
        },
        { status: 400 }
      );
    }

    // Record winner
    majorDraw.winner = {
      userId: new mongoose.Types.ObjectId(validatedData.winnerUserId),
      entryNumber: validatedData.entryNumber,
      selectedDate: new Date(),
      notified: false,
      selectedBy: new mongoose.Types.ObjectId(session.user.id),
      selectionMethod: validatedData.selectionMethod,
    };

    // Update draw status to completed if not already
    if (majorDraw.status !== "completed") {
      majorDraw.status = "completed";
      majorDraw.isActive = false;
    }

    await majorDraw.save();

    // TODO: Send winner notification (SMS/Email)
    // This would be implemented later with your notification system

    return NextResponse.json(
      {
        success: true,
        message: "Winner selected successfully",
        winner: {
          userId: winnerUser._id,
          name: `${winnerUser.firstName} ${winnerUser.lastName}`,
          email: winnerUser.email,
          entryNumber: validatedData.entryNumber,
          selectionMethod: validatedData.selectionMethod,
          selectedDate: majorDraw.winner.selectedDate,
          selectedBy: session.user.email,
        },
        majorDraw: {
          id: majorDraw._id,
          name: majorDraw.name,
          totalEntries: majorDraw.totalEntries,
          status: majorDraw.status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error selecting winner:", error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to select winner",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler - Get current winner if exists
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    // Get major draw ID from query params
    const searchParams = request.nextUrl.searchParams;
    const majorDrawId = searchParams.get("majorDrawId");

    if (!majorDrawId) {
      return NextResponse.json({ error: "majorDrawId is required" }, { status: 400 });
    }

    // Get major draw
    const majorDraw = await MajorDraw.findById(majorDrawId);
    if (!majorDraw) {
      return NextResponse.json({ error: "Major draw not found" }, { status: 404 });
    }

    // If no winner, return null
    if (!majorDraw.winner) {
      return NextResponse.json(
        {
          hasWinner: false,
          majorDraw: {
            id: majorDraw._id,
            name: majorDraw.name,
            status: majorDraw.status,
            totalEntries: majorDraw.totalEntries,
          },
        },
        { status: 200 }
      );
    }

    // Get winner user details
    const winnerUser = await User.findById(majorDraw.winner.userId).select("firstName lastName email mobile state");

    return NextResponse.json(
      {
        hasWinner: true,
        winner: {
          userId: majorDraw.winner.userId,
          user: winnerUser
            ? {
                name: `${winnerUser.firstName} ${winnerUser.lastName}`,
                email: winnerUser.email,
                mobile: winnerUser.mobile,
                state: winnerUser.state,
              }
            : null,
          entryNumber: majorDraw.winner.entryNumber,
          selectedDate: majorDraw.winner.selectedDate,
          notified: majorDraw.winner.notified,
          selectionMethod: majorDraw.winner.selectionMethod,
        },
        majorDraw: {
          id: majorDraw._id,
          name: majorDraw.name,
          status: majorDraw.status,
          totalEntries: majorDraw.totalEntries,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error getting winner:", error);
    return NextResponse.json(
      {
        error: "Failed to get winner",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
