/**
 * Monthly Comparison Type Definitions
 * 
 * Type definitions for month-over-month metrics comparison.
 */

import type { IDailyMetrics } from "./DailyMetrics";

export interface MonthlyComparisonQuery {
  month: string; // Format: YYYY-MM
}

export interface MonthlyComparisonData {
  currentMonth: IDailyMetrics[];
  previousMonth: IDailyMetrics[];
  currentMonthTotal: MonthlyTotals;
  previousMonthTotal: MonthlyTotals;
  comparison: ComparisonMetrics;
}

export interface MonthlyTotals {
  adSpend: number;
  revenue: number;
  salesCount: number;
  profit: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

export interface ComparisonMetrics {
  adSpend: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  revenue: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  salesCount: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  profit: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  roas: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
  conversions: {
    value: number;
    percentage: number;
    direction: "up" | "down" | "neutral";
  };
}

export interface MonthlyComparisonResponse {
  data: MonthlyComparisonData;
}

