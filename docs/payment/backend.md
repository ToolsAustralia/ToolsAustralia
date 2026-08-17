# Payment — Backend

## Helper modules ([src/utils/payment/](../../src/utils/payment/))

The biggest helper directory in the repo. Each module has one focused responsibility.

### Stripe wrappers (low-level)

| File | Purpose |
|---|---|
| `stripe/` | Stripe SDK call wrappers; per-resource (sub, invoice, PI). |
| `stripe-invoice-payment-intents.ts` | Invoice ↔ PaymentIntent navigation helpers. |
| `stripe-refund-amount.ts` | Compute refund amount given a charge / invoice. |
| `stripe-subscription-metadata.ts` | Read/write `metadata` on subscription objects. |

### Ledger & processing (the heart)

| File | Purpose |
|---|---|
| `payment-processing.ts` | `grantBenefits()`, `processPaymentBenefits()` — the success path that writes `BenefitsGranted` ledger rows. Also hosts `trackKlaviyoEvent()`, which emits the customer receipt ("Invoice Generated") **server-side** for every package charge, and fires the server-side Meta CAPI **Purchase** with `event_time` = Stripe charge time (both below). Both deliberately skip `packageType: "shop"` — see the Merchandise section at the end of this file. |
| `payment-status.ts` | Status-derivation helpers (paid / failed / pending classification). |
| `ledger-helpers.ts` | Shared helpers for reading/writing `data.grants`. |

#### Single-platform attribution on `BenefitsGranted`

`processPaymentBenefits()` / `processPaymentBenefitsInternal()` accept a trailing optional
`resolvedAttribution` arg (`{ platform, confidence, attributedClickId, attributedClickTimestamp } | null`)
and stamp three top-level fields onto the `BenefitsGranted` `PaymentEvent`:

- `convertingPlatform` (enum | null), `attributionConfidence` (enum | null), `isRenewal` (boolean).
- **Precedence** is resolved by [`reconcilePersistedAttribution`](../../src/services/attribution/reconcilePersistedAttribution.ts),
  which reconciles the edge-resolved decision (passed in `resolvedAttribution`, stamped into Stripe
  metadata at the edge and read back in the webhook via `extractResolvedPlatformFromMetadata`) with
  the UTM persisted on the `PaymentEvent` (merged session → signup):
  - **Edge gave a positive signal** (a paid click, or a cookie owned-channel last-touch — anything
    other than `direct`) → trust it; that platform/confidence wins.
  - **Edge gave `direct`** → recover an **owned-channel** (`klaviyo_email` / `klaviyo_sms`) platform
    from the persisted UTM if one is present **and the touch is within the owned-channel recency
    window** (5 days for Klaviyo — `windowDaysFor` in
    [`platformPriority.ts`](../../src/services/attribution/platformPriority.ts)), else stay `direct`.
    The cookie-only edge resolver structurally cannot see a Klaviyo touch captured at signup
    (`User.signupAttribution`), so without this those conversions leaked to `direct`. The recovery is
    windowed by passing `now` (conversion time = `Date.now()`) and `persistedTouchAt` into
    `reconcilePersistedAttribution`. **Touch dating (revised 2026-07-19):** a **session**-carried UTM
    is undatable — the client payload prefers the 90-day first-touch `_ta_attr` cookie with
    `capturedAt` stripped, and renewals re-carry frozen subscription metadata — so it passes
    `persistedTouchAt = null` (owned channels still credit via the lenient null rule; nothing else
    changes for Klaviyo). A UTM carried from **signup** is windowed against the **captured
    ad-visit time** (`resolveSignupTouchAtMs(signupAttribution.visitedAt, user.createdAt)` —
    `visitedAt` is stamped at the promo landing; account creation is only the legacy fallback,
    since registration refreshes `signupAttribution` in place for returning accounts). A stale
    signup-Klaviyo touch with no recent visit therefore resolves to `direct`, matching the
    windowed historical reconcile in
    [`scripts/backfill-klaviyo-attribution-cycle.ts`](../../scripts/backfill-klaviyo-attribution-cycle.ts).
    **Paid sources ARE now recovered, strictly (2026-07-19)** — only when affirmatively within the
    platform's 7-day click window of a datable anchor, which in practice means signup-sourced UTMs
    (purchase within 7d of the captured paid **ad visit** — covering both same-session
    signup→purchase and returning members converting off retargeting ads). Undatable
    (session-carried) or stale paid UTMs stay `direct`; renewals can never flip. See
    docs/tracking/backend.md §"Persisted-UTM reconciliation".
  - **No edge decision at all** (legacy / force-charge paths) → fall back to any recognised persisted
    UTM, else `direct`; a present-but-unknown source becomes `"other"`, an absent source becomes
    `"direct"`. Confidence in the recovered/fallback cases is `"utm_only"`.
  - This makes the live `convertingPlatform` match what
    [`scripts/backfill-klaviyo-attribution-cycle.ts`](../../scripts/backfill-klaviyo-attribution-cycle.ts)
    produces, retiring the per-cycle backfill for future rows.
