import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { getNextQueuedDraw } from "@/utils/draws/major-draw-helpers";

/**
 * GET /api/major-draw/next
 * Get the next queued major draw name
 */
export async function GET() {
  try {
    await connectDB();

    const nextDraw = await getNextQueuedDraw();

    if (!nextDraw) {
      return NextResponse.json({
        success: false,
        nextDraw: null,
      });
    }

      return NextResponse.json({
        success: true,
        nextDraw: {
          name: nextDraw.name,
          _id: String(nextDraw._id),
        },
      });
  } catch (error) {
    console.error("Error fetching next draw:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

