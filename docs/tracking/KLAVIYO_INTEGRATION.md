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
| `Subscription Renewed` | webhook `invoice.payment_succeeded` (`subscription_cycle`) | `sub_{paymentIntentId}` — `generateOrderId("membership", packageId, paymentIntentId)`, **matches the same invoice's `Placed Order`** | **Carries `$value` for renewal-specific reporting only — DO NOT add to the account revenue/CLV metric.** The all-inclusive `Placed Order` already counts this renewal; mapping this event in too would double-count. See "double-counting" note below. |

### Lifecycle events — for email flows and segmentation (not revenue)

| Klaviyo event | Fires from |
|---|---|
| `User Registered` | `register/route.ts` (all 4 registration code paths) |
| `Subscription Started` | webhook `invoice.payment_succeeded` (first cycle) |
| `Subscription Renewed` | webhook `invoice.payment_succeeded` (`subscription_cycle`) — **also carries `$value` (renewal-revenue reporting only, NOT for account revenue/CLV — would double-count `Placed Order`)** |
| `Subscription Cancelled` | webhook `customer.subscription.deleted` (`handleSubscriptionDeleted`) — **not** `CancelSubscriptionService`, despite what this row said before 2026-08-26 |
| `Subscription Cancellation Requested` (canonical, added 2026-08-26) | `CancelSubscriptionService.cancelSubscription()` when `isMemberChurn === true` — i.e. the member-initiated `/api/stripe/cancel-subscription` route only. The cancel-CLICK signal; see the section below |
| `Subscription Upgraded` | webhook + `/api/stripe/upgrade-subscription-payment` |
| `Subscription Downgraded` | webhook + `/api/stripe/downgrade-subscription` |
| `Subscription Renewal Failed` | webhook `invoice.payment_failed` |
| `Subscription Payment Failed` | initial subscription payment failure paths |
| `Payment Failed` | one-time / mini-draw / upsell failure paths |
| `One-Time Package Purchased` | `grantBenefits` (one-time package type). Carries `had_active_subscription` — the **pre-grant** membership state, added 2026-08-26, so a nurture flow can tell "an ACTIVE member topping up" from "someone with no active membership who bought a pack instead of joining". Same predicate as the live `has_active_subscription`, frozen at the purchase instant — paused and past-due members read `false` here too; read the canonical-property row before building a flow filter on it |
| `Mini-Draw Package Purchased` | `grantBenefits` (mini-draw type) |
| `Upsell Accepted` | `grantBenefits` (upsell type) |
| `Major Draw Entry Added` / `Won` / `Ended` | draw services |
| `Invoice Generated` | **server-side** from `trackKlaviyoEvent` (payment-processing.ts) via `trackInvoice` — see "Invoice Generated (customer receipt)" below |

### Browser-side events

| Klaviyo event | Fires from | Gated? |
|---|---|---|
| `Viewed Page` | `KlaviyoPageTracker` on route change | ✓ via `shouldTrackRoute()` — internal routes excluded |
| `Identify` | `KlaviyoUserIdentifier` when user logs in | Not gated — must run on `/my-account` |
| `Viewed Product`, `Added to Cart` | via `useKlaviyoTracking` hook from product components | Not gated |
| `Viewed Giveaway` (canonical, added 2026-05-28) | `PromoViewTracking` on `/promotions/<slug>` and brand pages (`/promotions/dewalt`, `/makita`, `/milwaukee`, `/ryobi`) | ✓ via `hasPixelConsent()` (called by `trackKlaviyoEvent`) |
| `Started Checkout` — **authed path** (`step="viewed"`, canonical, revised 2026-05-28 Phase-7) | [`MembershipSection.handlePlanSelect`](../../src/components/sections/MembershipSection.tsx) at the "Enter Now" click — fires at intent capture, BEFORE the modal renders the card form. Captures abandoners who never reach payment-submit. | ✓ via `hasPixelConsent()` |
| `Started Checkout` — **guest registration path** (`step="registered"`, canonical, added 2026-05-28) | **Server-side** from `/api/auth/register` after `ensureUserProfileSynced` — fires when guest completes step-1 with a `packageId`, from all 4 register branches (new-user + 3 plain-account updates) | **Not gated** — committed action, not browsing. See [docs/auth/gotchas.md](../auth/gotchas.md). |
| `Started Checkout` — **guest second-open fallback** (`step="viewed"`, canonical, Phase-7) | `MembershipModal.handleSubmit` with `if (!isAuthenticated)` gate — fires when `guestUserData` persisted across modal close/reopen so step-1 was skipped (no server-side fire) | ✓ via `hasPixelConsent()` |

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

**Exception — `Subscription Renewed` DOES carry `$value` (added 2026-06):** unlike the other lifecycle events, `createSubscriptionRenewedEvent` ([klaviyo-events.ts](../../src/utils/integrations/klaviyo/klaviyo-events.ts) ~L333) now also emits top-level `$value` + `Currency` + `Order ID` via `buildRevenueProperties`, using the deterministic Order ID `sub_{paymentIntentId}` (`generateOrderId("membership", packageId, paymentIntentId)`) — the **same** Order ID as the `Placed Order` for that invoice. (Before this, it emitted only `price` as a STRING via `formatPackageDataForKlaviyo`, which Klaviyo ignores for revenue, so renewal revenue was invisible on this event.)

**CRITICAL — do NOT map `Subscription Renewed` into the account revenue/CLV metric.** The all-inclusive `Placed Order` event already counts the renewal for total revenue + CLV; adding `Subscription Renewed` too would **double-count** every renewal. This `$value` exists for **renewal-specific reporting / flow value only** (e.g. a renewal-thank-you flow whose attributed value should reflect the renewal). This is complementary to the Klaviyo-side custom conversion metric `Placed Order WHERE is_renewal != true` (the flow/campaign conversion metric — see "Renewal `Placed Order` events carry an `is_renewal` discriminator" below) used to keep marketing attribution free of automated renewals.

## Renewals — fired to Klaviyo, NOT to Meta

Subscription renewals fire `Subscription Renewed` (lifecycle) + `Placed Order` (revenue) to Klaviyo. They do NOT fire to Meta — see `src/utils/tracking/pixel-purchase-tracking.ts` `trackPixelSubscriptionRenewal`, which deliberately skips Meta to keep Meta's optimization signal focused on net-new customer acquisition.

This split is intentional:
- **Klaviyo** = full LTV ledger (every dollar counts)
- **Meta** = new-customer acquisition signal (first month only)

### Renewal `Placed Order` events carry an `is_renewal` discriminator

Klaviyo's automatic revenue attribution will credit a Placed Order to whichever flow/campaign the user most recently engaged with inside the attribution window (default: 5 days email / 24 h SMS) — regardless of whether the order was user-initiated or an automated renewal. That means a welcome email can show "$X attributed revenue" that's partially renewals which would have fired anyway.

To make honest reporting possible, every `Placed Order` event carries an `is_renewal: boolean` property. There are **two** emitters and both set it:

- **Package-shaped orders** — [createPlacedOrderEvent](src/utils/integrations/klaviyo/klaviyo-events.ts), wired from `billingReason === "subscription_cycle"` at the [grantBenefits callsite](src/utils/payment/payment-processing.ts). For Stripe-originated orders the raw `billing_reason` is also emitted (`"subscription_create"`, `"subscription_cycle"`, `"subscription_update"`, `"manual"`).
- **Merchandise orders** — [trackShopPlacedOrder](src/utils/integrations/klaviyo/klaviyo-revenue-service.ts), which hard-codes `is_renewal: false` (merch is never a renewal) and emits no `billing_reason`.

