import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import { getCurrentMajorDrawForDisplay } from "@/utils/draws/major-draw-helpers";
import { format } from "date-fns";

/**
 * GET /api/admin/major-draw/current-and-last
 * Get current and last draw date ranges for filtering
 * Returns activationDate and drawDate for both draws
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Get current draw (active, frozen, queued, or latest completed)
    const currentDraw = await getCurrentMajorDrawForDisplay(true);

    // Get last completed draw (before current draw's activation)
    let lastDraw = null;
    if (currentDraw?.activationDate) {
      lastDraw = await MajorDraw.findOne({
        status: "completed",
        drawDate: { $lt: currentDraw.activationDate },
      })
        .sort({ drawDate: -1 })
        .select("activationDate drawDate name");
    } else {
      // If no current draw, get the most recent completed draw
      lastDraw = await MajorDraw.findOne({
        status: "completed",
      })
        .sort({ drawDate: -1 })
        .select("activationDate drawDate name");
    }

    // Format dates as YYYY-MM-DD strings
    const formatDate = (date: Date | undefined): string | null => {
      if (!date) return null;
      return format(new Date(date), "yyyy-MM-dd");
    };

    const response = {
      success: true,
      data: {
        currentDraw: currentDraw
          ? {
              activationDate: formatDate(currentDraw.activationDate),
              drawDate: formatDate(currentDraw.drawDate),
              name: currentDraw.name,
            }
          : null,
        lastDraw: lastDraw
          ? {
              activationDate: formatDate(lastDraw.activationDate),
              drawDate: formatDate(lastDraw.drawDate),
              name: lastDraw.name,
            }
          : null,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Error fetching current and last draw dates:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch draw dates",
      },
      { status: 500 }
    );
  }
}

