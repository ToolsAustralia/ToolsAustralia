import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";

/**
 * GET /api/major-draw/completed
 * Get all completed major draws with winner information
 */
export async function GET() {
  try {
    await connectDB();

    // Get completed major draws with populated winner information
    const completedDraws = await MajorDraw.find({
      status: "completed",
    })
      .populate({
        path: "winner.userId",
        select: "firstName lastName email state",
      })
      .populate({
        path: "winner.selectedBy",
        select: "firstName lastName",
      })
      .sort({ drawDate: -1 }) // Most recent first
      .lean();

    // Transform the data to include winner details
    const drawsWithWinners = completedDraws.map((draw) => {
      const winnerInfo = draw.winner?.userId
        ? {
            name: `${draw.winner.userId.firstName} ${draw.winner.userId.lastName}`,
            state: draw.winner.userId.state,
            email: draw.winner.userId.email,
            entryNumber: draw.winner.entryNumber,
            selectedDate: draw.winner.selectedDate,
            notified: draw.winner.notified,
            selectionMethod: draw.winner.selectionMethod,
            selectedBy: draw.winner.selectedBy
              ? `${draw.winner.selectedBy.firstName} ${draw.winner.selectedBy.lastName}`
              : null,
          }
        : null;

      return {
        _id: draw._id,
        name: draw.name,
        description: draw.description,
        prize: draw.prize,
        drawDate: draw.drawDate,
        totalEntries: draw.totalEntries,
        participantCount: draw.entries.length,
        winner: winnerInfo,
        createdAt: draw.createdAt,
        updatedAt: draw.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        draws: drawsWithWinners,
        total: drawsWithWinners.length,
      },
    });
  } catch (error) {
    console.error("Error fetching completed major draws:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch completed major draws",
      },
      { status: 500 }
    );
  }
}
