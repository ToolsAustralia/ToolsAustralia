import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormHourlyRevenueSchema } from "@/lib/internal-norm/schemas/analytics-spend";
import { getHourlyRevenueByPlatform } from "@/services/admin/hourlyRevenueByPlatform";

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  platform: z
    .enum(["meta", "tiktok", "snapchat", "klaviyo", "ad-channels", "all"])
    .optional()
    .default("all"),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "analytics.hourly-revenue",
    requiredPermission: "facebookAds.view",
    responseSchema: NormHourlyRevenueSchema,
    perEndpointPerMinute: 10,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    try {
      const data = await getHourlyRevenueByPlatform(parsed.data);
      return ctx.ok(data);
    } catch (e) {
      return ctx.error(400, "bad_request", e instanceof Error ? e.message : "failed");
    }
  },
);
