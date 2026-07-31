import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormPromoAnalyticsSummarySchema } from "@/lib/internal-norm/schemas/promo-analytics";
import PromoAnalyticsService, {
  resolvePromoAnalyticsRange,
} from "@/services/promo-analytics/PromoAnalyticsService";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const QuerySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "custom"]).default("today"),
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "promo-analytics.summary",
    requiredPermission: "promos.view",
    responseSchema: NormPromoAnalyticsSummarySchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    let range;
    try {
      // Mapped field-by-field on purpose — see the admin summary route for why.
      range = resolvePromoAnalyticsRange({
        dateRange: parsed.data.dateRange,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
      });
    } catch (e) {
      return ctx.error(400, "bad_query", (e as Error).message);
    }

    const [summary, channelSummary, builtPrizeSummary, toolboxSummary] = await Promise.all([
      PromoAnalyticsService.getAggregatedMetrics(range.start, range.end),
      PromoAnalyticsService.getAggregatedByChannel(range.start, range.end),
      PromoAnalyticsService.getAggregatedByBuiltPrize(range.start, range.end),
      PromoAnalyticsService.getAggregatedByToolbox(range.start, range.end),
    ]);

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
      byPage: summary.byPage,
      byChannel: channelSummary.byChannel,
      byBuiltPrize: builtPrizeSummary.byBuiltPrize,
      byToolbox: toolboxSummary.byToolbox,
    });
  },
);
