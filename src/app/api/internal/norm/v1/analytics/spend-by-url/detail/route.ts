import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAnalyticsSpendByUrlDetailSchema } from "@/lib/internal-norm/schemas/analytics-spend";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";
import { ensureSpendByUrlFreshness } from "@/services/meta/spendByUrlFreshness";
import { adAccountEnvVar, resolveAdAccountId } from "@/services/analytics/adPlatformAccounts";

// On-read freshness may sync the trailing 1-2 days from Meta (time-budgeted).
export const maxDuration = 60;

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  // Ad ids are only unique within a platform, so per-ad detail is single-platform.
  platform: z.enum(["meta", "tiktok"]).default("meta"),
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
      ...(ctx.url.searchParams.has("platform")
        ? { platform: ctx.url.searchParams.get("platform") }
        : {}),
    });
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const { platform } = parsed.data;

    const adAccountId = resolveAdAccountId(platform);
    if (!adAccountId) {
      return ctx.error(500, "misconfigured", `${adAccountEnvVar(platform)} not configured`);
    }

    // Same near-real-time refresh the admin route gets — keeps Norm's figures
    // in lockstep with the dashboard (time-budgeted; see spendByUrlFreshness).
    await ensureSpendByUrlFreshness(platform, adAccountId, parsed.data.startDate, parsed.data.endDate);

    const result = await aggService.getSpendByUrlDetailFormatted(
      platform,
      adAccountId,
      canonicalUrls,
      parsed.data.startDate,
      parsed.data.endDate,
    );
    return ctx.ok(result);
  },
);
