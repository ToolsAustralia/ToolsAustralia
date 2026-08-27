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
import { getPackageById } from "@/data/membershipPackages";
import { createSubscriptionCancellationRequestedEvent } from "@/utils/integrations/klaviyo/klaviyo-events";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import { handleSubscriptionQueueUpdate } from "@/utils/partner-discounts/partner-discount-queue";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";
import type { IUser } from "@/models/User";
import { recordCancellationAnalytics } from "@/services/admin/membershipAnalyticsPersistence";
import {
  isSubscriptionReferenceError,
  resolveCancellableStripeSubscription,
  SUBSCRIPTION_REFERENCE_ERROR_CODES,
} from "@/services/subscription/SubscriptionReferenceService";

export interface CancelSubscriptionOptions {
  cancelAtPeriodEnd?: boolean;
  /** Optional analytics metadata for membership dashboard history */
  analytics?: {
    actor: "user" | "admin";
    adminUserId?: string;
  };
  /**
   * Declare that THIS cancellation is genuine member churn — the member chose to
   * leave. Gates the cancel-time `"Subscription Cancellation Requested"` Klaviyo
   * emit that starts the win-back flow.
   *
   * Defaults to `false` because this service has three callers and only one of
   * them is churn: the member-initiated cancel route. The past-due tier switch
   * (`switchTierPastDue`) cancels-then-resubscribes — the member is staying, not
   * leaving — and an admin-initiated cancellation must not silently drop a
   * customer who never asked to leave into the win-back email sequence.
   *
   * Renamed from `mintBonusCode` on 2026-08-26 when minting moved to the Klaviyo
   * webhook. It was NOT deleted with the mint: it is the only thing in the
   * codebase that tells member churn apart from the two non-churn cancellations,
   * and deleting it would silently merge three different situations into one.
   */
  isMemberChurn?: boolean;
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
 * Fire the cancel-time `"Subscription Cancellation Requested"` Klaviyo event.
 *
 * Fire-and-forget by design: this is a marketing signal and it must never block
 * or fail a member cancelling their membership. `trackEventBackground` returns
 * `void` and swallows its own transport errors; the try/catch here covers the
 * synchronous payload build (catalogue lookup, `toISOString`).
 *
 * MUST be called AFTER `await user.save()` — it reads the PERSISTED
 * `cancelledAt` / `endDate`, not the values this run intended to write.
 */
function emitCancellationRequested(user: IUser): void {
  try {
    const cancelledAt = user.subscription?.cancelledAt;
    if (!cancelledAt) {
      // No persisted cancellation instant means there is nothing truthful to
      // anchor the win-back flow on. console.error so it survives the production
      // build's console stripping — a silent miss here is an unsent flow.
      console.error(
        "❌ [CANCEL SUBSCRIPTION] Skipped 'Subscription Cancellation Requested': no persisted subscription.cancelledAt",
        { userId: user._id?.toString() }
      );
      return;
    }

    const planId = user.subscription?.packageId ?? null;
    const pkg = planId ? getPackageById(planId) : undefined;
    if (planId && !pkg) {
      console.error(
        "❌ [CANCEL SUBSCRIPTION] 'Subscription Cancellation Requested' package id did not resolve — emitting without the package block",
        { userId: user._id?.toString(), packageId: planId }
      );
    }

    klaviyo.trackEventBackground(
      createSubscriptionCancellationRequestedEvent(user, {
        packageData: pkg
          ? {
              packageId: pkg._id,
              packageName: pkg.name,
              // Same tier derivation the canonical `Started Checkout` emit uses
              // (`src/app/api/auth/register/route.ts`) — "Tradie" → "tradie".
              tier: pkg.name.toLowerCase(),
              price: pkg.price,
            }
          : null,
        cancelledAt,
        accessEndsAt: user.subscription?.endDate ?? null,
      })
    );
  } catch (klaviyoError) {
    console.error(
      "❌ [CANCEL SUBSCRIPTION] Klaviyo 'Subscription Cancellation Requested' emit failed (non-blocking):",
      klaviyoError
    );
  }
}

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
  const { cancelAtPeriodEnd = true, analytics, isMemberChurn = false } = options;

