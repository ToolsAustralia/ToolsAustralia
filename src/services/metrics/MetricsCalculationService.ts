/**
 * Metrics Calculation Service
 * 
 * Pure calculation functions for metrics.
 * No side effects, easy to test.
 */

import {
  calculateROAS,
  calculateProfit,
  calculateCTR,
  calculateCPC,
  calculatePercentageChange,
  getTrendDirection,
} from "@/utils/metrics/calculations";

export class MetricsCalculationService {
  /**
   * Calculate ROAS (Return on Ad Spend)
   */
  calculateROAS(revenue: number, adSpend: number): number {
    return calculateROAS(revenue, adSpend);
  }

  /**
   * Calculate profit (Revenue - Ad Spend)
   */
  calculateProfit(revenue: number, adSpend: number): number {
    return calculateProfit(revenue, adSpend);
  }

  /**
   * Calculate CTR (Click-Through Rate) as percentage
   */
  calculateCTR(clicks: number, impressions: number): number {
    return calculateCTR(clicks, impressions);
  }

  /**
   * Calculate CPC (Cost Per Click)
   */
  calculateCPC(adSpend: number, clicks: number): number {
    return calculateCPC(adSpend, clicks);
  }

  /**
   * Calculate percentage change between two values
   */
  calculatePercentageChange(current: number, previous: number): number {
    return calculatePercentageChange(current, previous);
  }

  /**
   * Get trend direction
   */
  getTrendDirection(current: number, previous: number): "up" | "down" | "neutral" {
    return getTrendDirection(current, previous);
  }

  /**
   * Calculate all metrics for a day
   */
  calculateDailyMetrics(data: {
    adSpend: number;
    revenue: number;
    salesCount: number;
    conversions: number;
    impressions: number;
    clicks: number;
  }) {
    const profit = this.calculateProfit(data.revenue, data.adSpend);
    const roas = this.calculateROAS(data.revenue, data.adSpend);
    const ctr = this.calculateCTR(data.clicks, data.impressions);
    const cpc = this.calculateCPC(data.adSpend, data.clicks);

    return {
      ...data,
      profit,
      roas,
      ctr,
      cpc,
    };
  }
}

