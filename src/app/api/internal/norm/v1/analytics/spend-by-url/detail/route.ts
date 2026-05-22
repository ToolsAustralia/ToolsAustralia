import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAnalyticsSpendByUrlDetailSchema } from "@/lib/internal-norm/schemas/analytics-spend";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
});

const aggService = new SpendByUrlAggregationService();

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "analytics.spend-by-url.detail",
    requiredPermission: "facebookAds.view",
    responseSchema: NormAnalyticsSpendByUrlDetailSchema,
  },
  async (ctx) => {
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    if (!adAccountId) {
      return ctx.error(500, "misconfigured", "FACEBOOK_AD_ACCOUNT_ID not configured");
    }

    const canonicalUrls = ctx.url.searchParams
      .getAll("canonicalUrl")
      .map((u) => u.trim())
      .filter(Boolean);
    if (canonicalUrls.length === 0) {
      return ctx.error(400, "bad_query", "At least one canonicalUrl is required");
    }

    const parsed = QuerySchema.safeParse({
      startDate: ctx.url.searchParams.get("startDate"),
      endDate: ctx.url.searchParams.get("endDate"),
    });
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const result = await aggService.getSpendByUrlDetailFormatted(
      adAccountId,
      canonicalUrls,
      parsed.data.startDate,
      parsed.data.endDate,
    );
    return ctx.ok(result);
  },
);
