# Payment — Rules

## PCI compliance

### R1. Only Stripe payment-method ids in our database

`User.savedPaymentMethods[].paymentMethodId` is a Stripe `pm_xxx` string. Never store:
- Card number / PAN
- CVV
- Full track data
- Card brand + last4 if it's used as PCI-sensitive context (last4 alone for display is OK; combined with name+expiry it edges into PCI scope)

The schema enforces id-only ([src/models/User.ts:21-26](../../src/models/User.ts#L21-L26)). Reviewers must reject any change that adds more card fields to this subdocument.

### R2. Sanitise Stripe responses before persisting

When writing to `InvoiceChargeLog.result` or any other audit row, strip:
- Full PaymentMethod objects (have card data)
- Sensitive metadata fields
- Complete charge objects with card details

Keep ids, status, error codes, amounts, timestamps.

## Ledger symmetry

### R3. Every grant is recorded in `data.grants`

`grantBenefits()` / `processPaymentBenefits()` must record every side effect of the payment in the `BenefitsGranted` `PaymentEvent.data.grants` ledger. Refund reversal reads this ledger — anything not recorded won't be reversed.

### R4. Add a reverser when adding a grant type

When introducing a new grant kind:
1. Extend `IPaymentGrantLedger` ([src/types/payment-ledger.ts](../../src/types/payment-ledger.ts)).
2. Record the grant in `payment-processing.ts`.
3. Add a reverser module in `src/utils/payment/reversers/`.
4. Wire it into `buildLedgerReversalSteps` in `refund-ledger-reversal.ts`.
5. Document the invariant in [billing-stripe/rules.md](../billing-stripe/rules.md#ledger-symmetry).

Skip step 3-4 and refunds will silently fail to reverse the new grant. Real production bugs come from this.

## 3DS

### R5. Don't bypass 3DS

Never set `payment_method_options.card.request_three_d_secure` to skip 3DS for fraud-risky transactions. Stripe Radar will flag it. The default `automatic` is correct.

### R6. Same-origin return URLs

The `return_url` passed to `confirmPayment()` must be same-origin. Cross-origin returns can lose session cookies on Safari (ITP).

### R7. Always poll after 3DS redirect

After the user returns from a 3DS challenge, **don't trust the URL params alone** — Stripe's `redirect_status` is a hint, not the record. [`use3DSRedirectHandler`](../../src/hooks/use3DSRedirectHandler.ts) re-reads the intent from Stripe via `stripe.retrievePaymentIntent(clientSecret)` and maps *that* status. Use the hook; don't reimplement. (`/api/stripe/verify-payment-complete` exists for the same job server-side but has no client caller as of 2026-08-27.)

## Idempotency

### R8. Stable Stripe idempotency keys (see also [billing-stripe R5](../billing-stripe/rules.md#r5))

Apply the same rule for every payment-creating call:
```ts
// CORRECT
{ idempotencyKey: `purchase-${userId}-${productId}` }

// WRONG
{ idempotencyKey: `purchase-${Date.now()}` }
```

## Saved payment methods

### R9. Default-PM exclusivity

Only one `savedPaymentMethods[]` entry can have `isDefault: true`. When setting a new default, unset the old one in the same atomic update.

### R10. Detach from Stripe customer on delete

When the user deletes a saved card, the `payment-method-delete-flow.ts` flow must:
1. Detach the PM from the Stripe customer (`stripe.paymentMethods.detach`).
2. Remove from `User.savedPaymentMethods[]`.
3. If it was the default, promote the next-most-recent (or null if none).

## Subscription edge cases

### R11. Don't double-create subscriptions

Before `stripe.subscriptions.create()`, call `stripeCustomerHasManageableSubscription(customerId)` ([subscription R7](../subscription/rules.md#r7)). If true, surface a clear "you already have a subscription" error rather than creating a duplicate.

### R12. Pause-collection resume runs first

In any path that succeeds a renewal payment (webhook, admin retry, user retry), call `resumeAfterSuccessfulRenewalPayment()` BEFORE `processPaymentBenefits()`. See [subscription R9](../subscription/rules.md#r9).

## Post-payment session

### R13. A post-payment sign-in must never surface as a payment error

The 3DS landing exchanges the redirect's client secret for a session ([frontend.md](./frontend.md#3ds-session-establishment)). That call is fired with `void`, is never awaited into rendered state, and swallows every failure — no error state, no toast, no `ErrorReport`. The money has already moved, so a failed sign-in must degrade to "success page, logged out", never to "your payment failed". Retry only the `202 pending` webhook race; treat every other status as terminal. The same applies to any future landing that signs a buyer in from proof of payment.

## One-time pack charging

### R14. One checkout takes at most one charge — never create a PaymentIntent without first trying to adopt one

A one-time pack checkout has **two** places that can move money, and only one of them may
actually do so:

1. `/api/stripe/create-payment-intent` mints an **upfront PaymentIntent** so Apple Pay /
   Google Pay can display the amount. When the buyer presses Purchase with a **new card**,
   `confirmStripeIntent()` confirms it — **that is a real charge**, not a dry run.
2. The purchase route (`create-one-time-purchase` / `-existing-user`) would otherwise create
   its own PaymentIntent with `confirm: true`.

Both purchase routes MUST therefore resolve their charge through
`resolvePurchasePaymentIntent()` ([backend.md](./backend.md#resolve-purchase-payment-intentts--the-one-charge-rule)),
never by calling `stripe.paymentIntents.create()` directly. The resolver adopts the charge the
browser already made, recovers an unclaimed one, and only creates as a last resort.

**Why this is a rule and not a convention.** `create-one-time-purchase` had the reuse branch
from the start; `create-one-time-purchase-existing-user` never did. Every authenticated member
paying with a new card was billed twice and granted the pack's entries twice — 57 checkouts,
54 members, Jan–Sep 2026, confirmed against live Stripe metadata on 14/14 sampled pairs. The
defect was not a missing parameter; it was **two copies of the same logic where only one got
fixed**. If you add a third one-time purchase path, it goes through the resolver too.

Corollary: whichever path takes ownership of a charge stamps `oneTimeChargeClaimed: "true"`
into its metadata. That marker is what lets recovery tell an *orphaned* upfront charge (adopt
it) from one already booked (charge again, because the member is deliberately buying a second
pack). Dropping the marker silently gives away packs.
