import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormFacebookAdsInsightsSchema } from "@/lib/internal-norm/schemas/facebook-ads";
import { FacebookAdsInsightsService } from "@/services/facebook-ads/FacebookAdsInsightsService";

const QuerySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "custom"]).default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  level: z.enum(["account", "campaign", "adset", "ad"]).default("account"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "facebook-ads.insights",
    requiredPermission: "facebookAds.view",
    responseSchema: NormFacebookAdsInsightsSchema,
    perEndpointPerMinute: 10,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const data = await new FacebookAdsInsightsService().getInsights(parsed.data);

    // Strip `cached` (admin-only debug flag) before returning to Norm.
    return ctx.ok({
      summary: data.summary,
      breakdown: data.breakdown,
      dateRange: data.dateRange,
      syncedAt: data.syncedAt,
    });
  },
);
