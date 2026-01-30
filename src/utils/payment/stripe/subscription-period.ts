/**
 * Subscription period end for Stripe Basil API compatibility.
 *
 * In 2025-03-31.basil, current_period_end and current_period_start were removed
 * from the Subscription object and moved to SubscriptionItem. This helper
 * returns the period end from items (earliest across items) or from the
 * subscription for older API versions.
 *
 * Use this whenever you need "when does this subscription period end?" for
 * cancellation date, end date display, or billing logic.
 */

import type Stripe from "stripe";

type SubscriptionWithLegacyPeriod = Stripe.Subscription & { current_period_end?: number };
type SubscriptionItemWithPeriod = Stripe.SubscriptionItem & { current_period_end?: number };

/**
 * Returns the Unix timestamp (seconds) for the end of the current billing period.
 * Works with both legacy (subscription.current_period_end) and Basil (items[].current_period_end).
 *
 * @param sub - Stripe subscription (from retrieve or list; list may need expand for items)
 * @returns Period end timestamp in seconds, or undefined if not available
 */
export function getSubscriptionPeriodEnd(sub: Stripe.Subscription): number | undefined {
  const legacy = (sub as SubscriptionWithLegacyPeriod).current_period_end;
  if (typeof legacy === "number") return legacy;
  const items = sub.items?.data;
  if (!items?.length) return undefined;
  let minEnd: number | undefined;
  for (const item of items) {
    const end = (item as SubscriptionItemWithPeriod).current_period_end;
    if (typeof end === "number") minEnd = minEnd === undefined ? end : Math.min(minEnd, end);
  }
  return minEnd;
}
