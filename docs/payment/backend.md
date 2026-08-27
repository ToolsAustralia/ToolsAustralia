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
| `attach-typed-code.ts` | `attachTypedCodeToCheckout()` — the **pre-confirm** write that classifies the customer's **raw typed code** server-side and stamps it onto the still-unpaid subscription / PaymentIntent. Carries **all three** code types. See below. |

### `attach-typed-code.ts` — the authoritative typed-code write

> **Renamed 2026-08-27 (was `campaign-code-checkout.ts`).** The seam carried only campaign
> codes when it was built; it now carries all three, so the name moved with the behaviour
> onto `typedCode` — the word its own slot marker (`metadata.typedCodeSlot`), slot type
> (`CheckoutCodeSlot`) and sibling gate module (`typed-code-at-checkout.ts`) already used.
> The module, the route (`/api/stripe/attach-typed-code`), the hook method
> (`attachTypedCode`), the modal ref (`attachedTypedCodeRef`), the test
> (`npm run test:attach-typed-code`) and the `[typed-code]` log prefix now all say one word.
> **What deliberately did NOT move:** the `campaignCode` **metadata key** and
> `CampaignCodeValidationService` — those really are campaign-only, so renaming them would
> have forked a vocabulary rather than unified one. The `[campaign-code]` log prefix
> likewise stays on that service.

`MembershipModal` pre-warms the checkout object the moment step 2 mounts, and the coupon box lives on that same step — so at pre-warm time the customer has not typed anything yet, and the object that gets charged carried no `campaignCode`. This module closes that: at the PURCHASE click, **after** the code is final and **before** `confirmPayment`, it writes the desired state of `campaignCode` onto the object.

Contract:

- **All three code types, classified SERVER-SIDE.** The body's `code` is the **raw string the customer typed**, with no claim about its kind. The module runs the same three-way classification `/api/codes/validate` runs — referral (`validateReferralCodeForUser`) → promo (`PromoLink.findActiveByCode` + `isExpired()`) → campaign (`CampaignCodeValidationService.resolveCodeForCheckout`) — each against an identity resolved from the Stripe object's **own server-written metadata**, and writes `referralCode` / `promoLinkCode` / `campaignCode` accordingly. It returns `{ ok: true, code, slot }`. This is what closes the gap where referral and promo-link codes rode only in a create-subscription body and were lost whenever the pre-warm made that call redundant. **The client gains no new trust** — it never says which kind of code it typed.
- **Desired-state, not append-only, scoped by `metadata.typedCodeSlot`.** `code: null` clears the slot the marker names by writing `""` (every downstream read is a truthiness check, so `""` and "key absent" are equivalent). This is what makes *apply A → card declines → remove A → retry* correct. The marker exists because three keys are now in play: without it, stamping a campaign code would wipe the `?promo=` **attribution** `promoLinkCode` a *different* writer put there at create time. An object stamped before the marker existed has no marker and is read as slot `"campaign"`, which preserves the original clear behaviour exactly; `promoLinkCode` deliberately gets no such fallback.
- **Re-verifies server-side.** Calls `CampaignCodeValidationService.resolveCodeForCheckout` verbatim, with a user id resolved **only** from the Stripe object's own server-written metadata (`userId`, else `userEmail` → `User` lookup, else the session). The request body is never an identity claim.
- **Authorization is a possession proof**, because the caller may be a guest: `metadata.subscriptionRequestId` for a subscription, `client_secret` for a PaymentIntent. Both are server-written and bound to the specific object. The `client_secret` is never logged or echoed.
- **State guard: the object must be unpaid.** Subscription: `status ∈ {incomplete, trialing}` **and** `latest_invoice.status !== "paid"`. PaymentIntent: `status ∈ {requires_payment_method, requires_confirmation, requires_action}`. `trialing` is accepted because on the anchor days (AEST 25/26/27) the create routes send `trial_end`, and Stripe will not hold a trialing subscription at `incomplete` — the up-front charge rides an `add_invoice_items` line on an open invoice instead. The paired invoice check is what keeps "never stamp a paid object" intact.
- **Never throws, never blocks the sale.** Every failure is a typed result; the caller charges anyway and a genuine holder keeps the unspent issuance in their rewards wallet.
- **Metadata is spread in full on every write.** These update calls take a metadata *map*, so a partial payload would destroy `packageId`, the CAPI match keys, the A/B assignment and the attribution on an object the customer is about to be charged on.

Reached over HTTP via `POST /api/stripe/attach-typed-code` ([billing-stripe/api.md](../billing-stripe/api.md)); called from `useStripeSubscription().attachTypedCode`.

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

`trackKlaviyoEvent()` takes the caller's pre-grant `hadActiveSubscription` as a required 5th parameter
(see the bonus-code section below) and `billingReason` as an explicit `string | undefined` 4th — neither is
optional, so a new caller cannot silently ship a wrong default.

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

`addToMajorDraw`'s `freshEntriesBySource` zero-shape in [payment-processing.ts](../../src/utils/payment/payment-processing.ts) now enumerates the full source-key set (`referral`, `cancellation-upsell`, `promo-link`, and the new `streak` bucket included) so downstream readers never hit a missing key. The `streak` bucket is written only by `DrawGrantService` (rewards-redeemables domain) — payment-path grants never write it.

## No bonus code is minted in `grantBenefits` any more (2026-08-26)

