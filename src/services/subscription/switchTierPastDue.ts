/**
 * Past-due tier switch — the teardown step.
 *
 * A past-due member who wants a DIFFERENT tier cannot upgrade/downgrade in place: a proration
 * swap on an existing subscription spawns a granting `subscription_update` invoice (the reason
 * same-tier reactivation is the only in-place recovery — see docs/PAST_DUE_REANCHOR.md). So we
 * CANCEL the past-due subscription immediately and VOID (forgive) its open renewal invoice(s),
 * leaving the account in a clean `canceled` state. The caller then runs the ordinary
 * fresh-subscribe flow for the new tier (create-subscription-existing-user), which grants exactly
 * once via its own `subscription_create` invoice and carries over `lastMonthAccumulatedEntries`
 * (preserved by {@link cancelSubscription}).
 *
 * Cancel + void emit only `customer.subscription.deleted` + `invoice.voided` — never
 * `invoice.payment_succeeded` — so there is NO spurious-grant risk from the teardown. The single
 * intended grant is the new subscription's own `subscription_create` invoice.
 *
 * The stored DB status lags Stripe (webhook queue), so the teardown reconciles against LIVE Stripe
 * status before the irreversible cancel: it only tears down a genuinely past_due/unpaid live sub,
 * refuses to cancel one Stripe has already RECOVERED, and treats an already-gone sub as done.
 *
 * @module services/subscription/switchTierPastDue
 */

import { stripe } from "@/lib/stripe";
import type { IUser } from "@/models/User";
import { cancelSubscription } from "@/services/subscription/CancelSubscriptionService";
import {
  resolveCancellableStripeSubscription,
  isSubscriptionReferenceError,
  SUBSCRIPTION_REFERENCE_ERROR_CODES,
} from "@/services/subscription/SubscriptionReferenceService";

/** The subscription is not past due — this teardown must never run on an active subscription. */
export class NotPastDueError extends Error {
  readonly code = "NOT_PAST_DUE";
  constructor() {
    super("Subscription is not past due");
    this.name = "NotPastDueError";
  }
}

/**
 * Stripe has already RECOVERED the subscription (a dunning retry succeeded); the local `past_due`
 * was just stale. We must NOT cancel a live/paid subscription — the caller should refresh.
 */
export class SubscriptionRecoveredError extends Error {
  readonly code = "SUBSCRIPTION_RECOVERED";
  constructor() {
    super("Good news — your payment already went through and your membership is active again. Refresh to continue.");
    this.name = "SubscriptionRecoveredError";
  }
}

export interface SwitchTierPastDueResult {
  /** The canceled subscription id, or null when the sub was already gone before we ran. */
  subscriptionId: string | null;
  cancelledImmediately: boolean;
  /** How many open/uncollectible invoices were voided (forgiven). */
  invoicesVoided: number;
  /** True when no teardown was needed (sub already canceled/gone) — an idempotent no-op. */
  alreadyClosed: boolean;
}

/** Mark the DB subscription canceled (used when Stripe already has no manageable sub). */
async function markSubscriptionCanceled(user: IUser): Promise<void> {
  if (!user.subscription) return;
  user.subscription.isActive = false;
  user.subscription.status = "canceled";
  user.subscription.autoRenew = false;
  user.markModified("subscription");
  await user.save();
}

/**
 * Cancel a past-due subscription immediately and void its open renewal invoice(s), so the member
 * can resubscribe to a different tier via the normal fresh-subscribe flow.
 *
 * Reconciles against LIVE Stripe status first:
 *  - stored `canceled` (a retried teardown) → no-op, `alreadyClosed`.
 *  - live status past_due/unpaid → tear down (cancel + void).
 *  - live status recovered (active/trialing/…) → throw {@link SubscriptionRecoveredError} (never
 *    cancel a paid sub).
 *  - Stripe has no manageable sub (dunning-exhausted cancel not yet webhooked) → sync DB canceled,
 *    return `alreadyClosed`.
 *
 * @param user Mongoose user document (mutated + saved).
 */
export async function abandonPastDueForTierSwitch(user: IUser): Promise<SwitchTierPastDueResult> {
  const localStatus = user.subscription?.status;

  // Idempotent: a retried POST after the first teardown already canceled the sub locally → nothing
  // to do; let the caller proceed to resubscribe.
  if (localStatus === "canceled") {
    return { subscriptionId: null, cancelledImmediately: false, invoicesVoided: 0, alreadyClosed: true };
  }
  if (localStatus !== "past_due") {
    throw new NotPastDueError();
  }

  // Reconcile against LIVE Stripe status before the irreversible cancel — the local status lags the
  // webhook queue, so a dunning retry may have recovered (or Stripe may have already canceled) the sub.
  let liveStatus: string;
  try {
    const { subscription: liveSub } = await resolveCancellableStripeSubscription(user);
    liveStatus = liveSub.status;
  } catch (error) {
    if (
      isSubscriptionReferenceError(error) &&
      error.code === SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION
    ) {
      // Stripe has no manageable sub — already gone (dunning-exhausted cancel not yet webhooked, or a
      // retried teardown). Sync the DB to canceled so the member can resubscribe, and report done.
      await markSubscriptionCanceled(user);
      return { subscriptionId: null, cancelledImmediately: false, invoicesVoided: 0, alreadyClosed: true };
    }
    throw error;
  }

  if (liveStatus !== "past_due" && liveStatus !== "unpaid") {
    // Stripe RECOVERED the subscription (e.g. a dunning retry succeeded) after our last sync — do NOT
    // cancel a live/paid subscription. The caller refreshes to the resolved (active) state.
    throw new SubscriptionRecoveredError();
  }

  // Cancel immediately (cancelSubscription auto-immediates for past_due): status→canceled,
  // isActive→false, partner-discount queue ended, lastMonthAccumulatedEntries preserved.
  const cancelResult = await cancelSubscription(user, { analytics: { actor: "user" } });

  // Forgive the failed renewal: void every open/uncollectible invoice on the (now canceled) sub.
  // Voiding AFTER cancel avoids racing a dunning retry, and voidInvoice emits `invoice.voided` only
  // (never a granting payment event). Per-invoice best-effort so one transient failure never aborts
  // the rest or blocks the resubscribe. Only finalized invoices are voidable (draft/paid left as-is).
  let invoicesVoided = 0;
  for (const status of ["open", "uncollectible"] as const) {
    let invoices;
    try {
      invoices = await stripe.invoices.list({ subscription: cancelResult.subscriptionId, status, limit: 100 });
    } catch (error) {
      console.error(`[switch-tier-past-due] listing ${status} invoices failed (non-blocking):`, error);
      continue;
    }
    for (const invoice of invoices.data) {
      if (!invoice.id) continue;
      try {
        await stripe.invoices.voidInvoice(invoice.id);
        invoicesVoided++;
      } catch (error) {
        console.error(`[switch-tier-past-due] voiding invoice ${invoice.id} failed (non-blocking):`, error);
      }
    }
  }

  return {
    subscriptionId: cancelResult.subscriptionId,
    cancelledImmediately: cancelResult.cancelledImmediately,
    invoicesVoided,
    alreadyClosed: false,
  };
}
