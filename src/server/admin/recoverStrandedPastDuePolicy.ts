/**
 * Pure helpers governing the per-user "recover stranded past-due" flow.
 *
 * Kept in their own module (no Stripe SDK / Mongo imports) so they can be unit-tested
 * without `STRIPE_SECRET_KEY` or a DB connection in the environment.
 *
 * Stripe idempotency keys live here because each step in the recovery sequence
 * needs its own stable key — using a single key for all four calls would cause
 * Stripe to return cached responses across step boundaries.
 */

import type Stripe from "stripe";
import { RECENT_ATTEMPT_WINDOW_HOURS, cutoffForRecentAttempt } from "./past-due-charge-idempotency";

export { RECENT_ATTEMPT_WINDOW_HOURS } from "./past-due-charge-idempotency";

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
 * - `open` / `draft` → still chargeable; admin should use the existing flow
 * - `paid` → already paid; nothing to recover
 */
export function isOriginalInvoiceEligibleForRecovery(invoice: Stripe.Invoice): EligibilityResult {
  switch (invoice.status) {
    case "uncollectible":
    case "void":
      return { eligible: true };
    case "open":
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
