/**
 * Stripe subscription reference helpers
 *
 * Canonical `User.stripeSubscriptionId` should point to a manageable subscription
 * (active, trialing, past_due, unpaid, paused), not incomplete checkout attempts.
 */

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import type { IUser } from "@/models/User";

/** Statuses that may be cancelled or managed as the user's current membership */
export const MANAGEABLE_STRIPE_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
] as const;

export type ManageableStripeSubscriptionStatus = (typeof MANAGEABLE_STRIPE_SUBSCRIPTION_STATUSES)[number];

/** Terminal / non-canonical Stripe subscription states for stored pointer repair */
export const DEAD_STRIPE_SUBSCRIPTION_STATUSES = ["incomplete", "incomplete_expired", "canceled"] as const;

export function isManageableStripeSubscriptionStatus(status: string): status is ManageableStripeSubscriptionStatus {
  return (MANAGEABLE_STRIPE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

export function isDeadStripeSubscriptionStatus(status: string): boolean {
  return (DEAD_STRIPE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

/** Only promote to User.stripeSubscriptionId when Stripe confirms a manageable state */
export function shouldWriteCanonicalStripeSubscriptionId(status: string): boolean {
  return isManageableStripeSubscriptionStatus(status);
}

export const SUBSCRIPTION_REFERENCE_ERROR_CODES = {
  NO_ACTIVE_SUBSCRIPTION: "NO_ACTIVE_SUBSCRIPTION",
  STRIPE_RETRYABLE: "STRIPE_RETRYABLE",
} as const;

export type SubscriptionReferenceErrorCode =
  (typeof SUBSCRIPTION_REFERENCE_ERROR_CODES)[keyof typeof SUBSCRIPTION_REFERENCE_ERROR_CODES];

export class SubscriptionReferenceError extends Error {
  constructor(
    message: string,
    public readonly code: SubscriptionReferenceErrorCode
  ) {
    super(message);
    this.name = "SubscriptionReferenceError";
  }
}

export function isSubscriptionReferenceError(e: unknown): e is SubscriptionReferenceError {
  return e instanceof SubscriptionReferenceError;
}

export type RetrieveStripeSubscriptionResult =
  | { ok: true; subscription: Stripe.Subscription }
  | { ok: false; is404: boolean; isRetryable: boolean; message: string };

/**
 * Retrieve a subscription; classify 404 vs retryable Stripe errors.
 */
export async function retrieveStripeSubscription(
  subscriptionId: string,
  stripeClient: Pick<typeof stripe, "subscriptions"> = stripe
): Promise<RetrieveStripeSubscriptionResult> {
  try {
    const subscription = (await stripeClient.subscriptions.retrieve(subscriptionId)) as Stripe.Subscription;
    return { ok: true, subscription };
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
    const statusCode =
      e && typeof e === "object" && "statusCode" in e ? (e as { statusCode?: number }).statusCode : undefined;
    const message = e instanceof Error ? e.message : String(e);

    if (code === "resource_missing" || code === "resource_missing_deleted" || statusCode === 404) {
      return { ok: false, is404: true, isRetryable: false, message };
    }
    if (code === "rate_limit" || statusCode === 429) {
      return { ok: false, is404: false, isRetryable: true, message };
    }
    // Network / 5xx — treat as retryable for API responses
    if (statusCode != null && statusCode >= 500) {
      return { ok: false, is404: false, isRetryable: true, message };
    }
    return { ok: false, is404: false, isRetryable: false, message };
  }
}

/**
 * List the best recoverable subscription for a customer (for stale DB pointer repair).
 * Priority: active → trialing → past_due → unpaid → paused
 *
 * IMPORTANT: We re-validate each returned subscription's own `status` field
 * instead of trusting the `status` query filter. Stripe's `list({ status: "trialing" })`
 * also returns subscriptions that merely have a future `trial_end` even when their
 * actual status is `incomplete` (an abandoned `payment_behavior: default_incomplete`
 * checkout with an unpaid initial invoice). Without this filter, such a dead
 * checkout is mis-classified as a live membership and permanently blocks
 * resubscribe. See docs/subscription/gotchas.md.
 */
export async function findRecoverableSubscriptionForCustomer(
  customerId: string,
  stripeClient: Pick<typeof stripe, "subscriptions"> = stripe
): Promise<Stripe.Subscription | null> {
  for (const status of MANAGEABLE_STRIPE_SUBSCRIPTION_STATUSES) {
    const subs = await stripeClient.subscriptions.list({
      customer: customerId,
      status,
      limit: 10,
    });
    const manageable = subs.data.filter((sub) =>
      isManageableStripeSubscriptionStatus(sub.status)
    );
    if (manageable.length > 0) {
      manageable.sort((a, b) => b.created - a.created);
      return manageable[0] as Stripe.Subscription;
    }
  }
  return null;
}

/**
 * True if the Stripe customer already has any subscription in a manageable (blocking) state.
 * Used before creating a new subscription to avoid duplicate active/trialing/etc. memberships.
 */
export async function stripeCustomerHasManageableSubscription(
  customerId: string,
  stripeClient: Pick<typeof stripe, "subscriptions"> = stripe
): Promise<boolean> {
  const recovered = await findRecoverableSubscriptionForCustomer(customerId, stripeClient);
  return recovered != null;
}

export type ResolveCancellableSubscriptionResult = {
  subscription: Stripe.Subscription;
  /** True if we replaced a dead/missing stored id with a live one */
  repairedCanonicalId: boolean;
};

/**
 * Resolve the Stripe subscription to cancel for this user.
 * Repairs `user.stripeSubscriptionId` in-memory when the stored id is dead or 404
 * and another manageable subscription exists for the same customer.
 *
 * @throws SubscriptionReferenceError NO_ACTIVE_SUBSCRIPTION | STRIPE_RETRYABLE
 */
export async function resolveCancellableStripeSubscription(
  user: IUser,
  stripeClient: Pick<typeof stripe, "subscriptions"> = stripe
): Promise<ResolveCancellableSubscriptionResult> {
  const customerId = user.stripeCustomerId?.trim();
  const subscriptionId = user.stripeSubscriptionId?.trim();

  if (!subscriptionId) {
    if (!customerId) {
      throw new SubscriptionReferenceError("No active subscription found", SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION);
    }
    const recovered = await findRecoverableSubscriptionForCustomer(customerId, stripeClient);
    if (!recovered) {
      throw new SubscriptionReferenceError("No active subscription found", SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION);
    }
    user.stripeSubscriptionId = recovered.id;
    return { subscription: recovered, repairedCanonicalId: true };
  }

  const retrieved = await retrieveStripeSubscription(subscriptionId, stripeClient);
  if (!retrieved.ok) {
    if (retrieved.isRetryable) {
      throw new SubscriptionReferenceError(
        retrieved.message || "Stripe temporarily unavailable",
        SUBSCRIPTION_REFERENCE_ERROR_CODES.STRIPE_RETRYABLE
      );
    }
    if (retrieved.is404 || !customerId) {
      user.stripeSubscriptionId = undefined;
      if (customerId) {
        const recovered = await findRecoverableSubscriptionForCustomer(customerId, stripeClient);
        if (recovered) {
          user.stripeSubscriptionId = recovered.id;
          return { subscription: recovered, repairedCanonicalId: true };
        }
      }
      throw new SubscriptionReferenceError("No active subscription found", SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION);
    }
    throw new SubscriptionReferenceError(
      retrieved.message || "Could not verify subscription",
      SUBSCRIPTION_REFERENCE_ERROR_CODES.STRIPE_RETRYABLE
    );
  }

  const sub = retrieved.subscription;
  if (isManageableStripeSubscriptionStatus(sub.status)) {
    return { subscription: sub, repairedCanonicalId: false };
  }

  if (isDeadStripeSubscriptionStatus(sub.status)) {
    user.stripeSubscriptionId = undefined;
    if (!customerId) {
      throw new SubscriptionReferenceError("No active subscription found", SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION);
    }
    const recovered = await findRecoverableSubscriptionForCustomer(customerId, stripeClient);
    if (!recovered) {
      throw new SubscriptionReferenceError("No active subscription found", SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION);
    }
    user.stripeSubscriptionId = recovered.id;
    return { subscription: recovered, repairedCanonicalId: true };
  }

  throw new SubscriptionReferenceError("No active subscription found", SUBSCRIPTION_REFERENCE_ERROR_CODES.NO_ACTIVE_SUBSCRIPTION);
}

/**
 * If stored subscription id differs from the paid subscription and the stored one is dead, return true for adoption.
 * Used by webhook auto-correction (invoice paid path).
 */
export function shouldAdoptPaidSubscriptionOverStored(
  paidSubscriptionId: string,
  storedSubscriptionId: string | undefined,
  paidSubscriptionStatus: string,
  storedSubscriptionStatus: string
): boolean {
  if (!paidSubscriptionId || !storedSubscriptionId || paidSubscriptionId === storedSubscriptionId) {
    return false;
  }
  if (!isManageableStripeSubscriptionStatus(paidSubscriptionStatus)) {
    return false;
  }
  return isDeadStripeSubscriptionStatus(storedSubscriptionStatus);
}
