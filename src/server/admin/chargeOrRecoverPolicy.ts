/**
 * Pure decision function for the admin per-user past-due charge flow.
 *
 * Wraps `isOriginalInvoiceEligibleForRecovery` in a discriminated result that
 * downstream code can switch on without re-running the predicate. No Stripe SDK
 * or Mongoose imports — testable without env vars.
 */

import type Stripe from "stripe";
import { isOriginalInvoiceEligibleForRecovery } from "./recoverStrandedPastDuePolicy";

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
