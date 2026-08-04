import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import PromoAnalyticsService, {
  resolvePromoAnalyticsRange,
} from "@/services/promo-analytics/PromoAnalyticsService";
import { z } from "zod";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "custom"]).optional().default("today"),
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
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
    const _guard = await requirePermission("pageAnalytics.view");
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
      // Mapped field-by-field on purpose. Passing `parsed.data` wholesale is what let the key
      // name drift from `dateRange` to `range` unnoticed — every range silently resolved to
      // today. An explicit mapping makes any future rename of the Zod key a compile error.
      range = resolvePromoAnalyticsRange({
        dateRange: parsed.data.dateRange,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: (e as Error).message },
        { status: 400 }
      );
    }

    const [summary, channelSummary, builtPrizeSummary, toolboxSummary] = await Promise.all([
      PromoAnalyticsService.getAggregatedMetrics(range.start, range.end),
      PromoAnalyticsService.getAggregatedByChannel(range.start, range.end),
      PromoAnalyticsService.getAggregatedByBuiltPrize(range.start, range.end),
      PromoAnalyticsService.getAggregatedByToolbox(range.start, range.end),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        byChannel: channelSummary.byChannel,
        byBuiltPrize: builtPrizeSummary.byBuiltPrize,
        byToolbox: toolboxSummary.byToolbox,
        dateRange: {
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          // Surfaced so the UI can say WHY an older range returned less than asked for.
          // Visit rows are TTL-deleted; signups and revenue are not.
          visitsRetainedFrom: range.visitsRetainedFrom.toISOString(),
          clampedToRetention: range.clampedToRetention,
        },
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
