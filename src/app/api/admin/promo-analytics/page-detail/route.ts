import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import PromoAnalyticsService from "@/services/promo-analytics/PromoAnalyticsService";
import { getStartOfTodayInAEST, createAESTDateAsUTC } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";

const AEST_TIMEZONE = "Australia/Sydney";

const querySchema = z.object({
  pageType: z.enum(["evergreen", "toolset"]),
  slug: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * GET /api/admin/promo-analytics/page-detail
 *
 * Get per-page UTM campaign breakdown (which ads/emails drove traffic).
 * Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const _guard = await requirePermission("promos.view");
    if (_guard instanceof NextResponse) return _guard;

    const searchParams = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      pageType: searchParams.get("pageType"),
      slug: searchParams.get("slug"),
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { pageType, slug, startDate, endDate } = parsed.data;

    let rangeStart: Date;
    let rangeEnd: Date;

    if (startDate && endDate) {
      const [startY, startM, startD] = startDate.split("-").map(Number);
      const [endY, endM, endD] = endDate.split("-").map(Number);
      rangeStart = createAESTDateAsUTC(startY, startM, startD, 0, 0);
      rangeEnd = createAESTDateAsUTC(endY, endM, endD, 23, 59);
      rangeEnd.setUTCSeconds(59, 999);
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

    const data = await PromoAnalyticsService.getPageDetailMetrics(
      pageType,
      slug,
      rangeStart,
      rangeEnd
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[promo-analytics/page-detail] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load page detail analytics" },
      { status: 500 }
    );
  }
}
