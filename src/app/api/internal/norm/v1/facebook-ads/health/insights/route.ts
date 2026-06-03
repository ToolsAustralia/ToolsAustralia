import { z } from "zod";
import { parseISO } from "date-fns";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormFacebookAdsHealthInsightsSchema } from "@/lib/internal-norm/schemas/facebook-ads-health";
import { getFacebookAdsHealthInsights } from "@/services/facebook-ads-health/healthInsights";

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  level: z.enum(["campaign", "adset", "ad"]).default("adset"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "facebook-ads.health.insights",
    requiredPermission: "facebookAds.view",
    responseSchema: NormFacebookAdsHealthInsightsSchema,
    perEndpointPerMinute: 10,
  },
  async (ctx) => {
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID ?? "";
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN ?? "";
    if (!adAccountId || !accessToken) {
      return ctx.error(
        500,
        "misconfigured",
        "FACEBOOK_AD_ACCOUNT_ID / FACEBOOK_MARKETING_ACCESS_TOKEN not configured",
      );
    }

    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const { rows, alertCount } = await getFacebookAdsHealthInsights({
      adAccountId,
      accessToken,
      startDate: parseISO(parsed.data.startDate),
      endDate: parseISO(parsed.data.endDate),
      level: parsed.data.level,
    });

    // Serialize Date fields to ISO strings (the schema describes the wire format).
    // `snoozedUntil` (operator-specific) is dropped — the schema omits it so Zod strips it.
    const projected = rows.map((r) => ({
      ...r,
      lastSignificantEdit: r.lastSignificantEdit ? r.lastSignificantEdit.toISOString() : null,
      createdTime: r.createdTime ? r.createdTime.toISOString() : null,
    }));

    return ctx.ok({ rows: projected, alertCount });
  },
);
