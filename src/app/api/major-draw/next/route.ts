import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { getNextQueuedDraw } from "@/utils/draws/major-draw-helpers";

// Next.js ISR configuration
export const revalidate = 60; // Revalidate every 60 seconds (ISR)

/**
 * GET /api/major-draw/next
 * Get the next queued major draw name
 */
export async function GET() {
  try {
    await connectDB();

    const nextDraw = await getNextQueuedDraw();

    if (!nextDraw) {
      return NextResponse.json(
        {
          success: false,
          nextDraw: null,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60", // Cache 30s, serve stale up to 1min
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        nextDraw: {
          name: nextDraw.name,
          _id: String(nextDraw._id),
          activationDate: nextDraw.activationDate ? nextDraw.activationDate.toISOString() : null,
          prize: nextDraw.prize
            ? {
                name: nextDraw.prize.name,
                images: nextDraw.prize.images || [],
              }
            : undefined,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60", // Cache 30s, serve stale up to 1min
        },
      }
    );
  } catch (error) {
    console.error("Error fetching next draw:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}

