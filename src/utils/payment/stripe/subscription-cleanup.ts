/**
 * Subscription Cleanup Utilities
 *
 * This module provides utilities for cleaning up incomplete subscriptions
 * following Stripe best practices. Cleanup should only happen AFTER payment succeeds.
 */

import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import { subscriptionLog } from "@/utils/logging/subscription-logger";

/**
 * Lists all incomplete subscriptions for a customer
 *
 * @param customerId - Stripe customer ID
 * @returns Array of incomplete subscriptions
 */
async function listIncompleteSubscriptions(
  customerId: string
): Promise<Stripe.Subscription[]> {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "incomplete",
      limit: 100,
    });

    return subscriptions.data;
  } catch (error) {
    subscriptionLog.error(
      `Failed to list incomplete subscriptions for customer ${customerId}`,
      error
    );
    return [];
  }
}

/**
 * Safely cancels a subscription with error handling
 *
 * @param subscriptionId - Stripe subscription ID to cancel
 * @returns True if cancellation succeeded, false otherwise
 */
async function safeCancelSubscription(subscriptionId: string): Promise<boolean> {
  try {
    await stripe.subscriptions.cancel(subscriptionId);
    subscriptionLog.info(`Successfully cancelled incomplete subscription: ${subscriptionId}`);
    return true;
  } catch (error) {
    // Subscription might already be cancelled or in a different state
    // This is non-critical, so we log but don't throw
    subscriptionLog.warn(
      `Failed to cancel subscription ${subscriptionId} (may already be cancelled)`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

/**
 * Cancels all incomplete subscriptions for a customer except the successful one
 *
 * This follows Stripe best practice: only cleanup AFTER payment succeeds.
 * Multiple incomplete subscriptions during checkout are normal and expected.
 *
 * @param customerId - Stripe customer ID
 * @param successfulSubscriptionId - Subscription ID that just succeeded (keep this one)
 * @returns Number of subscriptions cancelled
 */
export async function cancelOtherIncompleteSubscriptions(
  customerId: string,
  successfulSubscriptionId: string
): Promise<number> {
  try {
    subscriptionLog.info(
      `Cleaning up incomplete subscriptions for customer ${customerId}, keeping ${successfulSubscriptionId}`
    );

    const incompleteSubscriptions = await listIncompleteSubscriptions(customerId);

    if (incompleteSubscriptions.length === 0) {
      subscriptionLog.info(`No incomplete subscriptions found for customer ${customerId}`);
      return 0;
    }

    let cancelledCount = 0;

    for (const subscription of incompleteSubscriptions) {
      // Skip the successful subscription
      if (subscription.id === successfulSubscriptionId) {
        subscriptionLog.info(
          `Skipping successful subscription ${subscription.id}`
        );
        continue;
      }

      // Cancel other incomplete subscriptions
      const cancelled = await safeCancelSubscription(subscription.id);
      if (cancelled) {
        cancelledCount++;
      }
    }

    subscriptionLog.info(
      `Cleanup complete: cancelled ${cancelledCount} of ${incompleteSubscriptions.length} incomplete subscriptions`
    );

    return cancelledCount;
  } catch (error) {
    // Non-blocking: cleanup failure shouldn't affect payment success
    subscriptionLog.error(
      `Error during subscription cleanup for customer ${customerId}`,
      error
    );
    return 0;
  }
}