**`Placed Order` is emitted SERVER-SIDE ONLY.** A browser-side `trackPurchase` helper existed on the `useKlaviyoTracking` hook and was **deleted on 2026-09-02**: it had zero callers, and wiring it up would have double-counted every sale against the authoritative webhook event (neither path sets a Klaviyo `unique_id`, so nothing would have deduped them). It also omitted `is_renewal`. Do not re-add a client-side purchase emit; if one is ever genuinely needed it requires a different event name and a deduplication story first.

⚠️ **The property must always be PRESENT, never omitted for the `false` case.** Klaviyo treats a missing property as "not set", which does **not** match an `EQUALS false` / `= 0` filter. An omitted flag silently drops the order out of any metric built on it, with no error anywhere. This is not theoretical: `trackShopPlacedOrder` shipped without the flag on 2026-08-27 and every merchandise sale would have been invisible to Marketing Revenue — caught and fixed 2026-09-02 before the shop took its first order. Both emitters are now fenced by `npm run test:klaviyo-canonical`.

| Order type | `is_renewal` | `billing_reason` |
|---|---|---|
| First membership purchase | `false` | `"subscription_create"` |
| Automated monthly renewal | `true` | `"subscription_cycle"` |
| Upgrade / downgrade proration | `false` | `"subscription_update"` |
| One-time / mini-draw / upsell | `false` | (omitted) |
| Merchandise (shop) | `false` | (omitted) |

**Default Klaviyo metrics still see all revenue** — `is_renewal` is purely additive. To get a "new revenue only" report, create a custom metric in Klaviyo (Account → Metrics → Create) keyed on `Placed Order` with the condition `is_renewal EQUALS false`. Use that one for "what is this campaign actually driving" analysis; use the default `Placed Order` metric for LTV and total revenue.

