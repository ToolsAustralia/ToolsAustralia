/**
 * Pure decision functions for the admin past-due charge flows (per-user AND bulk).
 *
 * Wraps `isOriginalInvoiceEligibleForRecovery` in discriminated results that
 * downstream code can switch on without re-running the predicate. No Stripe SDK
 * or Mongoose imports — testable without env vars (type-only imports are erased).
 */

import type Stripe from "stripe";
import { isOriginalInvoiceEligibleForRecovery } from "./recoverStrandedPastDuePolicy";
import type { RecoverStrandedResult } from "./recoverStrandedPastDue";

export type ChargeActionDecision =
  | { kind: "recover" }
  | { kind: "pay" };

/**
 * Decide whether a candidate invoice should be paid directly or routed through
 * the stranded-recovery flow. "recover" is selected for invoices Stripe has
 * given up on (status: open with no scheduled retry, plus uncollectible/void).
 */
export function chooseChargeAction(invoice: Stripe.Invoice): ChargeActionDecision {
  const eligibility = isOriginalInvoiceEligibleForRecovery(invoice);
  return eligibility.eligible ? { kind: "recover" } : { kind: "pay" };
}

type InvoiceWithPayments = Stripe.Invoice & {
  payments?: { data?: Array<{ status?: string | null } | null> | null } | null;
};

/**
 * BULK variant of the pay-vs-recover decision, used by the chunked bulk charge job.
 *
 * Differs from `chooseChargeAction` in one load-bearing way: an open-exhausted
 * invoice (attempt_count >= 1, next_payment_attempt null) is only routed to
 * recovery when NO payable invoice_payment remains. `stripe.invoices.pay()`
 * rejects with "This invoice can no longer be paid" precisely when every
 * invoice_payment's PaymentIntent has been CANCELED — but an exhausted invoice
 * whose PI is still live (invoice_payment status "open", e.g. a recovered-then-
 * declined cycle finalized with auto_advance:false) IS still directly payable,
 * and recovery would dead-end it (`no_held_draft` — its draft was already
 * consumed). Measured on the 2026-07-19 run: 558 rejected invoices all had only
 * canceled payments; 28 of the 177 card-declined (i.e. genuinely attempted)
 * invoices were exhausted-but-payable and must stay on the pay branch.
 *
 * Requires the invoice retrieved with `expand: ["payments"]`. When `payments`
 * was not expanded, falls back to "pay" (the legacy behavior) rather than
 * guessing recovery.
 */
export function decideBulkChargeAction(invoice: Stripe.Invoice): ChargeActionDecision {
  const eligibility = isOriginalInvoiceEligibleForRecovery(invoice);
  if (!eligibility.eligible) return { kind: "pay" };

  // void / uncollectible can never be paid via invoices.pay — always recover.
  if (invoice.status === "void" || invoice.status === "uncollectible") {
    return { kind: "recover" };
  }

  // open-exhausted: recover only when nothing payable remains.
  const payments = (invoice as InvoiceWithPayments).payments?.data;
  if (payments == null) return { kind: "pay" }; // not expanded — preserve pay behavior
  const hasPayableInvoicePayment = payments.some((p) => p?.status === "open");
  return hasPayableInvoicePayment ? { kind: "pay" } : { kind: "recover" };
}

/** Fields the bulk job writes to the run-tagged InvoiceChargeLog summary row for a recovery. */
export interface BulkRecoverySummary {
  status: "success" | "failed" | "skipped";
  errorMessage: string;
  /** Cents, for the log row (revenue totals count it only on success). */
  amount: number;
  newInvoiceId?: string;
}

/** Recovery refusals that happened MID-FLIGHT (Stripe state may have changed) → "failed". */
const MID_FLIGHT_RECOVERY_FAILURES = new Set<string>([
  "void_failed",
  "draft_create_failed",
  "finalize_failed",
]);

/**
 * Map a `recoverStrandedPastDueInvoice` result to the single run-tagged summary
 * row the bulk job writes against the ORIGINAL worklist invoice id. Exactly one
 * run-tagged row must exist per worklist item — the chunk loop's `remaining`
 * computation and the run totals both key on it. (The recovery flow's own
 * internal rows — step audits and the pay row on the NEW invoice id — carry no
 * chargeRunId, so they are never double-counted.)
 *
 * Skip messages are phrased so `classifySkipReason` buckets them:
 * "not past_due" → noLongerPastDue, "already_paid" → alreadyPaid,
 * "payment method" → missingPaymentMethod; the rest land in "other".
 */
export function summarizeBulkRecoveryOutcome(
  result: RecoverStrandedResult,
  fallbackAmountCents: number
): BulkRecoverySummary {
  if (result.ok) {
    const row = result.row;
    const amount = row.amount ?? fallbackAmountCents;
    if (row.status === "success") {
      return {
        status: "success",
        amount,
        newInvoiceId: result.newInvoiceId,
        errorMessage: `Recovered: stranded original voided; held draft ${result.newInvoiceId} finalized and paid`,
      };
    }
    if (row.status === "failed") {
      return {
        status: "failed",
        amount,
        newInvoiceId: result.newInvoiceId,
        errorMessage: `Recovery pay failed on ${result.newInvoiceId}: ${row.error ?? "unknown error"}`,
      };
    }
    return {
      status: "skipped",
      amount,
      newInvoiceId: result.newInvoiceId,
      errorMessage: `Recovery pay skipped on ${result.newInvoiceId}: ${row.skipReason ?? "unknown reason"}`,
    };
  }

  if (MID_FLIGHT_RECOVERY_FAILURES.has(result.reason)) {
    return {
      status: "failed",
      amount: fallbackAmountCents,
      errorMessage: `Recovery ${result.reason}: ${result.message}`,
    };
  }

  return {
    status: "skipped",
    amount: fallbackAmountCents,
    errorMessage: `Skipped: recovery ${result.reason} — ${result.message}`,
  };
}