  let resolvedStripeSub: Stripe.Subscription;
  try {
    const resolved = await resolveCancellableStripeSubscription(user);
    resolvedStripeSub = resolved.subscription;
    if (resolved.repairedCanonicalId) {
      user.markModified("subscription");
      await user.save();
    }
  } catch (e) {
    if (isSubscriptionReferenceError(e) && e.code === SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION) {
      if (user.isModified("stripeSubscriptionId")) {
        user.markModified("subscription");
        await user.save().catch((saveErr) => {
          console.warn("[CANCEL SUBSCRIPTION] Could not persist cleared stripeSubscriptionId:", saveErr);
        });
      }
    }
    throw e;
  }

  const subscriptionId = resolvedStripeSub.id;

  // For past_due subscriptions, cancel immediately (no period to preserve)
  const isPastDue =
    resolvedStripeSub.status === "past_due" || user.subscription?.status === "past_due";
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

  // `"Subscription Cancelled"` event tracking is handled in the Stripe webhook
  // (customer.subscription.deleted) to avoid duplicate "Subscription Cancelled"
  // events from both API + webhook paths.
  //
  // NAMED CARVE-OUT — `"Subscription Cancellation Requested"` (added 2026-08-26).
  // The emit directly below is a DIFFERENT event with a DIFFERENT name feeding a
  // DIFFERENT flow, and it is deliberately fired from this service path. It does
  // NOT violate the rule above, which bans duplicating `"Subscription Cancelled"`,
  // not every cancel-time emit. Do not "clean it up" as a rule violation: it is
  // named as an explicit carve-out in all three copies of that rule
  // (docs/subscription/rules.md R4, docs/billing-stripe/rules.md R2,
  // docs/tracking/rules.md R2).
  //
  // Why it has to exist: `"Subscription Cancelled"` only fires when Stripe deletes
  // the subscription, which for a cancel-at-period-end cancellation is up to a
  // month after the member clicked cancel — far too late to start a win-back
  // flow, and not guaranteed to arrive at all. This is the cancel-CLICK signal.
  //
  // No bonus code is minted here any more. Minting moved to
  // `POST /api/bonus-codes/v1/issue`, which Klaviyo calls from inside the
  // win-back flow one step ahead of the discount email, so the customer's
  // 72-hour window starts when that email is about to send rather than at this
  // commit — the win-back email lands days later, and the old window had already
  // expired by then. This service's job at cancellation is to emit the
  // cancel-time signal that STARTS that flow, and nothing more.
  //
  // Placed after `await user.save()` on purpose: the event carries the PERSISTED
  // `cancelledAt` / `endDate`, so it cannot run before the write lands.
  if (isMemberChurn) {
    emitCancellationRequested(user);
  }

  try {
    ensureUserProfileSynced(user);
  } catch (klaviyoError) {
    console.error("❌ Klaviyo profile sync failed after cancellation:", klaviyoError);
  }

  const responseEndDate =
    cancelAtPeriodEnd && stripeEndDate ? stripeEndDate : user.subscription?.endDate ?? null;

  try {
    await recordCancellationAnalytics(
      user as IUser,
      {
        cancelledImmediately: shouldCancelImmediately,
        subscriptionId: canceledSubscription.id,
        status: canceledSubscription.status,
        cancelAtPeriodEnd: canceledSubscription.cancel_at_period_end,
        currentPeriodEnd: responseEndDate ? responseEndDate.toISOString() : null,
        endDate: user.subscription?.endDate ? user.subscription.endDate.toISOString() : null,
        isPastDue,
      },
      analytics
    );
  } catch (analyticsErr) {
    console.error("⚠️ [CANCEL SUBSCRIPTION] Membership analytics history failed (non-blocking):", analyticsErr);
  }

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
