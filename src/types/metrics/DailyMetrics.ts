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
  level?: "account" | "campaign" | "adset" | "ad";
  breakdown?: {
    campaignId?: string;
    campaignName?: string;
    adsetId?: string;
    adsetName?: string;
    adId?: string;
    adName?: string;
  };
  revenueBreakdown?: {
    totalRevenue: number;
    byPackageType: Record<string, { revenue: number; count: number }>;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DailyMetricsQuery {
  startDate: Date;
  endDate: Date;
  level?: "account" | "campaign" | "adset" | "ad";
  breakdownId?: string; // Optional: filter by specific campaign/adset/ad ID
}

export interface DailyMetricsResponse {
  data: IDailyMetrics[];
  cached: boolean;
}

export interface DailyMetricsResult {
  data: IDailyMetrics[];
  cached: boolean;
}

