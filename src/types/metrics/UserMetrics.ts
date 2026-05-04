/**
 * User Metrics Type Definitions
 *
 * Type definitions for user analytics and metrics tracking.
 */

import type { AgeGroupLabel } from "@/utils/metrics/age-grouping";

export interface MembershipPackageBreakdown {
  packageId: string;
  packageName: string;
  total: number;
  active: number;
  pastDue: number;
  cancelled: number;
}

export interface UserMetrics {
  signupSource: {
    affiliate: number;
    referral: number;
    direct: number;
    organic: number;
    social: number;
  };
  profession: Record<string, number>;
  ageGroup: Record<AgeGroupLabel, number>;
  membershipStatus: {
    active: number;
    cancelled: number;
    pastDue: number;
    renewed: number;
  };
  membershipByPackage: MembershipPackageBreakdown[];
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
  asOfDate?: Date | null;
}

export interface UserMetricsResponse {
  data: UserMetrics;
  meta: {
    timestamp: string;
    totalUsers: number;
  };
}
