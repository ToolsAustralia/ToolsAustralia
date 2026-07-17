# Payment — Gotchas

## `subscription-period.ts` is the Basil-safe way to read period start/end

[`getSubscriptionPeriodEnd` / `getSubscriptionPeriodStart`](../../src/utils/payment/stripe/subscription-period.ts) are the canonical helpers for "when does this subscription's current period start/end?". Under the Stripe Basil API those fields live on `subscription.items.data[i].current_period_*`, not the subscription root (which returns `undefined`); the helpers read the earliest value across items and fall back to the legacy root field for older shapes. `getSubscriptionPeriodStart` was added June 2026 alongside the existing end helper when the upgrade route needed the start for display. Always use these — reading `subscription.current_period_*` directly silently yields `undefined`/`Invalid Date`. See [billing-stripe/gotchas.md](../billing-stripe/gotchas.md) for the incident that motivated this.

## `addToMajorDraw` must never silently swallow a failed draw credit

[`payment-processing.ts`](../../src/utils/payment/payment-processing.ts) `addToMajorDraw` credits the active `MajorDraw` for every package payment. It historically did a **non-atomic 3-step write** (`updateOne` + a full ~1MB `findById` reload of the whole `entries[]` array to recompute `totalEntries` + another `updateOne`) wrapped in a `try/catch` whose logging was **entirely commented out** with a "Don't throw" comment. During synchronized renewal billing spikes (anchor-day billing fires dozens of `invoice.paid` webhooks at once), transient DB failures on those writes were **silently dropped** → `data.grants.drawGrants: []`, the member missing/short on the draw, with **zero `ErrorReport`s and the webhook queue showing `succeeded`** (the failure was below the queue layer). May 2026: 60 active members were left under-credited by 25,235 entries this way; see `docs/draws/gotchas.md`.

