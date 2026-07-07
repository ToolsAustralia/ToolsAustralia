/**
 * Pure, environment-free helpers governing stranded past-due invoice recovery.
 *
 * Relocated here from `src/server/admin/recoverStrandedPastDuePolicy.ts` so the shared
 * recovery primitive (`src/services/subscription/prepareRecoveredCycleInvoice.ts`) and the
 * member-facing pay paths can reuse them WITHOUT a service → server/admin backwards
 * dependency. No Stripe SDK / Mongo imports — testable without env vars.
 *
 * Stripe idempotency keys live here because each step in the recovery sequence needs its
 * own stable key — using a single key for all calls would cause Stripe to return cached
 * responses across step boundaries.
 */

import type Stripe from "stripe";

/** Stable idempotency key for the void step. */
export function buildRecoveryVoidIdempotencyKey(originalInvoiceId: string): string {
  return `recover-void-${originalInvoiceId}`;
}

/** Stable idempotency key for the one-off invoice create step (keyed by ORIGINAL id). */
export function buildRecoveryCreateIdempotencyKey(originalInvoiceId: string): string {
  return `recover-create-${originalInvoiceId}`;
}

/** Stable idempotency key for the finalize step (keyed by NEW invoice id). */
export function buildRecoveryFinalizeIdempotencyKey(newInvoiceId: string): string {
  return `recover-finalize-${newInvoiceId}`;
}

/** Stable idempotency key for the invoice-item create step (keyed by ORIGINAL id). */
export function buildRecoveryItemIdempotencyKey(originalInvoiceId: string): string {
  return `recover-item-${originalInvoiceId}`;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: "still_chargeable" | "already_paid" | "unknown_status" };

/**
 * Recovery is only valid when the original invoice has aged out of payable state.
 * - `uncollectible` / `void` → eligible (the "stranded" case)
 * - `open` (exhausted) → eligible: Stripe quirk where smart retries have run out but
 *   status stays `open` (Dashboard labels these "Failed"). Detected via attempt_count >= 1
 *   and next_payment_attempt == null — `stripe.invoices.pay()` rejects these anyway.
 * - `open` (still active) / `draft` → still chargeable; admin should use the existing flow
 * - `paid` → already paid; nothing to recover
 */
export function isOriginalInvoiceEligibleForRecovery(invoice: Stripe.Invoice): EligibilityResult {
  switch (invoice.status) {
    case "uncollectible":
    case "void":
      return { eligible: true };
    case "open": {
      // Stripe quirk: an `open` invoice can be functionally dead. After smart
      // retries exhaust, Stripe stops scheduling (`next_payment_attempt: null`)
      // and `stripe.invoices.pay()` rejects with "no longer be paid" — but the
      // API status remains `open`. The Stripe Dashboard labels these as "Failed".
      //
      // Detection: status is `open` AND there's been at least one attempt AND
      // Stripe has stopped scheduling future attempts. That combination is the
      // unambiguous "Stripe gave up" signal — recovery via void+re-bill is the
      // right path even though API status is `open`.
      const attemptCount = invoice.attempt_count ?? 0;
      const hasNextAttempt = invoice.next_payment_attempt != null;
      if (attemptCount >= 1 && !hasNextAttempt) {
        return { eligible: true };
      }
      return { eligible: false, reason: "still_chargeable" };
    }
    case "draft":
      return { eligible: false, reason: "still_chargeable" };
    case "paid":
      return { eligible: false, reason: "already_paid" };
    default:
      return { eligible: false, reason: "unknown_status" };
  }
}

/**
 * Find a held draft on the subscription whose amount matches the expected cycle.
 * Picks the newest matching draft (Stripe creates one per missed cycle while paused;
 * we want the most recent so subsequent cycles' drafts can age out naturally).
 */
export function pickHeldDraftForRecovery(
  drafts: Stripe.Invoice[],
  expectedAmountCents: number
): Stripe.Invoice | null {
  const matches = drafts.filter(
    (d) => d.status === "draft" && d.amount_due === expectedAmountCents
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.created - a.created);
  return matches[0] ?? null;
}
