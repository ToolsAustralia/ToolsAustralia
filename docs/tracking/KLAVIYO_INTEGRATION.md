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
| Membership lifecycle state | `membership_status` | enum string | Profile property only. One of `"active"` / `"past_due"` / `"canceled"` / `"never_subscribed"`. Coerced from raw Stripe state via `deriveMembershipStatus()`. Coexists with legacy `subscription_status` (which keeps the raw Stripe value). |
| Funnel-step discriminator | `step` | string | Used on multi-fire events like `Started Checkout` (`"viewed"` vs `"registered"`). Lets flow templates differentiate funnel position. |
| User ID | `user_id` | string | MongoDB `_id.toString()`. |
| Payment intent | `payment_intent_id` | string | **Omit the key entirely when absent** — no `""` or `"unknown"` sentinels. Klaviyo's `is set` filter cannot distinguish a sentinel from a real value. |
| Event timestamp | `<verb>_at` | ISO 8601 string | `started_at`, `purchased_at`, `viewed_at`, `cancelled_at`. **Not** locale strings like `"December 22, 2025"`. Klaviyo segments do date math only on ISO / Unix values. |
| Whether user is logged in when event fired | `is_authenticated` | boolean | For mixed authed/guest event paths (e.g. `Started Checkout`). |
| Promo / giveaway context | `promo_slug`, `promo_id`, `promo_title`, `prize_name`, `prize_image_url`, `promo_url` | string | When an event is fired from a promo page, include these so email templates can reference the asset directly. |
| Deep link back to action | `checkout_url`, `resume_url`, etc. | string (absolute URL with UTM) | When the email's CTA needs to return the user to a specific preselected state. Always include UTM params so the ads team can attribute. |

### Profile properties added 2026-05-28

These five canonical profile properties land on every user's Klaviyo profile via `ensureUserProfileSynced` and back-fill via `scripts/backfill-klaviyo-membership-properties.ts`. They power the "Purchased entries but no membership", "At-risk near renewal", and "Long-term member" segments the ads team requested. **Legacy `subscription_status` continues to be written** with raw Stripe values for back-compat with existing flows / segments / templates.

| Property | Type | Computed how |
|---|---|---|
| `membership_status` | enum string (`"active"` / `"past_due"` / `"canceled"` / `"never_subscribed"`) | `deriveMembershipStatus(user)` in [klaviyo-helpers.ts](../../src/utils/integrations/klaviyo/klaviyo-helpers.ts). Coerced from raw Stripe state — see coercion table in [patterns.md P7](./patterns.md). `"trialing"` → `"active"`, `"unpaid"` → `"past_due"`, `"incomplete"` → `"never_subscribed"`. |
| `entries_purchased` | number | Lifetime total: `member + one-time + upsell + mini-draw` entries. Sum of existing `entryBreakdown` counters — no new query. |
| `giveaways_entered` | number | Distinct draws (Major + Mini) the user has at least one entry in. Two parallel queries via `Promise.all` because Major Draw entries live as embedded subdocs on `MajorDraw.entries[]` (indexed at [MajorDraw.ts:269](../../src/models/MajorDraw.ts#L269)) and Mini Draw entries live in the flat `TicketEntry` collection (indexed at [TicketEntry.ts:58](../../src/models/TicketEntry.ts#L58)). |
| `membership_active_duration_months` | number \| null | `differenceInMonths(now, user.subscription.startDate)` from `date-fns`. Calendar-aware, DST-safe (no `30.4375 * 86400000` averaging). `null` when never subscribed. |
| `next_renewal_date` | ISO 8601 string \| null | `subscription.endDate` ISO when `isActive && autoRenew`. `null` for canceled / never-subscribed. ISO required for Klaviyo date math (locale strings are unfilterable as dates). |

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

## Common bugs to watch for

- **Building revenue events by hand** instead of using `buildRevenueProperties` — easy to typo `$value` as `value`, breaking revenue reporting.
- **Adding `Date.now()` or random IDs to order IDs** — breaks refund linking. Always use the deterministic generators in `klaviyo-order-helpers.ts`.
- **Calling `trackKlaviyoEvent` (client) from a webhook** — no-ops because `typeof window === "undefined"`. Use `klaviyo.trackEventBackground` (server) instead.
- **Firing `Placed Order` from both client and server for the same purchase** — risks double-counting revenue if order IDs differ. The current architecture fires `Placed Order` only server-side from `grantBenefits`.
- **Not passing the customer's email** — Klaviyo can't attach the event to a profile, revenue shows as anonymous.
- **Sending camelCase keys to Klaviyo** — creates duplicate `firstName` / `lastName` / `userId` / `productId` shadow properties alongside the snake_case standard fields. Any flow filter or merge tag set up against one variant silently ignores the other. The `KlaviyoIdentifyParams` and `KlaviyoEventParams` interfaces enforce snake_case for new code; existing assets are audited via `npm run find:klaviyo-legacy-fields`.

## References

- [Klaviyo Events API](https://developers.klaviyo.com/en/reference/create_event)
- [Klaviyo Revenue Metrics setup](https://help.klaviyo.com/hc/en-us/articles/115005078647)
- [Integrate a subscription ecommerce platform](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_subscription_ecommerce_platform)
- [Integrate a platform without a pre-built integration](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration)

## Read-only reporting (admin Klaviyo tab)

The `klaviyo` singleton (`src/lib/klaviyo.ts`) exposes a public **`reportingRequest<T>(endpoint, method, body?)`** passthrough that wraps the same `makeRequest` + retry/backoff used by the write paths and returns parsed JSON (throws a clear error on non-OK — e.g. a `403` surfaces a missing key scope). It powers the admin Klaviyo analytics service `src/services/admin/klaviyo/klaviyoReporting.ts`, which (read-only) lists campaigns/flows and fetches `campaign-values-reports` / `flow-values-reports` against a **conversion metric** resolved by `resolveConversionMetricId()`: prefers **`KLAVIYO_CONVERSION_METRIC_ID`** — set this to the account's custom **"Marketing Revenue"** metric (= `Placed Order` WHERE `is_renewal = 0`, i.e. acquisition revenue, renewals excluded; custom conversion metrics are **not** returned by `/api/metrics/`, so they must be supplied by id) — else falls back to resolving the standard **"Placed Order"** event metric by name (id `TaGfFU` on this account, integration `API`; includes renewals). The values-report returns one row per message carrying `send_channel` + `<entity>_id`; the pure `foldKlaviyoValues` shaper folds those into per-campaign/flow email-vs-SMS totals (`npm run test:klaviyo-fold`). Reporting endpoints are throttled (~2/min) — the `/api/admin/klaviyo/analytics` route caches results (10-min TTL) and never auto-refreshes. Required key scopes: `campaigns:read`, `flows:read`, `metrics:read`.