Between 2026-08-25 and 2026-08-26, [payment-processing.ts](../../src/utils/payment/payment-processing.ts)
minted the `one-time-purchase` per-customer bonus code inside `grantBenefits`, immediately after the
campaign-redemption block, gated on `packageType === "one-time" && !user.subscription?.isActive`. **That
block was deleted.**

Why: the nurture email that carries the code lands days after the purchase, while the personal window is a
fixed 72 hours — so a code minted at purchase had already expired by the time the customer was told about
it. Minting now happens when Klaviyo calls `POST /api/bonus-codes/v1/issue` from inside the flow, one step
above the discount email, so the clock starts when the email is about to send. See
[rewards-redeemables P7](../rewards-redeemables/patterns.md).

What this means for anyone working in `grantBenefits`:

- **The payment path owns no bonus-code logic at all** — no `mintBonusCodeForTrigger` import, no gate, no
  `IUser` cast for it. (`IUser` is still imported and still used by `addToPartnerDiscountQueue` and
  `handleSubscriptionQueueUpdate`; the mint's removal did not touch it.)
- **The one-time-purchase cohort is still reached** — through the Klaviyo events this path already emits.
  A flow built on those is what calls the endpoint. Do not re-add a server-side mint here.
- **The gate's discriminator survives as an event property (2026-08-26).** The deleted block's
  `!user.subscription?.isActive` condition is now carried on the `One-Time Package Purchased` event as
  `had_active_subscription`, so the Klaviyo flow can apply the same member / non-member split the server
  used to. It is captured as `hadActiveSubscription` in `processPaymentBenefitsInternal` **immediately
  before** `grantBenefits` runs and threaded through `trackKlaviyoEvent` as a **required** parameter.
  Read it pre-grant, not post: today the one-time branch never touches `user.subscription`, so reading it
  after would give the same answer — but that is an invisible invariant one edit inside
  `handleOneTimePackage` would break silently, and nothing downstream can rebuild a point-in-time fact.
  Shape and rationale: [tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md).
- `checkAndRedeemCampaign` (a customer *spending* a code at checkout) is a different thing entirely and is
  unchanged — see the next section.

## `checkAndRedeemCampaign`'s failure log is `console.error` (2026-08-25)

`checkAndRedeemCampaign` in [payment-processing.ts](../../src/utils/payment/payment-processing.ts) is deliberately **non-blocking**: a campaign code that fails to redeem must never fail the payment. The consequence is that its "did not grant entries" branch is the **only** trace of a customer who paid and received nothing — the customer sees no error either.

That branch used to log at `console.warn`, which `next.config.ts`'s `compiler.removeConsole` strips from production builds, so in production the scenario was silent in the logs as well as to the customer. It is now `console.error`, which survives. This matters more now that campaign codes are mass-distributed by email and therefore forwardable: `/api/codes/validate` can be asked about a code the caller does not hold, and the checkout modal commits on that answer. (The validate side now refuses a non-holder outright — see [docs/promo/api.md](../promo/api.md) — so this log should stay rare; if it starts firing, something upstream disagrees with `RedemptionService`.)

## Streak hooks in the payment path (2026-07-15)

- `payment-processing.ts` is the ONLY caller passing `{ allowStreakIssuance: true }` to `MilestoneService.checkAndIssueMilestones` — new streak-months issuances are payment-coupled by construction (the cron/mass evaluator may only re-deliver, never newly issue).
- `reverseMembershipLedger` ([refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)) now gives back a refunded renewal's streak +1: it atomically flips the matching `MembershipRenewalCycle` row (`userId` + `paymentIntentId` + `billing_reason: subscription_cycle`, `succeeded/recovered → refunded` — the pre-image gate makes replays no-op) and decrements `subscription.streakMonths` with a floor of 0. The milestone issuances granted on that payment were already revoked via `grants.milestoneIssuanceIds` (`milestoneRevoke` step).

## Per-user grant ledger — `aggregateNetGrantsByUser` (2026-08-26)

[`src/utils/payment/payment-event-net-queries.ts`](src/utils/payment/payment-event-net-queries.ts)

```ts
aggregateNetGrantsByUser(userIds): Promise<Map<string, UserGrantLedger>>
UserGrantLedger = { memberEntries, oneTimeEntries, upsellEntries, miniDrawEntries, netSpend }
```

Lifetime **paid** grants per user, refund-netted by the same
`excludeRefundedBenefitsGrantedStages()` (Option B) the admin revenue breakdown uses, so the
two figures can never disagree. `netSpend` is in **dollars**, matching the
`BenefitsGranted.data.price` convention at the top of that file.

- Groups by `(userId, packageType)` in one aggregation; indexed on `userId_1_timestamp_-1`.
- Users with no grants are **absent** from the Map — callers fall back to `emptyGrantLedger()`.
- Accepts `string | ObjectId` because `IUser._id` is declared `string` in this codebase.
- `foldGrantRows` is split out as a pure function so the arithmetic is testable without Mongo
  (`npm run test:payment-grant-ledger`). The bug it replaces was arithmetic, not I/O.

**Covers paid sources only.** Free grants — referral, promo-link, cancellation-upsell, streak,
bonus-entry-promo — never produce a `BenefitsGranted` row. The all-sources lifetime total is
`user.accumulatedEntries`.

Consumed by the Klaviyo profile projection to replace a catalogue reconstruction that was
wrong for 4,904 of 4,904 active members. See `docs/tracking/KLAVIYO_INTEGRATION.md`.
