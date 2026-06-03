import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormKlaviyoAnalyticsSchema } from "@/lib/internal-norm/schemas/klaviyo";
import { getKlaviyoAnalytics } from "@/services/admin/klaviyo/klaviyoReporting";

const QuerySchema = z.object({
  range: z
    .enum(["last_7_days", "last_30_days", "last_90_days", "last_12_months"])
    .optional()
    .default("last_30_days"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "klaviyo.analytics",
    requiredPermission: "facebookAds.view",
    responseSchema: NormKlaviyoAnalyticsSchema,
    perEndpointPerMinute: 2,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const data = await getKlaviyoAnalytics(parsed.data.range, Date.now());
    return ctx.ok(data);
  },
);
