# Klaviyo Integration

This doc describes how Klaviyo (email + revenue analytics) is wired in this codebase. Keep it in sync with code.

## Architecture

Klaviyo has TWO surfaces:

1. **Browser side** (`window.klaviyo`) — loaded via `KlaviyoScriptLoader`. Used for: `Viewed Page` tracking, anonymous→identified user linking via `Identify`, low-volume client-side events.
2. **Server side** (`klaviyo` singleton in `src/lib/klaviyo.ts`) — full Klaviyo API client with retry/timeout/error classification. Used for: ALL revenue events, lifecycle events triggered by Stripe webhooks, profile management, list subscriptions, GDPR deletions. **This is the primary path** — survives ad blockers, doesn't depend on a browser session.

Critical: post-purchase events fire from the **server**, not the browser. The browser may be closed, redirected, or have ad blockers active during the Stripe webhook → server-side is the only reliable signal.

## API version

`src/lib/klaviyo.ts` defaults to Klaviyo API revision `2025-10-15` (override with `KLAVIYO_API_REVISION`). Klaviyo's revision policy guarantees backward compatibility within a revision — bump only when you need new features. The client uses the Klaviyo Profiles + Events + Subscription Bulk Jobs endpoints.

**Revision quirks worth knowing** (current as of `2025-10-15`):
- The list endpoints `/templates/`, `/flows/`, `/segments/` **reject** `additional-fields[*]=definition` with HTTP 400. The single-resource endpoint `/flows/{id}/` accepts it. The audit script (`npm run find:klaviyo-legacy-fields`) deep-fetches each flow individually to access the full definition tree (filters + conditional splits) and the related `flow-actions` (inline message bodies).
- `/templates/` and `/segments/` cap `page[size]` at **10**. `/flows/` caps at **50**.

## Event inventory (server-side via `klaviyo.trackEventBackground`)

### Revenue events — these flow into Klaviyo's CLV / revenue metrics

| Klaviyo event | Fires from | `Order ID` format | Notes |
|---|---|---|---|
| `Placed Order` | webhook → `grantBenefits` → `trackPlacedOrder` | `sub_{paymentIntentId}` / `onetime_{packageId}_{paymentIntentId}` / `minidraw_{packageId}_{paymentIntentId}` / `upsell_{packageId}_{paymentIntentId}` | **Deterministic** — no timestamp. Uses Klaviyo's strict revenue schema (`$value`, `Currency`, `Order ID`). |
| `Refunded Order` | `refund-processing.ts` → `trackRefundedOrder` | Reconstructed from the original payment event — MUST match the Placed Order's `Order ID` exactly | Negative `$value` subtracts from CLV. |

### Lifecycle events — for email flows and segmentation (not revenue)

| Klaviyo event | Fires from |
|---|---|
| `User Registered` | `register/route.ts` (all 4 registration code paths) |
| `Subscription Started` | webhook `invoice.payment_succeeded` (first cycle) |
| `Subscription Renewed` | webhook `invoice.payment_succeeded` (`subscription_cycle`) |
| `Subscription Cancelled` | `CancelSubscriptionService` |
| `Subscription Upgraded` | webhook + `/api/stripe/upgrade-subscription-payment` |
| `Subscription Downgraded` | webhook + `/api/stripe/downgrade-subscription` |
| `Subscription Renewal Failed` | webhook `invoice.payment_failed` |
| `Subscription Payment Failed` | initial subscription payment failure paths |
| `Payment Failed` | one-time / mini-draw / upsell failure paths |
| `One-Time Package Purchased` | `grantBenefits` (one-time package type) |
| `Mini-Draw Package Purchased` | `grantBenefits` (mini-draw type) |
| `Upsell Accepted` | `grantBenefits` (upsell type) |
| `Major Draw Entry Added` / `Won` / `Ended` | draw services |
| `Invoice Generated` | invoice service layer |

### Browser-side events

| Klaviyo event | Fires from | Gated? |
|---|---|---|
| `Viewed Page` | `KlaviyoPageTracker` on route change | ✓ via `shouldTrackRoute()` — internal routes excluded |
| `Identify` | `KlaviyoUserIdentifier` when user logs in | Not gated — must run on `/my-account` |
| `Viewed Product`, `Added to Cart`, `Started Checkout` (when wired) | via `useKlaviyoTracking` hook from product components | Not gated |

## Revenue tracking — the `$value` rule

**Klaviyo's revenue metric is calculated ONLY from the top-level `$value` property.** No other property name (value, amount, price) is read. Get this wrong and revenue is invisible in Klaviyo.

The schema is enforced by `src/utils/integrations/klaviyo/klaviyo-revenue-schema.ts`:

```ts
{
  $value: number,       // REQUIRED — top-level, exact case
  Currency: string,     // capital C
  "Order ID": string,   // space, capital letters
}
```

Use `buildRevenueProperties(orderId, value, currency)` to construct this — never write the keys by hand.

## Order ID stability — refund linking

Klaviyo links `Refunded Order` to its `Placed Order` ONLY when the `Order ID` matches **exactly**. The order ID format is therefore deterministic (no timestamps, no random IDs):

```ts
// klaviyo-order-helpers.ts
membership:  `sub_${paymentIntentId}`
one-time:    `onetime_${packageId}_${paymentIntentId}`
mini-draw:   `minidraw_${packageId}_${paymentIntentId}`
upsell:      `upsell_${packageId}_${paymentIntentId}`
```

