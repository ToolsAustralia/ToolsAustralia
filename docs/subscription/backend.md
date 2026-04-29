# Subscription — Backend

## Services

All non-trivial subscription logic lives under [`src/services/subscription/`](../../src/services/subscription/). Per CLAUDE.md, route handlers must delegate here — no business logic in `route.ts`.

### `cancelSubscription(user, options)`

[CancelSubscriptionService.ts](../../src/services/subscription/CancelSubscriptionService.ts)

The single shared cancellation entry point. Used by both the user route (`/api/stripe/cancel-subscription`) and the admin route (`/api/admin/users/[id]/cancel-subscription`).

**Signature:**

```ts
interface CancelSubscriptionOptions {
  cancelAtPeriodEnd?: boolean;            // default true
  analytics?: { actor: "user" | "admin"; adminUserId?: string };
}
interface CancelSubscriptionResult {
  cancelledImmediately: boolean;
  subscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;        // ISO
  endDate: string | null;                 // ISO
  isPastDue: boolean;
}
```

**Flow:**
1. `resolveCancellableStripeSubscription(user)` — finds the live Stripe sub, repairing the canonical `User.stripeSubscriptionId` if it pointed at a dead one.
2. `isPastDue` derived from Stripe status OR Mongo `subscription.status` (either signal counts).
3. `shouldCancelImmediately = isPastDue || !cancelAtPeriodEnd`.
4. Stripe call: `stripe.subscriptions.cancel(id)` for immediate, otherwise `stripe.subscriptions.update(id, { cancel_at_period_end: true })`.
5. Re-`retrieve()` the subscription to get the authoritative `current_period_end`.
6. Resolve `stripeEndDate` via `resolveTimestamp(...)` — falls through `getSubscriptionPeriodEnd` (Basil API → legacy) → `cancel_at` field.
7. Mongo update on `user.subscription`: `autoRenew=false`, `cancelledAt=new Date()`, `status`, `endDate` (now if immediate, else stripe end), `isActive` (false if immediate).
8. Partner-discount queue: `handleSubscriptionQueueUpdate(user, "end")` — *only when cancelling immediately*.
9. `await user.save()`.
10. Klaviyo `ensureUserProfileSynced(user)` — non-blocking, errors logged not thrown.
11. `recordCancellationAnalytics(...)` writes a `MembershipStatusHistory` row — non-blocking.

**Important:** Cancellation analytics events (the "Subscription Cancelled" Klaviyo / Meta event) are **only emitted from the `customer.subscription.deleted` webhook**, never from this service path, to prevent duplicate events.

### `pauseAfterRenewalFailure(subscriptionId)` / `resumeAfterSuccessfulRenewalPayment(subscriptionId)`

[SubscriptionCollectionPauseService.ts](../../src/services/subscription/SubscriptionCollectionPauseService.ts)

```ts
export async function pauseAfterRenewalFailure(subscriptionId: string): Promise<void>;
export async function resumeAfterSuccessfulRenewalPayment(subscriptionId: string): Promise<void>;
```

