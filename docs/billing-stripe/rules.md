# Billing-Stripe — Rules

## Webhook

### R1. Always dedupe via `ProcessedStripeEvent`

Stripe retries webhook deliveries. Every handler must check `ProcessedStripeEvent.findOne({ eventId: event.id })` before doing work, and write a row before returning 200. Without this, a single failed renewal can be processed twice — double `MembershipStatusHistory` rows, double partner-discount-queue updates, etc.

### R2. The webhook is the only emitter of cancellation tracking events

Klaviyo `Subscription Cancelled`, Meta CAPI cancellation, etc. fire **only** from `customer.subscription.deleted`. API paths write the local `MembershipStatusHistory` row but must not emit external tracking events. Otherwise dual-emission on every cancel.

### R3. Resume pause-collection BEFORE applying benefits

In `invoice.payment_succeeded`, call `resumeAfterSuccessfulRenewalPayment(subId)` before `processPaymentBenefits()`. A slow benefits path or proxy timeout must not leave `pause_collection` orphaned. See [subscription/rules.md R9](../subscription/rules.md#r9).

### R4. Dispute-lost = full refund

`charge.dispute.closed` with status `lost` must trigger the same reversal path as `charge.refunded` for the full amount. `charge.dispute.funds_withdrawn` reverses provisionally (refund returns funds → benefits stay reversed).

## Idempotency

### R5. Stable idempotency keys, never `Date.now()`

Stripe-mutating calls use deterministic keys derived from the resource being mutated:

```ts
// CORRECT
idempotency_key: `admin-charge-${invoiceId}`
idempotency_key: `subscription-create-${userId}-${packageId}`

// WRONG — breaks idempotency
idempotency_key: `charge-${Date.now()}`
```

The `canRetryAt` field on `InvoiceChargeLog` controls retry timing instead of the idempotency key.

### R6. Time-windowed idempotency for past-due charges

`InvoiceChargeLog` has a unique compound index `{ invoiceId, attemptedAt-day }` preventing more than one charge attempt per invoice per day. Combined with the stable Stripe idempotency key, this is double safety.

## Ledger symmetry

### R7. Every grant must record its own reversal data

When a successful payment grants benefits (entries, packages, milestones, promo bonuses), the `BenefitsGranted` `PaymentEvent.data.grants` ledger must record exactly what was granted — enough to reverse it later. Don't re-derive benefits from package type at refund time; package config can change.

### R8. Full refund only — partial = `RefundPartial`

Only `charge.refunded` events with `amount_refunded === amount` (full refund) trigger benefit reversal. Partial refunds write a `RefundPartial` `PaymentEvent` with `data.status: "partial-skipped"` for admin visibility but **don't** touch user state.

### R9. Refund idempotency lock

`RefundProcessed` row uses the same key as the matching `BenefitsGranted` (e.g. `invoice_in_xxx` for subscriptions). Webhook retries can find the existing `RefundProcessed` row and bail out.

### R10. Klaviyo / promo / milestone failures don't block

After ledger reversal, Klaviyo sync and promo/campaign rollback are non-blocking. Failures append to `RefundProcessed.data.reversalIssues[]` but the user/draw updates are committed.

## Stripe API quirks

### F1. Don't `expand: ['latest_payment_intent']` on Invoices

On API `2025-05-28.basil`, this returns `This property cannot be expanded`. Use `expand: ['payment_intent']` instead. The invoice JSON may still surface `latest_payment_intent` as an id; retrieve the PI separately if needed.

### F2. Don't pass payment method by reference assumption

`invoice.default_payment_method` can be a **string** (PM id) OR an **object** (expanded). Always handle both:

```ts
const paymentMethodId = typeof invoice.default_payment_method === "string"
  ? invoice.default_payment_method
  : invoice.default_payment_method?.id;
```

### F3. Pass `payment_method` explicitly to `invoices.pay()`

Don't rely on Stripe's defaults — explicitly pass the payment method id:

```ts
stripe.invoices.pay(invoiceId, {
  payment_method: paymentMethodId,
}, { idempotencyKey: `admin-charge-${invoiceId}` });
```

Without it, certain flows fail to actually attempt the charge.

## Logging

### R11. Sanitise Stripe responses before persisting

When writing `InvoiceChargeLog.result`, strip:
- Card details (PAN, full last4 if it's PCI-sensitive context)
- Full payment method objects with card data

Keep: error codes, status, amounts, timestamps, ids.

### R12. `console.error` only

Production builds strip `console.{log,info,debug,warn}` (`next.config.ts`). Use `console.error` for genuine errors that must survive, or route through `ErrorReport` (see [error-reporting](../error-reporting/)).
