import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAnalyticsPackagesFocusSchema } from "@/lib/internal-norm/schemas/analytics-spend";
import { PackagesFocusBreakdownService } from "@/services/analytics/PackagesFocusBreakdownService";
import { resolveAdAccountId } from "@/services/analytics/adPlatformAccounts";

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  platform: z.enum(["meta", "tiktok"]).default("meta"),
});

// The service's on-read freshness may sync the trailing 1-2 days from Meta
// (time-budgeted; see spendByUrlFreshness).
export const maxDuration = 60;

const breakdownService = new PackagesFocusBreakdownService();

/**
 * GET /v1/analytics/packages-focus
 * Membership vs one-time landing-URL split of one platform's ad spend/ROAS: bucket
 * summary (materialized, any range) + campaign→adset→ad detail (live join,
 * ~60-day insights window). Both meta and tiktok are supported since 2026-07-29;
 * supported:false / "not-configured" now means only that this environment has no
 * account id for the requested platform.
 */
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "analytics.packages-focus",
    requiredPermission: "facebookAds.view",
    responseSchema: NormAnalyticsPackagesFocusSchema,
    perEndpointPerMinute: 10,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    // Per-platform account id; an unconfigured platform yields supported:false rather
    // than a 500, matching the admin route exactly.
    const adAccountId = resolveAdAccountId(parsed.data.platform);

    const result = await breakdownService.getBreakdownFormatted(
      parsed.data.platform,
      adAccountId ?? "",
      parsed.data.startDate,
      parsed.data.endDate,
    );
    return ctx.ok(result);
  },
);