The refund flow at [refund-processing.ts:345](src/utils/payment/refund-processing.ts#L345) reconstructs the order ID via `extractOrderIdFromPaymentIntent(paymentIntentId, packageType, packageId)` — same inputs → same output → Klaviyo links and CLV stays correct.

**Historical note:** before this fix, order IDs included `Date.now()`. Refunds for orders placed before this branch landed will NOT link in Klaviyo (the original IDs have timestamps that the refund flow cannot reproduce). New orders going forward link correctly. There is no migration path for historical mis-linked orders — Klaviyo doesn't expose an API to rewrite event metadata.

## `Subscription Started` + `Placed Order` — are they double-counting?

No. Per Klaviyo's [subscription integration guide](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_subscription_ecommerce_platform), revenue calculations key off `Placed Order` specifically. `Subscription Started` is a lifecycle/trigger event — it does not have `$value` and does not contribute to CLV.

So for a new membership purchase we fire BOTH:
- `Placed Order` ($30 → counts as revenue)
- `Subscription Started` (no $value → drives a welcome-email flow, no revenue impact)

Same for upgrades/downgrades/renewals — the lifecycle event is the email trigger, the Placed Order event is the revenue ledger entry.

## Renewals — fired to Klaviyo, NOT to Meta

Subscription renewals fire `Subscription Renewed` (lifecycle) + `Placed Order` (revenue) to Klaviyo. They do NOT fire to Meta — see `src/utils/tracking/pixel-purchase-tracking.ts` `trackPixelSubscriptionRenewal`, which deliberately skips Meta to keep Meta's optimization signal focused on net-new customer acquisition.

This split is intentional:
- **Klaviyo** = full LTV ledger (every dollar counts)
- **Meta** = new-customer acquisition signal (first month only)

### Renewal `Placed Order` events carry an `is_renewal` discriminator

Klaviyo's automatic revenue attribution will credit a Placed Order to whichever flow/campaign the user most recently engaged with inside the attribution window (default: 5 days email / 24 h SMS) — regardless of whether the order was user-initiated or an automated renewal. That means a welcome email can show "$X attributed revenue" that's partially renewals which would have fired anyway.

To make honest reporting possible, every `Placed Order` event carries an `is_renewal: boolean` property (built by [createPlacedOrderEvent](src/utils/integrations/klaviyo/klaviyo-events.ts) → wired from `billingReason === "subscription_cycle"` at the [grantBenefits callsite](src/utils/payment/payment-processing.ts)). For Stripe-originated orders the raw `billing_reason` is also emitted (`"subscription_create"`, `"subscription_cycle"`, `"subscription_update"`, `"manual"`).

| Order type | `is_renewal` | `billing_reason` |
|---|---|---|
| First membership purchase | `false` | `"subscription_create"` |
| Automated monthly renewal | `true` | `"subscription_cycle"` |
| Upgrade / downgrade proration | `false` | `"subscription_update"` |
| One-time / mini-draw / upsell | `false` | (omitted) |

**Default Klaviyo metrics still see all revenue** — `is_renewal` is purely additive. To get a "new revenue only" report, create a custom metric in Klaviyo (Account → Metrics → Create) keyed on `Placed Order` with the condition `is_renewal EQUALS false`. Use that one for "what is this campaign actually driving" analysis; use the default `Placed Order` metric for LTV and total revenue.

Refund linking is unaffected — `Refunded Order` continues to link by `Order ID` only.

## EMQ-equivalent for Klaviyo: profile properties

Klaviyo doesn't have an "Event Match Quality" score like Meta, but profile linking quality determines whether events attach to the right profile. The codebase pushes profile updates via:

- `klaviyo.upsertProfile(...)` — creates or updates with email + first_name + last_name + phone_number + custom properties
- `ensureUserProfileSynced(user, brandInterest)` in `klaviyo-profile-sync.ts` — wraps upsert with retry, idempotency check, and brand-interest property
- `KlaviyoUserIdentifier` (browser) — `klaviyo.push(['identify', { email, ... }])` on login

For all server-side events, `customer_properties` comes from `getCustomerProperties(user)` ([klaviyo-helpers.ts](src/utils/integrations/klaviyo/klaviyo-helpers.ts)) which includes email + phone + first/last name. Events use the SAME email as the upserted profile, so attachment works automatically.

## Common bugs to watch for

- **Building revenue events by hand** instead of using `buildRevenueProperties` — easy to typo `$value` as `value`, breaking revenue reporting.
- **Adding `Date.now()` or random IDs to order IDs** — breaks refund linking. Always use the deterministic generators in `klaviyo-order-helpers.ts`.
- **Calling `trackKlaviyoEvent` (client) from a webhook** — no-ops because `typeof window === "undefined"`. Use `klaviyo.trackEventBackground` (server) instead.
- **Firing `Placed Order` from both client and server for the same purchase** — risks double-counting revenue if order IDs differ. The current architecture fires `Placed Order` only server-side from `grantBenefits`.
- **Not passing the customer's email** — Klaviyo can't attach the event to a profile, revenue shows as anonymous.

## References

- [Klaviyo Events API](https://developers.klaviyo.com/en/reference/create_event)
- [Klaviyo Revenue Metrics setup](https://help.klaviyo.com/hc/en-us/articles/115005078647)
- [Integrate a subscription ecommerce platform](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_subscription_ecommerce_platform)
- [Integrate a platform without a pre-built integration](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration)
