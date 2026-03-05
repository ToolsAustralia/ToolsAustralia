/**
 * Subscription Creation Guard
 *
 * Single source of truth for "can this user create a new subscription?"
 * Used by create-subscription and create-subscription-existing-user to prevent
 * duplicate subscriptions. Returns a consistent 409 payload for frontend handling.
 *
 * Blocks creation when the user has a blocking Stripe subscription status
 * (active, past_due, unpaid, trialing, paused) OR when a
 * stripeSubscriptionId exists without a corresponding subscription object
 * (data inconsistency safety net).
 */

import { hasBlockingSubscription } from "@/utils/subscription/subscription-helpers";

export const EXISTING_SUBSCRIPTION_MESSAGE =
  "You have an existing subscription that must be resolved before creating a new one. Please update your payment method, cancel your subscription, or contact support.";

export const EXISTING_SUBSCRIPTION_CODE = "EXISTING_SUBSCRIPTION" as const;

export type CheckCanCreateSubscriptionUser =
  | { stripeSubscriptionId?: string; subscription?: { isActive?: boolean; status?: string } }
  | null
  | undefined;

export type CheckCanCreateSubscriptionAllowed = { allowed: true };

export type CheckCanCreateSubscriptionBlocked = {
  allowed: false;
  status: 409;
  body: { error: string; code: typeof EXISTING_SUBSCRIPTION_CODE };
};

export type CheckCanCreateSubscriptionResult =
  | CheckCanCreateSubscriptionAllowed
  | CheckCanCreateSubscriptionBlocked;

/**
 * Checks whether the user is allowed to create a new subscription.
 * Use before creating a Stripe subscription to prevent duplicate subscriptions.
 *
 * Blocks when:
 * - subscription.status is a blocking Stripe status (active, past_due, unpaid, trialing, paused)
 * - stripeSubscriptionId exists but subscription object is missing (corrupted state)
 *
 * Allows when:
 * - user is null/undefined (new user)
 * - subscription status is terminal (canceled, cancelled, incomplete_expired) or missing
 * - no subscription and no stripeSubscriptionId
 *
 * @param user - User document or null (e.g. registeredUser by email, or existingUser by session)
 * @returns { allowed: true } or { allowed: false, status: 409, body } for 409 response
 */
export function checkCanCreateSubscription(
  user: CheckCanCreateSubscriptionUser
): CheckCanCreateSubscriptionResult {
  if (user == null) {
    return { allowed: true };
  }

  if (hasBlockingSubscription(user)) {
    return {
      allowed: false,
      status: 409,
      body: {
        error: EXISTING_SUBSCRIPTION_MESSAGE,
        code: EXISTING_SUBSCRIPTION_CODE,
      },
    };
  }

  if (user.stripeSubscriptionId && !user.subscription) {
    return {
      allowed: false,
      status: 409,
      body: {
        error: EXISTING_SUBSCRIPTION_MESSAGE,
        code: EXISTING_SUBSCRIPTION_CODE,
      },
    };
  }

  return { allowed: true };
}
