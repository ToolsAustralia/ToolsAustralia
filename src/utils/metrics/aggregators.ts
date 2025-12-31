/**
 * Data aggregation helpers
 */

import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import type { MonthlyTotals } from "@/types/metrics/MonthlyComparison";

/**
 * Sum daily metrics to get monthly totals
 * @param dailyMetrics - Array of daily metrics
 * @returns Monthly totals
 */
export function aggregateMonthlyTotals(dailyMetrics: IDailyMetrics[]): MonthlyTotals {
  const totals = dailyMetrics.reduce(
    (acc, day) => ({
      adSpend: acc.adSpend + day.adSpend,
      revenue: acc.revenue + day.revenue,
      salesCount: acc.salesCount + day.salesCount,
      profit: acc.profit + day.profit,
      conversions: acc.conversions + day.conversions,
      impressions: acc.impressions + day.impressions,
      clicks: acc.clicks + day.clicks,
      roas: 0, // Will be calculated below
    }),
    {
      adSpend: 0,
      revenue: 0,
      salesCount: 0,
      profit: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
      roas: 0,
    }
  );

  // Calculate ROAS from totals (not weighted average of daily ROAS)
  totals.roas = totals.adSpend > 0 ? totals.revenue / totals.adSpend : 0;

  return totals as MonthlyTotals;
}

/**
 * Calculate weighted average ROAS for a period
 * @param dailyMetrics - Array of daily metrics
 * @returns Weighted average ROAS
 */
export function calculateWeightedROAS(dailyMetrics: IDailyMetrics[]): number {
  if (dailyMetrics.length === 0) {
    return 0;
  }

  const totalRevenue = dailyMetrics.reduce((sum, day) => sum + day.revenue, 0);
  const totalAdSpend = dailyMetrics.reduce((sum, day) => sum + day.adSpend, 0);

  if (totalAdSpend === 0) {
    return 0;
  }

  return totalRevenue / totalAdSpend;
}

