import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormFacebookAdsHourlyInsightsSchema } from "@/lib/internal-norm/schemas/facebook-ads";
import { HourlyInsightsService } from "@/services/facebook-ads/HourlyInsightsService";

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  filterLevel: z.enum(["campaign", "adset", "ad"]).optional(),
  filterIds: z.string().optional(), // comma-separated
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "facebook-ads.hourly-insights.list",
    requiredPermission: "facebookAds.view",
    responseSchema: NormFacebookAdsHourlyInsightsSchema,
    perEndpointPerMinute: 10,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const filterIds = parsed.data.filterIds
      ? parsed.data.filterIds.split(",").map((id) => id.trim()).filter(Boolean)
      : [];

    const result = await new HourlyInsightsService().getHourly({
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      filterLevel: parsed.data.filterLevel,
      filterIds,
    });

    return ctx.ok(result);
  },
);
