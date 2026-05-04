# Subscription — Frontend

## Hooks

All client reads of subscription state go through one of these four hooks. They are the only sanctioned read path — components must not call `/api/memberships` directly.

| Hook | What it returns | Source |
|---|---|---|
| `useStripeSubscription()` | The user's Stripe subscription record (status, `cancel_at_period_end`, `current_period_end`, `pause_collection`). Driven by TanStack Query. | [src/hooks/useStripeSubscription.ts](../../src/hooks/useStripeSubscription.ts) |
| `useMemberships()` | The catalog of available `MembershipPackage` rows (subscription tier choices). | [src/hooks/useMemberships.ts](../../src/hooks/useMemberships.ts) |
| `useActivePackage()` | The user's currently-effective package, accounting for downgrade-preservation (`previousSubscription`). | [src/hooks/useActivePackage.ts](../../src/hooks/useActivePackage.ts) |
| `useMembershipModal()` | Modal controller for the membership upgrade/downgrade/cancel flow. | [src/hooks/useMembershipModal.ts](../../src/hooks/useMembershipModal.ts) |

> _TODO: verify each hook's exact return shape and query-key — pull from source when next refreshing this doc._

## Pages and routes

The user-facing membership UI is split between:

- **`src/app/(site)/my-account/`** — see the [dashboard-account](../dashboard-account/) domain. This is where members see their current plan, renewal date, payment method, cancel button, and downgrade/upgrade entry points.
- **`src/components/payment/`** — see the [payment](../payment/) domain. Hosts the `PaymentElement` integration used during signup and pay-now flows.

There is **no dedicated `(site)/subscription/` route group**. Subscription is exposed *through* `my-account` and the checkout flow.

## State conventions

- **TanStack Query** owns all server-state reads. Don't store subscription data in Zustand.
- **No client-side computation of `isActive`**. Always read `subscription.isActive` from the user object (server-derived). Components computing their own truthy-checks against `subscription.endDate` is a known footgun — see [gotchas.md](./gotchas.md#client-derived-isactive).
- **Optimistic updates are forbidden** for cancellation. The cancel API has multiple side effects (Stripe, Klaviyo, partner queue); the UI must wait for the API result and then invalidate the relevant queries.

## Cancellation UX (admin)

The admin-side cancel flow lives in [src/components/admin/UserDetailModal.tsx](../../src/components/admin/UserDetailModal.tsx) (Subscription tab). The "Cancel Subscription" button is shown when `subscription.isActive === true` **or** `subscription.status === "past_due"`. The modal offers two options (cancel-at-period-end vs immediate); for `past_due` the choice is ignored and immediate is forced.

Mutation hook: `useAdminCancelSubscription` in [src/hooks/queries/useAdminQueries.ts](../../src/hooks/queries/useAdminQueries.ts). It POSTs to `/api/admin/users/[id]/cancel-subscription` and invalidates the user-detail and user-list queries on success.

Full UX details: see [api.md](./api.md#admin-cancel-subscription) and the migrated [ADMIN_CANCEL_SUBSCRIPTION reference](./gotchas.md#admin-cancel-edge-cases).

## Cancellation UX (user)

User-side cancellation runs through `/api/stripe/cancel-subscription` (the same `CancelSubscriptionService` powers it). The UI lives under `my-account` — see [dashboard-account](../dashboard-account/) for the page structure.

> _TODO: link the specific user-facing component path once dashboard-account docs are written._