- `isRenewal` comes from `classifyIsRenewal({ billingReason, isResubscribe })` — true only for a
  `subscription_cycle` that is not a create / upgrade / resubscribe.

#### Landing-URL packages focus in the `data` blob (added 2026-07-17)

When the webhook-forwarded `sessionAttribution.packages_focus === "one-time"`, `processPaymentBenefits`
persists `data.packagesFocus: "one-time"` on the `BenefitsGranted` row (camelCase per the blob's
convention, set **independently** of the session/signup merge gate since the marker is meaningful on
its own). It records that the customer's landing URL carried `?packages=one-time` (one-time-focused ad
variant). Membership is the default and is expressed by **absence** — analysis must treat missing as
membership-default. No aggregation consumer exists yet; this is the seed for future true-ROAS-per-focus
reporting (capture pipeline documented in [docs/tracking/backend.md](../tracking/backend.md); no
`PaymentEvent` schema change — the blob is `Mixed`).
- Audit evidence (`attributedClickId`, `attributedClickTimestamp`) is written into the Mixed `data`
  blob only when present. Subscriptions/renewals inherit the decision from `subscription.metadata`
  (sticky), so the converting platform stays constant across the membership lifetime.

#### Built-prize slug in the `data` blob — signup-sourced only (added 2026-07-27)

Inside the existing promotion-fields branch (`if (signupAttr?.promotionSlug)`), `processPaymentBenefits`
also copies `signupAttr.builtPrizeSlug` onto `data.builtPrizeSlug` on the `BenefitsGranted` row, guarded
by its own `if` so it is only ever set when present:

```ts
if (signupAttr?.promotionSlug) {
  attributionData.promotionPageType = signupAttr.promotionPageType;
  attributionData.promotionSlug = signupAttr.promotionSlug;
  if (signupAttr.builtPrizeSlug) {
    attributionData.builtPrizeSlug = signupAttr.builtPrizeSlug;
  }
}
```

- **Source: `User.signupAttribution.builtPrizeSlug` only** — the prize the customer had assembled in
  "Build your prize" (`?toolset=`/`?toolbox=`) at the moment they registered, persisted at signup (see
  [docs/auth/api.md](../auth/api.md), [docs/subscription/models.md](../subscription/models.md)). It is
  **never** read from the live/current session or from `sessionAttribution` — a member who rebuilds a
  different prize post-signup does not retroactively change past or future `PaymentEvent` rows; the
  field always reflects the prize at signup time, same as `promotionSlug`/`promotionPageType`.
- **Absent for pre-feature users.** Every user who registered before this feature shipped has
  `signupAttribution.promotionSlug` but no `builtPrizeSlug`. The inner `if` prevents writing
  `builtPrizeSlug: undefined` into the Mixed `data` blob for those rows.
- **No `PaymentEvent` schema change.** `PaymentEvent.data` is `Schema.Types.Mixed` with an index
  signature `[key: string]: string | number | boolean | undefined` (`src/models/PaymentEvent.ts:19-24,
  86-90`), so the new string key flows through with no model edit.
