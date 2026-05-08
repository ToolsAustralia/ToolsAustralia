# Billing-Stripe — Patterns

## P1. Webhook switch-on-type with named handlers

The webhook's top-level `switch (event.type)` dispatches to a named function per event type — never inline logic. Keeps the router readable; lets each handler have its own test surface.

## P2. Single-source-of-truth ledger

Instead of re-computing what a payment granted at refund time, **record it at grant time**. The `data.grants` field on `BenefitsGranted` is the contract — any new grant type extends `IPaymentGrantLedger` and gets a matching reverser.

When adding a new grant:
1. Extend `IPaymentGrantLedger` ([src/types/payment-ledger.ts](../../src/types/payment-ledger.ts)).
2. Record the grant in `payment-processing.ts` when applying.
3. Add a reverser step in `refund-ledger-reversal.ts`'s `buildLedgerReversalSteps` (or a new `PaymentReverser` module).
4. Document the invariant in [rules.md](./rules.md).

## P3. Stable idempotency keys derived from the resource

Pattern: `${operation-name}-${stable-resource-id}`. Examples used in this codebase:
- `admin-charge-${invoiceId}`
- `cancel-subscription-${subscriptionId}`
- `subscription-create-${userId}-${packageId}`

Never include time, retry counter, or random data.

## P4. Stripe error classification at the call site

Wrap every Stripe SDK call with a thin classifier that returns one of:
- `ok` — subscription/invoice/etc. retrieved
- `is404` — `code === "resource_missing"` or `statusCode === 404`
- `isRetryable` — `code === "rate_limit"`, `statusCode === 429`, `statusCode >= 500`
- `is4xx` — anything else 4xx

Then map to HTTP responses uniformly. The pattern is in `retrieveStripeSubscription()` ([subscription/SubscriptionReferenceService.ts:68-93](../../src/services/subscription/SubscriptionReferenceService.ts#L68-L93)) — apply to other Stripe calls.

## P5. Resume-before-benefits on success

The pattern is: the cleanup that *enables future success* runs before the work that *grants this success*. Specifically `resumeAfterSuccessfulRenewalPayment()` runs before `processPaymentBenefits()` so a benefits failure can't leave Stripe in a paused-collection state.

Generalise: side effects that affect future Stripe behaviour run first; side effects that affect our DB run after.

## P6. Sanitise-before-persist for audit logs

`InvoiceChargeLog.result` stores Stripe API responses. Strip:
- PCI-sensitive card data (PAN, full last4 in some contexts)
- Full PM objects

Keep error codes, ids, amounts, timestamps. Prevents PCI scope expansion of the Mongo collection.

## P7. Time-windowed idempotency via DB index

`InvoiceChargeLog`'s compound unique index `{ invoiceId, attemptedAt-day }` means the database itself rejects duplicate charge attempts within 24 hours. Belt-and-braces with the Stripe idempotency key.

## P8. Auto-correct stale references via webhook

When `invoice.paid` references a different (but manageable) subscription than the user's stored canonical, and the stored one is dead, **adopt the paid one**. See `shouldAdoptPaidSubscriptionOverStored()` ([subscription/SubscriptionReferenceService.ts:211-224](../../src/services/subscription/SubscriptionReferenceService.ts#L211-L224)). The webhook is the ideal place for this — Stripe just confirmed the paid sub is real.

## P9. Single shared service for user + admin paths

User-facing and admin-facing routes that perform the same operation must share a service. Examples:
- `cancelSubscription()` — user route + admin route
- `chargePastDueShared.ts` — single past-due retry + bulk job

The service accepts an `analytics` option (`actor: "user" | "admin"`, `adminUserId?`) so audit rows distinguish the path.

## P10. One-shot idempotency-retry on key collisions

Where a Stripe-mutating call uses a per-attempt UUID as the idempotency key (instead of a stable resource-derived key per [P3](#p3-stable-idempotency-keys-derived-from-the-resource)) and the request body includes any non-deterministic field (capi_*, attribution, IP), wrap the call so that on `StripeIdempotencyError` it:

1. Cancels the orphan incomplete resource on Stripe (matched by `customer + metadata.packageId` for subscriptions).
2. Retries once with a fresh `crypto.randomUUID()` idempotency key.

Reference implementation: [`createSubscriptionWithIdempotencyRetry`](../../src/utils/payment/stripe/createSubscriptionWithIdempotencyRetry.ts) — used by both `/api/stripe/create-subscription` and `/api/stripe/create-subscription-existing-user`. The retry is one-shot only — a second collision is rethrown so it surfaces in error reports rather than looping.

## Cursor agent boundary

The Cursor `.cursor/agents/stripe-billing.md` subagent owns this domain. Read its boundary description before non-trivial changes — the orchestrator rule (`.cursor/rules/orchestrator.mdc`) requires QA review for changes touching payments. Cursor-only; not invocable from Claude Code.
