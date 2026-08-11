import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormTikTokAdsInsightsSchema } from "@/lib/internal-norm/schemas/tiktok-ads";
import { getTikTokAdInsights } from "@/services/admin/tiktok/tiktokAdInsightsQuery";

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Defaults to "ad", so a caller written before the switcher existed keeps its shape.
  level: z.enum(["campaign", "adset", "ad"]).default("ad"),
});

// Mirror of the admin GET /api/admin/tiktok-ads/insights — the TikTok analogue of
// the Facebook ads insights Norm endpoint. Spend + TikTok-reported conversions/revenue/ROAS,
// grouped at campaign / ad-set / ad level. No PII in the projection (names + numbers only).
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

    // Mapped field-by-field, so a renamed Zod key is a compile error rather than a
    // silently-defaulted parameter.
    const data = await getTikTokAdInsights({
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      level: parsed.data.level,
    });
    return ctx.ok(data);
  },
);
