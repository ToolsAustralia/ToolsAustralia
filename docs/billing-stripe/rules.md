# Billing-Stripe — Rules

## Webhook

### R1. Always dedupe via `ProcessedStripeEvent`

Stripe retries webhook deliveries. Every handler must check `ProcessedStripeEvent.findOne({ eventId: event.id })` before doing work, and write a row before returning 200. Without this, a single failed renewal can be processed twice — double `MembershipStatusHistory` rows, double partner-discount-queue updates, etc.

### R2. The webhook is the only emitter of cancellation tracking events

Klaviyo `Subscription Cancelled` fires **only** from `customer.subscription.deleted`. API paths write the local `MembershipStatusHistory` row but must not emit a second `Subscription Cancelled`. Otherwise dual-emission on every cancel.

**There is no Meta CAPI cancellation event** — this rule used to name one; `src/lib/facebook.ts` has never carried a cancellation emitter, and `handleSubscriptionDeleted` calls only `klaviyo.trackEventBackground`. Corrected 2026-08-26.

**Scope:** the ban is on duplicating `Subscription Cancelled`, not on every cancel-time emit. A differently-named cancel-time event from the service path is a different signal to a different flow.

**Named carve-out (2026-08-26): `Subscription Cancellation Requested`.** Emitted from `cancelSubscription()` when `isMemberChurn === true` (only `/api/stripe/cancel-subscription` passes it), fire-and-forget, after `await user.save()`. It is the win-back flow's trigger and is **allowed** — `Subscription Cancelled` fires only when Stripe deletes the subscription, up to a month later on a cancel-at-period-end cancel, so it is useless as a win-back trigger. Full property table in [tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md#subscription-cancellation-requested-2026-08-26).

Name any **further** such event as an explicit carve-out here and in the two other copies of this rule ([subscription/rules.md](../subscription/rules.md#r4-cancellation-analytics-events-come-from-the-webhook-only), [tracking/rules.md](../tracking/rules.md)) in the same edit.

### R3. Resume pause-collection BEFORE applying benefits — but only if it IS paused

In `invoice.payment_succeeded`, call `resumeAfterSuccessfulRenewalPayment(subId)` before `processPaymentBenefits()`. A slow benefits path or proxy timeout must not leave `pause_collection` orphaned. See [subscription/rules.md R9](../subscription/rules.md#r9-after-successful-renewal-payment-clear-pause_collection-before-applying-benefits).

**Gate it on `subscription.pause_collection != null`** (`decideClearPause` does this since 2026-08-24). Clearing a pause that was never set is a Stripe no-op, and it was costing one `/v1/subscriptions` **write** on every renewal against a 25 req/sec per-endpoint cap. Ordering is unchanged for members who really are paused.

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

### F4. Read the payload you were handed — don't re-retrieve it

Before adding a `retrieve` to a webhook handler, check whether the event (or the expanded object you
already fetched) carries what you need. Stripe's caps are **100 req/sec account-wide and 25 req/sec
per endpoint**, so a needless call costs a slot in a shared bucket that only runs out on the busiest
minute of the month. Two concrete traps, both of which shipped:

- **The metadata snapshot is already on the invoice.** `parent.subscription_details.metadata` and each
  line's `metadata` carry the subscription's metadata, on **draft** invoices included (verified over
  190 production `invoice.created` payloads). No `subscriptions.retrieve` needed to read `packageName`.
- **Basil moved the subscription pointer.** The top-level `invoice.subscription` is **gone** —
  stripe@18.5.0's `Invoice` interface does not declare it. A `if (invoice.subscription)` shortcut
  therefore never fires and silently falls through to the expensive branch, forever. Read
  `parent.subscription_details.subscription` (via `resolveInvoiceSubscriptionId` /
  `resolveExpandedInvoiceSubscription`), and never let a compiled-away optional field be the thing
  standing between you and an API call.

Also gate every *write*: `pause_collection: ""` on an unpaused subscription, or any update whose new
value equals the current one, is a full request for nothing. See
[gotchas.md → One renewal cost 10 Stripe API calls](./gotchas.md#one-renewal-cost-10-stripe-api-calls--three-were-pure-waste-2026-08-24).

## The Stripe singleton

### R13. Never wrap the `stripe` singleton in a `Proxy`

`src/lib/stripe.ts` exports one client and ~83 server modules import it, so anything wrapping it
must be perfectly transparent. A `Proxy` is not: an `async` `get` trap strips `ApiListPromise`'s
async-iterator (breaking the three `for await` call sites that use the singleton) and turns the
**synchronous** `stripe.webhooks.constructEvent` into a Promise, which silently disables the whole
webhook dispatcher. If you need to intercept Stripe calls, do it via the `httpClient` config option —
the SDK calls exactly `getClientName()` and `makeRequest()` on it and already awaits the latter.
Evidence and the measured probe: [gotchas](./gotchas.md#dont-wrap-the-stripe-singleton-in-a-proxy--it-breaks-for-await-and-constructevent-2026-08-24).

### R14. Don't rely on `maxNetworkRetries` for 429s

`maxNetworkRetries: 2` (`src/lib/stripe.ts`) covers connection errors and a narrow set of status
codes. `RequestSender._shouldRetry` (`node_modules/stripe/cjs/RequestSender.js:138`) has **no
branch on status 429** — it retries connection errors, 409 and ≥500. It *does* honour a
`stripe-should-retry: true` response header, which Stripe may send on a rate-limit response, but
that is Stripe's choice rather than ours, so it is not something to design against. Staying under
the cap is the client's job, which is what
[`stripe-rate-limiter.ts`](../../src/lib/stripe-rate-limiter.ts) does — for calls that go through
the singleton, on the paths it actually meters. Read
[architecture](./architecture.md#what-it-meters--and-what-it-does-not) before citing it as
account-level protection: it is **per lambda instance**, and it barely engages on the inbound
webhook path.

### R15. New Stripe calls go through the singleton — don't `new Stripe(...)` in app code

`src/app/api/**` must import `{ stripe } from "@/lib/stripe"`. An ad-hoc client silently opts out
of the rate limiter and of any future singleton-level config. `cancel-incomplete-subscription`
was the last route doing this and was migrated on 2026-08-24. Ops scripts under `scripts/` that
build their own client are tolerated (they run by hand via tsx, never in a lambda, so they cannot
multiply across instances) but are listed in
[architecture](./architecture.md#coverage-what-is-not-behind-the-limiter) so the gap stays visible.

## Logging

### R11. Sanitise Stripe responses before persisting

When writing `InvoiceChargeLog.result`, strip:
- Card details (PAN, full last4 if it's PCI-sensitive context)
- Full payment method objects with card data

Keep: error codes, status, amounts, timestamps, ids.

### R12. `console.error` only

Production builds strip `console.{log,info,debug,warn}` (`next.config.ts`). Use `console.error` for genuine errors that must survive, or route through `ErrorReport` (see [error-reporting](../error-reporting/)).
