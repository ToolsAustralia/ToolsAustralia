# Payment — Architecture

## What this domain does

Sits between the Stripe boundary ([billing-stripe](../billing-stripe/)) and feature flows that need payment:
- New subscription checkout → Payment Intent confirmation
- One-time purchases (mini-draw packs, upsells, shop) → Payment Intent
- Saved card management → Setup Intent + payment-method CRUD
- 3DS authentication redirect handling
- Failed-invoice retry flow (subscription renewals)
- Ledger-grant write on success, ledger-reverse on refund

## Two intent flows

```
NEW PAYMENT (charge now)             SAVE CARD (no charge)
─────────────────────────            ─────────────────────────
POST /api/stripe/                    POST /api/stripe/
  create-payment-intent                create-setup-intent
       │                                    │
       ▼                                    ▼
Stripe PaymentIntent              Stripe SetupIntent
  client_secret                     client_secret
       │                                    │
       ▼ (browser)                          ▼ (browser)
<PaymentElement>                  <PaymentElement>
   .confirmPayment()                 .confirmSetup()
       │                                    │
       ▼ (3DS may redirect)                 ▼
return_url with PI id              attaches PM to customer
       │                                    │
       ▼                                    ▼
use3DSRedirectHandler →           saved to User.savedPaymentMethods
   verify-payment-complete           (PM id only — never card data)
       │
       ▼
processPaymentBenefits
   (ledger grant)
```

## Ledger writes (success)

On successful payment confirmation:
1. Webhook (`invoice.payment_succeeded` for subs, `payment_intent.succeeded` for one-time) fires.
2. Handler calls `processPaymentBenefits()` in [src/utils/payment/payment-processing.ts](../../src/utils/payment/payment-processing.ts).
3. Each grant (entries, package activation, milestone progress, promo bonus) is recorded into `PaymentEvent.data.grants`.
4. The `PaymentEvent` row (`type: "BenefitsGranted"`) is the single source of truth for "what this payment unlocked" — see [billing-stripe ledger model](../billing-stripe/architecture.md#ledger-model--paymentevent).

## Ledger reverses (refund)

[src/utils/payment/refund-processing.ts](../../src/utils/payment/refund-processing.ts) → `processRefundReversal()` orchestrates:
- [refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts) — `reverseLedgerBenefits` reads `data.grants` and replays each grant in reverse via the `reversers/` modules.
- Each reverser is a focused module per grant type (entries, packages, milestones, promo bonuses).

Full architecture is documented in [billing-stripe/architecture.md#refund-reversal-architecture](../billing-stripe/architecture.md#refund-reversal-architecture).

## 3DS redirect handling

When Stripe requires 3DS (Strong Customer Authentication), the user is redirected to the bank's challenge page. After confirming, Stripe redirects to our `return_url` with the PaymentIntent id appended.

[src/hooks/use3DSRedirectHandler.ts](../../src/hooks/use3DSRedirectHandler.ts) detects the PI in the URL, calls `/api/stripe/verify-payment-complete`, and reconciles the page state (success / failure / pending).

> _TODO: read use3DSRedirectHandler.ts and document the exact return-URL format, status states, and the success/failure routing._

## Failed-invoice retry

User-facing pay-now flow for failed renewals:
1. Email link or `my-account` page → `/api/stripe/pay-failed-invoice` or `/api/stripe/renew-subscription`.
2. Helper `failed-invoice-selection.ts` picks the right invoice (open + chargeable, not the latest draft).
3. `failed-invoice-handler.ts` runs `stripe.invoices.pay()` with the user's saved or new PM.
4. On success: `resumeAfterSuccessfulRenewalPayment()` clears pause-collection ([subscription R9](../subscription/rules.md#r9)), then `processPaymentBenefits()` grants benefits.

## Helper layout

[src/utils/payment/](../../src/utils/payment/) is the largest helper directory in the codebase. Sub-areas:

- **Stripe wrappers**: `stripe/`, `stripe-invoice-payment-intents.ts`, `stripe-refund-amount.ts`, `stripe-subscription-metadata.ts`
- **Ledger / processing**: `payment-processing.ts`, `payment-status.ts`, `ledger-helpers.ts`
- **Refund reversal**: `refund-processing.ts`, `refund-ledger-reversal.ts`, `reversers/`
- **PM management**: `payment-method-manager.ts`, `payment-method-delete-flow.ts`, `account-manager.ts`
- **Subscription helpers**: `subscription-creation-guard.ts`, `subscription-state-manager.ts`, `subscription-entries-calculator.ts`, `subscription-error-handler.ts`, `subscription-response-handler.ts`
- **Failed invoice**: `failed-invoice-handler.ts`, `failed-invoice-selection.ts`
- **Stranded-invoice recovery (pure)**: `recovery/stranded-invoice-policy.ts` — the environment-free eligibility predicate (`isOriginalInvoiceEligibleForRecovery`), held-draft picker (`pickHeldDraftForRecovery`), and recovery idempotency-key builders. Relocated here from `src/server/admin/` so the shared recovery primitive (`src/services/subscription/prepareRecoveredCycleInvoice.ts`) and the member-facing pay paths reuse them without a service → server/admin dependency.
- **Cleanup / queries**: `payment-cleanup.ts`, `payment-event-net-queries.ts`
- **Cross-feature calculators**: `upsell-entries-calculator.ts`, `upsell-promo-multiplier.ts`
