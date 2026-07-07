/**
 * Admin-specific helpers for the per-user "recover stranded past-due" flow.
 *
 * The PURE, environment-free pieces — the eligibility predicate
 * (`isOriginalInvoiceEligibleForRecovery`), the held-draft picker
 * (`pickHeldDraftForRecovery`), and the recovery idempotency-key builders — were
 * relocated to `@/utils/payment/recovery/stranded-invoice-policy` so the shared
 * recovery primitive and member-facing pay paths can reuse them without a
 * service → server/admin backwards dependency. They are re-exported here for
 * backward compatibility with existing admin importers.
 *
 * What remains here is admin-only: the 6h recovery-lock predicate that reads
 * InvoiceChargeLog rows (depends on `past-due-charge-idempotency`).
 */

import { RECENT_ATTEMPT_WINDOW_HOURS, cutoffForRecentAttempt } from "./past-due-charge-idempotency";

export { RECENT_ATTEMPT_WINDOW_HOURS } from "./past-due-charge-idempotency";

// Re-export the relocated pure helpers so existing admin importers keep working unchanged.
export {
  buildRecoveryVoidIdempotencyKey,
  buildRecoveryCreateIdempotencyKey,
  buildRecoveryFinalizeIdempotencyKey,
  buildRecoveryItemIdempotencyKey,
  isOriginalInvoiceEligibleForRecovery,
  pickHeldDraftForRecovery,
} from "@/utils/payment/recovery/stranded-invoice-policy";
export type { EligibilityResult } from "@/utils/payment/recovery/stranded-invoice-policy";

type RecoveryLogRow = {
  attemptedAt: Date;
  result?: unknown;
};

/**
 * 24h lock predicate. Returns true if any prior recovery attempt on the same
 * original invoice happened within the window. Reuses `RECENT_ATTEMPT_WINDOW_HOURS`
 * from the existing past-due idempotency module.
 */
export function hasRecentRecoveryAttempt(
  rows: RecoveryLogRow[],
  originalInvoiceId: string,
  now: Date = new Date()
): boolean {
  const cutoff = cutoffForRecentAttempt(now);
  for (const row of rows) {
    if (row.attemptedAt < cutoff) continue;
    const recovery = extractRecoveryTag(row.result);
    if (recovery?.originalInvoiceId === originalInvoiceId) return true;
  }
  return false;
}

function extractRecoveryTag(
  result: unknown
): { originalInvoiceId?: string } | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const recovery = record.recovery;
  if (!recovery || typeof recovery !== "object") return null;
  return recovery as { originalInvoiceId?: string };
}