`pause` sets `pause_collection: { behavior: "keep_as_draft" }`. `resume` clears `pause_collection` (sets to empty string per Stripe's manual-unpause API). Both are idempotent.

Pause callers: `invoice.payment_failed` webhook handler.

Resume callers (must run *before* benefit application):
- `invoice.payment_succeeded` webhook (when `shouldClearPauseCollectionAfterPaidInvoice()` returns true)
- `src/server/admin/chargePastDueShared.ts` after successful `invoices.pay`
- `/api/stripe/renew-subscription` after user retry success

### `pauseCollectionPolicy.ts` (pure helpers)

[pauseCollectionPolicy.ts](../../src/services/subscription/pauseCollectionPolicy.ts)

Two pure helpers, no Stripe client — safe to import in tests:

```ts
shouldClearPauseCollectionAfterPaidInvoice({
  billingReason,                    // Stripe invoice.billing_reason
  previousSubscriptionDbStatus,     // Mongo's view of status before this update
}): boolean;

describePauseCollection(subscription): string;   // "none" | "void" | "mark_uncollectible" | "keep_as_draft" | "paused"
```

Clearing rule (returns true if any):
- Previous DB status was `past_due` or `unpaid`.
- `billingReason` is `subscription_cycle` | `subscription_threshold` | `subscription_update`.

### `SubscriptionReferenceService` (Stripe-ref repair toolkit)

[SubscriptionReferenceService.ts](../../src/services/subscription/SubscriptionReferenceService.ts)

Helpers used everywhere we touch a Stripe subscription. Key exports:

| Symbol | Role |
|---|---|
| `MANAGEABLE_STRIPE_SUBSCRIPTION_STATUSES` | `["active","trialing","past_due","unpaid","paused"]` — the canonical "user has a real sub" set. |
| `DEAD_STRIPE_SUBSCRIPTION_STATUSES` | `["incomplete","incomplete_expired","canceled"]`. |
| `isManageableStripeSubscriptionStatus(status)` | Type-narrowing predicate. |
| `isDeadStripeSubscriptionStatus(status)` | Same for dead set. |
| `shouldWriteCanonicalStripeSubscriptionId(status)` | Only promote to `User.stripeSubscriptionId` when manageable. |
| `retrieveStripeSubscription(id)` | Wraps `stripe.subscriptions.retrieve` with classified errors (`is404`, `isRetryable`). |
| `findRecoverableSubscriptionForCustomer(customerId)` | Lists subs by status priority (`active → trialing → past_due → unpaid → paused`); newest-first within a status. |
| `stripeCustomerHasManageableSubscription(customerId)` | Pre-create dedupe guard. |
| `resolveCancellableStripeSubscription(user)` | The full repair-and-resolve algorithm used by the cancel service. Throws `SubscriptionReferenceError` with a typed `code`. |
| `shouldAdoptPaidSubscriptionOverStored(...)` | Webhook auto-correction when `invoice.paid` references a different (but manageable) sub than the stored one (and stored is dead). |

Error codes (`SUBSCRIPTION_REFERENCE_ERROR_CODES`):
- `NO_ACTIVE_SUBSCRIPTION` — surface as 400 / "you have no subscription to cancel."
- `STRIPE_RETRYABLE` — surface as 503 with retry-after.

## Utilities

[`src/utils/subscription/`](../../src/utils/subscription/) and [`src/utils/membership/`](../../src/utils/membership/) hold pure helpers consumed by services and route handlers.

| File | Purpose |
|---|---|
| `utils/membership/get-active-package.ts` | Resolve the user's currently-effective package, honouring `previousSubscription` for downgrade benefit-preservation. |
| `utils/membership/has-additional-package-access.ts` | Combined check: subscription + one-time package overlap. |
| `utils/membership/membership-adapters.ts` | Shape conversions between Mongo, Stripe, and UI representations. |
| `utils/membership/subscription-benefits.ts` | Resolve `entriesPerMonth`, `shopDiscountPercent` etc. given a subscription state. |
| `utils/membership/benefit-resolution.ts` | Higher-level resolver that combines subscription + one-time + active mini-draws. |
| `utils/membership/member-package-mapping.ts` | Static config map `packageId → packageName` etc. |
| `utils/subscription/subscription-helpers.ts` | Misc helpers (date math, status normalisation). |

> _TODO: enumerate the exact exports from each helper file and document any non-obvious invariants. The above is a structural overview — refresh when touching these files._

## Jobs / cron / locks

`ChargeJobLock` (model) is a **single-document** distributed lock used to serialise the past-due charge job, ensuring only one instance of the operational charge run executes at a time across deployments. The doc's `_id` is hard-coded to `"charge-job-lock"`. See [models.md](./models.md#chargejoblock).

> _TODO: locate the cron entry that uses `ChargeJobLock` (likely under `src/lib/jobs/` or `src/app/api/cron/`) and document its schedule + behaviour. Cross-reference [infrastructure](../infrastructure/) when those docs exist._
