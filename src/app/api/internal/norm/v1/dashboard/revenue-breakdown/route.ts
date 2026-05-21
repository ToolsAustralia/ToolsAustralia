import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormRevenueBreakdownSchema } from "@/lib/internal-norm/schemas/dashboard";
import { DashboardStatsService } from "@/services/admin/DashboardStatsService";
import { resolveNormDateRange } from "@/utils/admin/resolveNormDateRange";

const QuerySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "current-draw", "last-draw", "all-time", "custom"]).default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const GET = withNorm(
  { tier: "read", registryKey: "dashboard.revenue-breakdown", requiredPermission: "overview.view", responseSchema: NormRevenueBreakdownSchema },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    const range = await resolveNormDateRange({ range: parsed.data.dateRange, start: parsed.data.startDate, end: parsed.data.endDate });
    const stats = await new DashboardStatsService().getStats({
      dateRange: range.dateRange,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
    });
    return ctx.ok({
      dateRange: { range: range.dateRange, start: range.startDate.toISOString(), end: range.endDate.toISOString() },
      total: stats.revenue.total,
      breakdown: {
        membershipPurchase: pick(stats.revenue.breakdown.membershipPurchase),
        membershipRenewal: pick(stats.revenue.breakdown.membershipRenewal),
        oneTimePurchase: pick(stats.revenue.breakdown.oneTimePurchase),
        additionalOneTimePurchase: pick(stats.revenue.breakdown.additionalOneTimePurchase),
        miniDraw: pick(stats.revenue.breakdown.miniDraw),
        upsell: pick(stats.revenue.breakdown.upsell),
      },
    });
  }
);

function pick(b: { revenue: number; purchaseCount: number; userCount: number }) {
  return { revenue: b.revenue, purchaseCount: b.purchaseCount, userCount: b.userCount };
}
