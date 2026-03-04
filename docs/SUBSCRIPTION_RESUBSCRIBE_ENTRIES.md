# Subscription Resubscribe and Accumulated Entries

## Purpose

When a user resubscribes after their membership has lapsed (expired or cancelled), their **accumulated entries** must be preserved and then increased by the new promo grant. If we treat the payment as an "initial" subscription, we overwrite `lastMonthAccumulatedEntries` with the initial formula (e.g. 40 × 3 = 120) and the user loses their prior accumulation (e.g. 440). This document describes how resubscribe is detected and how entries are calculated so behaviour is correct and maintainable.

## Flow

1. User had an active subscription with `lastMonthAccumulatedEntries` (e.g. 440).
2. Subscription lapses (expires, is cancelled, or payment fails and is not recovered).
3. User subscribes again (same or different promo, e.g. 3x).
4. **API (`create-subscription-existing-user`):**
   - Detects resubscribe: existing subscription, not active, and `lastMonthAccumulatedEntries` is present.
   - Creates the Stripe subscription with **metadata** `isResubscribe: "true"` so the webhook has a reliable source of truth.
   - Saves the user document with the new subscription and **preserves** `lastMonthAccumulatedEntries` (e.g. 440).
   - If the user pays with a saved payment method, the API pays the invoice and sets `subscription.isActive = true` on the user **before** the webhook runs.
5. **Webhook (`invoice.payment_succeeded`):**
   - For `billing_reason === "subscription_create"`, determines resubscribe by:
     - **Primary:** `subscription.metadata.isResubscribe === "true"` (set by the API at creation).
     - **Fallback:** `!user.subscription?.isActive && user.subscription?.lastMonthAccumulatedEntries !== undefined` (for older subscriptions or other entry points that do not set metadata).
   - If resubscribe: uses `calculateResubscribeEntries(baseEntries, lastMonthAccumulatedEntries, promoMultiplier)` so that `newLastMonthAccumulatedEntries = lastMonthAccumulatedEntries + (baseEntries × promoMultiplier)` and only the new promo entries are added to `accumulatedEntries`.
   - If initial: uses `calculateInitialSubscriptionEntries(baseEntries, promoMultiplier)` and sets `lastMonthAccumulatedEntries = baseEntries × promoMultiplier`.

Without the metadata flag, the webhook would often see `user.subscription.isActive === true` (because the API had already updated it after paying), treat the event as initial, and overwrite the preserved value. The metadata ensures the webhook correctly applies the resubscribe calculation.

## Where It Is Implemented

- **Metadata constant:** `src/utils/payment/stripe-subscription-metadata.ts` — `STRIPE_SUBSCRIPTION_METADATA_IS_RESUBSCRIBE`.
- **API:** `src/app/api/stripe/create-subscription-existing-user/route.ts` — computes resubscribe before building subscription metadata, adds `isResubscribe: "true"` to metadata when applicable, and preserves `lastMonthAccumulatedEntries` on the user document.
- **Webhook:** `src/app/api/stripe/webhook/route.ts` — in `handleInvoicePaymentSucceeded`, sets `isResubscribe` from subscription metadata first, then falls back to the user-document heuristic.
- **Calculator:** `src/utils/payment/subscription-entries-calculator.ts` — `calculateResubscribeEntries` and `calculateSubscriptionEntries` (resubscribe branch).

## Edge Cases

- **Old subscriptions without metadata:** The webhook fallback (no active subscription + existing `lastMonthAccumulatedEntries`) still allows correct resubscribe behaviour for subscriptions created before this metadata was added.
- **Stripe customer with multiple subscriptions:** A customer can have several subscription records in Stripe (e.g. one Active, one Expired, one Cancelled). Resubscribe handling does not rely on "only one subscription"; it relies on metadata or user document state at the time of the payment event.
- **Promo multiplier:** Resubscribe uses the **current** active promo multiplier for the new grant; the preserved value is only the previous accumulated total, not the previous multiplier.
