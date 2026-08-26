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
import { RECOVERY_DECLINE_CODES } from "@/utils/admin/chargeDeclineReasons";
import { isStripeExcessiveRetryReason } from "@/utils/payment/stripe/stripe-excessive-retry";

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
  /**
   * Present ONLY when a separate, CODED pay row exists on that new invoice. Both
   * admin decline views key on this to avoid double-counting the member — see
   * `src/utils/admin/chargeDeclineReasons.ts`. Never set it speculatively.
   */
  newInvoiceId?: string;
  /**
   * Synthetic decline code persisted so a codeless recovery outcome buckets as itself
   * instead of `unknown`. Only set where NO coded twin row exists.
   */
  errorCode?: string;
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
        // Generic wording: recover either finalized+paid a held draft OR (no_held_draft cohort) minted+paid
        // a fresh current cycle — both "collect the owed cycle now", so don't hard-code "held draft".
        errorMessage: `Recovered: collected the owed cycle now (invoice ${result.newInvoiceId})`,
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
    // No `newInvoiceId` here — and that is load-bearing, not an oversight. This branch
    // covers the mint / re-bill cohort (`no_held_draft` → `unpauseAndAnchorNow`), where
    // no separate coded pay row is ever written, so THIS row is the member's only
    // record of the decline. Stamp a synthetic code so both admin decline views can
    // bucket it instead of dropping it (it was hidden entirely) or showing it as
    // `unknown` (237 real declines over 28–31 Jul 2026).
    return {
      status: "failed",
      amount: fallbackAmountCents,
      errorMessage: `Recovery ${result.reason}: ${result.message}`,
      errorCode: RECOVERY_DECLINE_CODES.rebillNotSettled,
    };
  }

  return {
    status: "skipped",
    amount: fallbackAmountCents,
    errorMessage: `Skipped: recovery ${result.reason} — ${result.message}`,
  };
}

/**
 * Days a card sits out after Stripe blocks it via Adaptive Acceptance.
 *
 * Stripe support's own guidance is "wait 2-3 days between retry attempts for
 * the same transaction"; we take the top of that range. Deliberately NOT the
 * general per-invoice window — ordinary declines keep the existing cadence.
 */
export const EXCESSIVE_RETRY_COOLDOWN_DAYS = 3;

/** The single blocked-card fact the cooldown decision needs. */
export type LatestBlockForCooldown = {
  cardFingerprint: string;
  outcomeReason?: string | null;
  /** When WE observed the block. Never `createdAt` — that is the PaymentIntent's
   *  creation time and can precede the block by days. */
  capturedAt: Date;
};

export type CooldownDecision =
  | { cooldown: false }
  | { cooldown: true; retryAfter: Date; daysRemaining: number };

/**
 * Should this invoice sit out because the card it will charge is inside an
 * Stripe excessive-retry block window?
 *
 * Scoped to the CARD, not the customer — three cases this gets right that a
 * customer-scoped check would not:
 *   1. Member added a new card after being blocked → fingerprints differ →
 *      charge immediately. A customer-scoped check would wrongly freeze them.
 *   2. Block was a Radar reason (`rule`, `highest_risk_level`) → allowlisting
 *      DOES fix those, so no cooldown.
 *   3. Block has aged past the window → retry normally.
 *
 * Pure: caller supplies the latest block row and the fingerprint the invoice
 * will actually charge.
 */
export function shouldCooldownForExcessiveRetry(params: {
  latestBlock: LatestBlockForCooldown | null | undefined;
  /** Fingerprint of the payment method this invoice will charge. */
  currentFingerprint: string | null | undefined;
  now: Date;
  cooldownDays?: number;
}): CooldownDecision {
  const { latestBlock, currentFingerprint, now } = params;
  const cooldownDays = params.cooldownDays ?? EXCESSIVE_RETRY_COOLDOWN_DAYS;

  if (!latestBlock || !currentFingerprint) return { cooldown: false };

  // Different card than the one Stripe blocked → nothing to sit out.
  if (latestBlock.cardFingerprint !== currentFingerprint) return { cooldown: false };

  // Radar-type blocks are fixable by the allow list; only Adaptive Acceptance
  // blocks are immune to it and therefore worth backing off from.
  if (!isStripeExcessiveRetryReason(latestBlock.outcomeReason)) {
    return { cooldown: false };
  }

  const windowMs = cooldownDays * 24 * 60 * 60 * 1000;
  const retryAfter = new Date(latestBlock.capturedAt.getTime() + windowMs);
  if (now.getTime() >= retryAfter.getTime()) return { cooldown: false };

  const daysRemaining = Math.max(
    1,
    Math.ceil((retryAfter.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  );
  return { cooldown: true, retryAfter, daysRemaining };
}

/** How a failed `invoices.retrieve` should be treated by the bulk charge job. */
export type InvoiceRetrieveFailure =
  /** The invoice is genuinely gone. Retrying cannot help; record a skip. */
  | "permanent"
  /** Stripe was unreachable (429 / 5xx / network). Worth another attempt. */
  | "transient"
  /** Real error (auth, bad request). Retrying will not help, but it is NOT
   *  evidence the invoice is deleted — record a failure, never a skip. */
  | "fatal";

/**
 * Classify a Stripe error from `invoices.retrieve`.
 *
 * Exists because a bare catch previously recorded EVERY failure as a permanent
 * "deleted/void" skip — so a transient rate limit silently retired a member for
 * the day and read in the admin UI as though their invoice no longer existed.
 * Rate limits are exactly what a long, paced run is most likely to hit.
 *
 * Pure so the three branches can be tested without Stripe or a DB.
 */
export function classifyInvoiceRetrieveError(err: unknown): InvoiceRetrieveFailure {
  const e = err as { code?: string; statusCode?: number; type?: string } | null | undefined;
  if (!e) return "fatal";

  if (e.code === "resource_missing" || e.statusCode === 404) return "permanent";

  if (
    e.statusCode === 429 ||
    e.code === "rate_limit" ||
    (typeof e.statusCode === "number" && e.statusCode >= 500) ||
    e.type === "StripeConnectionError" ||
    e.type === "StripeAPIError"
  ) {
    return "transient";
  }

  return "fatal";
}