⚠️ **That custom metric is readable in the Klaviyo UI ONLY — the Reporting API cannot see it.** Verified 2026-09-02 against the live account. The metric exists (id `01KSSZVD0B3GYG7BGVE7PNCA4N`, "Marketing Revenue", filter `is_renewal = 0` numeric). `campaign-values-reports` / `flow-values-reports` **accept** it as `conversion_metric_id`, return HTTP 200, and then return **base `Placed Order` numbers anyway** — 92 campaigns, A$188,451.81, identical to the cent under both metric ids. Controls: a different real metric (`SVLZpF`) *does* change the numbers, so the parameter is honoured; a bogus id returns `400 "Passed in conversion metric does not exist"`, so ids are validated and the custom one passes. The aggregates endpoint rejects custom metrics outright (`400 "Custom metrics are not supported for this API."`) and additionally refuses to filter the base metric on `is_renewal` at all. **There is therefore no API route to the renewals-excluded split** — quote it from the UI, or emit a real second event (see the spec's non-goal, `Placed Non-Recurring Order`). Full evidence: [2026-09-02 spec](../superpowers/specs/2026-09-02-klaviyo-shop-is-renewal-design.md).

Refund linking is unaffected — `Refunded Order` continues to link by `Order ID` only.

## `Invoice Generated` (customer receipt) — server-side, gated by `billing_reason`

`Invoice Generated` is the receipt event; the Klaviyo **"Invoice"** flow triggers on it and sends the **"Receipt"** email. As of the **2026-07 invoice-reliability change** it is emitted **server-side** from [`trackKlaviyoEvent`](../../src/utils/payment/payment-processing.ts) (inside `processPaymentBenefits`, which is idempotent and always runs server-side for every charge). It **no longer** depends on a client-side `/api/invoice/finalize` call, so it can never be dropped by a browser that navigates away after paying.

The emit/skip decision is a pure predicate — `shouldEmitInvoiceGenerated(billingReason?)` in [`klaviyo-invoice-service.ts`](../../src/utils/integrations/klaviyo/klaviyo-invoice-service.ts) — keyed on the Stripe `billing_reason`:

| `billing_reason` | Charge | `Invoice Generated`? | Who owns the customer email |
|---|---|---|---|
| `subscription_create` | New membership (first cycle) | **EMIT** (server-side) | "Invoice" flow → "Receipt" |
| undefined / `""` | One-time pack, mini-draw, accepted upsell | **EMIT** (each charge its own receipt) | "Invoice" flow → "Receipt" |
| `subscription_cycle` / `subscription_threshold` | Renewal | **SKIP** | "Subscription Renewed" → **"Membership Renewal"** flow (live) |
| `subscription_update` | Upgrade | **SKIP** here | emitted by the `invoice.payment_succeeded` webhook's `isUpgrade` block |

Renewals are skipped so we never **double-email**: a renewing member already gets the "Membership Renewal" flow email off the `Subscription Renewed` event. Upgrades are skipped here because the webhook emits an upgrade-specific `Invoice Generated` with the correct `billing_reason`.

`buildInvoiceData` ([`klaviyo-invoice-helpers.ts`](../../src/utils/integrations/klaviyo/klaviyo-invoice-helpers.ts)) hard-codes `billingReason: "subscription_create"` for memberships and `undefined` otherwise — so a new membership charge routes to the Invoice flow just like a one-time purchase.

The Receipt template renders the line item as `{{ item.description }}`. `buildInvoiceData` resolves that label via `getReceiptLabelByPackageId` for membership / one-time / mini (adds "(Member)" / "(Mini Draw)" disambiguators) — but **upsell** offer ids (`membership-upsell-boss`, `onetime-upsell-foreman`, …) live in `upsellPackages.ts`, not the membership/mini catalogs, so the helper would fall back to the raw id. For `packageType === "upsell"` we use the clean offer name (`packageData.packageName`, e.g. "Foreman Pack") instead. Fenced by `npm run test:invoice-generated-gate`.

**Two live flows, one split:**
- **"Invoice" flow** — triggers on `Invoice Generated`, sends "Receipt". Receives new memberships, one-time packs, mini-draws, and accepted upsells.
- **"Membership Renewal" flow** — triggers on `Subscription Renewed`, sends the renewal email. Receives renewals only.

**Behavioral consequence of the 2026-07 change:** an accepted upsell is its own separate Stripe charge, so it now produces its **own** `Invoice Generated` — a user who buys and then accepts an upsell receives **two** receipts, not the single client-combined invoice the old flow produced. The old client-driven "combined invoice" / delay-until-upsell-decision path (`trackCombinedInvoice`, `shouldDelayInvoice`, `buildCombinedInvoiceData`) has been **removed**.

`Invoice Generated` carries **no** top-level `$value` — it is not a Klaviyo revenue metric. Revenue lives on `Placed Order` (with the `is_renewal` discriminator) and `Subscription Renewed` (see the `$value` rule above).

## EMQ-equivalent for Klaviyo: profile properties

Klaviyo doesn't have an "Event Match Quality" score like Meta, but profile linking quality determines whether events attach to the right profile. The codebase pushes profile updates via:

- `klaviyo.upsertProfile(...)` — creates or updates with email + first_name + last_name + phone_number + custom properties
- `ensureUserProfileSynced(user, brandInterest)` in `klaviyo-profile-sync.ts` — wraps upsert with retry, idempotency check, and brand-interest property
- `KlaviyoUserIdentifier` (browser) — `klaviyo.push(['identify', { email, ... }])` on login
- `klaviyo.bulkImportProfiles(profiles)` — the **fast path for large profile-DATA resyncs/backfills**: one async `POST /profile-bulk-import-jobs/` upserts up to **10,000 profiles per job** (vs `upsertProfile`, which hits the Profiles API twice per profile). Poll with `getBulkImportJobStatus(jobId)`; inspect failures with `getBulkImportErrors(jobId)`. The JSON:API body and size-safe batching are built by the pure, unit-tested helpers `buildBulkImportPayload` + `chunkProfilesForBulkImport` in [bulk-import.ts](src/utils/integrations/klaviyo/bulk-import.ts) (keep each batch under Klaviyo's 5MB payload limit). **Data-only upsert — it deliberately never sets `data.relationships.lists`**, so it updates profile attributes/properties without changing list membership or consent. Use it for backfills (e.g. the post-outage resync script); use `upsertProfile` for single live updates.

For all server-side events, `customer_properties` comes from `getCustomerProperties(user)` ([klaviyo-helpers.ts](src/utils/integrations/klaviyo/klaviyo-helpers.ts)) which includes email + phone + first/last name. Events use the SAME email as the upserted profile, so attachment works automatically.

## Property naming contract — snake_case everywhere

All keys sent to Klaviyo — profile attributes, custom properties, identify traits, and event properties — are **snake_case**. Mixed casing creates duplicate profile properties (a camelCase shadow alongside Klaviyo's standard snake_case field) and silently breaks any flow filter, segment condition, or template merge tag set up against the other variant.

- **Profile attributes** (Klaviyo's built-in fields): `email`, `first_name`, `last_name`, `phone_number`. Always send these at the top level of the profile payload, not inside `properties`.
- **Profile custom properties**: snake_case keys. The canonical typed shape lives in [src/types/klaviyo.ts](src/types/klaviyo.ts) — extend it when you add a new property rather than ad-hoc spreading.
- **Client identify traits** (`useKlaviyoTracking().identify` / `identifyKlaviyoUser`): `first_name`, `last_name`, `phone_number`, `user_id`. The trait keys must match the server-side `upsertProfile` field names so they merge instead of forking.
- **Event properties** (`trackKlaviyoEvent`, `useKlaviyoTracking().track*`): snake_case. The typed `KlaviyoEventParams` interface in [src/hooks/useKlaviyoTracking.ts](src/hooks/useKlaviyoTracking.ts) is the source of truth — keys are `product_id`, `product_name`, `order_id`, `num_items`, `content_name`, `content_ids`. (Revenue events additionally use Klaviyo's exact-case `$value`, `Currency`, `Order ID` — built via `buildRevenueProperties()`, never by hand.)

To audit existing Klaviyo assets for legacy camelCase references before changing the client contract, run `npm run find:klaviyo-legacy-fields`. It scans templates (html/text), flow definitions + inline message bodies, segment condition trees, and Draft/Scheduled campaigns for both identify (`firstName`/`lastName`/`userId`) and event-param (`productId`/`productName`/`numItems`/...) tokens and reports any hit by asset name + ID.

## Canonical property names — new events only (drift containment)

This codebase emits Klaviyo events from two eras:

- **Legacy events** (everything defined in [klaviyo-events.ts](src/utils/integrations/klaviyo/klaviyo-events.ts) as of 2026-05-27): `Subscription Started`, `Placed Order`, `Subscription Renewal Failed`, `Invoice Generated`, etc. These ship with property-name drift — `price` (string) vs `amount` vs `total_amount` for the same dollar value; `entries_granted` vs `entries_added` vs `entries_gained` for the same entry count; `purchase_date` (locale string `"December 22, 2025"`) vs `timestamp` (ISO) for the same moment. **Do not refactor them.** Existing Klaviyo flows, email templates, segments, and campaigns are wired against these exact names. Renaming silently breaks production flows (filters stop matching) and emails (merge tags blank out — Klaviyo does not surface a warning).
- **New events** (anything added after 2026-05-27): use the **canonical names** in the table below. New Klaviyo flows the ads team builds will be written against canonical names from day 1, so there is no migration cost.

This is intentional drift containment — we accept the legacy schema as paid cost and prevent it from compounding.

### Canonical schema

| Concept | Property name | Type | Notes |
|---|---|---|---|
| Package price | `price` | **number** | Not string. Templates format via `{{ event.price\|format_number }}`. Klaviyo segment `>` / `<` filters compare numerically only when the property is a number — strings sort lexicographically (`"100"` < `"99"`). |
| Revenue value | `$value` | number | Klaviyo's revenue triple. Required on `Placed Order` / `Refunded Order` only. Built via `buildRevenueProperties()` — never by hand. Emit alongside `price` when an event represents revenue. |
| Currency | `currency` | string | Lowercase ISO code (`"AUD"`). The PascalCase `Currency` is reserved for Klaviyo's revenue triple inside Placed Order / Refunded Order. |
| Package ID | `package_id` | string | Slug-style identifier (`"membership_standard"`). |
| Package name | `package_name` | string | Human-readable (`"Standard Membership"`). |
| Package tier | `tier` | string | Not `package_tier`. Omit the key when absent — no empty-string default. |
| Package type | `package_type` | enum string | One of `"membership"` / `"one-time"` / `"mini-draw"` / `"upsell"`. Always emit, even when implied by the event name — lets the ads team write cross-event aggregations. |
| Entries change on a single event | `entries_granted` | number | Not `entries_added` / `entries` / `entries_gained`. Use for grants on purchase / renewal / upgrade events. |
| Lifetime entry count on profile | `entries_purchased` | number | Profile property only — not an event property. Aggregates across all sources. |
| Forecast entries (pre-purchase) | `num_entries` | number | Distinct from `entries_granted` — used on funnel events like `Started Checkout` where the entries haven't been granted yet (the purchase hasn't happened). |
| Membership lifecycle state | `membership_status` | enum string | Profile property only. One of `"active"` / `"past_due"` / `"canceled"` / `"paused"` / `"never_subscribed"`. Coerced from raw Stripe state via `deriveMembershipStatus()`. Coexists with legacy `subscription_status` (which keeps the raw Stripe value). |
| Funnel-step discriminator | `step` | string | Used on multi-fire events like `Started Checkout` (`"viewed"` vs `"registered"`). Lets flow templates differentiate funnel position. |
| User ID | `user_id` | string | MongoDB `_id.toString()`. |
| Payment intent | `payment_intent_id` | string | **Omit the key entirely when absent** — no `""` or `"unknown"` sentinels. Klaviyo's `is set` filter cannot distinguish a sentinel from a real value. |
| Event timestamp | `<verb>_at` | ISO 8601 string | `started_at`, `purchased_at`, `viewed_at`, `cancelled_at`. **Not** locale strings like `"December 22, 2025"`. Klaviyo segments do date math only on ISO / Unix values. |
| Whether user is logged in when event fired | `is_authenticated` | boolean | For mixed authed/guest event paths (e.g. `Started Checkout`). |
| Whether the customer held an active membership **at the instant of the event** | `had_active_subscription` | boolean | Point-in-time, past tense. The **same** `subscription.isActive` predicate as the live `has_active_subscription` profile property, frozen at the purchase instant. It fixes **staleness** — a flow reading the live property days later sees whether the customer is a member *then*, and they may have joined or churned in between — it does **not** change the semantics: a paused or past-due member reads `false` here too, and a member with a scheduled cancellation reads `true`. A flow that must tell those three states apart needs `membership_status` (five-state, from `deriveMembershipStatus`), which is a live profile property, not a point-in-time one. Carried by `One-Time Package Purchased`; captured **pre-grant**, before `grantBenefits` runs. |
| Promo / giveaway context | `promo_slug`, `promo_id`, `promo_title`, `prize_name`, `prize_image_url`, `promo_url` | string | When an event is fired from a promo page, include these so email templates can reference the asset directly. |
| Deep link back to action | `checkout_url`, `resume_url`, etc. | string (absolute URL with UTM) | When the email's CTA needs to return the user to a specific preselected state. Always include UTM params so the ads team can attribute. |
| Bonus-entry code | `code` | string | The redeemable code, e.g. `"BONUS-ABC123"`. |
| Human-readable expiry, pre-formatted | `expires_at_label` | string | Built via `formatExpiryLabelAEST()` (`src/utils/common/timezone.ts`) — the single server-side formatter every rendered copy of the deadline derives from, so no copy can disagree with the instant redemption enforces. **It reaches the `Bonus Code Issued` metric only: neither the three discount emails nor any live page renders it today** — see [`Bonus Code Issued`](#bonus-code-issued-2026-08-25) below before you put `{{ event.expires_at_label }}` in a template. Corrected 2026-08-26; this cell used to say it was "the SAME function the rewards wallet renders, so the email and the app can never disagree" — the wallet components are unreachable and no email renders it. **Never** hand-format from `expires_at`; never use `formatDateForKlaviyo` (`en-US`, no `timeZone`). |
| Which flow minted/re-armed the code | `trigger` | enum string | `BonusCodeTrigger` — `"cancel-click"` / `"checkout-start"` / `"one-time-purchase"` (`src/utils/redeemables/bonus-code-policy.ts`). **Supplied by the caller in the webhook body** since 2026-08-26, not derived server-side: the Klaviyo flow names which of the three it is when it calls `POST /api/bonus-codes/v1/issue`. An unknown value is a `400`. |

### Profile properties added 2026-05-28

These five canonical profile properties land on every user's Klaviyo profile via `ensureUserProfileSynced` and back-fill via `scripts/backfill-klaviyo-membership-properties.ts`. They power the "Purchased entries but no membership", "At-risk near renewal", and "Long-term member" segments the ads team requested. **Legacy `subscription_status` continues to be written** with raw Stripe values for back-compat with existing flows / segments / templates.

| Property | Type | Computed how |
|---|---|---|
| `membership_status` | enum string (`"active"` / `"past_due"` / `"canceled"` / `"paused"` / `"never_subscribed"`) | `deriveMembershipStatus(user)` in [klaviyo-helpers.ts](../../src/utils/integrations/klaviyo/klaviyo-helpers.ts). Coerced from raw Stripe state — see coercion table in [patterns.md P7](./patterns.md). `"trialing"` → `"active"`, `"unpaid"` → `"past_due"`, `"paused"` → `"paused"` (retention-pause freeze window), `"incomplete"` → `"never_subscribed"`. |
| `entries_purchased` | number | Lifetime total: `member + one-time + upsell + mini-draw` entries. Sum of existing `entryBreakdown` counters — no new query. |
| `giveaways_entered` | number | Distinct draws (Major + Mini) the user has at least one entry in. Two parallel queries via `Promise.all` because Major Draw entries live as embedded subdocs on `MajorDraw.entries[]` (indexed at [MajorDraw.ts:269](../../src/models/MajorDraw.ts#L269)) and Mini Draw entries live in the flat `TicketEntry` collection (indexed at [TicketEntry.ts:58](../../src/models/TicketEntry.ts#L58)). |
| `membership_active_duration_months` | number \| null | `differenceInMonths(now, user.subscription.startDate)` from `date-fns`. Calendar-aware, DST-safe (no `30.4375 * 86400000` averaging). `null` when never subscribed. |
| `next_renewal_date` | ISO 8601 string \| null | `subscription.endDate` ISO when `isActive && autoRenew`. `null` for canceled / never-subscribed. ISO required for Klaviyo date math (locale strings are unfilterable as dates). |

#### Display-ready twins — for email copy, never for segments

Three properties exist **only** so a Klaviyo merge tag can print them to a customer. Each has a machine-readable
sibling above; **segments and flow filters must keep using the sibling**, which is stable, typed and filterable.

| Property | Type | Value | Sibling it renders |
|---|---|---|---|
| `membership_label` | string | `"Tradie Member"` / `"Foreman Member"` / `"Boss Member"` / `"Not a member"` | `subscription_tier` (the raw packageId) |
| `partner_discount_label` | string | `"Active"` / `"Not active"` | `partner_discount_active` (boolean) |
| `next_renewal_label` | string | A date (`"24 September 2026"`), `"Payment retrying"`, `"Renewal date pending"`, or `"Auto-renew off"` | `next_renewal_date` (ISO instant) |

**Why they exist.** Klaviyo's drag-and-drop editor stores a merge tag as a single *expression* — the "Edit code"
field takes `person|lookup:"x"|default:'y'` and nothing more. `{% if %}` block tags cannot go there, so a
marketer has no way to map an id to a name, format a date, or hide a line, inside the template. Without these,
the New Member block shipped reading `Tier: tradie-subscription`, `Partner discount: True`, and
`Next renewal: 2026-09-23T14:00:00.000Z` to real members.

**Two rules they follow, both load-bearing:**

1. **`next_renewal_label` is formatted in AEST, not UTC.** Renewals anchor to day 24 and are stored as `14:00Z`,
   which is the *next day* in Sydney. A UTC-formatted label tells a member their renewal is the 23rd when the
   charge lands on the 24th. Verified against a live profile: `next_renewal_date` `"2026-09-23T14:00:00.000Z"`
   → `next_renewal_label` `"24 September 2026"`.
2. **They are always populated** — never `""`, never omitted. Two reasons. The editor cannot hide one line
   of a multi-line text block, so an empty value leaves a dangling `Partner discount:` with nothing after it.
   And Klaviyo's upsert **merges** — an omitted property keeps its previous value, so a lapsed member would
   read `"Boss Member"` forever. Every branch returns a string, so every sync overwrites.
3. **No branch may assert something false.** `next_renewal_label` has four states, not two:
   `"Payment retrying"` for past-due — Stripe is still retrying the card and
   `sync-klaviyo-past-due-profiles.ts` pushes that cohort precisely so a recovery flow can email them, so
   `"Auto-renew off"` would contradict the email they are being sent; `"Renewal date pending"` when
   auto-renew is ON but the date is not yet known (`/api/stripe/update-auto-renew` clears `endDate` when
   RE-ENABLING and syncs on the next line, and `handleSubscriptionPackage` activates before the webhook
   writes it); `"Auto-renew off"` only when it genuinely is.
4. **`membership_label` gates on membership STATUS, not on `packageId`.** A lapsed record keeps its id, and
   gating on the id alone told a `never_subscribed` profile it was a `"Foreman Member"` — caught against
   production on 2026-09-04, after the unit tests passed. `past_due` and `paused` keep their tier; they are
   still members whose access continues.
5. **Never throw.** `formatInTimeZone` raises `RangeError` on an unparseable date, and
   `classifyKlaviyoFailure` cannot pattern-match that message — so it returns `retryable: true`, which HOLDS
   the reconciliation cursor and freezes the sweep for **every** user (the 2026-08-27 incident). The label is
   guarded and degrades to `"Renewal date pending"`.

Both label derivations are pure and exported (`deriveMembershipLabel`, `deriveNextRenewalLabel`) so every
branch is covered by `npm run test:klaviyo-projection` without a database — including the AEST day-shift,
which is the whole reason the label exists.

**Propagation to existing profiles is automatic — no backfill script is required.** A new property lands on a
profile the next time `userToKlaviyoProfile` runs for that user, and two schedules cover that
([vercel.json](../../vercel.json)):

| Path | Schedule | Covers |
|---|---|---|
| `reconcile-klaviyo-profiles` | `*/5 * * * *` | Anyone whose `updatedAt` moved — a purchase, login, verification, tier change. Effectively immediate for active users. |
| `reconcile-klaviyo-profiles?mode=full` | `7 * * * *` | A rotating `fullPassCursor` over every profile, ~344 per run × 24 runs/day ≈ **a full circuit in ~7 days at 56k profiles**. |

So the only exposure is a flow going live *inside* that ~7-day window, where a dormant profile would render the
template's `|default:` instead of its real value. If a launch cannot wait, force the circuit with
`npm run sync:klaviyo-profiles-bulk` (bulk endpoint, one call per batch rather than per profile).

Example segments the ads team can now build:

- *Purchased entries but no membership* — `membership_status EQUALS "never_subscribed" AND entries_purchased > 0`
- *At-risk near renewal* — `membership_status EQUALS "active" AND next_renewal_date is within next 3 days`
- *Long-term VIP* — `membership_active_duration_months >= 6`

### Recently added canonical events (single-page reference for the ads team)

This section is the **one place** the ads team should look for new-event property shapes when building flows / templates / segments. Each row lists the event, its trigger, and every property they can reference in `{{ event.* }}` merge tags.

#### `Viewed Giveaway` (2026-05-28)

Fires once per route change on `/promotions/*` pages. Cookied profiles auto-attach; anonymous never-cookied users land as anonymous and link up later when they identify.

| Property | Type | Example |
|---|---|---|
| `promo_slug` | string | `"milwaukee-march-2026"` |
| `promo_id` | string (optional, omitted if absent) | `"promo_abc123"` |
| `promo_title` | string | `"Win a Milwaukee Tool Pack"` |
| `prize_name` | string | `"Milwaukee 18V Combo Kit"` |
| `prize_image_url` | string (optional) | `"https://..."` |
| `promo_url` | string (full URL) | `"https://toolsaustralia.com.au/promotions/milwaukee-march-2026"` |
| `is_authenticated` | boolean | `true` / `false` |
| `viewed_at` | ISO 8601 | `"2026-05-28T10:23:00Z"` |

Example flow: *Viewed Giveaway → wait 24h → if no `Placed Order` → send email with `{{ event.promo_title }}` / `{{ event.prize_name }}` / `{{ event.promo_url }}` CTA*.

#### `Started Checkout` (2026-05-28)

Fires from two mutually-exclusive paths — both produce the same event shape, distinguished by the `step` discriminator. The combined funnel: `Started Checkout (step=*) → Placed Order`.

| Property | Type | Example |
|---|---|---|
| `package_id` | string | `"membership_standard"` |
| `package_name` | string | `"Standard Membership"` |
| `package_type` | enum (`"membership"` / `"one-time"` / `"mini-draw"` / `"upsell"`) | `"membership"` |
| `tier` | string (optional) | `"tradie"` |
| `price` | **number** (not string) | `30` |
| `$value` | number — Klaviyo revenue-template compat | `30` |
| `currency` | string (lowercase) | `"aud"` |
| `num_entries` | number (optional) | `100` |
| `checkout_url` | string (absolute URL with UTM) | `"https://toolsaustralia.com.au/membership?openMembership=1&packageId=tradie-subscription&utm_source=klaviyo&utm_medium=email&utm_campaign=klaviyo_abandoned_checkout"` |
| `promo_slug` | string (optional, when user originated from `/promotions/<slug>`) | `"milwaukee-march-2026"` |
| `step` | enum (`"viewed"` / `"registered"`) | `"registered"` |
| `is_authenticated` | boolean (derived from `step`) | `false` |
| `started_at` | ISO 8601 | `"2026-05-28T10:23:00Z"` |

`step` distinguishes:
- `"viewed"` — authenticated user clicked "Pay" in `MembershipModal`. Klaviyo cookie already linked. Client-side fire.
- `"registered"` — guest completed step-1 registration. Server-side fire from `/api/auth/register`. Email is in `customer_properties.email`.

Example flow: *Started Checkout → wait 1h → if no `Placed Order` → send "pick up where you left off" email with `{{ event.package_name }}` / `{{ event.price|format_number }}` / `{{ event.checkout_url }}` as CTA*.

#### `Bonus Code Issued` (2026-08-25)

Fires when a per-customer bonus-entry code is minted or re-armed. Emitted server-side, awaited (not `trackEventBackground`), by `BonusCodeNotifier.notify()` in [`src/services/redeemables/BonusCodeNotifier.ts`](../../src/services/redeemables/BonusCodeNotifier.ts); the outcome is persisted onto the issuance (`notifiedAt` / `notifyError`) so support can answer "why didn't this customer get their code?".

**This event no longer delivers the code to the customer, and has not since 2026-08-26.** The code string is hardcoded in the flow's own discount-email template; the flow calls `POST /api/bonus-codes/v1/issue` one step above that email to make the code real for that person, and this event fires from inside that call. It is kept as the **only** record that a customer was issued a code and whether the notification went out — there is no admin screen for bonus codes, so dropping it would make "why didn't this customer get their code?" unanswerable. Treat it as observability, not as a delivery mechanism.

`expires_at` / `expires_at_label` are always the **persisted issuance value**, never recomputed — the same instant the server enforces at redemption. See [rewards-redeemables docs](../rewards-redeemables/) for the issuance model.

**`expires_at_label` reaches no customer today, and the three discount emails cannot render it.** A Klaviyo flow email renders against its **own trigger metric** — for these three sequences that is cancel-click / checkout-abandon / one-time-purchase, not this event — so `{{ event.expires_at_label }}` in a discount template resolves to **empty**. Printing a deadline to the customer would need a **separate flow triggered on `Bonus Code Issued`**; none exists, and none is required for launch (see [rewards-redeemables/gotchas.md](../rewards-redeemables/gotchas.md), launch step 4). The wallet field that renders the same string (`RedeemableWalletItem.expiresAtLabel`) is likewise unreachable — both of its components are behind the rewards pause flag or unmounted. Corrected 2026-08-26; this paragraph used to claim the wallet rendered it and the email was "ready to render as-is".

| Property | Type | Example |
|---|---|---|
| `user_id` | string | `"64f1a2b3c4d5e6f7a8b9c0d1"` |
| `code` | string — the **shared campaign code** (`MonthlyEntryCampaign.code`, e.g. `BACKIN200`), not the optional per-issuance `RedeemableIssuance.code`. `StampedIssuance` exposes both fields side by side (`campaignCode` vs `code?`); this event always sends `campaignCode`. | `"BONUS-ABC123"` |
| `entries_granted` | number | `15` |
| `issued_at` | ISO 8601 | `"2026-08-25T03:00:00.000Z"` |
| `expires_at` | ISO 8601 — the persisted `RedeemableIssuance.expiresAt`, passed as a parameter, never `new Date()` | `"2026-08-28T03:00:00.000Z"` |
| `expires_at_label` | string — `formatExpiryLabelAEST(expires_at)`. Render it **verbatim** if a flow on *this* metric is ever built; never re-format `expires_at` yourself. Not readable from the three discount emails (see above). | `"Friday 28 August 2026, 1:00PM AEST"` |
| `trigger` | enum (`"cancel-click"` / `"checkout-start"` / `"one-time-purchase"`) | `"cancel-click"` |

Idempotency: `event.unique_id` is set to `` `${issuance.id}:${issuance.expiresAt.toISOString()}` `` before the emit — the same issuance with the same deadline collapses to one Klaviyo event even if `trackEvent`'s retry logic (`MAX_RETRIES = 5`, `"timeout"` is retryable) redelivers an accepted-but-slow POST; a legitimately re-armed deadline produces a new `unique_id` and a new event.

**Environment gate — three copies, outermost first.** `POST /api/bonus-codes/v1/issue` refuses outright unless `VERCEL_ENV === "production"` and answers `403`. Behind it, the authoritative copy is in [`mintBonusCodeForTrigger.ts`](../../src/services/redeemables/mintBonusCodeForTrigger.ts), which sits **ahead of the mint**, not ahead of the email — by the time `notify()` runs the issuance row is already written and the one-per-lifetime grant already burned. `BonusCodeNotifier.notify()` carries a third `VERCEL_ENV !== "production"` early return (logging via `console.error`, which survives `compiler.removeConsole`) purely as an inner backstop for a future direct caller of `notify()`; the only live path goes through the route and the helper, so it never fires in practice. Consequence: this event **cannot be exercised on a preview deploy or locally** — dev and prod share one Klaviyo account, and gating only the email would still let a preview write the issuance row and burn a real customer's grant. Rationale lives in [docs/rewards-redeemables/backend.md](../rewards-redeemables/backend.md) — do not restate it here, the two copies drifted once already.

Customer-facing copy in the corresponding email template must follow CLAUDE.md rule 11 (free-entry framing, no gambling language) — the entries are a free inclusion with the membership/pack, never sold, never priced per entry.

#### `Subscription Cancellation Requested` (2026-08-26)

Fires **at the cancel click**, once the cancellation has been committed (Stripe updated and `user.save()` landed). Emitted server-side, fire-and-forget (`klaviyo.trackEventBackground`), from [`CancelSubscriptionService.cancelSubscription()`](../../src/services/subscription/CancelSubscriptionService.ts) — and **only** when its `isMemberChurn` option is `true`, which only the member-initiated `/api/stripe/cancel-subscription` route passes. An admin-initiated cancellation and the past-due tier switch (cancel-then-resubscribe) deliberately do not fire it: neither is churn.

This is the **win-back flow's trigger**, and the flow that later calls `POST /api/bonus-codes/v1/issue` one step above its discount email.

**Why it is not `Subscription Cancelled`.** That event fires only from the `customer.subscription.deleted` webhook. On a cancel-at-period-end cancellation Stripe deletes the subscription *at period end* — up to a month after the member decided to leave — and the handler early-returns in cases where it never arrives at all. A win-back email needs the click. A Klaviyo **segment** cannot substitute either: the period-end path does not change `subscription.status`, so `deriveMembershipStatus` still reports `membership_status: "active"` after the post-cancel profile sync. The two events coexist by design and are named as an explicit carve-out in [tracking/rules.md R2](./rules.md), [billing-stripe/rules.md R2](../billing-stripe/rules.md) and [subscription/rules.md R4](../subscription/rules.md).

| Property | Type | Example |
|---|---|---|
| `user_id` | string | `"64f1a2b3c4d5e6f7a8b9c0d1"` |
| `package_id` | string (omitted when the stored plan id no longer resolves) | `"tradie-subscription"` |
| `package_name` | string — the REAL catalogue name via `formatCanonicalPackageData` | `"Tradie"` |
| `package_type` | enum — always `"membership"` for this event | `"membership"` |
| `tier` | string — `pkg.name.toLowerCase()`, the same derivation `Started Checkout` uses | `"tradie"` |
| `price` | **number** (not string) — the tier's monthly price | `20` |
| `cancelled_at` | ISO 8601 — the **persisted** `subscription.cancelledAt` | `"2026-08-26T04:30:00.000Z"` |
| `access_ends_at` | ISO 8601 (omitted when unknown) — the **persisted** `subscription.endDate`, i.e. when access actually stops | `"2026-09-24T13:59:59.000Z"` |

**Do not copy the legacy `Subscription Cancelled` payload.** That one hardcodes `package_name: "Subscription"` and ships the raw package id as both `tier` and `package_id` ([stripe-webhook-handlers/index.ts](../../src/services/stripe-webhook-handlers/index.ts)), so a template cannot print a tier name from it. This event does a real `getPackageById` lookup instead.

**Unresolvable package.** If `subscription.packageId` is missing or no longer in the catalogue, the event still fires — it is the flow's only trigger, so dropping it would silently exclude those members — and simply **omits** the whole package block rather than emitting a sentinel. A `console.error` records it. Templates must therefore guard `{{ event.package_name }}` with a default.

**Timing.** Emitted **after** `await user.save()`, so `cancelled_at` / `access_ends_at` are the values actually stored — an immediate cancel and a period-end cancel persist different `endDate`s and the email renders this one. It is fire-and-forget and wrapped in its own try/catch: a marketing signal must never block or fail a member cancelling their membership.

Rule 11 applies to the win-back email copy: the entries are a **free inclusion** with the membership, never sold and never priced per entry.

#### Snapshot test

Every new canonical event has a CI-fenced snapshot in [`canonical-events-shape.test.ts`](../../src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts). The test runs via `npm run test:klaviyo-canonical` and fails when a new event uses non-canonical keys (e.g. `package_tier`, `package_price`, `amount`, `purchase_date`, `entries_added`).

### When adding a new event

1. Find each property in the canonical schema. If a concept fits an existing row, use that exact name and type. Do not invent an alias.
2. If your event needs a property that doesn't fit any row, **add a row in the same PR** that introduces the property. Keep names noun-led and snake_case.
3. Build package-related properties via `formatCanonicalPackageData(...)` (canonical helper). Do **not** call the legacy `formatPackageDataForKlaviyo(...)` for new events — it emits `price` as a string and is preserved only for the legacy events that already depend on its shape.
4. Add a snapshot test for the event's property keys to `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts` so future drift attempts fail the test runner before code review.
5. When in doubt, look at the most recently added event for the pattern — not the oldest one in `klaviyo-events.ts`.

### No-refactor policy on legacy events

Do not rename, drop, or change the type of any property on an event that already fires in production unless **all three** of the following are true:

1. The user has explicitly authorized the migration for this specific property.
2. The ads team has confirmed (in writing) which dependent flows, templates, segments, and campaigns will be updated, and the timeline.
3. A dual-write transition is in the code with a `TODO(klaviyo-rename-cleanup)` comment plus a removal date.

Klaviyo does not surface "property no longer emitted" warnings — broken flows fail silently and broken templates send emails with blank merge tags. The legacy drift is amortized; touching it re-introduces the cost.

If you find a legacy property that's actively painful (e.g. a date-string field the ads team can't filter on), raise it as a separate scoped ticket — not as a side-effect of unrelated work.

## Payment attribution via UTM tuple — NOT `_kx` (2026-06-01)

The single-platform payment resolver attributes a payment to Klaviyo **only** via the UTM tuple:

- `utm_source=klaviyo` (case-insensitive — normalised to lowercase at capture; Klaviyo auto-UTM appends the capital-K variant)
- `utm_medium=email` → resolves to `convertingPlatform: "klaviyo_email"`, 5-day recency window
- `utm_medium=sms` → resolves to `convertingPlatform: "klaviyo_sms"`, 5-day recency window

**`_kx` is NOT used for attribution.** Klaviyo appends `_kx` to tracked links for its own profile-linking, but the value cannot be re-read reliably server-side (it's a short-lived token that Klaviyo resolves to a profile only in the browser). The payment resolver ignores `_kx` entirely.

**Account auto-UTM must be ON.** In Klaviyo account settings → Tracking → "Automatically add UTM parameters to links", set `utm_medium` to `Message type`. This ensures every email link lands with `utm_source=Klaviyo&utm_medium=Email` (or `SMS`) which the resolver then normalises and matches. If auto-UTM is off, email clicks arrive with no UTM and are attributed as `direct`.

| Attribution signal | `convertingPlatform` | Recency window |
|---|---|---|
| `utm_source=klaviyo` + `utm_medium=email` | `klaviyo_email` | 5 days |
| `utm_source=klaviyo` + `utm_medium=sms` | `klaviyo_sms` | 5 days |

These resolve at lower priority than paid click IDs (Meta/TikTok/Snap 7d). A user who clicked a Meta ad and then clicked a Klaviyo email link within 7 days will be attributed to Meta (the paid click wins).

## Past-due reanchor and Klaviyo profile sync

When a `past_due`/`unpaid` subscription recovers and is reanchored to the recovery-payment date, the **Klaviyo profile is re-pushed** so the snapshot properties reflect the new anchor. Two independent pushes guard this:

1. **Orchestrator push** — `reanchorAfterPastDueRecovery` calls `ensureUserProfileSynced` immediately after writing the new `endDate` to Mongo.
2. **Defense-in-depth push** — the active/trialing recovery branch of `handleSubscriptionUpdated` (the `customer.subscription.updated` webhook fired by Stripe when `trial_end` is set) also pushes the profile.

**Why this matters:** Klaviyo profile properties `next_renewal_date`, `subscription_end_date`, and `past_due_renewal_entries` are **pushed snapshots**, not live reads. Without a re-push after reanchor, these properties would show the old anchor date until the next scheduled sync or member action.

Every other surface that shows the renewal date reads `endDate` live per request (my-account, SubscriptionManagementModal, admin panels) and auto-corrects without any action.

See [docs/PAST_DUE_REANCHOR.md](../PAST_DUE_REANCHOR.md) for the full downstream-propagation details.

## Profile delivery — the reconciliation sweep is the guarantee, not `ensureUserProfileSynced` (2026-08-26)

**`ensureUserProfileSynced` is best-effort and MUST NOT be relied on for correctness.** It is
declared `void` and delegates to a fire-and-forget `.catch()`, so the `await` at its ~24 call
sites is a no-op and the real HTTP request is left detached — on Vercel the function can
freeze once the webhook returns 200. It stays in place as a fast path; it is not the contract.

The contract is **[`KlaviyoProfileReconciliationService`](src/services/klaviyo/KlaviyoProfileReconciliationService.ts)**,
driven by [`/api/cron/reconcile-klaviyo-profiles`](src/app/api/cron/reconcile-klaviyo-profiles/route.ts):

```
users = User.find({ updatedAt: { $gt: watermark } })   // KlaviyoSyncState singleton
      → prefetch ONE payment ledger for the batch
      → sync through the existing throttle (8 concurrent / 700ms)
      → stamp klaviyoSyncedAt with { timestamps: false }
      → advance the watermark ONLY on a fully clean run
```

- **Why `updatedAt`.** Mongoose maintains it on every mutation including a raw `$inc`. A
  customer granted entries at 22:59:17 had `updatedAt = 22:59:18.916`. Keying on it covers
  paths nobody instrumented — `customer.subscription.deleted`, admin PATCHes without
  `basicInfo`, referral / milestone / redeemable grants — and paths not yet written.
- **`{ timestamps: false }` is load-bearing.** Without it, stamping `klaviyoSyncedAt` bumps
  `updatedAt`, re-dirtying the user so the sweep re-selects them forever.
- **A failed run does not advance the watermark**, so the next run re-covers the window. A
  Klaviyo outage becomes a delay, not a silent permanent gap.
- **`MAX_RUN_MS = 45s`** stops a page before Vercel's `maxDuration = 60` kills it. Measured: a
  500-user page took 66.6s before this existed, and a killed run would have lost its work AND
  left the watermark unmoved — re-selecting the same page forever.
- **Cadence: every 5 minutes**, plus an **hourly** `?mode=full` pass. Klaviyo's own guidance is
  "at least every 30 minutes (e.g. on a cron)"; the binding rule is that sync frequency must
  fall inside the shortest flow time delay.
- **The full pass walks a rotating cursor** (`KlaviyoSyncState.fullPassCursor`), separate from
  the live watermark so a repair pass can never rewind it. It advances every run and wraps on
  completion. This is NOT optional: a full pass that restarts from epoch re-syncs the same
  first page forever — verified, two consecutive runs both began at 1970-01-01 and covered the
  same 50 users, i.e. 0.6% coverage at 56k profiles. A run covers ~344 users, so a circuit
  takes ~7 days at 56k and ~27 days at 4x — inside the monthly tick of the one property it
  exists to refresh (`membership_active_duration_months`). Callers passing `afterUpdatedAt`
  explicitly (the ops backfill) manage their own cursor and never touch this one.
- **Scaling shape:** the incremental sweep keys on MUTATION RATE, not profile count — an
  indexed seek returning only dirty users. Measured throughput is 7.6 users/sec (~344 per
  45s run) against ~6 mutations per 5 minutes today, so it runs at ~1.7% of capacity with
  roughly 57x headroom. Profile-count growth lands on the full-pass circuit time, not on the
  incremental path.
- **Requires the `updatedAt` index on `User`.** Without it the selector is a full collection
  scan (56,441 docs examined to return 4).

**Never call the sweep from a payment path.** The Klaviyo client uses a 30s timeout and Stripe
retries webhooks that do not return a fast 2xx.

## Entry and spend properties come from the payment ledger, not the catalogue (2026-08-26)

`member_entries`, `entries_purchased`, `lifetime_value` and `total_spent` are read from
`PaymentEvent` via
[`aggregateNetGrantsByUser`](src/utils/payment/payment-event-net-queries.ts), refund-netted
with the same `excludeRefundedBenefitsGrantedStages()` the admin revenue breakdown uses.

They previously **reconstructed** membership entries as
`catalogue.entriesPerMonth × floor(elapsed / 30 days)`. Measured against production, that was
wrong for **4,904 of 4,904 active members** (understated ×5–×14), because the catalogue cannot
see promo multipliers, upgrades that reset `startDate`, or resubscribes.

| property | source | note |
|---|---|---|
| `member_entries` | `PaymentEvent` membership grants | paid only |
| `entries_purchased` | sum of the four package types | paid only |
| `lifetime_value` / `total_spent` | `PaymentEvent.data.price` | dollars, refund-netted |
| `accumulated_entries` | `user.accumulatedEntries` | **all** sources incl. free grants |
| `current_draw_entries` | the draw's own entry row | unchanged |

**Klaviyo's native Historic CLV is the tiebreaker for revenue.** Klaviyo computes it from the
`Placed Order` / `Refunded Order` events this app already sends with `$value`, `Currency` and
`Order ID` — a source that cannot drift out of sync with what Klaviyo itself sees. If our
`lifetime_value` and Klaviyo's CLV disagree, believe Klaviyo's.

⚠️ **`entries_purchased` is an INTERNAL segment key only.** CLAUDE.md rule 11 and BUSINESS.md §1
hold that entries are never sold — they are a free inclusion with a membership or pack. Never
put this property name in customer-facing copy or an email merge tag.

## Retired properties — clear with `null`, never `undefined` (2026-08-26)

The five `upsell_*` properties (`upsell_total_shown`, `_accepted`, `_declined`,
`_conversion_rate`, `_last_interaction`) are **retired** and written as explicit `null`.

Their only writer (`POST /api/upsell/track`, called from `UpsellManager.tsx`) is imported
nowhere, so they read `0` for all 56,360 users while 2,290 had real upsell purchases — a
funnel that never recorded anything. `total_upsells_purchased` is unaffected; it counts
`user.upsellPurchases` and is real.

**`undefined` cannot clear a Klaviyo property** — `cleanProperties` strips it, leaving the
stale value in place. Only an explicit `null` clears. Reviving upsell funnel data means
mounting the tracker; that is separate work.

## Dev and production share ONE Klaviyo account (2026-08-26)

`KLAVIYO_MODE` only prefixes **event** names with `[DEV]`; profile writes went out unprefixed.
Confirmed in the production account: **24 `[DEV]`-prefixed metrics**, newest 5 days old, and
**four `[DEV]`-named flows are live**.

All nine profile-MUTATING client methods (`upsertProfile`, `bulkImportProfiles`,
`mergeProfiles`, `deleteProfile`, `removeFromLists`, the two subscribe and two unsubscribe
methods) now refuse unless `mode === "production"` **or**
`KLAVIYO_ALLOW_DEV_PROFILE_WRITES === "true"`, returning `PROFILE_WRITE_BLOCKED_ERROR`. Events
are deliberately NOT gated — they carry `[DEV]` and stay separable.

**Severity, stated accurately:** a local run reads the *dev* database, and only 8 of its 933
emails exist in production — all test/staff accounts, **zero paying customers**. So this
prevents test-profile pollution of the live marketing account and puts a deliberate gate on
the `--prod` ops path; it was never protecting real customers from corruption.

The env is re-read on every call (matching `isConfigured()`) because ops scripts load dotenv
*after* this module's singleton is constructed.

## Common bugs to watch for

- **Building revenue events by hand** instead of using `buildRevenueProperties` — easy to typo `$value` as `value`, breaking revenue reporting.
- **Adding `Date.now()` or random IDs to order IDs** — breaks refund linking. Always use the deterministic generators in `klaviyo-order-helpers.ts`.
- **Calling `trackKlaviyoEvent` (client) from a webhook** — no-ops because `typeof window === "undefined"`. Use `klaviyo.trackEventBackground` (server) instead.
- **Firing `Placed Order` from both client and server for the same purchase** — risks double-counting revenue if order IDs differ. The current architecture fires `Placed Order` only server-side from `grantBenefits`.
- **Not passing the customer's email** — Klaviyo can't attach the event to a profile, revenue shows as anonymous.
- **Sending camelCase keys to Klaviyo** — creates duplicate `firstName` / `lastName` / `userId` / `productId` shadow properties alongside the snake_case standard fields. Any flow filter or merge tag set up against one variant silently ignores the other. The `KlaviyoIdentifyParams` and `KlaviyoEventParams` interfaces enforce snake_case for new code; existing assets are audited via `npm run find:klaviyo-legacy-fields`.
- **Giving a PROFILE property the same name as an EVENT property.** Klaviyo: *"If a profile property has the same name as event data on your account, you will not be able to segment on the event data or view it in drop-downs."* Diffed 2026-08-26 — all 153 event keys vs every profile property, no collisions. Re-check before adding any property name. (The event namespace already forks `entries_added` / `entries_gained` / `entries_granted` for one idea; don't add a fourth.)
- **Truthiness-checking a Mongoose NESTED object.** `subscription.pendingChange` has all-optional sub-fields, so Mongoose materialises it as `{}` and `!!{}` is `true` — `subscription_has_pending_upgrade` was a hardcoded `true` on all 56,360 profiles while zero users had a real pending upgrade. Use [`isValidPendingUpgrade`](src/utils/subscription/pending-upgrade.ts), which checks the payload. `tsc` cannot catch this class of bug; `npm run test:pending-upgrade` pins it.
- **Reading Klaviyo's own `updated` timestamp to detect a stale sync.** It moves when Klaviyo runs predictive analytics — two sampled profiles shared an identical `updated` with no write from us. Use `user.klaviyoSyncedAt`, which records when *we* last wrote.

## References

- [Klaviyo Events API](https://developers.klaviyo.com/en/reference/create_event)
- [Klaviyo Revenue Metrics setup](https://help.klaviyo.com/hc/en-us/articles/115005078647)
- [Integrate a subscription ecommerce platform](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_subscription_ecommerce_platform)
- [Integrate a platform without a pre-built integration](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration)

## Read-only reporting (admin Klaviyo tab)

The `klaviyo` singleton (`src/lib/klaviyo.ts`) exposes a public **`reportingRequest<T>(endpoint, method, body?)`** passthrough that wraps the same `makeRequest` + retry/backoff used by the write paths and returns parsed JSON (throws a clear error on non-OK — e.g. a `403` surfaces a missing key scope). It powers the admin Klaviyo analytics service `src/services/admin/klaviyo/klaviyoReporting.ts`, which (read-only) lists campaigns/flows and fetches `campaign-values-reports` / `flow-values-reports` against a **conversion metric** resolved by `resolveConversionMetricId()`: prefers **`KLAVIYO_CONVERSION_METRIC_ID`** — set this to the account's custom **"Marketing Revenue"** metric (= `Placed Order` WHERE `is_renewal = 0`, i.e. acquisition revenue, renewals excluded; custom conversion metrics are **not** returned by `/api/metrics/`, so they must be supplied by id) — else falls back to resolving the standard **"Placed Order"** event metric by name (id `TaGfFU` on this account, integration `API`; includes renewals). The values-report returns one row per message carrying `send_channel` + `<entity>_id`; the pure `foldKlaviyoValues` shaper folds those into per-campaign/flow email-vs-SMS totals (`npm run test:klaviyo-fold`). Reporting endpoints are throttled (~2/min) — the `/api/admin/klaviyo/analytics` route caches results (10-min TTL) and never auto-refreshes. Required key scopes: `campaigns:read`, `flows:read`, `metrics:read`.
