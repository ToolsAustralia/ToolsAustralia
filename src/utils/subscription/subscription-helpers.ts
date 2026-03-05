/**
 * Subscription Helper Utilities
 *
 * Pure utility functions for subscription status checks and validation.
 * These functions have no side effects and are easily testable.
 *
 * Key Principles:
 * - Pure functions (no side effects)
 * - Type-safe
 * - Reusable across components, hooks, and API routes
 * - Easy to test
 */

import type { IUser } from "@/models/User";

/**
 * Check if user has a failed renewal
 *
 * A failed renewal is when:
 * - Subscription status is "past_due"
 * - Subscription is not active
 * - Auto-renewal is enabled (user wants subscription to continue)
 *
 * Note: We check autoRenew to avoid showing the modal to users who have
 * cancelled their subscription, even if the status is still "past_due"
 * (which can happen if cancellation occurs during the past_due state).
 *
 * @param user - User object with subscription data
 * @returns true if user has a failed renewal, false otherwise
 */
export function hasFailedRenewal(
  user: IUser | { subscription?: { status?: string; isActive?: boolean; autoRenew?: boolean } } | null | undefined
): boolean {
  if (!user?.subscription) {
    return false;
  }

  // Only show renewal failed modal if:
  // 1. Status is past_due (payment failed)
  // 2. Subscription is not active
  // 3. Auto-renewal is enabled (user wants subscription to continue, not cancelled)
  return (
    user.subscription.status === "past_due" &&
    !user.subscription.isActive &&
    user.subscription.autoRenew === true
  );
}

/**
 * Get failed renewal status information
 *
 * @param user - User object with subscription data
 * @returns Object with hasFailed flag and status string
 */
export function getFailedRenewalStatus(user: IUser | null | undefined): {
  hasFailed: boolean;
  status: string;
} {
  if (!user?.subscription) {
    return {
      hasFailed: false,
      status: "none",
    };
  }

  const hasFailed = hasFailedRenewal(user);
  const status = user.subscription.status || "unknown";

  return {
    hasFailed,
    status,
  };
}

/**
 * Subscription statuses that block purchasing a new subscription.
 *
 * Any non-terminal Stripe status with a live subscription object must be
 * resolved (paid, cancelled, or expired) before a new one can be created.
 *
 * NOT included:
 * - "incomplete": Registration initialises every user with status "incomplete"
 *   before any Stripe subscription exists, and the plan-switch flow during
 *   checkout relies on creating a new subscription while the previous one is
 *   still "incomplete" (cancelled via cancelPreviousSubscriptionId).
 * - "incomplete_expired": Terminal status; invoice voided, safe to resubscribe.
 * - "canceled" / "cancelled": Terminal; user can resubscribe.
 * - missing/unknown: No live subscription; allow.
 */
export const BLOCKING_SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "unpaid",
  "trialing",
  "paused",
] as const;

export type BlockingSubscriptionStatus = (typeof BLOCKING_SUBSCRIPTION_STATUSES)[number];

/**
 * Check if user has a subscription that blocks purchasing a new one
 *
 * Users with active, past_due, unpaid, trialing, or paused subscriptions
 * cannot buy a new subscription until they resolve their existing one
 * (pay, cancel, or let it expire).
 *
 * @param user - User object with subscription data (IUser, UserData, or any with subscription.status)
 * @returns true if user has a blocking subscription, false otherwise
 */
export function hasBlockingSubscription(user: { subscription?: { status?: string } } | null | undefined): boolean {
  if (!user?.subscription?.status) {
    return false;
  }
  return BLOCKING_SUBSCRIPTION_STATUSES.includes(
    user.subscription.status as BlockingSubscriptionStatus
  );
}


