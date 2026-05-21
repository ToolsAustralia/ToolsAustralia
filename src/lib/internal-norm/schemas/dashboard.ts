import { z } from "zod";
import { NormDateRangeSchema } from "./common";

const RevenueBucketSchema = z.object({
  revenue: z.number(),
  purchaseCount: z.number(),
  userCount: z.number(),
});

export const NormDashboardStatsSchema = z.object({
  dateRange: NormDateRangeSchema,
  users: z.object({
    total: z.number(),
    activeSubscriptions: z.number(),
    newInRange: z.number(),
    cancelledMemberships: z.number(),
    totalScheduledCancellation: z.number(),
    dropOffRate: z.number(),
    periodChurnRate: z.number().nullable(),
    membershipRenewals: z.object({
      expectedInRange: z.number(),
      succeededInRange: z.number(),
      failedInvoicesInRange: z.number(),
      becamePastDueInRange: z.number(),
    }),
  }),
  revenue: z.object({
    total: z.number(),
    breakdown: z.object({
      membershipPurchase: RevenueBucketSchema,
      membershipRenewal: RevenueBucketSchema,
      oneTimePurchase: RevenueBucketSchema,
      additionalOneTimePurchase: RevenueBucketSchema,
      miniDraw: RevenueBucketSchema,
      upsell: RevenueBucketSchema,
    }),
  }),
  majorDraw: z.object({
    totalEntries: z.number(),
    activeDraws: z.number(),
  }),
  conversionRate: z.number(),
  facebookAds: z.object({
    spend: z.number(),
    roas: z.number(),
  }),
});

export const NormRevenueBreakdownSchema = z.object({
  dateRange: NormDateRangeSchema,
  total: z.number(),
  breakdown: NormDashboardStatsSchema.shape.revenue.shape.breakdown,
});
