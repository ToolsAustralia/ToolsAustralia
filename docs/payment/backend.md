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
| `payment-processing.ts` | `grantBenefits()`, `processPaymentBenefits()` — the success path that writes `BenefitsGranted` ledger rows. |
| `payment-status.ts` | Status-derivation helpers (paid / failed / pending classification). |
| `ledger-helpers.ts` | Shared helpers for reading/writing `data.grants`. |

#### Single-platform attribution on `BenefitsGranted`

`processPaymentBenefits()` / `processPaymentBenefitsInternal()` accept a trailing optional
`resolvedAttribution` arg (`{ platform, confidence, attributedClickId, attributedClickTimestamp } | null`)
and stamp three top-level fields onto the `BenefitsGranted` `PaymentEvent`:

- `convertingPlatform` (enum | null), `attributionConfidence` (enum | null), `isRenewal` (boolean).
- **Precedence**: prefer the edge-resolved decision passed in `resolvedAttribution` (stamped into
  Stripe metadata at the edge and read back in the webhook via
  `extractResolvedPlatformFromMetadata`). When none is present (legacy / force-charge paths),
  fall back to `normalizeUtmToPlatform(attributionData.utmSource, utmMedium)`; a present-but-unknown
  source becomes `"other"`, an absent source becomes `"direct"`, and confidence is `"utm_only"`.
- `isRenewal` comes from `classifyIsRenewal({ billingReason, isResubscribe })` — true only for a
  `subscription_cycle` that is not a create / upgrade / resubscribe.
- Audit evidence (`attributedClickId`, `attributedClickTimestamp`) is written into the Mixed `data`
  blob only when present. Subscriptions/renewals inherit the decision from `subscription.metadata`
  (sticky), so the converting platform stays constant across the membership lifetime.

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
| `subscription-error-handler.ts` | Map Stripe errors to user-facing responses. |
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