- Purpose: lets revenue reporting follow the specific prize BUILD a customer configured, not just the
  landing page they arrived on (`promotionSlug`) — the same rationale as the promo build → beacon →
  signup chain documented in [docs/promo/frontend.md](../promo/frontend.md).

#### Server-side "Invoice Generated" receipt

`trackKlaviyoEvent()` (in `payment-processing.ts`) is the single source of truth for the Klaviyo
**"Invoice Generated"** customer receipt. It runs inside `processPaymentBenefits` (idempotent,
always server-side for every charge), so the receipt can never be dropped by a client that navigates
away — the failure mode of the old client-side `/api/invoice/finalize` call (removed 2026-07). It
calls [`trackInvoice()`](../../src/utils/integrations/klaviyo/klaviyo-invoice-service.ts) gated by
`shouldEmitInvoiceGenerated(billingReason)`:

- **EMIT**: `subscription_create` (new membership) and undefined/empty `billing_reason` (one-time,
  mini-draw, accepted upsell — each is its own charge).
- **SKIP**: `subscription_cycle` / `subscription_threshold` (renewals → "Membership Renewal" flow)
  and `subscription_update` (upgrade → `invoice.payment_succeeded` webhook). Prevents double-emailing.

An accepted upsell is a separate PaymentIntent, so it gets its own receipt (two receipts per upsell
purchase). See [gotchas.md](./gotchas.md) for the full incident and the removed combined-invoice path.

#### Server-side CAPI Purchase — `event_time` = Stripe charge time

`grantBenefits()` also fires the server-side CAPI **Purchase** (Meta + TikTok + Snap, via
[`trackPixelPurchase()`](../../src/utils/tracking/pixel-purchase-tracking.ts)'s `sendConversion` fan-out) with
`actionSource: "system_generated"` (there is no live browser session in the webhook; the browser
Pixel fires the matching event with `action_source=website` and each platform dedups the pair by `event_id`).

Because the webhook has no cookies, the per-platform **click ids** are handed over through Stripe
metadata: the payment-creation routes write `capi_fbc`/`capi_fbp` (Meta) and `capi_ttclid`/`capi_ttp`
(TikTok, added 2026-07-29), and `extractRequestContextFromMetadata()` in the webhook reads them back
onto the `requestContext` that `grantBenefits()` forwards. `requestContext` is therefore the single
carrier for every provider's match signals — see
[docs/tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md](../tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md).
It passes `eventTimeUnixSeconds: normalizeEpochToUnixSeconds(paymentMetadata?.chargedAt ?? paymentMetadata?.created)`
([`canonical-event.ts`](../../src/lib/tracking/canonical-event.ts)), so Meta books the conversion at
the **payment SUCCESS moment** instead of the webhook-processing moment — a purchase paid at
23:59 (Melbourne) no longer lands in the next day's Meta reporting. `chargedAt` (ms) is set by the
webhook handlers from Stripe `event.created` on the `payment_intent.succeeded` paths and from the
invoice `paid_at` on the membership path; it exists separately from `created` because on PI paths
`created` is the PaymentIntent's **creation** time, which can precede payment (form opened, deferred
confirm) and would back-date the conversion. The fallback `created` is **milliseconds** at the
webhook call sites but **seconds** in the legacy default built inside
`processPaymentBenefitsInternal`; the normalizer handles both deterministically (`> 1e11` cutoff).
Values outside Meta's accepted window (or garbage) fall back to "now" via `resolveEventTime` — the
pre-fix behavior — so a bad timestamp can never make Meta reject the event.
Test: `npm run test:purchase-event-time`.

### Refund reversal

| File | Purpose |
|---|---|
| `refund-processing.ts` | `processRefundReversal()` — webhook entry for `charge.refunded` and dispute events. |
| `refund-ledger-reversal.ts` | `reverseLedgerBenefits()` — orchestrates the reverser modules. |
| `reversers/` | Per-grant-type modules (entries, packages, milestones, promo bonuses). Each is a `PaymentReverser`. |

### Payment method management

