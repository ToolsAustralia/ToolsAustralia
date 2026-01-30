/**
 * Subscription Creation Guard
 *
 * Single source of truth for "can this user create a new subscription?"
 * Used by create-subscription and create-subscription-existing-user to prevent
 * double active subscriptions. Returns a consistent 409 payload for frontend handling.
 */

export const EXISTING_SUBSCRIPTION_MESSAGE =
  "User already has an active subscription. Please manage your existing subscription instead of creating a new one.";

export const EXISTING_SUBSCRIPTION_CODE = "EXISTING_SUBSCRIPTION" as const;

export type CheckCanCreateSubscriptionUser =
  | { subscription?: { isActive?: boolean } }
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
 * Use before creating a Stripe subscription to prevent double active subscriptions.
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
  if (user.subscription?.isActive === true) {
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
