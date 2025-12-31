/**
 * Monthly Comparison Service
 * 
 * Business logic for month-over-month metrics comparison.
 */

import { DailyMetricsRepository } from "@/repositories/DailyMetricsRepository";
import { DailyMetricsService } from "./DailyMetricsService";
import { MetricsCalculationService } from "./MetricsCalculationService";
import type {
  MonthlyComparisonData,
  MonthlyTotals,
  ComparisonMetrics,
} from "@/types/metrics/MonthlyComparison";
import { getMonthDateRange, getPreviousMonth } from "@/utils/dates/month-helpers";
import { aggregateMonthlyTotals, calculateWeightedROAS } from "@/utils/metrics/aggregators";

export class MonthlyComparisonService {
  constructor(
    private dailyMetricsRepo = new DailyMetricsRepository(),
    private dailyMetricsService = new DailyMetricsService(),
    private calculationService = new MetricsCalculationService()
  ) {}

  /**
   * Get monthly comparison data
   * @param month - Month in YYYY-MM format
   * @returns Comparison data for current and previous month
   */
  async getMonthlyComparison(month: string): Promise<MonthlyComparisonData> {
    // Get date ranges for current and previous month
    const currentMonthRange = getMonthDateRange(month);
    const previousMonth = getPreviousMonth(month);
    const previousMonthRange = getMonthDateRange(previousMonth);

    // Fetch daily metrics for both months (will auto-aggregate if missing)
    const [currentMonthResult, previousMonthResult] = await Promise.all([
      this.dailyMetricsService.getDailyMetrics({
        startDate: currentMonthRange.start,
        endDate: currentMonthRange.end,
      }),
      this.dailyMetricsService.getDailyMetrics({
        startDate: previousMonthRange.start,
        endDate: previousMonthRange.end,
      }),
    ]);

    const currentMonthData = currentMonthResult.data;
    const previousMonthData = previousMonthResult.data;

    // Calculate totals (ROAS is calculated in aggregateMonthlyTotals)
    const currentMonthTotal = aggregateMonthlyTotals(currentMonthData);
    const previousMonthTotal = aggregateMonthlyTotals(previousMonthData);

    // Calculate comparison metrics
    const comparison = this.calculateComparisonMetrics(currentMonthTotal, previousMonthTotal);

    return {
      currentMonth: currentMonthData,
      previousMonth: previousMonthData,
      currentMonthTotal,
      previousMonthTotal,
      comparison,
    };
  }

  /**
   * Calculate comparison metrics between two periods
   */
  calculateComparisonMetrics(current: MonthlyTotals, previous: MonthlyTotals): ComparisonMetrics {
    const createComparison = (currentValue: number, previousValue: number) => {
      const change = currentValue - previousValue;
      const percentage = this.calculationService.calculatePercentageChange(currentValue, previousValue);
      const direction = this.calculationService.getTrendDirection(currentValue, previousValue);

      return {
        value: change,
        percentage,
        direction,
      };
    };

    return {
      adSpend: createComparison(current.adSpend, previous.adSpend),
      revenue: createComparison(current.revenue, previous.revenue),
      salesCount: createComparison(current.salesCount, previous.salesCount),
      profit: createComparison(current.profit, previous.profit),
      roas: createComparison(current.roas, previous.roas),
      conversions: createComparison(current.conversions, previous.conversions),
    };
  }
}

