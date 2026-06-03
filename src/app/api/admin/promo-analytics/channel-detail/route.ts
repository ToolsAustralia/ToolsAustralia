import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import PromoAnalyticsService, {
  resolvePromoAnalyticsRange,
} from "@/services/promo-analytics/PromoAnalyticsService";
import { z } from "zod";

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
    const _guard = await requirePermission("promos.view");
    if (_guard instanceof NextResponse) return _guard;

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
    const hasCustom = !!(startDate && endDate);
    let range;
    try {
      range = resolvePromoAnalyticsRange({
        range: hasCustom ? "custom" : "today",
        startDate,
        endDate,
      });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: (e as Error).message },
        { status: 400 }
      );
    }

    const data = await PromoAnalyticsService.getChannelDetailMetrics(
      utmSource,
      range.start,
      range.end
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
