/**
 * Subscription Types
 *
 * Type definitions for subscription-related functionality.
 *
 * @module types/subscription
 */

/**
 * Subscription status
 */
export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'trialing'
  | 'unpaid';

/**
 * Subscription data
 */
export interface SubscriptionData {
  subscriptionId: string;
  customerId: string;
  status: SubscriptionStatus;
  packageId: string;
  packageName: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
}
