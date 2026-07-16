import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormTikTokAdsInsightsSchema } from "@/lib/internal-norm/schemas/tiktok-ads";
import { getTikTokAdInsights } from "@/services/admin/tiktok/tiktokAdInsightsQuery";

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Mirror of the admin GET /api/admin/tiktok-ads/insights — the TikTok analogue of
// the Facebook ads insights Norm endpoint. Per-ad spend + TikTok-reported
// conversions/revenue/ROAS. No PII in the projection (ad names + numbers only).
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "tiktok-ads.insights",
    requiredPermission: "facebookAds.view",
    responseSchema: NormTikTokAdsInsightsSchema,
    perEndpointPerMinute: 10,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const data = await getTikTokAdInsights(parsed.data);
    return ctx.ok(data);
  },
);
