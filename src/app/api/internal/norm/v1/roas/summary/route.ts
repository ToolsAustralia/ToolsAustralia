import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormRoasSummarySchema } from "@/lib/internal-norm/schemas/roas";
import { FacebookAdsInsightsService } from "@/services/facebook-ads/FacebookAdsInsightsService";
import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

const QuerySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"]).default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const GET = withNorm(
  { tier: "read", registryKey: "roas.summary", requiredPermission: "facebookAds.view", responseSchema: NormRoasSummarySchema, perEndpointPerMinute: 10 },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    const range = await resolveNormDateRange({ range: parsed.data.dateRange, start: parsed.data.startDate, end: parsed.data.endDate });

    // FacebookAdsInsightsService only natively supports today/yesterday/custom — for draw + all-time
    // we resolve to ISO dates first and pass as "custom".
    const isAggregateRange = range.dateRange !== "today" && range.dateRange !== "yesterday";
    const data = await new FacebookAdsInsightsService().getInsights({
      dateRange: isAggregateRange ? "custom" : (range.dateRange as "today" | "yesterday"),
      level: "account",
      startDate: isAggregateRange ? range.startDate.toISOString() : undefined,
      endDate: isAggregateRange ? range.endDate.toISOString() : undefined,
    });

    return ctx.ok({
      dateRange: { range: range.dateRange, start: range.startDate.toISOString(), end: range.endDate.toISOString() },
      spend: data.summary.spend,
      revenue: data.summary.revenue,
      profit: data.summary.profit,
      roas: data.summary.roas,
      conversions: data.summary.conversions,
      impressions: data.summary.impressions,
      clicks: data.summary.clicks,
      ctr: data.summary.ctr,
      cpc: data.summary.cpc,
    });
  }
);
