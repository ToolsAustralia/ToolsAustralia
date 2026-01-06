/**
 * User Major Draw Comparison Service
 * 
 * Business logic for comparing user metrics between two major draws.
 */

import { DailyUserMetricsService } from "./DailyUserMetricsService";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import type { IDailyUserMetrics } from "@/types/metrics/DailyUserMetrics";

export interface UserDrawTotals {
  totalUsers: number;
  newSignups: number;
  activeMemberships: number;
  cancelledMemberships: number;
  expiredMemberships: number;
  renewedMemberships: number;
  totalPurchases: number;
  totalRevenue: number;
  averageOrderValue: number;
}

export interface UserComparisonMetrics {
  totalUsers: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  newSignups: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  activeMemberships: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  totalPurchases: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  totalRevenue: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  averageOrderValue: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
}

export interface UserMajorDrawComparisonData {
  currentDraw: IDailyUserMetrics[];
  previousDraw: IDailyUserMetrics[];
  currentDrawTotal: UserDrawTotals;
  previousDrawTotal: UserDrawTotals;
  comparison: UserComparisonMetrics;
  currentDrawInfo: {
    id: string;
    name: string;
    drawDate: Date;
    activationDate: Date;
  };
  previousDrawInfo: {
    id: string;
    name: string;
    drawDate: Date;
    activationDate: Date;
  };
}

export class UserMajorDrawComparisonService {
  constructor(private dailyUserMetricsService = new DailyUserMetricsService()) {}

  /**
   * Get comparison data between two major draws for user metrics
   */
  async getUserMajorDrawComparison(
    currentDrawId: string,
    previousDrawId: string
  ): Promise<UserMajorDrawComparisonData> {
    await connectDB();

    // Fetch both major draws
    const [currentDrawResult, previousDrawResult] = await Promise.all([
      MajorDraw.findById(currentDrawId).lean(),
      MajorDraw.findById(previousDrawId).lean(),
    ]);

    if (!currentDrawResult || !previousDrawResult) {
      throw new Error("One or both major draws not found");
    }

    // Type assertion to ensure we have the correct structure
    const currentDraw = currentDrawResult as unknown as {
      _id: unknown;
      name: string;
      drawDate: Date | string;
      activationDate: Date | string;
    };
    const previousDraw = previousDrawResult as unknown as {
      _id: unknown;
      name: string;
      drawDate: Date | string;
      activationDate: Date | string;
    };

    // Get date ranges for each draw
    const currentStartDate = new Date(currentDraw.activationDate);
    const currentEndDate = new Date(currentDraw.drawDate);
    const previousStartDate = new Date(previousDraw.activationDate);
    const previousEndDate = new Date(previousDraw.drawDate);

    // Fetch daily user metrics for both draws
    const [currentMetrics, previousMetrics] = await Promise.all([
      this.dailyUserMetricsService.getDailyUserMetrics({
        startDate: currentStartDate,
        endDate: currentEndDate,
      }),
      this.dailyUserMetricsService.getDailyUserMetrics({
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
        id: String(currentDraw._id),
        name: currentDraw.name,
        drawDate: new Date(currentDraw.drawDate),
        activationDate: new Date(currentDraw.activationDate),
      },
      previousDrawInfo: {
        id: String(previousDraw._id),
        name: previousDraw.name,
        drawDate: new Date(previousDraw.drawDate),
        activationDate: new Date(previousDraw.activationDate),
      },
    };
  }

  /**
   * Calculate totals from daily user metrics
   */
  private calculateTotals(metrics: IDailyUserMetrics[]): UserDrawTotals {
    const totals = metrics.reduce(
      (acc, metric) => ({
        totalUsers: Math.max(acc.totalUsers, metric.totalUsers), // Use max for cumulative
        newSignups: acc.newSignups + metric.newSignups,
        activeMemberships: Math.max(acc.activeMemberships, metric.activeMemberships), // Use max for cumulative
        cancelledMemberships: acc.cancelledMemberships + metric.cancelledMemberships,
        expiredMemberships: acc.expiredMemberships + metric.expiredMemberships,
        renewedMemberships: acc.renewedMemberships + metric.renewedMemberships,
        totalPurchases: acc.totalPurchases + metric.totalPurchases,
        totalRevenue: acc.totalRevenue + metric.totalRevenue,
      }),
      {
        totalUsers: 0,
        newSignups: 0,
        activeMemberships: 0,
        cancelledMemberships: 0,
        expiredMemberships: 0,
        renewedMemberships: 0,
        totalPurchases: 0,
        totalRevenue: 0,
      }
    );

    const averageOrderValue = totals.totalPurchases > 0 ? totals.totalRevenue / totals.totalPurchases : 0;

    return {
      ...totals,
      averageOrderValue,
    };
  }

  /**
   * Calculate comparison metrics between two draws
   */
  private calculateComparison(
    current: UserDrawTotals,
    previous: UserDrawTotals
  ): UserComparisonMetrics {
    const calculateComparison = (
      currentValue: number,
      previousValue: number
    ): { value: number; percentage: number; direction: "up" | "down" | "neutral" } => {
      const value = currentValue - previousValue;
      const percentage = previousValue !== 0 ? (value / previousValue) * 100 : 0;
      const direction = percentage > 0.01 ? "up" : percentage < -0.01 ? "down" : "neutral";

      return { value, percentage, direction };
    };

    return {
      totalUsers: calculateComparison(current.totalUsers, previous.totalUsers),
      newSignups: calculateComparison(current.newSignups, previous.newSignups),
      activeMemberships: calculateComparison(current.activeMemberships, previous.activeMemberships),
      totalPurchases: calculateComparison(current.totalPurchases, previous.totalPurchases),
      totalRevenue: calculateComparison(current.totalRevenue, previous.totalRevenue),
      averageOrderValue: calculateComparison(current.averageOrderValue, previous.averageOrderValue),
    };
  }
}


