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
 * @module services/subscription/switchTierPastDue
 */

import { stripe } from "@/lib/stripe";
import type { IUser } from "@/models/User";
import { cancelSubscription } from "@/services/subscription/CancelSubscriptionService";

/** The subscription is not past due — this teardown must never run on an active subscription. */
export class NotPastDueError extends Error {
  readonly code = "NOT_PAST_DUE";
  constructor() {
    super("Subscription is not past due");
    this.name = "NotPastDueError";
  }
}

export interface SwitchTierPastDueResult {
  subscriptionId: string;
  cancelledImmediately: boolean;
  /** How many open/uncollectible invoices were voided (forgiven). */
  invoicesVoided: number;
}

/**
 * Cancel a past-due subscription immediately and void its open renewal invoice(s), so the member
 * can resubscribe to a different tier via the normal fresh-subscribe flow.
 *
 * SAFETY: throws {@link NotPastDueError} unless the stored status is `past_due`. This path
 * immediate-cancels, so it must never be reachable for an active subscription.
 *
 * @param user Mongoose user document (mutated + saved by {@link cancelSubscription}).
 */
export async function abandonPastDueForTierSwitch(user: IUser): Promise<SwitchTierPastDueResult> {
  if (user.subscription?.status !== "past_due") {
    throw new NotPastDueError();
  }

  // Cancel immediately (cancelSubscription auto-immediates for past_due): status→canceled,
  // isActive→false, partner-discount queue ended, lastMonthAccumulatedEntries preserved for
  // the resubscribe carry-over. This is the same proven primitive the cancel routes use.
  const cancelResult = await cancelSubscription(user, { analytics: { actor: "user" } });

  // Forgive the failed renewal: void every open/uncollectible invoice on the (now canceled)
  // subscription. Best-effort — the subscription is already retired, so a void failure must NOT
  // block the resubscribe. Voiding AFTER cancel avoids racing a dunning retry, and voidInvoice
  // emits `invoice.voided` only (never a granting payment event). Only finalized invoices are
  // voidable, so we filter to open/uncollectible (draft/paid are left as-is).
  let invoicesVoided = 0;
  for (const status of ["open", "uncollectible"] as const) {
    try {
      const list = await stripe.invoices.list({
        subscription: cancelResult.subscriptionId,
        status,
        limit: 100,
      });
      for (const invoice of list.data) {
        if (!invoice.id) continue;
        await stripe.invoices.voidInvoice(invoice.id);
        invoicesVoided++;
      }
    } catch (error) {
      console.error(
        `[switch-tier-past-due] voiding ${status} invoices failed (non-blocking):`,
        error
      );
    }
  }

  return {
    subscriptionId: cancelResult.subscriptionId,
    cancelledImmediately: cancelResult.cancelledImmediately,
    invoicesVoided,
  };
}
