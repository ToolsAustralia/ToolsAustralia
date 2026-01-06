/**
 * Major Draw Comparison Service
 * 
 * Business logic for comparing metrics between two major draws.
 */

import { DailyMetricsService } from "./DailyMetricsService";
import { MetricsCalculationService } from "./MetricsCalculationService";
import type { MajorDrawComparisonData, DrawTotals, ComparisonMetrics } from "@/types/metrics/MajorDrawComparison";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";

export class MajorDrawComparisonService {
  constructor(
    private dailyMetricsService = new DailyMetricsService(),
    private calculationService = new MetricsCalculationService()
  ) {}

  /**
   * Get comparison data between two major draws
   */
  async getMajorDrawComparison(
    currentDrawId: string,
    previousDrawId: string
  ): Promise<MajorDrawComparisonData> {
    await connectDB();

    // Fetch both major draws
    const [currentDraw, previousDraw] = await Promise.all([
      MajorDraw.findById(currentDrawId).lean(),
      MajorDraw.findById(previousDrawId).lean(),
    ]);

    if (!currentDraw || !previousDraw) {
      throw new Error("One or both major draws not found");
    }

    // Get date ranges for each draw
    // Use activationDate as start and drawDate as end
    const currentStartDate = new Date(currentDraw.activationDate);
    const currentEndDate = new Date(currentDraw.drawDate);
    const previousStartDate = new Date(previousDraw.activationDate);
    const previousEndDate = new Date(previousDraw.drawDate);

    // Fetch daily metrics for both draws
    const [currentMetrics, previousMetrics] = await Promise.all([
      this.dailyMetricsService.getDailyMetrics({
        startDate: currentStartDate,
        endDate: currentEndDate,
      }),
      this.dailyMetricsService.getDailyMetrics({
        startDate: previousStartDate,
        endDate: previousEndDate,
      }),
    ]);

    // Calculate totals
    const currentDrawTotal = this.calculateTotals(currentMetrics.data);
    const previousDrawTotal = this.calculateTotals(previousMetrics.data);

    // Calculate comparison metrics
    const comparison = this.calculateComparison(currentDrawTotal, previousDrawTotal);

    return {
      currentDraw: currentMetrics.data,
      previousDraw: previousMetrics.data,
      currentDrawTotal,
      previousDrawTotal,
      comparison,
      currentDrawInfo: {
        id: currentDraw._id.toString(),
        name: currentDraw.name,
        drawDate: currentDraw.drawDate,
        activationDate: currentDraw.activationDate,
      },
      previousDrawInfo: {
        id: previousDraw._id.toString(),
        name: previousDraw.name,
        drawDate: previousDraw.drawDate,
        activationDate: previousDraw.activationDate,
      },
    };
  }

  /**
   * Calculate totals from daily metrics
   */
  private calculateTotals(metrics: Array<{ adSpend: number; revenue: number; salesCount: number; conversions: number; impressions: number; clicks: number }>): DrawTotals {
    const totals = metrics.reduce(
      (acc, metric) => ({
        adSpend: acc.adSpend + metric.adSpend,
        revenue: acc.revenue + metric.revenue,
        salesCount: acc.salesCount + metric.salesCount,
        conversions: acc.conversions + metric.conversions,
        impressions: acc.impressions + metric.impressions,
        clicks: acc.clicks + metric.clicks,
      }),
      {
        adSpend: 0,
        revenue: 0,
        salesCount: 0,
        conversions: 0,
        impressions: 0,
        clicks: 0,
      }
    );

    const profit = totals.revenue - totals.adSpend;
    const roas = totals.adSpend > 0 ? totals.revenue / totals.adSpend : 0;

    return {
      ...totals,
      profit,
      roas,
    };
  }

  /**
   * Calculate comparison metrics between two draws
   */
  private calculateComparison(
    current: DrawTotals,
    previous: DrawTotals
  ): ComparisonMetrics {
    const calculateComparison = (
      currentValue: number,
      previousValue: number
    ): { value: number; percentage: number; direction: "up" | "down" | "neutral" } => {
      const value = currentValue - previousValue;
      const percentage =
        previousValue !== 0 ? (value / previousValue) * 100 : 0;
      const direction =
        percentage > 0.01 ? "up" : percentage < -0.01 ? "down" : "neutral";

      return { value, percentage, direction };
    };

    return {
      adSpend: calculateComparison(current.adSpend, previous.adSpend),
      revenue: calculateComparison(current.revenue, previous.revenue),
      salesCount: calculateComparison(current.salesCount, previous.salesCount),
      profit: calculateComparison(current.profit, previous.profit),
      roas: calculateComparison(current.roas, previous.roas),
      conversions: calculateComparison(current.conversions, previous.conversions),
    };
  }
}

