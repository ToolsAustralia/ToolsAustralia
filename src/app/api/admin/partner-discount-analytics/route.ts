import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import PartnerDiscountAnalyticsService, {
  resolvePartnerDiscountAnalyticsRange,
} from "@/services/partner-discount-analytics/PartnerDiscountAnalyticsService";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "custom"]).optional().default("today"),
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
});

/**
 * GET /api/admin/partner-discount-analytics
 *
 * Per-surface funnel for the two partner-discount catalogues: visits, engagement (filters,
 * offer opens, access-seam reach, unlock clicks, portal hand-offs), signups, conversions and
 * revenue.
 *
 * Gated by `pageAnalytics.view` — the same permission as the three sibling reads rendered on
 * the Page Analytics tab, which is where this one is displayed. No new permission was added:
 * this is the same class of data for the same audience.
 *
 * Query: dateRange, startDate (custom), endDate (custom)
 *
 * @see docs/partner/analytics.md
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("pageAnalytics.view");
    if (guard instanceof NextResponse) return guard;

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
      // name drift on the promo route — `input.range` was always undefined, the `?? "today"`
      // default won, and EVERY requested range silently returned today, invisible to `tsc`.
      // An explicit mapping makes a future rename a compile error.
      range = resolvePartnerDiscountAnalyticsRange({
        dateRange: parsed.data.dateRange,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error).message }, { status: 400 });
    }

    const summary = await PartnerDiscountAnalyticsService.getAggregatedMetrics(
      range.start,
      range.end
    );

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
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
    console.error("[partner-discount-analytics] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load partner discount analytics" },
      { status: 500 }
    );
  }
}
