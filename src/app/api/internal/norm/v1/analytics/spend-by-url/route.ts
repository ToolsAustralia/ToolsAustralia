import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAnalyticsSpendByUrlListSchema } from "@/lib/internal-norm/schemas/analytics-spend";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";
import { ensureSpendByUrlFreshness } from "@/services/meta/spendByUrlFreshness";
import { adAccountEnvVar, resolveAdAccountId } from "@/services/analytics/adPlatformAccounts";

// On-read freshness may sync the trailing 1-2 days from Meta (time-budgeted).
export const maxDuration = 60;

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  // One platform per call — see the admin route for why there is no "all".
  platform: z.enum(["meta", "tiktok"]).default("meta"),
});

const aggService = new SpendByUrlAggregationService();

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "analytics.spend-by-url.list",
    requiredPermission: "facebookAds.view",
    responseSchema: NormAnalyticsSpendByUrlListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
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
    // Meta-only; TikTok's rollup is rebuilt by its nightly cron.
    if (platform === "meta") {
      await ensureSpendByUrlFreshness(adAccountId, parsed.data.startDate, parsed.data.endDate);
    }

    const result = await aggService.getSpendByUrlListFormatted(
      platform,
      adAccountId,
      parsed.data.startDate,
      parsed.data.endDate,
    );
    return ctx.ok(result);
  },
);
