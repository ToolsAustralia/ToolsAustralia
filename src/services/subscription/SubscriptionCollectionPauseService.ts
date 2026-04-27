/**
 * Pauses / resumes Stripe subscription invoice collection around failed renewals.
 *
 * When a renewal invoice fails, Stripe can otherwise keep creating invoices each billing
 * period while the subscription stays past_due, stacking charges and duplicate renewal benefits.
 *
 * After a failed renewal we set `pause_collection` with `keep_as_draft` so new invoices
 * during the pause do not finalize/charge until collection resumes. The existing open
 * invoice remains collectible per Stripe's retry rules.
 *
 * After a successful `subscription_cycle` payment we clear `pause_collection` so the next
 * renewal behaves normally.
 *
 * @see https://stripe.com/docs/billing/subscriptions/pause-payment
 */

import { stripe } from "@/lib/stripe";

/** Pure policy helpers (no Stripe client); safe to import in tests. */
export {
  shouldClearPauseCollectionAfterPaidInvoice,
  describePauseCollection,
} from "./pauseCollectionPolicy";

export async function pauseAfterRenewalFailure(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: {
      behavior: "keep_as_draft",
    },
  });
}

/**
 * Clears `pause_collection` (manual unpausing). Safe if the subscription was not paused.
 */
export async function resumeAfterSuccessfulRenewalPayment(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    // Stripe clears the field when set to empty string (see API "manually unpausing")
    pause_collection: "",
  });
}
