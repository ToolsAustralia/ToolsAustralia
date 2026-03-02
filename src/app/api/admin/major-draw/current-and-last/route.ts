import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import { getCurrentMajorDrawForDisplay } from "@/utils/draws/major-draw-helpers";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * GET /api/admin/major-draw/current-and-last
 * Get current and last draw date ranges for filtering
 * Returns activationDate and drawDate for both draws
 */
export async function GET(_request: NextRequest) {
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

    // Format dates as YYYY-MM-DD strings in AEST timezone
    const formatDate = (date: Date | undefined): string | null => {
      if (!date) return null;
      // Format the date in AEST timezone to ensure correct date representation
      return formatInTimeZone(new Date(date), AEST_TIMEZONE, "yyyy-MM-dd");
    };

    // Calculate date ranges ensuring no overlap
    let currentDrawStartDate: string | null = null;
    let currentDrawEndDate: string | null = null;
    let lastDrawStartDate: string | null = null;
    let lastDrawEndDate: string | null = null;

    if (currentDraw?.drawDate) {
      // For current draw, start date should be the day after last draw's end date
      // This ensures no overlap between draws
      if (lastDraw?.drawDate) {
        // Get last draw's drawDate in AEST
        const lastDrawEndYear = parseInt(formatInTimeZone(lastDraw.drawDate, AEST_TIMEZONE, "yyyy"), 10);
        const lastDrawEndMonth = parseInt(formatInTimeZone(lastDraw.drawDate, AEST_TIMEZONE, "M"), 10);
        const lastDrawEndDay = parseInt(formatInTimeZone(lastDraw.drawDate, AEST_TIMEZONE, "d"), 10);
        
        // Add 1 day to last draw's end date to get current draw's start date
        const lastDrawEndDateAEST = createAESTDateAsUTC(lastDrawEndYear, lastDrawEndMonth, lastDrawEndDay, 0, 0);
        const currentDrawStart = addDays(lastDrawEndDateAEST, 1);
        
        // Format the start date in AEST
        currentDrawStartDate = formatInTimeZone(currentDrawStart, AEST_TIMEZONE, "yyyy-MM-dd");
      } else {
        // No last draw, use activationDate as is
        currentDrawStartDate = formatDate(currentDraw.activationDate);
      }
      currentDrawEndDate = formatDate(currentDraw.drawDate);
    }

    if (lastDraw?.activationDate && lastDraw?.drawDate) {
      lastDrawStartDate = formatDate(lastDraw.activationDate);
      // Last draw ends on its drawDate (inclusive)
      lastDrawEndDate = formatDate(lastDraw.drawDate);
    }

    const response = {
      success: true,
      data: {
        currentDraw: currentDraw && currentDrawStartDate && currentDrawEndDate
          ? {
              activationDate: currentDrawStartDate,
              drawDate: currentDrawEndDate,
              name: currentDraw.name,
            }
          : null,
        lastDraw: lastDraw && lastDrawStartDate && lastDrawEndDate
          ? {
              activationDate: lastDrawStartDate,
              drawDate: lastDrawEndDate,
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



