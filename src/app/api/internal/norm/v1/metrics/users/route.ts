import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormUserMetricsSchema } from "@/lib/internal-norm/schemas/metrics";
import { UserMetricsService } from "@/services/metrics/UserMetricsService";
import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

const QuerySchema = z.object({
  dateRange: z
    .enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"])
    .default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "metrics.users",
    requiredPermission: "overview.view",
    responseSchema: NormUserMetricsSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    let range;
    try {
      range = await resolveNormDateRange({
        range: parsed.data.dateRange,
        start: parsed.data.startDate,
        end: parsed.data.endDate,
      });
    } catch (e) {
      return ctx.error(400, "bad_query", (e as Error).message);
    }

    const metrics = await new UserMetricsService().getUserMetrics({
      startDate: range.startDate,
      endDate: range.endDate,
      asOfDate: range.asOfDate,
    });

    const totalUsers = Object.values(metrics.signupSource).reduce((s, n) => s + n, 0);

    return ctx.ok({
      dateRange: {
        start: range.startDate.toISOString(),
        end: range.endDate.toISOString(),
      },
      totalUsers,
      signupSource: metrics.signupSource,
      profession: metrics.profession,
      state: metrics.state,
      ageGroup: metrics.ageGroup,
      membershipStatus: metrics.membershipStatus,
      membershipByPackage: metrics.membershipByPackage,
      purchaseHistory: metrics.purchaseHistory,
    });
  }
);
