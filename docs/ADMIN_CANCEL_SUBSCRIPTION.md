# Admin Cancel Subscription Feature

## Overview

This feature allows administrators to cancel a user's Stripe subscription from the Admin Dashboard. It appears in the User Detail modal under the **Subscription** tab when viewing or editing a user. Cancellation follows Stripe best practices and keeps the database, Klaviyo, and partner discount queue in sync.

## Access

- **Location:** Admin → Users → Select user → Subscription tab
- **Permission:** Admin only (`session.user.role === "admin"`)
- **Requirement:** User must have a Stripe subscription (`stripeSubscriptionId`)

## When the Cancel Button Appears

The "Cancel Subscription" button is visible when the user has:

- **Active subscription** (`subscription.isActive === true`), or
- **Past due subscription** (`subscription.status === "past_due"`)

Past-due users have `isActive === false` in the database (set by the Stripe webhook when payment fails), but they still have a live Stripe subscription that can and should be cancelled. Including `past_due` ensures admins can clean up failed subscriptions.

The button is **not** shown when:

- User has no subscription
- Subscription is already fully cancelled (`status === "canceled"`)
- Subscription is incomplete or expired

## Cancellation Options

When the admin clicks "Cancel Subscription", a modal offers two choices:

| Option | Behavior | Use case |
|--------|----------|----------|
| **Cancel at end of billing period** | Sets `cancel_at_period_end: true` in Stripe. User keeps access until `current_period_end`. | Default—gives the user access until they've paid for. |
| **Cancel immediately** | Calls `stripe.subscriptions.cancel()`. Access revoked now. No refund. | When access must end right away (e.g. abuse, chargebacks). |

**Note:** For `past_due` subscriptions, the service **always cancels immediately**, since the billing period has already ended and there is no access to preserve.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ UserDetailModal (Subscription tab)                              │
│  - Cancel Subscription button (when isActive OR past_due)      │
│  - Cancellation modal (cancel at period end vs immediate)       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ useAdminCancelSubscription hook                                  │
│  - POST /api/admin/users/[id]/cancel-subscription               │
│  - Invalidates user detail + list queries on success            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ POST /api/admin/users/[id]/cancel-subscription                  │
│  - Admin auth                                                   │
│  - Validates userId, fetches user                               │
│  - Returns 400 if no stripeSubscriptionId                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ CancelSubscriptionService (src/services/subscription)            │
│  - Stripe: cancel() or update(cancel_at_period_end)              │
│  - MongoDB: autoRenew, cancelledAt, endDate, status              │
│  - Partner discount queue (handleSubscriptionQueueUpdate)       │
│  - Klaviyo: cancellation event + profile sync                  │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

### Admin Cancel Subscription

**POST** `/api/admin/users/[id]/cancel-subscription`

**Headers:** Session cookie (admin required)

**Request body:**

```json
{
  "cancelAtPeriodEnd": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cancelAtPeriodEnd` | boolean | `true` | `true` = cancel at period end; `false` = cancel immediately. Ignored for `past_due` (always immediate). |

**Success response (200):**

```json
{
  "success": true,
  "message": "Subscription will be canceled at the end of the current billing period.",
  "data": {
    "cancelledImmediately": false,
    "subscriptionId": "sub_xxxx",
    "status": "active",
    "cancelAtPeriodEnd": true,
    "currentPeriodEnd": "2025-04-01T00:00:00.000Z",
    "endDate": "2025-04-01T00:00:00.000Z",
    "isPastDue": false
  }
}
```

**Error responses:**

| Status | Condition |
|--------|-----------|
| 401 | Not authenticated or not admin |
| 400 | Invalid userId, user not found, or no Stripe subscription |
| 500 | Stripe or server error |

## Key Files

| File | Responsibility |
|------|----------------|
| `src/services/subscription/CancelSubscriptionService.ts` | Shared cancellation logic (Stripe, DB, Klaviyo, partner queue) |
| `src/services/subscription/index.ts` | Service exports |
| `src/app/api/admin/users/[id]/cancel-subscription/route.ts` | Admin API route |
| `src/app/api/stripe/cancel-subscription/route.ts` | User-facing cancel route (uses same service) |
| `src/hooks/queries/useAdminQueries.ts` | `useAdminCancelSubscription` mutation hook |
| `src/components/admin/UserDetailModal.tsx` | Cancel button and confirmation modal UI |

## Stripe Behavior

- **Active/trialing:** Uses `subscriptions.update(id, { cancel_at_period_end: true })` or `subscriptions.cancel(id)` depending on option.
- **Past due:** Always uses `subscriptions.cancel(id)` because there is no current period to preserve.
- **Preserved:** `lastMonthAccumulatedEntries` is kept for potential resubscribe.

## Side Effects

1. **MongoDB:** `subscription.autoRenew`, `cancelledAt`, `endDate`, `status`, `isActive` updated.
2. **Partner discount queue:** Ends active period immediately when cancelling immediately; otherwise handled when the period ends.
3. **Klaviyo:** Cancellation event and profile sync (non-blocking).
4. **React Query:** User detail and list queries invalidated on success.

## Related Documentation

- [CHARGE_PAST_DUE_CUSTOMERS.md](./CHARGE_PAST_DUE_CUSTOMERS.md) — Retry failed payments before cancelling
- [SUBSCRIPTION_PAYMENT_ELEMENT_MIGRATION.md](./SUBSCRIPTION_PAYMENT_ELEMENT_MIGRATION.md) — Subscription flow overview
