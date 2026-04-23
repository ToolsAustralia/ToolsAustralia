import { z } from "zod";

/** Zod schema for MonthlyEntryCampaign.segmentConfig (admin APIs + targeting previews) */
export const monthlyCouponSegmentConfigSchema = z
  .object({
    minInactiveDays: z.number().int().min(0).optional(),
    maxInactiveDays: z.number().int().min(0).optional(),
    requiresEmailVerified: z.boolean().optional(),
    requiresRecentPurchaseDays: z.number().int().min(1).optional(),
    includeUserIds: z.array(z.string()).optional(),
    excludeUserIds: z.array(z.string()).optional(),
    states: z.array(z.string().trim().min(2).max(3)).optional(),
    membershipTiers: z
      .array(z.enum(["tradie-subscription", "foreman-subscription", "boss-subscription"]))
      .optional(),
    topEntriesPercent: z.number().int().min(1).max(100).optional(),
  })
  .optional();
