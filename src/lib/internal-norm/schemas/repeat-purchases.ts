import { z } from "zod";

/**
 * Norm projection of the one-time-package repeat-purchase summary.
 * Aggregate counts only — no PII. Mirrors RepeatPurchaseSummary in
 * src/types/admin/repeatPurchase.ts (per-user rows are intentionally NOT exposed).
 */
export const NormRepeatPurchaseSummarySchema = z.object({
  oneTimeBuyers: z.number(),
  repeatBuyers: z.number(),
  repeatRate: z.number(),
  medianDaysToReturn: z.number().nullable(),
  repeatRevenue: z.number(),
  becameMembers: z.number(),
  totalPurchases: z.number(),
  buckets: z.array(z.object({ bucket: z.string(), users: z.number(), sharePct: z.number(), revenue: z.number() })),
  windows: z.array(
    z.object({ windowDays: z.number(), eligible: z.number(), returned: z.number(), rate: z.number() })
  ),
  // Per one-time package: anchor-grouped rates/revenue ("started*") + per-purchase gross.
  // Aggregate-only — package name + counts + AUD + rates, no user identifiers.
  packages: z.array(
    z.object({
      packageId: z.string(),
      packageName: z.string(),
      startedBuyers: z.number(),
      startedReturned: z.number(),
      startedRepeatRate: z.number(),
      startedBecameMembers: z.number(),
      startedMemberRate: z.number(),
      startedRevenue: z.number(),
      purchases: z.number(),
      grossRevenue: z.number(),
    })
  ),
});
