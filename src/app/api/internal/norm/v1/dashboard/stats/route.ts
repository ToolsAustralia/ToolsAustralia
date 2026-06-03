import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormDashboardStatsSchema } from "@/lib/internal-norm/schemas/dashboard";
import { DashboardStatsService } from "@/services/admin/DashboardStatsService";
import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

const QuerySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"]).default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const GET = withNorm(
  { tier: "read", registryKey: "dashboard.stats", requiredPermission: "overview.view", responseSchema: NormDashboardStatsSchema },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);

    const range = await resolveNormDateRange({ range: parsed.data.dateRange, start: parsed.data.startDate, end: parsed.data.endDate });
    const stats = await new DashboardStatsService().getStats({
      dateRange: range.dateRange,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
    });

    // Project to the Norm shape — drop trends, enhanced, snapshotMissingForStanding, etc.
    return ctx.ok({
      dateRange: { range: range.dateRange, start: range.startDate.toISOString(), end: range.endDate.toISOString() },
      users: {
        total: stats.users.total,
        activeSubscriptions: stats.users.activeSubscriptions,
        newInRange: stats.users.newInRange,
        cancelledMemberships: stats.users.cancelledMemberships,
        totalScheduledCancellation: stats.users.totalScheduledCancellation,
        dropOffRate: stats.users.dropOffRate,
        periodChurnRate: stats.users.periodChurnRate ?? null,
        membershipRenewals: {
          expectedInRange: stats.users.membershipRenewals.expectedInRange,
          succeededInRange: stats.users.membershipRenewals.succeededInRange,
          failedInvoicesInRange: stats.users.membershipRenewals.failedInvoicesInRange,
          becamePastDueInRange: stats.users.membershipRenewals.becamePastDueInRange,
        },
      },
      revenue: {
        total: stats.revenue.total,
        breakdown: {
          membershipPurchase: pickBucket(stats.revenue.breakdown.membershipPurchase),
          membershipRenewal: pickBucket(stats.revenue.breakdown.membershipRenewal),
          oneTimePurchase: pickBucket(stats.revenue.breakdown.oneTimePurchase),
          additionalOneTimePurchase: pickBucket(stats.revenue.breakdown.additionalOneTimePurchase),
          miniDraw: pickBucket(stats.revenue.breakdown.miniDraw),
          upsell: pickBucket(stats.revenue.breakdown.upsell),
        },
      },
      majorDraw: { totalEntries: stats.majorDraw.totalEntries, activeDraws: stats.majorDraw.activeDraws },
      conversionRate: stats.conversionRate,
      facebookAds: { spend: stats.facebookAds.spend, roas: stats.facebookAds.roas },
      // Per-platform attributed revenue (incl. TikTok + the All-Platforms keys).
      // Drop the trend objects; serialize optional adSpend/trueRoas to nullable.
      attributedRevenue: Object.fromEntries(
        Object.entries(stats.attributedRevenue).map(([platform, v]) => [
          platform,
          {
            revenue: v.revenue,
            renewalRevenue: v.renewalRevenue,
            conversions: v.conversions,
            byConfidence: v.byConfidence,
            adSpend: v.adSpend ?? null,
            trueRoas: v.trueRoas ?? null,
          },
        ]),
      ),
    });
  }
);

function pickBucket(b: { revenue: number; purchaseCount: number; userCount: number }) {
  return { revenue: b.revenue, purchaseCount: b.purchaseCount, userCount: b.userCount };
}