| File | Purpose |
|---|---|
| `payment-method-manager.ts` | Save / set-default / list user's payment methods (PM ids only). |
| `payment-method-delete-flow.ts` | Multi-step deletion flow with detach + DB cleanup. |
| `account-manager.ts` | `stripeCustomerId` lifecycle (find or create on first save). |

### Subscription orchestration

| File | Purpose |
|---|---|
| `subscription-creation-guard.ts` | Pre-create check via `stripeCustomerHasManageableSubscription` ([subscription patterns P11](../subscription/patterns.md)). |
| `subscription-state-manager.ts` | Mongo-side state writes after Stripe confirms. |
| `subscription-entries-calculator.ts` | Compute renewal entries given package + accumulator. |
| `subscription-error-handler.ts` | Map Stripe errors to user-facing responses. `handleSubscriptionError()` has a dedicated ApiError branch (body on `.data`): `userMessage` surfaces `data.details` (e.g. the card decline reason) and `code` comes from `data.code`. Previously only axios-style `.response.data` was handled, so ApiError always fell to the generic `Error` branch. |
| `subscription-response-handler.ts` | Serialize subscription state for API responses. |

### Failed-invoice retry

| File | Purpose |
|---|---|
| `failed-invoice-selection.ts` | Pick the right invoice when the user retries (open + chargeable, not latest draft). |
| `failed-invoice-handler.ts` | Run `stripe.invoices.pay()` with the chosen PM. |

### Cleanup & queries

| File | Purpose |
|---|---|
| `payment-cleanup.ts` | Operational cleanup of stuck PIs / orphans. |
| `payment-event-net-queries.ts` | Aggregate "net granted" and "net refunded" queries against `PaymentEvent`. |

### Cross-feature calculators

| File | Purpose |
|---|---|
| `upsell-entries-calculator.ts` | Entries-granted math for upsell packages. Formula: `upsellCategoryMultiplier × baseEntries`. Mini upsells return `baseEntries` unchanged (1:1, no multiplier). Active promo multipliers do **not** stack. |
| `upsell-promo-multiplier.ts` | Promo multiplier resolution helpers used for hero image selection and display; not used in the entry calculation formula. |

#### upsell-entries-calculator.ts — public API

| Export | Type | Description |
|---|---|---|
| `getPackageBaseEntries(params)` | sync | Look up base entries from `membershipPackages` or `miniDrawPackages`. |
| `calculateUpsellEntriesForOffer(offerId)` | async | Authoritative calculation: `categoryMultiplier × baseEntries`. Mini → `baseEntries` only. |
| `calculateUpsellEntriesFromContext(context, _promoMultiplier)` | async | Legacy wrapper for the purchase route: looks up the offer by `triggersOnPackageIds` then delegates to `calculateUpsellEntriesForOffer`. The `_promoMultiplier` arg is ignored — retained for ABI compatibility. |

## Lib helpers

| File | Purpose |
|---|---|
| [src/lib/payment/defaultBillingAddress.ts](../../src/lib/payment/defaultBillingAddress.ts) | Default billing-address shape for the Payment Element. |
| [src/lib/payment/payment-intent-id.ts](../../src/lib/payment/payment-intent-id.ts) | PI id helpers (parse, validate). |

## Where the work happens

- **Charge-now**: `/api/stripe/create-payment-intent` → service helper → returns client_secret.
- **Save card**: `/api/stripe/create-setup-intent` → returns client_secret.
- **3DS verify**: `/api/stripe/verify-payment-complete` → reads PI status, returns app-level state (`succeeded`/`failed`/`pending`).
- **Failed renewal**: `/api/stripe/pay-failed-invoice` → `failed-invoice-selection` → `failed-invoice-handler` → resume + grants on success.

## Major-draw fresh-row shape (Streak P2 touch, 2026-07-07)

`addToMajorDraw`'s `freshEntriesBySource` zero-shape in [payment-processing.ts](../../src/utils/payment/payment-processing.ts) now enumerates the full source-key set (`referral`, `cancellation-upsell`, `promo-link`, `streak`, and — since 2026-08-17 — `shop`) so downstream readers never hit a missing key. The `streak` bucket is written only by `DrawGrantService` (rewards-redeemables domain) — payment-path grants never write it. The `shop` bucket is not written by anything yet (see Merchandise, below).

