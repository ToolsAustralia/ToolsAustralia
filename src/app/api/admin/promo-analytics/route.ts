import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import PromoAnalyticsService, {
  resolvePromoAnalyticsRange,
} from "@/services/promo-analytics/PromoAnalyticsService";
import { z } from "zod";

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
    const _guard = await requirePermission("promos.view");
    if (_guard instanceof NextResponse) return _guard;

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

    let range;
    try {
      range = resolvePromoAnalyticsRange(parsed.data);
    } catch (e) {
      return NextResponse.json(
        { success: false, error: (e as Error).message },
        { status: 400 }
      );
    }

    const [summary, utmSummary, builtPrizeSummary] = await Promise.all([
      PromoAnalyticsService.getAggregatedMetrics(range.start, range.end),
      PromoAnalyticsService.getAggregatedByUTMSource(range.start, range.end),
      PromoAnalyticsService.getAggregatedByBuiltPrize(range.start, range.end),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        byUTMSource: utmSummary.byUTMSource,
        byBuiltPrize: builtPrizeSummary.byBuiltPrize,
        dateRange: { start: range.start.toISOString(), end: range.end.toISOString() },
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
