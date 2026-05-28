# Spec — Klaviyo events expansion (membership_status feed + Viewed Giveaway + Started Checkout)

**Date:** 2026-05-27 · **Status:** Draft (awaiting implementation per [plan](../plans/2026-05-27-klaviyo-events-expansion.md)) · **Domain:** `tracking`

This spec adds three Klaviyo integrations requested by the ads team for new email flows. The work is **events + profile properties only** — the Klaviyo flows that consume these events/properties are configured by the ads team inside the Klaviyo UI and are out of scope for engineering.

All new events use the **canonical property schema** documented in [docs/tracking/KLAVIYO_INTEGRATION.md](../../tracking/KLAVIYO_INTEGRATION.md) ("Canonical property names — new events only" section). Existing events are **not refactored** — the no-refactor policy in that doc applies to all production-firing events.

---

## 1. Why — the ads team's verbatim request

> **Purchased entries but has no membership**
>
> *"If we can have a constant feed updating Klaviyo profiles with a custom property called membership status that would be awesome. You can even explore creating a custom object attached to the Klaviyo profiles which can be a 'Membership' object which can contain (as an example): status, start date, next renewal date, membership active duration, entries purchased, giveaways entered etc."*
>
> **Abandoned at checkout**
>
> *"Event triggered by those who have closed the purchase modal and haven't completed the purchase. The event would require an email address to match to a Klaviyo profile, so only if: A member is logged in on your website. An anonymous user entered email address in step 1 of the purchase modal but haven't completed the purchase."*
>
> Abandoned-checkout properties (Yuval, 10:32 AM): *"Type: membership or package; Package or membership name; Package or membership cost; Direct link with package or membership preselected ready for someone to complete the checkout; If it's a package then number of entries (nice-to-have); And then the standard details - email, first name."*
>
> **Viewed Giveaway**
>
> *"Logged in member or an email subscriber (should be in the cookies if they haven't expired) and viewed the giveaway pages but haven't purchased. The script to trigger this event should live on any page on the /promotions/… directory."*

---

## 2. Klaviyo concept primer — Event vs Flow

The ads team uses "event" and "flow" interchangeably. They're distinct Klaviyo concepts and we need to be precise about which side does what.

| Concept | What it is | Side |
|---|---|---|
| **Event** (aka **Metric**) | A single data point recorded against a profile (e.g. *"Joe started checkout at 2:34pm with package_id=premium"*). Created via API call (`POST /api/events`) or browser `klaviyo.track()`. Once recorded, it lives in Klaviyo's metric stream forever. | **Engineering (this spec)** |
| **Profile property** | A custom key/value stored on the profile object (e.g. `membership_status: "active"`). Set via `POST /api/profiles`. Used by segments and flow filters. | **Engineering (this spec)** |
| **Flow** | An automated email sequence triggered by an event, segment entry, list addition, or date. Built entirely in Klaviyo's UI by the marketing team. e.g. *"When `Started Checkout` fires → wait 1 hour → check if `Placed Order` fired → if not, send Email A"*. | **Ads team (out of scope)** |
| **Segment** | A dynamic list of profiles matching some condition (e.g. `membership_status = "never_subscribed" AND entries_purchased > 0`). Used by campaigns and flows. | **Ads team (out of scope)** |

You always need **both** an event/property AND a flow/segment for an email to be sent. This spec covers only the engineering side.

**Source**: https://developers.klaviyo.com/en/reference/api_overview lists Events API, Profiles API, and Flows API as separate surfaces.

---

## 3. Item 1 — `membership_status` profile feed

### Goal

Keep every user's Klaviyo profile continuously updated with membership state so the ads team can build segments like *"Purchased entries but has no membership"* without engineering involvement per-flow.

### Verified current state

