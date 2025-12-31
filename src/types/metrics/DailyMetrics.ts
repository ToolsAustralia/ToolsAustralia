/**
 * Daily Metrics Type Definitions
 * 
 * Type definitions for daily aggregated metrics tracking system.
 */

export interface IDailyMetrics {
  _id?: string;
  date: Date;
  adSpend: number;
  revenue: number;
  salesCount: number;
  profit: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number; // Click-through rate (percentage)
  cpc: number; // Cost per click
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DailyMetricsQuery {
  startDate: Date;
  endDate: Date;
}

export interface DailyMetricsResponse {
  data: IDailyMetrics[];
  cached: boolean;
}

export interface DailyMetricsResult {
  data: IDailyMetrics[];
  cached: boolean;
}