Rules for this block:
- **Credit atomically in a single op per branch.** `$inc` the document-level `totalEntries` in the *same* update as the per-user row — never reload the whole `entries[]` array just to recompute it.
- **Use the `matchedCount`-based upsert** (`$inc` existing row → else `$push` guarded by `"entries.userId": { $ne }` → else re-`$inc`). This prevents duplicate per-user rows under concurrency.
- **Do NOT add an application-level retry around the credit.** `$inc`/`$push` are not idempotent; the MongoDB driver's `retryWrites: true` already retries each `updateOne` *exactly once* on safe (write-not-applied) errors. An extra app-level retry would **double-credit** if a write commits but its acknowledgement is lost (timeout-after-commit) — the very failure that happens under load — and the cron can't undo an over-credit (it only adds a missing delta). Attempt the credit once; let the reconciler heal hard failures.
- **On failure, write an `ErrorReport` via `ErrorLoggingService.logError` — never swallow silently.** Leave `drawGrants` empty so the reconciliation cron / `scripts/fix-major-draw-renewal-entries.ts` heals it idempotently (it compares the live draw value, so it won't double-credit).

## Refund reversal — always pass `row.drawId` through to `removeMajorDrawEntries`

[`refund-ledger-reversal.ts`](../../src/utils/payment/refund-ledger-reversal.ts) iterates `data.grants.drawGrants[]` from the original `BenefitsGranted` event and calls `removeMajorDrawEntries` for each row. The current code passes `row.drawId` as the 4th argument so the removal is scoped to the *specific* draw the entries originally landed in. **Do not remove or null out this argument.** Without it, the function falls back to walking every draw the user has entries in, which is what produced the silent prior-draw corruption (see `docs/draws/gotchas.md`).

For the legacy fallback path (originalEvent has no `grants.drawGrants` — pre-ledger event), `removeMajorDrawEntries` is intentionally called without a `drawId` because none is available. The function logs `[refund-reversal] no drawGrants ledger — falling back to legacy walk` so these cases are visible during local `stripe listen` debugging.

## Refund reversal must pass `invoiceId` to the affiliate reversal

`processRefundReversal` resolves both the real `paymentIntentId` and (for
subscription refunds) the `invoiceId`, and now passes **both** to
`reverseAffiliateCommissions`. This is required because affiliate commissions
store their payment link differently per type (`membership-recurring` by
`stripeInvoiceId`, `membership-first` by a normalized `invoice_in_…` PI). Without
the `invoiceId`, refunded renewals never reversed and the affiliate kept the
commission. See [affiliate/gotchas.md](../affiliate/gotchas.md#refund-reversal-must-match-all-commission-storage-forms-fixed-2026-06).

## Local debugging with `stripe listen`

When you run `stripe listen --forward-to http://localhost:3000/api/stripe/webhook` and a refund fires, every step of the reversal emits a structured `[refund-reversal] …` log line through `console.log`. Production builds strip those (per `next.config.ts` `compiler.removeConsole`), so they're dev-only. The legacy-walk warning is emitted via `console.error` and survives in production too — treat it as an alert.



## Confirmation method fix

(Migrated stub from `docs/PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md` — _TODO: read full source and merge here._)

Brief: subscription Payment Intent confirmation requires the right `confirmation_method` (typically `automatic` for Payment Element). Setting it explicitly on the PI avoids a class of confirmation-loop bugs.

## Default PM string vs object

`invoice.default_payment_method` can be:
- A **string** (the PM id, when not expanded)
- An **object** (PaymentMethod object, when expanded with `expand: ['default_payment_method']`)

Always handle both:
```ts
const pmId = typeof invoice.default_payment_method === "string"
  ? invoice.default_payment_method
  : invoice.default_payment_method?.id;
```

## Payment attribution

(Migrated stub from `docs/PAYMENT_ATTRIBUTION.md` — _TODO: read full source and merge here._)

Brief: when a payment succeeds, attribution data (UTM, affiliate, referrer) is written into `PaymentEvent.data` so reverse-attribution analytics work even after the user clears cookies. The capture point is the create-payment-intent / create-subscription routes — not the webhook.

## Payment error handling

The client-side classification pipeline lives in [`payment-error-detection.ts`](../../src/utils/payment/stripe/payment-error-detection.ts) (categorize + recovery strategy) and [`payment-error-messages.ts`](../../src/utils/payment/stripe/payment-error-messages.ts) (user-facing title + message). Subscription-creation error mapping lives in `subscription-error-handler.ts` (`SubscriptionErrorType` enum: creation-failed / network / validation / …), which now also handles the ApiError shape (body on `.data`) — see [backend.md](./backend.md).

## Confirm-time card declines THROW — routes must return the 400 "Payment failed" shape (fixed 2026-07)

With `confirm: true`, `stripe.paymentIntents.create` / `stripe.invoices.pay` **THROW** a `StripeCardError` on an issuer decline instead of returning a failed intent — the decline lands in the route's generic `catch`, not in any `last_payment_error` branch. Production bug: a confirm-time decline ("Invalid account.", `decline_code: invalid_account`) on `POST /api/stripe/create-one-time-purchase-existing-user` came back as a generic 500 and the user saw "Failed to create one-time purchase Please try again." with no actionable guidance.

The pipeline that fixes it:

- **Server**: route catch blocks call [`isStripeCardError(error)`](../../src/utils/payment/stripe/payment-error-detection.ts) — duck-typed (`type === "StripeCardError"` || `rawType === "card_error"`) — and return the 400 `{ success: false, error: "Payment failed", details, code, decline_code, … }` shape instead of a 500. Non-card Stripe errors must stay 500.
- **Client extraction**: [`extractPaymentErrorCodes(error)`](../../src/utils/payment/stripe/payment-error-detection.ts) returns `{ code, declineCode }` from any error shape that reaches the client — raw Stripe error (direct props), plain 400 body, ApiError from `src/lib/queries.ts` (body on `.data`), axios-style (`.response.data`). The internal `extractResponseBody()` makes `extractErrorMessage` / `extractErrorCode` / `categorizeError` probe ApiError `.data` too — previously only axios `.response.data` was probed, so ApiError decline info was invisible to the client pipeline. `categorizeError` also probes `.data` for the `requiresDifferentPaymentMethod` / `failureReason` / `failureCode` flags.
- **Guidance**: [`getCardDeclineGuidance(declineCode, errorCode)`](../../src/utils/payment/stripe/payment-error-messages.ts) looks up the `DECLINE_CODE_GUIDANCE` map (short, direct copy — 1–2 sentences, one next step). `formatPaymentError()` returns the decline-specific title/message when the error carries a code/decline_code, unless the errorType is `stripe_excessive_retry` / `invoice_collection_blocked` / setup- or payment-intent recovery — those keep priority (their next step is more specific than the decline reason).
- **Never leak sensitive codes**: `lost_card`, `stolen_card`, `pickup_card`, `fraudulent` are deliberately NOT in the map — they fall through to the generic "Your card was declined. Try a different card, or contact your bank." per Stripe guidance never to reveal those reasons. The generic `card_declined` + `insufficient_funds` switch cases in `formatPaymentError` reuse the same concise copy.

Fenced by `npm run test:decline-guidance` (incl. the sensitive-code non-leak and the production ApiError bug shape).

## Failed invoice recovery selection

When the user has multiple invoices on a paused subscription, `subscription.latest_invoice` may point to a **draft** (Stripe creates new cycle invoices that stay draft under `pause_collection: keep_as_draft`). Don't pay the latest — use `failed-invoice-selection.ts` to find the actual open invoice that can be paid.

See [billing-stripe gotchas](../billing-stripe/gotchas.md#missing-invoice-while-paused).

## 3DS challenge timing

The 3DS challenge flow involves a redirect away from our domain and back. Edge cases:

- **User abandons mid-challenge**: The PI ends up `requires_action` indefinitely. `payment-cleanup.ts` handles cancellation of stuck PIs older than a threshold.
- **Session cookies dropped on Safari**: Same-origin `return_url` is mandatory — see [rules R6](./rules.md#r6).
- **Browser-back during challenge**: User can return to checkout with the original PI still pending. The hook re-polls and reconciles.

## Saved-PM deletion is a multi-step flow

Deleting a saved card isn't just a Mongo update:
1. Detach from Stripe customer.
2. Remove from `User.savedPaymentMethods[]`.
3. If default, promote next-most-recent.
4. If the PM is referenced by an active subscription, error or migrate first — orphaning a sub's PM mid-cycle leaves it unrechargeable.

`payment-method-delete-flow.ts` orchestrates this. Don't bypass it.

## `processPaymentBenefits` is idempotent — but watch the timing

The benefits-grant path is wrapped in `PaymentEvent.findOne({ paymentIntentId })` dedupe. Webhook retries and the synchronous post-confirmation paths can both call it; the second call is a no-op.

But: between the first call's "find" and "create," a concurrent retry can race. The grant uses `BenefitsGranted-${paymentIntentId}` as a unique-key write — the loser gets `E11000` and bails. That's the safe path. Don't add an artificial delay or transaction; the unique index is enough.

## Stripe PaymentElement input font must be ≥16px (iOS Safari zoom)

_2026-06-09:_ Every PaymentElement input font size in `STRIPE_PAYMENT_ELEMENT_RULES` (`.Input`, `.Input--empty`, `.Input--focus`, `.Input--invalid`, `.InputElement`, and the `cardNumber` / `cardExpiry` / `cardCvc` field rules) plus `variables.fontSizeBase` were raised 14px → 16px in [`buildMembershipStripeAppearance`](../../src/utils/payment/stripe/membership-stripe-appearance.ts) (`minHeight: '44px'` retained). iOS Safari auto-zooms when a focused input's computed font-size is <16px; the app's own CSS cannot reach Stripe's cross-origin iframe, so the Appearance API is the only lever (Stripe's docs recommend ≥16px input font on mobile). Keep these at 16px — dropping below re-introduces the zoom. This builder is shared by PaymentMethodSelector, StripePaymentModal, PaymentMethodsTab, UpsellModal, SpecialPackagesModal, and RenewalFailedModal, so the single change fixes the card-field zoom across all of them.

## `billingReason` threads through to Klaviyo as `is_renewal` / `billing_reason`

The Stripe `invoice.billing_reason` parameter on `grantBenefits` / `trackKlaviyoEvent` is wired through to the `Placed Order` event in Klaviyo so attribution reports can filter automated renewals out of "true new revenue" calculations. The Klaviyo-side mechanics, custom-metric setup, and the full property naming contract live in [tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) — change the discriminator there, not in `payment-processing.ts`.

## "Invoice Generated" (customer receipt) is emitted server-side — never from the client (fixed 2026-07)

The Klaviyo **"Invoice Generated"** receipt used to be emitted by a fragile **client-side** call to `/api/invoice/finalize` from the upsell modals. Because every membership tier has an upsell configured, the old `shouldDelayInvoice()` was effectively always true, so the reliable server-side `trackInvoice` was skipped and the receipt depended entirely on the browser. If the customer navigated away (common after accepting an upsell) the receipt was silently dropped — verified in production (a real Boss subscriber fired Placed Order / Subscription Started / Upsell Accepted but **no** Invoice Generated).

Now "Invoice Generated" is emitted **server-side** from [`trackKlaviyoEvent`](../../src/utils/payment/payment-processing.ts) inside `processPaymentBenefits` — idempotent and always run server-side for every charge, so it can't be dropped by the client. The call is gated by [`shouldEmitInvoiceGenerated(billingReason)`](../../src/utils/integrations/klaviyo/klaviyo-invoice-service.ts):

- **EMIT** for `subscription_create` (new membership — the reported bug) and for undefined/empty `billing_reason` (one-time packs, mini-draws, and accepted upsells — each is its own charge).
- **SKIP** for `subscription_cycle` and `subscription_threshold` (renewals — owned by the "Subscription Renewed" → "Membership Renewal" Klaviyo flow) and `subscription_update` (upgrade — owned by the `invoice.payment_succeeded` webhook's `isUpgrade` block). Skipping these prevents double-emailing.

Exactly-once emission is guaranteed because `processPaymentBenefits` dedups by `paymentIntentId` / `PaymentEvent` (`BenefitsGranted-${paymentIntentId}`) before reaching `trackKlaviyoEvent`.

**Behavioral consequence:** an accepted upsell is a separate PaymentIntent, so it now gets its **own** receipt — an upsell purchase yields **two** receipts (base charge + upsell charge). The old client-combined single-invoice email is gone (it required the client and was unreliable).

**Removed (dead code deleted):** the `/api/invoice/finalize` route, `trackCombinedInvoice`, `buildCombinedInvoiceData`, `shouldDelayInvoice`, and the `finalizeInvoice` client logic in the upsell modals. The rule is fenced by `npm run test:invoice-generated-gate`.

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).
