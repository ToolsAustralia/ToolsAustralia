import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAnalyticsPackagesFocusSchema } from "@/lib/internal-norm/schemas/analytics-spend";
import { PackagesFocusBreakdownService } from "@/services/analytics/PackagesFocusBreakdownService";

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  platform: z.enum(["meta", "tiktok"]).default("meta"),
});

const breakdownService = new PackagesFocusBreakdownService();

/**
 * GET /v1/analytics/packages-focus
 * Membership vs one-time landing-URL split of Meta ad spend/ROAS: bucket
 * summary (materialized, any range) + campaign→adset→ad detail (live join,
 * ~60-day insights window). platform=tiktok returns supported:false until
 * its URL mapping ships.
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

    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    if (parsed.data.platform === "meta" && !adAccountId) {
      return ctx.error(500, "misconfigured", "FACEBOOK_AD_ACCOUNT_ID not configured");
    }

    const result = await breakdownService.getBreakdownFormatted(
      parsed.data.platform,
      adAccountId ?? "",
      parsed.data.startDate,
      parsed.data.endDate,
    );
    return ctx.ok(result);
  },
);
