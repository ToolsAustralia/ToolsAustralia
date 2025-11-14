import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MiniDraw, { IMiniDraw } from "@/models/MiniDraw";
import { Types } from "mongoose";
import mongoose from "mongoose";

/**
 * GET /api/admin/mini-draw/[id]
 * Get mini draw details for editing
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Validate ObjectId
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid mini draw ID" }, { status: 400 });
    }

    // Find the mini draw (exclude entries array for editing view)
    const miniDraw = (await MiniDraw.findById(id).select("-entries -winner -__v").lean()) as IMiniDraw | null;

    if (!miniDraw) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        miniDraw: {
          _id: (miniDraw._id as mongoose.Types.ObjectId).toString(),
          name: miniDraw.name,
          description: miniDraw.description,
          status: miniDraw.status,
          cycle: miniDraw.cycle ?? 1,
          latestWinnerId: miniDraw.latestWinnerId?.toString(),
          winnerHistory: (miniDraw.winnerHistory || []).map((winnerId) => winnerId.toString()),
          configurationLocked: miniDraw.configurationLocked,
          lockedAt: miniDraw.lockedAt?.toISOString(),
          prize: miniDraw.prize,
          totalEntries: miniDraw.totalEntries,
          minimumEntries: miniDraw.minimumEntries,
          entriesRemaining: Math.max((miniDraw.minimumEntries || 0) - (miniDraw.totalEntries || 0), 0),
          createdAt: miniDraw.createdAt.toISOString(),
          updatedAt: miniDraw.updatedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("❌ Error fetching mini draw:", error);
    return NextResponse.json(
      { error: "Failed to fetch mini draw", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
