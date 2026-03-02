/**
 * Daily User Metrics Type Definitions
 * 
 * Type definitions for daily aggregated user metrics.
 */

export interface IDailyUserMetrics {
  date: Date;
  totalUsers: number;
  newSignups: number;
  activeMemberships: number;
  cancelledMemberships: number;
  expiredMemberships: number;
  renewedMemberships: number;
  signupSource: {
    affiliate: number;
    referral: number;
    direct: number;
    organic: number;
    social: number;
  };
  totalPurchases: number;
  totalRevenue: number;
  averageOrderValue: number;
  professions: Record<string, number>;
}

export interface DailyUserMetricsQuery {
  startDate: Date;
  endDate: Date;
}

export interface DailyUserMetricsResult {
  data: IDailyUserMetrics[];
  cached: boolean;
}


