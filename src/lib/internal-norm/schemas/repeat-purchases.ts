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
});
