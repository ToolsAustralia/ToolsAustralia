/**
 * User Metrics Type Definitions
 * 
 * Type definitions for user analytics and metrics tracking.
 */

export interface UserMetrics {
  signupSource: {
    affiliate: number;
    referral: number;
    direct: number;
    organic: number;
    social: number;
  };
  profession: Record<string, number>;
  membershipStatus: {
    active: number;
    cancelled: number;
    expired: number;
    renewed: number;
  };
  purchaseHistory: {
    totalPurchases: number;
    totalRevenue: number;
    averageOrderValue: number;
    byPackageType: Record<string, number>;
  };
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
}

export interface UserMetricsQuery {
  startDate?: Date;
  endDate?: Date;
  groupBy?: "source" | "profession" | "status";
}

export interface UserMetricsResponse {
  data: UserMetrics;
  meta: {
    timestamp: string;
    totalUsers: number;
  };
}


