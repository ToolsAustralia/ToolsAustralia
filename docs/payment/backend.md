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
| `payment-processing.ts` | `grantBenefits()`, `processPaymentBenefits()` — the success path that writes `BenefitsGranted` ledger rows. Also hosts `trackKlaviyoEvent()`, which emits the customer receipt ("Invoice Generated") **server-side** for every charge, and fires the server-side Meta CAPI **Purchase** with `event_time` = Stripe charge time (both below). |
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
    `reconcilePersistedAttribution`: a UTM captured at **this** checkout
    (`attributionData.attributionSource === "session"`) counts as a current touch (`persistedTouchAt = now`),
    whereas a UTM carried from signup is windowed against the user's signup time
    (`user.createdAt`). A stale signup-Klaviyo touch with no recent click therefore resolves to
    `direct`, matching the windowed historical reconcile in
    [`scripts/backfill-klaviyo-attribution-cycle.ts`](../../scripts/backfill-klaviyo-attribution-cycle.ts).
    **Paid sources are not recovered** — a real paid click in-window already wins at the edge, so
    `direct` genuinely means "no paid click."
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

#### Server-side Facebook CAPI Purchase — `event_time` = Stripe charge time

`grantBenefits()` also fires the server-side Meta CAPI **Purchase** via
[`trackPixelPurchase()`](../../src/utils/tracking/pixel-purchase-tracking.ts) with
`actionSource: "system_generated"` (there is no live browser session in the webhook; the browser
Pixel fires the matching event with `action_source=website` and Meta dedups the pair by `event_id`).
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
