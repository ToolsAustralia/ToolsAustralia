# Subscription — API

Routes owned by this domain. All handlers must follow the route conventions in CLAUDE.md (Zod-validate, auth, delegate to a service).

## Routes in this domain

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/memberships` | _TODO: verify_ | List membership packages catalog |
| GET | `/api/memberships/[id]` | _TODO: verify_ | Get a single membership package |
| GET | `/api/subscription/benefits` | Session | Resolve current user's active benefits |

> _TODO: read the route handlers and fill in exact request/response shapes, status codes, and auth gating. The summaries below are the target shape; verify against [src/app/api/memberships/route.ts](../../src/app/api/memberships/route.ts), [src/app/api/memberships/[id]/route.ts](../../src/app/api/memberships/[id]/route.ts), and [src/app/api/subscription/benefits/route.ts](../../src/app/api/subscription/benefits/route.ts) before relying on this doc._

## `GET /api/subscription/benefits` — active Stripe discount

The benefits payload's `data` object now includes an **optional** `discount`
field reflecting the member's **live, active Stripe subscription discount**
(e.g. the accepted retention "50% off / 2 months" coupon):

```jsonc
"data": {
  // ...currentBenefits, isCancelled, endDate, etc.
  "discount": { "couponId": "retention-50off-2mo", "percentOff": 50, "endsAt": "2026-07-19T..." }
}
```

- Shape: `{ couponId: string; percentOff: number; endsAt?: string /* ISO */ }`.
- **Omitted entirely** when there is no active discount, the coupon is not a
  percentage discount, or the Stripe read failed — consumers must treat it as
  optional. The no-discount response is byte-identical to before.
- Resolved by `getActiveStripeSubscriptionDiscount(user)` in
  [src/utils/membership/subscription-benefits.ts](../../src/utils/membership/subscription-benefits.ts):
  best-effort, **never throws**, returns `null` on any failure so this shared
  endpoint is never broken for other consumers.
- Adds **one** extra Stripe call (`subscriptions.retrieve` with `discounts`
  expanded) **only when `user.stripeSubscriptionId` is present**. No Stripe
  call is made when there is no subscription id.
- `endsAt` is truthful only: set from Stripe's `discount.end`; else derived
  from `discount.start + coupon.duration_in_months` for `repeating` coupons;
  otherwise **omitted** (never fabricated).
- Read live from Stripe (`subscription.discounts`), not from
  `retentionOffersConsumed` — that persisted flag is not client-usable for
  active/expiry state. `RetentionDiscountService` is unchanged.

The Current Plan card ([CurrentBenefitsCard.tsx](../../src/components/modals/SubscriptionManagementModal/CurrentBenefitsCard.tsx))
renders the discounted price prominently with the catalog price struck
through and a "`{percentOff}% off · until {date}`" badge (or "`{percentOff}%
off applied`" when `endsAt` is absent). When `discount` is absent the card is
unchanged.

## Cross-domain routes that touch subscription

These routes live in other domains but read/write subscription state:

| Route | Domain | What it does |
|---|---|---|
| `/api/stripe/cancel-subscription` | [billing-stripe](../billing-stripe/) | User-facing cancel; calls `cancelSubscription()`. |
| `/api/stripe/renew-subscription` | [billing-stripe](../billing-stripe/) | User retry on a failed renewal invoice. Resumes pause-collection on success. |
| `/api/stripe/webhook` | [billing-stripe](../billing-stripe/) | Receives `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.{created,updated,deleted}`. The webhook is the single source of subscription analytics events (cancellation, renewal). |
| `/api/admin/users/[id]/cancel-subscription` | [admin](../admin/) | Admin cancel; calls same `cancelSubscription()` with `analytics.actor: "admin"`. |
| `/api/admin/users/[id]/charge-past-due` | [admin](../admin/) | Operational tool to retry a past-due invoice. Resumes pause-collection on success. |

## Admin cancel-subscription — full reference

(Migrated from former `docs/ADMIN_CANCEL_SUBSCRIPTION.md`.)

**POST** `/api/admin/users/[id]/cancel-subscription`

**Headers:** Session cookie (admin role required).

**Request body:**

```json
{ "cancelAtPeriodEnd": true }
```

| Field | Type | Default | Description |
|---|---|---|---|
| `cancelAtPeriodEnd` | boolean | `true` | `true` = cancel at period end; `false` = cancel immediately. **Ignored for `past_due` (always immediate).** |

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
|---|---|
| 401 | Not authenticated or not admin |
| 400 | Invalid `userId`, user not found, or no `stripeSubscriptionId` |
| 503 | Stripe retryable error (rate limit, 5xx, network) — surfaced as `SubscriptionReferenceError` code `STRIPE_RETRYABLE`. _TODO: verify exact status code mapping in handler_ |
| 500 | Other server error |

When the cancel button should appear in admin UI:
- `subscription.isActive === true`, **or**
- `subscription.status === "past_due"`

The button is **hidden** when the user has no subscription, or when status is already `canceled` / `incomplete` / `incomplete_expired`.

## Authorization model

All admin routes (`/api/admin/**`) must do their **own** session check via `src/lib/api-auth.ts` — middleware does not gate `/api/**` (the matcher excludes it). Subscription routes that act on the *current* user use NextAuth session via the standard helpers.

See `.cursor/agents/auth-security.md` and the [auth](../auth/) domain docs for the auth helper API.
