import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import PromoAnalyticsService, {
  resolvePromoAnalyticsRange,
} from "@/services/promo-analytics/PromoAnalyticsService";
import { z } from "zod";

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
    const _guard = await requirePermission("pageAnalytics.view");
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
    const hasCustom = !!(startDate && endDate);
    let range;
    try {
      range = resolvePromoAnalyticsRange({
        dateRange: hasCustom ? "custom" : "today",
        startDate,
        endDate,
      });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: (e as Error).message },
        { status: 400 }
      );
    }

    const data = await PromoAnalyticsService.getPageDetailMetrics(
      pageType,
      slug,
      range.start,
      range.end
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
