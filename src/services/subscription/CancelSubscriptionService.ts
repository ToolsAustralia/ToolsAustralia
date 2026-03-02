/**
 * Subscription Cancellation Service
 *
 * Shared logic for canceling Stripe subscriptions.
 * Used by both user-facing (/api/stripe/cancel-subscription) and admin
 * (/api/admin/users/[id]/cancel-subscription) routes.
 *
 * @see docs/ADMIN_CANCEL_SUBSCRIPTION.md for full feature documentation
 *
 * Past-due subscriptions: Always cancelled immediately (no period to preserve).
 */

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { klaviyo } from "@/lib/klaviyo";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import { createSubscriptionCancelledEvent } from "@/utils/integrations/klaviyo/klaviyo-events";
import { handleSubscriptionQueueUpdate } from "@/utils/partner-discounts/partner-discount-queue";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";
import type { IUser } from "@/models/User";

export interface CancelSubscriptionOptions {
  cancelAtPeriodEnd?: boolean;
}

export interface CancelSubscriptionResult {
  cancelledImmediately: boolean;
  subscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  endDate: string | null;
  isPastDue: boolean;
}

const getCancelAt = (subscription?: Stripe.Subscription): number | undefined => {
  if (!subscription) return undefined;
  return typeof subscription.cancel_at === "number" ? subscription.cancel_at : undefined;
};

const resolveTimestamp = (...timestamps: Array<number | undefined>) =>
  timestamps.find((value) => typeof value === "number");

/**
 * Cancel a user's Stripe subscription.
 *
 * @param user - Mongoose user document (must have stripeSubscriptionId)
 * @param options - cancelAtPeriodEnd: true = end of period, false = immediate
 * @returns CancelSubscriptionResult
 */
export async function cancelSubscription(
  user: IUser,
  options: CancelSubscriptionOptions = {}
): Promise<CancelSubscriptionResult> {
  const { cancelAtPeriodEnd = true } = options;

  const subscriptionId = user.stripeSubscriptionId;
  if (!subscriptionId) {
    throw new Error("No active subscription found");
  }

  // For past_due subscriptions, cancel immediately (no period to preserve)
  const isPastDue = user.subscription?.status === "past_due";
  const shouldCancelImmediately = isPastDue || !cancelAtPeriodEnd;

  let canceledSubscription: Stripe.Subscription;
  if (shouldCancelImmediately) {
    canceledSubscription = (await stripe.subscriptions.cancel(subscriptionId)) as Stripe.Subscription;
    console.log(
      `✅ Subscription canceled immediately${isPastDue ? " (past_due subscription)" : ""}: ${subscriptionId}`
    );
  } else {
    canceledSubscription = (await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })) as Stripe.Subscription;
    console.log(`✅ Subscription set to cancel at period end: ${subscriptionId}`);
  }

  // Resolve period end (canceled subs may still be retrievable)
  let latestSubscription: Stripe.Subscription;
  try {
    latestSubscription = (await stripe.subscriptions.retrieve(subscriptionId)) as Stripe.Subscription;
  } catch {
    latestSubscription = canceledSubscription;
  }

  const resolvedEndTimestamp = resolveTimestamp(
    getSubscriptionPeriodEnd(canceledSubscription),
    getSubscriptionPeriodEnd(latestSubscription),
    getCancelAt(latestSubscription),
    getCancelAt(canceledSubscription)
  );

  const stripeEndDate = resolvedEndTimestamp ? new Date(resolvedEndTimestamp * 1000) : null;

  // Update user's subscription status in database
  if (user.subscription) {
    user.subscription.autoRenew = false;
    user.subscription.cancelledAt = new Date();

    if (shouldCancelImmediately) {
      user.subscription.isActive = false;
      user.subscription.endDate = new Date();
      user.subscription.status = "canceled";
    } else if (stripeEndDate) {
      user.subscription.endDate = stripeEndDate;
    }

    if (user.subscription.lastMonthAccumulatedEntries !== undefined) {
      console.log(
        `📊 [CANCEL SUBSCRIPTION] Preserving lastMonthAccumulatedEntries: ${user.subscription.lastMonthAccumulatedEntries} for potential resubscribe`
      );
    }

    user.markModified("subscription");
  }

  // Partner discount queue - immediate cancel ends queue now
  if (shouldCancelImmediately) {
    console.log(`🎁 [CANCEL SUBSCRIPTION] Ending subscription in partner discount queue immediately`);
    await handleSubscriptionQueueUpdate(user as unknown as IUser, "end");
  }

  await user.save();

  // Verify save
  console.log(
    `✅ [CANCEL SUBSCRIPTION] Verified - isActive: ${user.subscription?.isActive}, endDate: ${
      user.subscription?.endDate?.toISOString() || "undefined"
    }, autoRenew: ${user.subscription?.autoRenew}`
  );

  // Klaviyo (non-blocking)
  try {
    klaviyo.trackEventBackground(
      createSubscriptionCancelledEvent(user, {
        packageId: user.subscription?.packageId || "unknown",
        packageName: "Subscription",
        tier: user.subscription?.packageId || "unknown",
      })
    );
  } catch (klaviyoError) {
    console.error("❌ Klaviyo subscription cancellation event tracking failed:", klaviyoError);
  }

  try {
    ensureUserProfileSynced(user);
  } catch (klaviyoError) {
    console.error("❌ Klaviyo profile sync failed after cancellation:", klaviyoError);
  }

  const responseEndDate =
    cancelAtPeriodEnd && stripeEndDate ? stripeEndDate : user.subscription?.endDate ?? null;

  return {
    cancelledImmediately: shouldCancelImmediately,
    subscriptionId: canceledSubscription.id,
    status: canceledSubscription.status,
    cancelAtPeriodEnd: canceledSubscription.cancel_at_period_end,
    currentPeriodEnd: responseEndDate ? responseEndDate.toISOString() : null,
    endDate: user.subscription?.endDate ? user.subscription.endDate.toISOString() : null,
    isPastDue,
  };
}
