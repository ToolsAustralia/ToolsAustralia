import type { TrendData, TrendConfig } from "@/types/admin/trend-types";

/**
 * Trend Calculation Service
 * Single-responsibility service for calculating percentage changes and comparison periods.
 */
export class TrendCalculationService {
  /** Default threshold below which changes are considered neutral */
  private readonly defaultNeutralThreshold = 0.5;

  /**
   * Calculate comparison period dates based on current period.
   * Returns the immediately preceding period of the same duration.
   */
  getComparisonPeriod(startDate: Date, endDate: Date): { start: Date; end: Date } {
    const periodLengthMs = endDate.getTime() - startDate.getTime();
    const comparisonEnd = new Date(startDate.getTime() - 1); // 1ms before current period
    const comparisonStart = new Date(comparisonEnd.getTime() - periodLengthMs);

    return { start: comparisonStart, end: comparisonEnd };
  }

  /**
   * Calculate percentage change and direction.
   * Handles edge cases: previous = 0, both = 0, negative values.
   */
  calculateTrend(
    currentValue: number,
    previousValue: number,
    config?: TrendConfig
  ): TrendData {
    const threshold = config?.neutralThreshold ?? this.defaultNeutralThreshold;

    // Both zero: neutral
    if (currentValue === 0 && previousValue === 0) {
      return { value: 0, direction: "neutral" };
    }

    // Previous zero, current positive: treat as +100%
    if (previousValue === 0) {
      return currentValue > 0
        ? { value: 100, direction: "up", previousValue }
        : { value: 0, direction: "neutral", previousValue };
    }

    const rawPercentage = ((currentValue - previousValue) / previousValue) * 100;

    // Cap extreme values for display (avoid confusing -1000%)
    const cappedValue = Math.max(-99, Math.min(999, Math.round(rawPercentage * 10) / 10));

    // Below threshold: neutral
    if (Math.abs(cappedValue) < threshold) {
      return { value: Math.round(cappedValue * 10) / 10, direction: "neutral", previousValue };
    }

    const direction: TrendData["direction"] = cappedValue > 0 ? "up" : "down";

    return { value: cappedValue, direction, previousValue };
  }

  /**
   * Batch calculate trends for multiple metrics.
   */
  calculateTrends(
    currentMetrics: Record<string, number>,
    previousMetrics: Record<string, number>,
    configs?: Record<string, TrendConfig>
  ): Record<string, TrendData> {
    const result: Record<string, TrendData> = {};

    for (const key of Object.keys(currentMetrics)) {
      const current = currentMetrics[key] ?? 0;
      const previous = previousMetrics[key] ?? 0;
      const config = configs?.[key];

      result[key] = this.calculateTrend(current, previous, config);
    }

    return result;
  }
}

export const trendCalculationService = new TrendCalculationService();