## Streak hooks in the payment path (2026-07-15)

- `payment-processing.ts` is the ONLY caller passing `{ allowStreakIssuance: true }` to `MilestoneService.checkAndIssueMilestones` — new streak-months issuances are payment-coupled by construction (the cron/mass evaluator may only re-deliver, never newly issue).
- `reverseMembershipLedger` ([refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)) now gives back a refunded renewal's streak +1: it atomically flips the matching `MembershipRenewalCycle` row (`userId` + `paymentIntentId` + `billing_reason: subscription_cycle`, `succeeded/recovered → refunded` — the pre-image gate makes replays no-op) and decrements `subscription.streakMonths` with a floor of 0. The milestone issuances granted on that payment were already revoked via `grants.milestoneIssuanceIds` (`milestoneRevoke` step).

## Merchandise — `packageType: "shop"` is wired but nothing produces it yet (2026-08-17)

The `packageType` union widened to `"one-time" | "membership" | "upsell" | "mini-draw" | "shop"` at six sites in [payment-processing.ts](../../src/utils/payment/payment-processing.ts) (`processPaymentBenefits`, `processPaymentBenefitsInternal`, `checkAndApplyBonusEntryPromo`, `checkAndApplyPromoLink`, `grantBenefits`, `trackKlaviyoEvent`). `addToMajorDraw` gained a `case "shop": sourceType = "shop"` plus a `shop: 0` slot in `freshEntriesBySource`, and the MajorDraw schema gained the matching bucket ([draws/gotchas.md](../draws/gotchas.md#entriesbysource-must-include-every-source-key-the-schema-lists)).

**No caller passes `"shop"` today — the change is inert at runtime.** The merchandise grant itself is a later task, gated on a trade-promotion permit variation; the type/schema plumbing landed first so the grant can't be written against a bucket Mongoose would silently drop. Don't read this section as "merch entries are live".

Four **deliberate** early-outs, not omissions:

| Site | Behaviour for `shop` | Why |
|---|---|---|
| `checkAndApplyBonusEntryPromo` | returns `0` **before** the unchecked `as` cast | The cast below it launders any value into `"membership" \| "one-time" \| "mini-draw"`, so `"shop"` would fall through the `promoType` ternary to `"mini-packages"` — a merch sale silently reading a mini-draw promo, with no error anywhere. The **ordering** is the point: place the guard above the cast or it does nothing. |
| `checkAndApplyPromoLink` | returns `{ bonusEntries: 0 }`, listed alongside `mini-draw`/`upsell` | Promo links are a package mechanic. Without the arm, a merch sale reaches `PromoRedemptionService.redeem()` with **both** `isMembershipPurchase` and `isOneTimePurchase` false — an undefined case. Revisit if promo codes should ever apply to merchandise. |
| `trackKlaviyoEvent` | returns early | Every payload below it is built from `packageId` / `packageName` / `entriesGranted` / `pointsEarned`; a t-shirt has none of those, so it would arrive as `"Unknown Package"` and pollute revenue metrics with a fake package. Order-shaped shop revenue events (order number, line items, sizes) belong on the shop path — an open question, not a silent drop. |
| CAPI Purchase block in `grantBenefits` | `if (!isRenewal && packageData.packageType !== "shop")` | The shop already fires a **browser** Purchase pixel from the checkout success page, deduped on `orderNumber` ([`CheckoutSuccessClient.tsx`](<../../src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx>) → `purchase-pixel-fired-storage`). Firing the server half here would use a **different** event id (`paymentIntentId`), so Meta could not dedup the pair and every merch sale would be counted twice. Server-side CAPI for shop belongs on the shop path, sharing the browser's `orderNumber` event id. |

The CAPI condition is written inline rather than via a `const isShopOrder` so TypeScript narrows `packageData.packageType` inside the block — the tracking payload's union is the 4-member one, and a boolean const does not carry the narrowing.
