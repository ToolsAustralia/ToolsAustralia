// src/server/admin/forceChargePastDuePolicy.ts
/**
 * Pure helpers for the Force Charge past-due flow.
 *
 * No Stripe SDK or Mongoose imports — testable without env vars.
 *
 * The orchestrator pairs an open or held-draft invoice with the user's
 * current subscription, finalizes if needed, and pays via the existing
 * payOpenInvoiceAsPastDueAdmin primitive. Critical: never create new
 * invoices manually — the webhook does not recognize `billing_reason: "manual"`.
 */

import type Stripe from "stripe";
import { isOriginalInvoiceEligibleForRecovery } from "@/utils/payment/recovery/stranded-invoice-policy";

/** Stable Stripe idempotency key for the finalize step. */
export function buildForceChargeFinalizeIdempotencyKey(invoiceId: string): string {
  return `force-finalize-${invoiceId}`;
}

export type ForceChargeTarget =
  | { kind: "open"; invoice: Stripe.Invoice }
  // A "stranded" open invoice (retry-exhausted): stripe.invoices.pay() rejects it, so the
  // orchestrator recovers it (void + finalize the held draft) instead of paying it directly.
  | { kind: "stranded"; invoice: Stripe.Invoice }
  | { kind: "draft"; invoice: Stripe.Invoice };

/**
 * Pick the single best invoice on the user's current subscription to charge.
 * - Prefers a **live** `open` invoice (charge_automatically, amount_remaining>0, Stripe still
 *   retrying) → `kind: "open"` (pay directly).
 * - Else a **stranded** open invoice (retry-exhausted per `isOriginalInvoiceEligibleForRecovery`)
 *   → `kind: "stranded"` (the orchestrator recovers it, never pays it directly).
 * - Else the newest `draft` invoice whose amount_due matches expectedAmountCents → `kind: "draft"`.
 * - Returns null when none fit (caller BLOCKs with "no_chargeable_invoice").
 *
 * Never returns a candidate that would require creating a new invoice — the design disallows that.
 */
export function pickForceChargeTarget(
  openInvoices: Stripe.Invoice[],
  draftInvoices: Stripe.Invoice[],
  expectedAmountCents: number
): ForceChargeTarget | null {
  const candidateOpens = openInvoices.filter(
    (inv) => inv.collection_method === "charge_automatically" && (inv.amount_remaining ?? 0) > 0
  );
  // Partition by Stripe's retry state: a live open can be paid directly; a stranded open
  // (attempt_count>=1 && next_payment_attempt==null) must be recovered, not paid.
  const liveOpens = candidateOpens.filter((inv) => !isOriginalInvoiceEligibleForRecovery(inv).eligible);
  const strandedOpens = candidateOpens.filter((inv) => isOriginalInvoiceEligibleForRecovery(inv).eligible);

  if (liveOpens.length > 0) {
    liveOpens.sort((a, b) => b.created - a.created);
    return { kind: "open", invoice: liveOpens[0]! };
  }
  if (strandedOpens.length > 0) {
    strandedOpens.sort((a, b) => b.created - a.created);
    return { kind: "stranded", invoice: strandedOpens[0]! };
  }

  // Draft fallback — must match expected cycle amount
  const eligibleDrafts = draftInvoices.filter(
    (d) => d.status === "draft" && d.amount_due === expectedAmountCents
  );
  if (eligibleDrafts.length > 0) {
    eligibleDrafts.sort((a, b) => b.created - a.created);
    return { kind: "draft", invoice: eligibleDrafts[0]! };
  }

  return null;
}

type StripeInvoiceWithPeriod = Stripe.Invoice & {
  period?: { start?: number; end?: number };
};

/**
 * Whether any paid invoice in the given list overlaps the current billing period.
 * Used as the Stripe-side double-billing guard. Period values are Unix seconds.
 */
export function isCurrentPeriodAlreadyPaid(
  paidInvoices: Stripe.Invoice[],
  currentPeriodStart: number,
  currentPeriodEnd: number
): boolean {
  for (const raw of paidInvoices) {
    const inv = raw as StripeInvoiceWithPeriod;
    if (inv.status !== "paid") continue;
    const start = inv.period?.start;
    const end = inv.period?.end;
    if (typeof start !== "number" || typeof end !== "number") continue;
    // Overlap test (closed intervals on both ends)
    if (start <= currentPeriodEnd && end >= currentPeriodStart) {
      return true;
    }
  }
  return false;
}

type ChargeLogRowForLock = {
  attemptedAt: Date;
  status: "success" | "failed" | "skipped";
  result?: unknown;
};

/**
 * 24h success-status lock predicate. True if a successful Force Charge
 * attempt against the same subscription happened within the last 24h.
 *
 * Reads `result.subscriptionId` from each row — the orchestrator stamps that
 * value into every InvoiceChargeLog row it writes for force-charge attempts.
 */
export function hasRecentSuccessfulChargeOnSubscription(
  rows: ChargeLogRowForLock[],
  subscriptionId: string,
  now: Date = new Date()
): boolean {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  for (const row of rows) {
    if (row.status !== "success") continue;
    if (row.attemptedAt < cutoff) continue;
    const sub = extractSubscriptionId(row.result);
    if (sub === subscriptionId) return true;
  }
  return false;
}

function extractSubscriptionId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  if (typeof record.subscriptionId === "string") return record.subscriptionId;
  return null;
}
