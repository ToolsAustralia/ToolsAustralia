// src/lib/internal-norm/schemas/milestone-rewards.ts
//
// Norm response schemas for the milestone-rewards admin domain.
//
// MilestoneReward rows are admin-configured "spend N AUD" / "earn N entries" /
// "stay a member for N days" thresholds. Each row joins to its issuance ledger
// (`MilestoneIssuance`) to expose per-reward performance: issued / redeemed /
// active / expired / cancelled counts plus `totalEntriesGranted` and a
// redemption-rate percentage.
//
// Conservative projection — Mongo ObjectIds expose as opaque strings,
// `createdBy` collapses to its opaque User._id string (admin-internal metadata),
// Date fields serialise to ISO 8601 strings. No per-user issuance rows are
// projected — only the aggregate performance block per reward.
import { z } from "zod";

const MILESTONE_TYPES = ["spend-amount", "entries-gained", "loyalty-days", "streak-months"] as const;

const MilestoneRewardPerformanceSchema = z.object({
  issuedCount: z.number().int().nonnegative(),
  redeemedCount: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  expiredCount: z.number().int().nonnegative(),
  cancelledCount: z.number().int().nonnegative(),
  // Pre-launch streak rungs marked achieved with zero entries (excluded from issuedCount).
  backfilledCount: z.number().int().nonnegative(),
  totalEntriesGranted: z.number().int().nonnegative(),
  redemptionRate: z.number().int().min(0).max(100), // whole-percent (0-100), rounded server-side
});

const MilestoneRewardRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayLabel: z.string().optional(),
  milestoneType: z.enum(MILESTONE_TYPES),
  threshold: z.number().int().positive(),
  entriesAmount: z.number().int().positive(),
  code: z.string(),
  isActive: z.boolean(),
  neverExpires: z.boolean(),
  startsAt: z.string().nullable(),                // ISO 8601 or null
  endsAt: z.string().nullable(),                  // ISO 8601 or null
  isRecurring: z.boolean(),
  recurrencePeriod: z.number().int().positive().nullable(), // 12 for streak rungs (ladder repeats annually); null = legacy whole-multiple recurrence
  autoGrant: z.boolean(),                         // streak rungs grant straight into the draw (no claim)
  createdBy: z.string().nullable(),               // opaque User._id string or null
  createdAt: z.string(),                          // ISO 8601
  updatedAt: z.string(),                          // ISO 8601
  performance: MilestoneRewardPerformanceSchema,
});

export const NormMilestoneRewardsListSchema = z.object({
  data: z.array(MilestoneRewardRowSchema),
  count: z.number().int().nonnegative(),
});
