import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormMembershipByPackageSchema } from "@/lib/internal-norm/schemas/dashboard";
import { MembershipAnalyticsService } from "@/services/admin/MembershipAnalyticsService";
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
    registryKey: "dashboard.membership-by-package",
    requiredPermission: "overview.view",
    responseSchema: NormMembershipByPackageSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    const range = await resolveNormDateRange({
      range: parsed.data.dateRange,
      start: parsed.data.startDate,
      end: parsed.data.endDate,
    });

    const service = new MembershipAnalyticsService();
    const data =
      range.membershipAsOfMode === "snapshot" && range.asOfDate
        ? await service.getMembershipByPackageSnapshot(range.asOfDate)
        : await service.getMembershipByPackageLive();

    return ctx.ok({
      packages: data.packages.map((p) => ({
        packageId: p.packageId,
        packageName: p.packageName,
        activeCount: p.activeCount,
        cancelledCount: p.cancelledCount,
        pastDueCount: p.pastDueCount,
        activeRevenue: p.activeRevenue,
        pastDueRevenue: p.pastDueRevenue,
      })),
      summary: {
        totalActiveCount: data.summary.totalActiveCount,
        totalPastDueCount: data.summary.totalPastDueCount,
        totalActiveRevenue: data.summary.totalActiveRevenue,
        totalPastDueRevenue: data.summary.totalPastDueRevenue,
      },
      meta: {
        membershipAsOfMode: range.membershipAsOfMode,
        asOf: range.asOfDate ? range.asOfDate.toISOString() : null,
      },
    });
  },
);
