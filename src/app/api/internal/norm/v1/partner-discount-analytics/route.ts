import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPartnerDiscountAnalyticsSummarySchema } from "@/lib/internal-norm/schemas/partner-discount-analytics";
import PartnerDiscountAnalyticsService, {
  resolvePartnerDiscountAnalyticsRange,
} from "@/services/partner-discount-analytics/PartnerDiscountAnalyticsService";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const QuerySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "custom"]).default("today"),
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
});

/**
 * Mirrors GET /api/admin/partner-discount-analytics by wrapping the SAME service, so the two
 * cannot drift. Aggregate-only — the projection contains no per-person field at all.
 */
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "partner-discount-analytics.summary",
    requiredPermission: "pageAnalytics.view",
    responseSchema: NormPartnerDiscountAnalyticsSummarySchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    let range;
    try {
      // Mapped field-by-field on purpose — see the admin summary route for why.
      range = resolvePartnerDiscountAnalyticsRange({
        dateRange: parsed.data.dateRange,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
    } catch (e) {
      return ctx.error(400, "bad_query", (e as Error).message);
    }

    const summary = await PartnerDiscountAnalyticsService.getAggregatedMetrics(
      range.start,
      range.end
    );

    return ctx.ok({
      dateRange: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        visitsRetainedFrom: range.visitsRetainedFrom.toISOString(),
        clampedToRetention: range.clampedToRetention,
      },
      totalVisits: summary.totalVisits,
      totalSignups: summary.totalSignups,
      totalConversions: summary.totalConversions,
      totalRevenue: summary.totalRevenue,
      bySurface: summary.bySurface,
    });
  },
);
