/**
 * Stripe "excessive retries" / network do-not-retry detection.
 * See: https://support.stripe.com/questions/payment-blocked-due-to-excessive-retries
 *
 * When Visa/network retry limits are hit, Stripe may block sending the charge:
 * outcome.type === "blocked", outcome.reason === "previously_declined_do_not_retry".
 */

import type Stripe from "stripe";

export type StripeExcessiveRetryFailureReason = "stripe_excessive_retry";

export interface StripeExcessiveRetryAnalysis {
  requiresDifferentPaymentMethod: boolean;
  failureReason?: StripeExcessiveRetryFailureReason;
}

/**
 * Detect excessive-retry block from a Charge outcome (expanded on PaymentIntent.latest_charge).
 */
export function isStripeExcessiveRetryOutcome(outcome: Stripe.Charge.Outcome | null | undefined): boolean {
  if (!outcome) return false;
  return outcome.type === "blocked" && outcome.reason === "previously_declined_do_not_retry";
}

/**
 * The `outcome.reason` string this module keys on, as a named constant so the
 * admin cooldown can test a PERSISTED reason (BlockedTransaction.outcomeReason)
 * against the same value the live predicate above uses. One concept, one name.
 */
export const STRIPE_EXCESSIVE_RETRY_OUTCOME_REASON = "previously_declined_do_not_retry";

/**
 * Same check as `isStripeExcessiveRetryOutcome`, but against a stored reason
 * string rather than a live Stripe outcome object.
 */
export function isStripeExcessiveRetryReason(reason: string | null | undefined): boolean {
  return reason === STRIPE_EXCESSIVE_RETRY_OUTCOME_REASON;
}

/**
 * True when the PI's latest charge indicates Stripe blocked due to prior declines / excessive retries.
 */
export function paymentIntentRequiresDifferentMethodFromExpanded(pi: Stripe.PaymentIntent): boolean {
  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") return false;
  return isStripeExcessiveRetryOutcome(charge.outcome ?? undefined);
}

/**
 * Pull PaymentIntent id from a Stripe Node SDK error (e.g. after failed invoices.pay / confirm).
 */
export function extractPaymentIntentIdFromStripeError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as {
    payment_intent?: string | { id?: string };
    raw?: { payment_intent?: { id?: string } | string };
  };
  const pi = e.payment_intent;
  if (typeof pi === "string" && pi.startsWith("pi_")) return pi;
  if (pi && typeof pi === "object" && typeof pi.id === "string") return pi.id;
  const rawPi = e.raw?.payment_intent;
  if (typeof rawPi === "string" && rawPi.startsWith("pi_")) return rawPi;
  if (rawPi && typeof rawPi === "object" && typeof rawPi.id === "string") return rawPi.id;
  return null;
}

/**
 * Retrieve PI with latest_charge expanded and check for excessive-retry block. Fails open on errors.
 */
export async function analyzePaymentIntentForExcessiveRetry(
  stripe: Stripe,
  paymentIntentId: string
): Promise<StripeExcessiveRetryAnalysis> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });
    if (paymentIntentRequiresDifferentMethodFromExpanded(pi)) {
      return { requiresDifferentPaymentMethod: true, failureReason: "stripe_excessive_retry" };
    }
  } catch {
    // Fail open: treat as unknown decline
  }
  return { requiresDifferentPaymentMethod: false };
}

/**
 * If the Stripe error references a PI, analyze it; otherwise no signal.
 */
export async function analyzeStripePayErrorForExcessiveRetry(
  stripe: Stripe,
  payError: unknown
): Promise<StripeExcessiveRetryAnalysis> {
  const id = extractPaymentIntentIdFromStripeError(payError);
  if (!id) return { requiresDifferentPaymentMethod: false };
  return analyzePaymentIntentForExcessiveRetry(stripe, id);
}

/** Invoice PaymentIntent client secrets are `pi_xxx_secret_yyy`. */
export function paymentIntentIdFromClientSecret(clientSecret: string): string | null {
  const marker = "_secret_";
  const i = clientSecret.indexOf(marker);
  if (i === -1) return null;
  const prefix = clientSecret.slice(0, i);
  return prefix.startsWith("pi_") ? prefix : null;
}