[src/utils/integrations/klaviyo/klaviyo-helpers.ts:217-320](../../../src/utils/integrations/klaviyo/klaviyo-helpers.ts#L217) already syncs ~30 profile properties via `ensureUserProfileSynced(user, brandInterest)`. Re-pushed on every relevant webhook ([CancelSubscriptionService](../../../src/services/subscription/CancelSubscriptionService.ts#L164), [renewal](../../../src/services/stripe-webhook-handlers/index.ts#L4234), [renewal failure](../../../src/services/stripe-webhook-handlers/index.ts#L3186), upgrade, downgrade, register, and 4 others).

Existing properties (**legacy — left untouched per the no-refactor policy**):
- `subscription_status` (string — mirrors raw Stripe state: undefined / `"active"` / `"past_due"` / `"canceled"` / `"unpaid"` / `"incomplete"` / `"trialing"`)
- `has_active_subscription` (bool)
- `subscription_tier`, `subscription_start_date`, `subscription_end_date`, `subscription_auto_renew`
- `member_entries`, `one_time_entries`, `upsell_entries`, `mini_draw_entries` (entry counts by source)
- `lifetime_value`, `total_spent`, `first_purchase_date`, `last_purchase_date`

The legacy `subscription_status` continues to be written — segments and flows the ads team already built against it keep working. The five new properties below are **additive** and use canonical names.

### What's added (canonical schema)

| Property | Type | Computed how |
|---|---|---|
| `membership_status` | enum string | One of `"active"` / `"past_due"` / `"canceled"` / `"never_subscribed"`. Derived from `user.subscription?.status` via `deriveMembershipStatus()` — coercion table below. |
| `entries_purchased` | number | Lifetime total = `member_entries + one_time_entries + upsell_entries + mini_draw_entries`. Sum of existing counters. No new collection query. |
| `giveaways_entered` | number | Count of distinct draws (Major + Mini) the user has at least 1 entry in. Single `$facet` aggregation on `TicketEntry` — one Mongo round-trip per profile sync. |
| `membership_active_duration_months` | number \| null | `differenceInMonths(new Date(), startDate)` from `date-fns`. `null` if `never_subscribed`. Uses the codebase's existing `date-fns` dependency — DST-safe, no `30.4375` averaging. |
| `next_renewal_date` | ISO 8601 string \| null | `subscription_end_date` ISO when `has_active_subscription === true AND subscription_auto_renew === true`. `null` for canceled / paused / never-subscribed users. ISO so Klaviyo segment date math works (locale-string siblings cannot be filtered as dates). |

### Stripe-state → `membership_status` coercion

The User model's `subscription.status` field at [src/models/User.ts:484-487](../../../src/models/User.ts#L484-L487) is unconstrained (just `String` with default `"incomplete"`). The codebase writes the following values: `"active"`, `"past_due"`, `"canceled"`, `"unpaid"`, `"incomplete"`, `"incomplete_expired"`, `"trialing"`. Klaviyo segments need a small, stable enum:

| Stripe / User state | Coerces to | Rationale |
|---|---|---|
| `"active"` | `"active"` | Direct |
| `"trialing"` | `"active"` | Trial users have full benefits — ads team treats them as members |
| `"past_due"` | `"past_due"` | Direct — dunning state |
| `"unpaid"` | `"past_due"` | Stripe's "unpaid" is dunning continued past `past_due` — same lifecycle bucket from a flow-trigger perspective |
| `"canceled"` | `"canceled"` | Direct |
| `"incomplete"` / `"incomplete_expired"` | `"never_subscribed"` | Initial-payment-not-completed states — these users effectively never became members |
| (no subscription object) | `"never_subscribed"` | Direct |
| Anything else (defensive) | `"never_subscribed"` | Safest default — won't accidentally classify someone as "active" |

### Why flat properties (not Klaviyo Custom Objects)

The ads team mentioned exploring a Klaviyo "Membership" custom object. We are **not** doing that in this spec. Reasons:

- Klaviyo Custom Objects is a **paid plan add-on** — must be confirmed on the account before scoping
- Flat profile properties cover every segment / flow filter the ads team described
- Custom Objects can be added later as additive work without rewriting flat properties

### How the ads team uses this

Three example segments they can now build:

1. **"Purchased entries but has no membership"**:
   `membership_status EQUALS "never_subscribed" AND entries_purchased > 0`
2. **"At-risk members near renewal"**:
   `membership_status EQUALS "active" AND next_renewal_date is within next 3 days`
3. **"Long-term members for VIP campaign"**:
   `membership_active_duration_months >= 6`

### Backfill

Existing users won't have the 5 new properties until `ensureUserProfileSynced` is called for them on their next webhook event (cancellation, renewal, purchase, etc.). To make the ads team's segments useful from day 1:

- New script `scripts/backfill-klaviyo-membership-properties.ts` iterates `User.find({ isActive: true })` and calls `ensureUserProfileSynced(user)` for each — idempotent, sequential with throttling to stay under Klaviyo's rate limit
- Run with `--dry-run` first, then live
- Acceptance: ≥99% of active members have all 5 new properties within 24h of script completion (see §8)

---

## 4. Item 2 — `Viewed Giveaway` event

### Goal

Fire a dedicated event to Klaviyo whenever someone views a promotion / giveaway page so the ads team can build a *"viewed but didn't enter"* email flow with rich template properties (promo title, prize image, etc.).

### Verified current state

[KlaviyoPageTracker.tsx:63](../../../src/components/KlaviyoPageTracker.tsx#L63) fires a generic `Viewed Page` event on every route change with properties `{ PageName, PageURL, PageType, Pathname }`. For `/promotions/[slug]` this resolves to `PageType: "promotion"` and `PageName: <slug>` ([page-metadata-helpers.ts:46](../../../src/utils/tracking/page-metadata-helpers.ts#L46)).

So the ads team could already filter `Viewed Page WHERE PageType = "promotion"` — but the template can only reference the slug string, not the promo title, prize name, or image. The dedicated event below fills that gap and lives **alongside** the existing `Viewed Page` (does not replace it).

### What's added (canonical schema)

A dedicated `Viewed Giveaway` event with rich properties for email template use. All property names per the canonical schema in [docs/tracking/KLAVIYO_INTEGRATION.md](../../tracking/KLAVIYO_INTEGRATION.md).

### Fire site

New component: `src/app/promotions/_components/PromoViewTracking.tsx`. **Mirrors the established pattern in [MiniDrawViewTracking.tsx](../../../src/app/(site)/mini-draws/[id]/components/MiniDrawViewTracking.tsx) and [ProductViewTracking.tsx](../../../src/app/(site)/shop/[slug]/components/ProductViewTracking.tsx)** — single `useEffect` keyed on the resolved entity, calls the typed `useKlaviyoTracking().trackViewedGiveaway(...)` method. Not a new top-level tracking component.

Mounted in:
- `src/app/promotions/[slug]/page.tsx` (dynamic-slug promo pages)
- `src/app/promotions/_components/ToolsetLandingPage.tsx` (shared root for the brand pages `/dewalt`, `/makita`, `/milwaukee`, `/ryobi` — one mount covers all four)

### Event payload (sent to Klaviyo, canonical schema)

```ts
{
  event: "Viewed Giveaway",
  customer_properties: { email },  // resolved by Klaviyo onsite cookie if profile known
  properties: {
    promo_slug: "milwaukee-march-2026",
    promo_id: "promo_abc123",         // omitted when not available — no sentinel
    promo_title: "Win a Milwaukee Tool Pack",
    prize_name: "Milwaukee 18V Combo Kit",
    prize_image_url: "https://...",   // omitted when not available
    promo_url: "https://toolsaustralia.com.au/promotions/milwaukee-march-2026",
    is_authenticated: true,           // boolean (canonical), not "yes" / "no"
    viewed_at: "2026-05-27T10:23:00Z" // ISO (canonical), not locale string
  }
}
```

Notes per canonical schema:
- `viewed_at` is ISO — segment date math works (locale strings can't be filtered as dates)
- Optional properties omitted entirely when absent (no `""` / `"unknown"` sentinels — Klaviyo's `is set` filter cannot distinguish a sentinel from a real value)
- `is_authenticated` is a boolean

### Anonymous user behavior (per ads team's request)

> *"Logged in member or an email subscriber (should be in the cookies if they haven't expired)"*

Klaviyo's onsite snippet auto-attaches client-side events to a cookied profile. If a user was ever identified to Klaviyo in this browser (via past purchase, newsletter signup, etc.), the cookie persists and our `klaviyo.track("Viewed Giveaway", ...)` call attaches to that profile automatically. Truly anonymous (never-cookied) users still fire the event but it lands as anonymous in Klaviyo until they later identify.

**No extra wiring needed** — this is the documented default behavior.

### Dedupe

Fires once per route change via `useEffect` deps `[promo.id, promo.slug, pathname, isAuthenticated]`. If the user navigates away and comes back, that's a new fire. Re-render on the same route (state changes, re-fetches) does not duplicate because effect deps are stable.

### Consent

Gated on `hasPixelConsent()` via the standard `trackKlaviyoEvent` helper — same gate as all other Klaviyo client-side events.

### How the ads team uses this

Klaviyo flow:
- **Trigger**: `Viewed Giveaway` event
- **Wait**: 24 hours
- **Conditional split**: did `Placed Order` fire for the same profile in the last 24h?
  - Yes → exit
  - No → send email referencing `{{ event.promo_title }}` and `{{ event.prize_name }}` with `{{ event.promo_url }}` as the CTA
- **Smart sending suppression**: only fire once per profile per 24h (Klaviyo flow setting)

---

## 5. Item 3 — `Started Checkout` event (powers the abandoned-checkout flow)

### Goal

Fire a Klaviyo event when a user begins the purchase journey through `MembershipModal` so the ads team can build an abandoned-checkout flow that emails users who didn't complete. Yuval's explicit payload requirements (type, name, cost, deep link, num_entries, email + first name) are all included.

### Naming rationale

We use **`Started Checkout`** despite our purchase flow being a modal (not a `/checkout` page). Klaviyo's documented semantic is *"user initiated purchase but didn't complete"* — funnel-stage, not URL-based. Direct quote from https://developers.klaviyo.com/en/docs/guide_to_integrating_a_subscription_ecommerce_platform:

> *"send abandoned cart emails to visitors who initiate purchase but don't complete it"*

Sticking with the documented name means:
- Klaviyo's pre-built **"Abandoned Cart"** flow template works out of the box (triggers on this event name)
- Counterpart to our existing `Placed Order` event ([klaviyo-events.ts:679](../../../src/utils/integrations/klaviyo/klaviyo-events.ts#L679)) — both share the `package_type` dimension so the funnel is coherent: `Started Checkout (package_type=X) → Placed Order (package_type=X)`

### Verified current state

[src/hooks/useKlaviyoTracking.ts:230-243](../../../src/hooks/useKlaviyoTracking.ts#L230) already defines `trackInitiateCheckout` which fires `klaviyo.track("Started Checkout", { ... })`. **The Klaviyo helper exists but has zero Klaviyo callsites** — grep across `src/**` returns no consumer.

Note: the modal currently calls `usePixelTracking().trackInitiateCheckout` (Facebook + TikTok, **not** Klaviyo) at two callsites:
- [MembershipModal:1317](../../../src/components/modals/MembershipModal/index.tsx#L1317) — inside `handleRegistration`, fires when guest submits step 1
- [MembershipModal:2658](../../../src/components/modals/MembershipModal/index.tsx#L2658) — inside `handleSubmit`, fires when user submits payment

The Klaviyo fire described below **sits alongside the existing Facebook fire at the second callsite** (authed path, L2658) and is **replaced by a server-side fire** for the guest path (which would otherwise sit at L1317 — see "Fire strategy" below for why server-side is reliable).

### Fire strategy — two mutually-exclusive paths

| Path | Where it fires | Why |
|---|---|---|
| **Authed user submits payment** (`step="viewed"`) | Client-side, in `MembershipModal:handleSubmit` alongside the existing FB `trackInitiateCheckout` at [L2658](../../../src/components/modals/MembershipModal/index.tsx#L2658) | Klaviyo cookie is already set (KlaviyoUserIdentifier identifies on login). Reuses the existing `initiateCheckoutFiredRef` guard for dedupe. |
| **Guest completes step 1** (`step="registered"`) | Server-side, in [/api/auth/register](../../../src/app/api/auth/register/route.ts) immediately after `ensureUserProfileSynced` | Avoids a race: the client-side onsite cookie isn't yet set for never-cookied guests. Server-side push to Klaviyo's Events API with explicit `customer_properties.email` attaches reliably to the just-created profile. |

The two paths are **mutually exclusive**: guest registration fires server-side only, authed checkout fires client-side only. No dedupe code needed.

We deliberately **drop** the original spec's "modal-open + 3s dwell debounce" pattern — it introduced a novel debounce timer with no precedent in the codebase and fired at a different funnel stage than the existing Facebook `InitiateCheckout` (which fires on action-submit). The two-path strategy above mirrors the Facebook pattern, reuses the existing ref-guard, and matches Klaviyo's documented recommendation:

> *"Trigger this event either when someone visits the checkout page after they've been identified or when they enter their email address on the checkout page if they have not already been identified."* — https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration

Our two paths map directly: payment-submit ≈ "identified user on checkout", step-1-registration ≈ "enters email on checkout".

### Why we don't fire on modal close

Considered and rejected:

1. **Tab-close / browser-crash abandoners would be invisible** — no JS runs on tab close. The Started Checkout + Klaviyo-side time-delay pattern catches all of them because abandonment is inferred from *absence of Placed Order*.
2. **Modal-close ≠ abandonment.** Users close to check terms, compare tiers, etc., and return seconds later.
3. Klaviyo's pre-built Abandoned Cart flow templates assume the Started Checkout pattern. Using a custom `Abandoned Checkout` event name means the ads team builds from scratch.

### Event payload (sent to Klaviyo, canonical schema)

```ts
{
  event: "Started Checkout",
  customer_properties: { email, first_name, last_name, phone_number },
  properties: {
    package_id: "membership_standard",
    package_name: "Standard Membership",
    package_type: "membership",         // canonical — always emitted (also: "one-time" / "mini-draw" / "upsell")
    tier: "standard",                   // canonical (NOT package_tier); omitted if absent — no "" sentinel
    price: 30,                          // NUMBER (canonical), not string "30.00" — segments need numeric compare
    $value: 30,                         // Klaviyo revenue-template compat alongside price
    currency: "aud",                    // LOWERCASE (canonical); PascalCase Currency reserved for revenue triple
    num_entries: 100,                   // entries this package would grant (Yuval nice-to-have)
    checkout_url: "https://toolsaustralia.com.au/?openMembership=1&packageId=membership_standard&utm_source=klaviyo&utm_medium=email&utm_campaign=klaviyo_abandoned_checkout",
    step: "viewed",                     // "viewed" (authed payment-submit) | "registered" (guest post-step-1)
    is_authenticated: true,             // boolean (canonical)
    promo_slug: "milwaukee-march-2026", // omitted if user did not arrive from a /promotions/ page
    started_at: "2026-05-27T10:23:00Z"  // ISO (canonical), not locale string
  }
}
```

`checkout_url` directly addresses Yuval's explicit ask: *"Direct link with package or membership preselected ready for someone to complete the checkout."* Built via `buildCheckoutResumeUrl(...)` helper added in Phase 4 — the modal already supports `?openMembership=1&packageId=...` deep-link reopening (verify before implementation).

### Fire-control guards

| Guard | Why |
|---|---|
| **`initiateCheckoutFiredRef` (existing useRef)** | Reuses the guard already in place for the Facebook `trackInitiateCheckout` at the same callsite. One Klaviyo fire per modal-open lifecycle. Server-side fire is naturally one-per-registration. |
| **`hasPixelConsent()` gate** (client only) | Standard consent check — same gate as every other Klaviyo client-side event. **Server-side fire is NOT gated** — it represents a committed action (form submission), not browsing. Documented in [docs/auth/gotchas.md](../../auth/gotchas.md). |
| **`window._klOnsite` check** (client only) | Skip if Klaviyo onsite snippet hasn't initialized yet — matches the pattern in [KlaviyoPageTracker.tsx:49](../../../src/components/KlaviyoPageTracker.tsx#L49). |

### Anonymous email (email-on-blur) — explicitly NOT in scope

The ads team's request mentions *"An anonymous user entered email address in step 1 of the purchase modal but haven't completed the purchase."* Their mental model assumes step 1 = email capture only.

**Our reality**: step 1 of `MembershipModal` is a full registration form (firstName + lastName + email + phone). When step 1 is submitted, `/api/auth/register` is called and the **server-side fire above** attaches the `Started Checkout` event directly to the newly-created Klaviyo profile. Users who complete step 1 are **already identified Klaviyo profiles** by the time the event lands.

The narrow edge case — user types an email into the field but doesn't submit step 1 — is out of scope. Adding it would require firing `klaviyo.identify(email)` on field blur, which captures partial input (`"j@"` followed by walk-away) and doesn't match Klaviyo's documented "enters email on checkout" trigger (which implies form submission).

### How the ads team uses this

Klaviyo "Abandoned Cart" flow template:
- **Trigger**: `Started Checkout` event
- **Wait**: 1 hour (configurable per ads team preference)
- **Conditional split**: did `Placed Order` fire for the same profile in the last 1h?
  - Yes → exit
  - No → send email referencing `{{ event.package_name }}`, `{{ event.price|format_number }}`, with `{{ event.checkout_url }}` as the CTA
- **Smart sending suppression**: ads team configures via Klaviyo flow settings (typically 1 per 24h per profile)

If the ads team wants different email copy per `package_type`, they branch on it in the flow:
- `package_type EQUALS "membership"` → membership-specific copy
- `package_type EQUALS "mini-draw"` → mini-draw urgency copy
- etc.

---

## 6. Documentation citations

Every design decision in this spec is backed by Klaviyo's official documentation:

| Decision | Source |
|---|---|
| `Started Checkout` is the canonical Klaviyo event name for abandoned-checkout flows | https://developers.klaviyo.com/en/docs/guide_to_integrating_a_subscription_ecommerce_platform — section "Started Checkout" |
| Fire on (a) authed user visits checkout, (b) anonymous identifies via email | https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration — "When to use Started Checkout" |
| Browser-side `klaviyo.track()` API surface | Same guide — "Custom Event Tracking with klaviyo.track()" |
| Anonymous-but-cookied users auto-attach to known profiles | Same guide — "Active on Site tracking snippet" |
| Events API endpoint + identifier requirements (email/phone/id) | https://developers.klaviyo.com/en/reference/create_event |
| Latest stable API revision (2025-10-15) | https://developers.klaviyo.com/en/reference/api_overview |
| Revenue metric reads from top-level `$value` only | https://help.klaviyo.com/hc/en-us/articles/115005078647-Set-up-revenue-metrics (already enforced in [klaviyo-revenue-schema.ts](../../../src/utils/integrations/klaviyo/klaviyo-revenue-schema.ts)) |
| Event ↔ Flow separation (Events API and Flows API are distinct surfaces) | https://developers.klaviyo.com/en/reference/api_overview |
| `Placed Order` carries `OrderType` and item-level details for subscription analytics | Subscription ecommerce integration guide — section "Placed Order and Placed Non-Recurring Order" (we already do this) |
| Canonical property schema for new events (drift containment) | [docs/tracking/KLAVIYO_INTEGRATION.md](../../tracking/KLAVIYO_INTEGRATION.md) — "Canonical property names — new events only" |

---

## 7. Files that will change

### Modified

| File | Change |
|---|---|
| [src/utils/integrations/klaviyo/klaviyo-helpers.ts](../../../src/utils/integrations/klaviyo/klaviyo-helpers.ts) | (Phase 1) Add `formatCanonicalPackageData` helper next to (not replacing) `formatPackageDataForKlaviyo`. (Phase 2) Add 5 new properties to `userToKlaviyoProfile`'s `properties: { ... }` block. Add helpers `deriveMembershipStatus`, `computeActiveDurationMonths`, `countDistinctDrawsEntered`. |
| [src/types/klaviyo.ts](../../../src/types/klaviyo.ts) | Extend `KlaviyoProfileProperties` with the 5 new fields. |
| [src/utils/integrations/klaviyo/klaviyo-events.ts](../../../src/utils/integrations/klaviyo/klaviyo-events.ts) | Add a "POST-2026-05 CANONICAL EVENTS" section with `createViewedGiveawayEvent` and `createStartedCheckoutEvent` builders. Do **not** modify any legacy event builders. |
| [src/hooks/useKlaviyoTracking.ts](../../../src/hooks/useKlaviyoTracking.ts) | Add `trackViewedGiveaway(params)` method. Extend `trackInitiateCheckout` to accept canonical params (`price` number, `tier`, `checkout_url`, etc.). |
| [src/app/api/auth/register/route.ts](../../../src/app/api/auth/register/route.ts) | After `ensureUserProfileSynced`, fire server-side `createStartedCheckoutEvent` for the guest registration path. Extend Zod schema to accept `packageId` (optional — affiliate/Google paths don't pass it). |
| [src/components/modals/MembershipModal/index.tsx](../../../src/components/modals/MembershipModal/index.tsx) | At L2658, add Klaviyo `Started Checkout` fire alongside the existing FB `trackInitiateCheckout` **for authed users only**. At L1317, add a comment noting the guest path is server-side. |
| [docs/tracking/KLAVIYO_INTEGRATION.md](../../tracking/KLAVIYO_INTEGRATION.md) | Add `Viewed Giveaway` and `Started Checkout` to the event inventory table. Document the 5 new profile properties. Add a "Recently added canonical events" subsection for the ads team. |
| [docs/tracking/api.md](../../tracking/api.md), [docs/tracking/patterns.md](../../tracking/patterns.md), [docs/tracking/gotchas.md](../../tracking/gotchas.md) | Note the new helpers + cross-link the canonical schema. |
| [docs/auth/gotchas.md](../../auth/gotchas.md) | Document the server-side-fires-regardless-of-consent caveat for `Started Checkout`. |
| [docs/promo/api.md](../../promo/api.md) | Note `PromoViewTracking` mount points. |
| [docs/shared-ui/gotchas.md](../../shared-ui/gotchas.md) | Note `MembershipModal` fires Klaviyo `Started Checkout` for authed users only. |
| [package.json](../../../package.json) | Add `test:klaviyo-canonical` script (Phase 1). Add `backfill:klaviyo-membership-properties` + `:dry` scripts (Phase 2). |
| [docs/infrastructure/testing.md](../../infrastructure/testing.md) | Add `test:klaviyo-canonical` to the test inventory. |

### Added

| File | Purpose |
|---|---|
| `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts` | Snapshot test fencing canonical property names. Fails CI if a new event uses non-canonical keys. |
| `src/app/promotions/_components/PromoViewTracking.tsx` | Mirrors [MiniDrawViewTracking.tsx](../../../src/app/(site)/mini-draws/[id]/components/MiniDrawViewTracking.tsx) shape. Mounted on promo pages. Fires `Viewed Giveaway` once per route change. |
| `src/utils/integrations/klaviyo/checkout-resume-url.ts` | `buildCheckoutResumeUrl()` helper — generates the deep-link CTA for the abandoned-checkout email. |
| `scripts/backfill-klaviyo-membership-properties.ts` | One-shot backfill running `ensureUserProfileSynced` for all active users so the 5 new profile properties land on existing profiles. |

### Promo page mount points

Verified routes (2026-05-28):

- `src/app/promotions/[slug]/page.tsx` — dynamic-slug promo pages
- `src/app/promotions/dewalt/page.tsx`, `makita/page.tsx`, `milwaukee/page.tsx`, `ryobi/page.tsx` — specific brand landing pages
- `src/app/promotions/_components/ToolsetLandingPage.tsx` — shared component used by the brand pages

`ToolsetLandingPage.tsx` is the shared root used by all four brand pages — one mount there covers `/dewalt`, `/makita`, `/milwaukee`, `/ryobi`. The dynamic `[slug]/page.tsx` route mounts separately.

---

## 8. Acceptance criteria

### Item 1 (profile feed)
- [ ] After a user registers, their Klaviyo profile shows `membership_status: "never_subscribed"`, `entries_purchased: 0`, `giveaways_entered: 0`, `membership_active_duration_months: null`, `next_renewal_date: null`.
- [ ] After they purchase a membership, the values flip: `membership_status: "active"`, `next_renewal_date` populated (ISO), `membership_active_duration_months: 0` (or 1 on first renewal).
- [ ] After they cancel (`auto_renew` flips false but subscription still active until period end), `membership_status: "canceled"`, `next_renewal_date: null`.
- [ ] After buying a one-time pack without a membership: `membership_status: "never_subscribed"` AND `entries_purchased > 0`. **This is the segment the ads team wants.**
- [ ] After they enter a Major Draw, `giveaways_entered: 1`. After they enter a different Major Draw, `giveaways_entered: 2`. Same draw twice → still 1.
- [ ] Properties re-push on every existing webhook that already calls `ensureUserProfileSynced`. No new webhook plumbing introduced.
- [ ] Legacy `subscription_status` continues to be written with raw Stripe values — existing segments and flows unaffected.
- [ ] Backfill script `--dry-run` reports expected user count. Live run completes with ≥99% of active members showing all 5 new properties in Klaviyo within 24h.

### Item 2 (Viewed Giveaway)
- [ ] Navigating to `/promotions/<any-slug>` fires exactly one `Viewed Giveaway` event with `promo_slug`, `promo_title`, `prize_name`, `prize_image_url` (when available), `promo_url`, `is_authenticated`, `viewed_at` (ISO).
- [ ] Cookied users see the event attached to their existing Klaviyo profile.
- [ ] Anonymous never-cookied users fire the event; Klaviyo records it against an anonymous profile (no special handling needed).
- [ ] No fire on `/admin`, `/my-account`, or other non-promo routes (component is only mounted on promo pages).
- [ ] Re-rendering the page does not fire duplicate events (single fire per route change).
- [ ] Pixel-consent off → event does not fire.
- [ ] Existing `Viewed Page` (with `PageType: "promotion"`) continues to fire as well — they coexist.

### Item 3 (Started Checkout)
- [ ] Authed user opens MembershipModal and clicks "Pay" → exactly one `Started Checkout` fires client-side with `step: "viewed"`, `is_authenticated: true`, `price` as number, `tier` (canonical name), `checkout_url`, full canonical payload.
- [ ] Guest completes step 1 (firstName + lastName + email + phone submitted, `/api/auth/register` returns 200) → exactly one `Started Checkout` fires **server-side** with `step: "registered"`, `is_authenticated: false`, full canonical payload.
- [ ] **Dedupe**: server-side + client-side fires combined produce exactly one `Started Checkout` event per guest user per modal lifecycle (paths are mutually exclusive).
- [ ] Modal opens twice in same lifecycle (authed) → exactly one fire (`initiateCheckoutFiredRef` guard).
- [ ] When the user starts checkout from a `/promotions/<slug>` page, `promo_slug` is populated in the event.
- [ ] `checkout_url` opens MembershipModal with the package preselected when followed in a new browser session.
- [ ] Pixel-consent off → client-side event does not fire. Server-side event fires regardless (documented in [docs/auth/gotchas.md](../../auth/gotchas.md)).
- [ ] Affiliate / Google-OAuth registration paths (no `packageId` in payload) → server-side fire is a graceful no-op.

### Schema discipline
- [ ] `npm run test:klaviyo-canonical` green — both new event builders pass the canonical-shape snapshot.
- [ ] No `formatPackageDataForKlaviyo` calls inside the new event builders (the canonical helper is the right one).
- [ ] No `package_tier`, `package_price`, `amount`, `total_amount`, `entries_added`, locale-string `*_date` keys introduced.

### Documentation
- [ ] [docs/tracking/KLAVIYO_INTEGRATION.md](../../tracking/KLAVIYO_INTEGRATION.md) updated: 2 new events in inventory, 5 new profile properties documented, "Recently added canonical events" section added for the ads team.
- [ ] Doc-sync hook passes (per CLAUDE.md rule 2).
- [ ] [docs/auth/gotchas.md](../../auth/gotchas.md), [docs/shared-ui/gotchas.md](../../shared-ui/gotchas.md), [docs/promo/api.md](../../promo/api.md) updated where the per-task plan specifies.

### Verification
- [ ] Manual test in Klaviyo's "Recent Activity" / "Event Activity Feed" — events visible with correct properties (5 test users covering active / past-due / canceled / one-time-only / never-purchased).
- [ ] Profile properties visible on the Klaviyo profile page after a test registration + purchase.
- [ ] No CSP violations in dev console on `/promotions/*` and modal open.
- [ ] `npm run lint` and `npm run type-check` pass.
- [ ] No `console.log` / `console.info` / `console.debug` / `console.warn` introduced — only `console.error` for errors that must survive production-build stripping.
- [ ] `npm run find:klaviyo-legacy-fields` reports no new camelCase or pre-canonical drift.

---

## 9. Out of scope (explicit, for the ads team)

- **Klaviyo flow building** — wait times, conditional splits, email templates, smart sending settings. All configured in Klaviyo UI by ads team.
- **Email template copy** — written and configured in Klaviyo by ads team.
- **Klaviyo segments** — defined in Klaviyo UI using the new profile properties (we provide the data; they define the audience).
- **Klaviyo Custom Objects** — "Membership object" deferred until paid plan add-on is confirmed and use case justifies the schema work.
- **Email-on-blur identify for pre-step-1 anonymous users** — narrow edge case, can be added later if data justifies it.
- **A/B testing the abandonment email send time** — ads team's call, configured via Klaviyo's send-time optimization.
- **Refactoring legacy events to canonical schema** — explicitly forbidden by the no-refactor policy in [docs/tracking/KLAVIYO_INTEGRATION.md](../../tracking/KLAVIYO_INTEGRATION.md). The legacy schema is frozen; new events go canonical.
- **Backfill of historical `Started Checkout` events for past abandoners** — Klaviyo event records are immutable; no API to backfill past events.

---

## 10. Open questions for the ads team (forward when briefing)

These are flow-side (their config), but worth confirming so they have answers ready:

1. **Abandoned-checkout wait time** — Klaviyo default 1 hour. Confirm or override.
2. **Repeat-abandoner behavior** — fire one nudge per abandonment, cap 1/24h? They configure via Klaviyo's smart sending.
3. **Per-`package_type` flow split** — one universal abandonment flow with `{{ event.package_name }}` merge tag, or four separate flows filtered by `package_type`?
4. **Viewed Giveaway → abandonment wait** — 24h, 12h, 6h? They configure.
5. **`membership_status` enum confirmation** — happy with `active` / `past_due` / `canceled` / `never_subscribed`?
6. **`Viewed Giveaway` scope** — Yuval named `/promotions/*` specifically. Should the event ALSO fire on `/major-draw` and `/mini-draws/[id]` (also giveaway pages), or are those tracked separately via `Viewed Product`? Currently scoped to `/promotions/*` only; expanding is one extra mount per page.

---

## 11. Verification commands

After implementation:

```bash
npm run lint
npm run type-check
npm run test:klaviyo-canonical
npm run find:klaviyo-legacy-fields
# No dedicated unit test runner for the wired-up event paths — manual verification in Klaviyo dashboard
```

Doc-sync hook (`.claude/hooks/doc-sync.mjs`) will enforce `docs/tracking/KLAVIYO_INTEGRATION.md` updates per CLAUDE.md rule 2.

For end-to-end verification:
- Run `npm run backfill:klaviyo-membership-properties:dry` against a staging DB to confirm script logic before touching production
- Use Klaviyo's "Recent Activity" view to inspect event property shapes
- Use a test Klaviyo profile to verify the abandoned-checkout flow renders the resume URL correctly
