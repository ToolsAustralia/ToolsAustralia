/**
 * Enhanced Dashboard Metrics Type Definitions
 * 
 * Type definitions for enhanced admin dashboard metrics.
 */

export interface EnhancedDashboardMetrics {
  averageOrderValue: number;
  customerAcquisitionCost: number;
  revenuePerUser: number;
  conversionRate: number;
  miniDrawPerformance: {
    totalRevenue: number;
    totalSales: number;
    averageRevenuePerDraw: number;
  };
  conversionFunnel: {
    visitors: number;
    signups: number;
    payingCustomers: number;
    conversionRates: {
      visitorToSignup: number;
      signupToPaying: number;
      overall: number;
    };
  };
}

export interface TrendData {
  value: number;
  previousValue: number;
  change: number;
  percentageChange: number;
  direction: "up" | "down" | "neutral";
}

