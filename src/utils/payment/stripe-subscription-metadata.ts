/**
 * Stripe subscription metadata keys.
 * Used when creating subscriptions so the webhook can reliably detect intent
 * (e.g. resubscribe) without depending on user document state that the API may have already updated.
 */
export const STRIPE_SUBSCRIPTION_METADATA_IS_RESUBSCRIBE = "isResubscribe" as const;
