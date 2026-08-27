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
- **Member mint-on-resolve (pure)**: `recovery/member-resolve-mint-policy.ts` — `classifyMemberResolveMintOutcome(mint)` maps a `mintCurrentCycleInvoice` result to the member "Resolve past due" response category: `collected` (ok / already-collected → success), `retry_interactively` (`charge_failed` → prompt add-a-card, since the minted invoice stays `still_chargeable` and the retry collects on the new default), or `blocked` (scheduled-to-cancel / mint error → terminal). Used by `pay-failed-invoice` for the `no_held_draft` cohort. Unit-tested: `npm run test:member-resolve-mint`.
- **Recovery lock**: `recovery/recovery-claim.ts` (`acquireRecoveryClaim` / `releaseRecoveryClaim`) — the per-subscription [`RecoveryClaim`](../../src/models/RecoveryClaim.ts) mutex (`_id: "recover:<subscriptionId>"`, 120s reclaim window, 300s TTL backstop) that serializes stranded recovery across member + admin pay paths. See [admin backend — Idempotency model](../admin/backend.md#idempotency-model).
- **Cleanup / queries**: `payment-cleanup.ts`, `payment-event-net-queries.ts`
- **Cross-feature calculators**: `upsell-entries-calculator.ts`, `upsell-promo-multiplier.ts`

## Where the bonus-entry code joins a payment

The bonus-entry campaign code is not part of either intent flow above — it is a
**metadata stamp** applied to whichever object is about to be charged, at the
last possible moment before the charge:

```
step 2 mounts ──► pre-warm (subscription | PaymentIntent)   ← no code exists yet
                            │                                 (coupon box is on
                            │                                  THIS step)
customer types code, Apply  │
                            ▼
PURCHASE click ──► attachTypedCodeToCheckout()  ← server re-verifies, stamps
                            │                        the UNPAID object
                            ▼
                    confirmPayment()  ← Stripe emits ...payment_succeeded
                            │
                            ▼
          webhook FRESH-retrieves the object and reads metadata.campaignCode
```

The ordering is the whole design: stamp before the confirm, never after. See
[backend.md](./backend.md#attach-typed-codets--the-authoritative-typed-code-write)
and [gotchas.md](./gotchas.md).

### The recovery leg: a recorded checkout intent (2026-08-27)

The stamp above is written by a request the **browser abandons**. `attachTypedCode`
(`useStripeSubscription.ts`) caps it at 15s and the modal charges regardless of the outcome — the
"never block the sale" contract, which is right. But it left one open window, and it was observed
live rather than theorised: the server answered `200 in 14903ms`, the browser had already aborted,
the card was charged, and the webhook logged no `campaignCode`. The customer paid and the entries
did not land.

Raising the cap does not fix that — it moves it, and it cannot help a dropped connection or a tab
closed mid-spinner. The asymmetry is what fixes it: **the server knows whether the customer asked
for the code; the browser does not.** So the server writes its own record, and the outcome stops
depending on a client-side race being won:

```
PURCHASE click ──► attachTypedCodeToCheckout()
                     │
                     ├─ 1. retrieve · authorize · state · identity · re-verify
                     ├─ 2. recordCheckoutIntent()   ← OUR DB. fast, before the slow half.
                     │                                checkoutIntentAt / checkoutIntentTargetId
                     └─ 3. stripe.{subscriptions|paymentIntents}.update(metadata)   ← the slow half
                                    │
      browser may abort anywhere from here ─────────────► confirmPayment() charges anyway
                                    ▼
       webhook ──► checkAndRedeemCampaign()
                     ├─ metadata.campaignCode present  ─► redeem it (unchanged, authoritative)
                     └─ ABSENT ─► resolveCheckoutIntent() ─► redeem the candidate it names
```

Step 2 sits **before** step 3 deliberately: a record written only on the Stripe write's success
would be missing in exactly the cases it exists for. The ordering is asserted, not assumed —
`npm run test:attach-typed-code` §7 pins `["intent", "stripe"]`.

The intent is a **candidate, not a decision**: `RedemptionService.redeem` re-applies every
eligibility, expiry and already-spent gate, so the recovery can never grant something the normal
path would refuse. Removing a code clears the intent, and it expires after 30 minutes so it cannot
reach a later purchase or a renewal invoice. Full invariants in
[docs/rewards-redeemables/rules.md R11](../rewards-redeemables/rules.md).
