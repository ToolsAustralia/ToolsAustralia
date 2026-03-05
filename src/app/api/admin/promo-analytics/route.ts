import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PromoAnalyticsService from "@/services/promo-analytics/PromoAnalyticsService";
import { getStartOfTodayInAEST, createAESTDateAsUTC } from "@/utils/common/timezone";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";

const AEST_TIMEZONE = "Australia/Sydney";

const querySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "custom"]).optional().default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * GET /api/admin/promo-analytics
 *
 * Get aggregated promotion analytics by page (visits, signups, conversions, revenue).
 * Admin only.
 *
 * Query: dateRange, startDate (custom), endDate (custom)
 *
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      dateRange: searchParams.get("dateRange") || "today",
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { dateRange, startDate, endDate } = parsed.data;

    const startOfToday = getStartOfTodayInAEST();
    const now = new Date();
    const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
    const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
    const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
    const endOfToday = createAESTDateAsUTC(todayYear, todayMonth, todayDay, 23, 59);
    endOfToday.setUTCSeconds(59, 999);

    let rangeStart: Date;
    let rangeEnd: Date;

    if (dateRange === "custom" && startDate && endDate) {
      const [startY, startM, startD] = startDate.split("-").map(Number);
      const [endY, endM, endD] = endDate.split("-").map(Number);
      rangeStart = createAESTDateAsUTC(startY, startM, startD, 0, 0);
      rangeEnd = createAESTDateAsUTC(endY, endM, endD, 23, 59);
      rangeEnd.setUTCSeconds(59, 999);
    } else {
      switch (dateRange) {
        case "today":
          rangeStart = startOfToday;
          rangeEnd = endOfToday;
          break;
        case "yesterday":
          rangeStart = subDays(startOfToday, 1);
          rangeEnd = new Date(startOfToday.getTime() - 1);
          break;
        default:
          // custom or fallback: requires startDate/endDate (handled above)
          rangeStart = subDays(startOfToday, 6);
          rangeEnd = endOfToday;
      }
    }

    const [summary, utmSummary] = await Promise.all([
      PromoAnalyticsService.getAggregatedMetrics(rangeStart, rangeEnd),
      PromoAnalyticsService.getAggregatedByUTMSource(rangeStart, rangeEnd),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        byUTMSource: utmSummary.byUTMSource,
        dateRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
      },
    });
  } catch (error) {
    console.error("[promo-analytics] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load promo analytics" },
      { status: 500 }
    );
  }
}
