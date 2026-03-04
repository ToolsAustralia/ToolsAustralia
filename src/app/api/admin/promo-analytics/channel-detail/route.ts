import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PromoAnalyticsService from "@/services/promo-analytics/PromoAnalyticsService";
import { getStartOfTodayInAEST, createAESTDateAsUTC } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";

const AEST_TIMEZONE = "Australia/Sydney";

const querySchema = z.object({
  utmSource: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * GET /api/admin/promo-analytics/channel-detail
 *
 * Get channel-level detail: pages receiving traffic from this channel
 * and breakdown by campaign within the channel.
 * Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      utmSource: searchParams.get("utmSource"),
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { utmSource, startDate, endDate } = parsed.data;

    let rangeStart: Date;
    let rangeEnd: Date;

    if (startDate && endDate) {
      rangeStart = new Date(startDate);
      rangeEnd = new Date(endDate);
      rangeEnd.setHours(23, 59, 59, 999);
    } else {
      const startOfToday = getStartOfTodayInAEST();
      const now = new Date();
      const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
      const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
      const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
      const endOfToday = createAESTDateAsUTC(todayYear, todayMonth, todayDay, 23, 59);
      endOfToday.setUTCSeconds(59, 999);
      rangeStart = startOfToday;
      rangeEnd = endOfToday;
    }

    const data = await PromoAnalyticsService.getChannelDetailMetrics(
      utmSource,
      rangeStart,
      rangeEnd
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[promo-analytics/channel-detail] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load channel detail analytics" },
      { status: 500 }
    );
  }
}
