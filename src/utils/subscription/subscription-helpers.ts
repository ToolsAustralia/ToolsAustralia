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
 *
 * @param user - User object with subscription data
 * @returns true if user has a failed renewal, false otherwise
 */
export function hasFailedRenewal(
  user: IUser | { subscription?: { status?: string; isActive?: boolean } } | null | undefined
): boolean {
  if (!user?.subscription) {
    return false;
  }

  return user.subscription.status === "past_due" && !user.subscription.isActive;
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


