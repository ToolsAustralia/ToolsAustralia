import type Stripe from "stripe";
import BlockedTransaction from "@/models/BlockedTransaction";

/**
 * Plain record shape persisted to the `blockedtransactions` collection.
 * `paymentIntentId` is the document `_id` for natural idempotency.
 */
export type BlockedTransactionRecord = {
  paymentIntentId: string;
  chargeId: string;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
  outcomeType: string | null;
  outcomeNetworkStatus: string | null;
  outcomeReason: string | null;
  amount: number;
  currency: string;
  rawOutcome: unknown;
  createdAt: Date;
};

/**
 * Pure projection of a Stripe `(PaymentIntent, Charge)` pair into the row we
 * persist. Returns `null` if the charge is missing card details or if the
 * charge's outcome is not a true Stripe-side block.
 *
 * Predicate is `outcome.type === "blocked"` — matches what Stripe Dashboard
 * labels with the "Blocked" status pill, and what the issuer-directed
 * auto-block mechanism actually produces. We deliberately do NOT include
 * `outcome.network_status === "declined_by_network"` here, even though the
 * webhook's outer `isBlocked` check does — that broader OR captures every
 * normal issuer decline (insufficient_funds, do_not_honor, etc.) and would
 * inflate this collection by ~16x with rows that aren't candidates for
 * allowlisting. The webhook's broader gate still runs `allowlist.apply()`
 * on those (the existing eligibility filter in the service handles them);
 * only the persisted dataset is tightened.
 *
 * Shared between the live webhook handler and the historical backfill script
 * so both write rows with identical shape.
 */
export function buildBlockedTransactionRecord(
  pi: Stripe.PaymentIntent,
  charge: Stripe.Charge
): BlockedTransactionRecord | null {
  const card = charge.payment_method_details?.card;
  if (!card?.fingerprint) return null;

  if (charge.outcome?.type !== "blocked") return null;

  const stripeCustomerId =
    typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
  const customerEmail = pi.receipt_email ?? charge.billing_details?.email ?? null;

  return {
    paymentIntentId: pi.id,
    chargeId: charge.id,
    cardFingerprint: card.fingerprint,
    cardLast4: card.last4 ?? "",
    cardBrand: card.brand ?? "unknown",
    stripeCustomerId,
    customerEmail,
    declineCode: pi.last_payment_error?.decline_code ?? null,
    failureCode: pi.last_payment_error?.code ?? null,
    outcomeType: charge.outcome?.type ?? null,
    outcomeNetworkStatus: charge.outcome?.network_status ?? null,
    outcomeReason: charge.outcome?.reason ?? null,
    amount: pi.amount,
    currency: pi.currency,
    rawOutcome: charge.outcome ?? null,
    createdAt: new Date(pi.created * 1000),
  };
}

/**
 * Idempotent upsert keyed on PI id. Safe to call from a Stripe webhook that
 * may be retried — second call updates `capturedAt` and any newly-changed
 * fields without inserting a duplicate. Caller is responsible for calling
 * `connectDB()` first (the webhook and backfill both do).
 */
export async function upsertBlockedTransaction(
  record: BlockedTransactionRecord
): Promise<void> {
  await BlockedTransaction.findOneAndUpdate(
    { _id: record.paymentIntentId },
    { $set: { ...record, capturedAt: new Date() } },
    { upsert: true, new: true }
  );
}
