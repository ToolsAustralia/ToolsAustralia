# Billing-Stripe — Models

3 collections own this domain's state.

## `PaymentEvent`

[src/models/PaymentEvent.ts](../../src/models/PaymentEvent.ts) — append-only ledger of every billing-relevant event.

Key types written:
- `BenefitsGranted` — successful payment with `data.grants` ledger
- `RefundProcessed` — full refund with reverse-grants summary
- `RefundPartial` — partial refund (`status: "partial-skipped"`)
- _TODO: enumerate the full type enum_

Idempotency: each row's natural key is `${type}-${paymentIntentId}` (e.g. `BenefitsGranted-invoice_in_xxx`). Webhook retries find the existing row and bail.

> _TODO: pull the full schema (fields, indexes, types) from the source file in a refresh pass._

## `ProcessedStripeEvent`

[src/models/ProcessedStripeEvent.ts](../../src/models/ProcessedStripeEvent.ts) — webhook dedupe lock.

Schema (essential fields):
- `eventId: string` (Stripe `evt_xxx`, **unique**)
- `eventType: string`
- `processedAt: Date`

Webhook handler pattern:
```ts
const seen = await ProcessedStripeEvent.findOne({ eventId: event.id });
if (seen) return new Response("ok", { status: 200 });

// ... do the work ...

await ProcessedStripeEvent.create({ eventId: event.id, eventType: event.type });
return new Response("ok", { status: 200 });
```

> _TODO: verify exact field set; confirm whether there's a TTL index for cleanup of old events._

## `InvoiceChargeLog`

[src/models/InvoiceChargeLog.ts](../../src/models/InvoiceChargeLog.ts) — audit trail for past-due charge attempts.

Key fields:
- `invoiceId` (indexed)
- `customerId` (indexed)
- `userId` (indexed, ref `User`)
- `adminId` (indexed, ref `User`) — who triggered
- `status: "success" | "failed" | "skipped"`
- `errorCode`, `errorMessage`
- `amount` (cents)
- `attemptedAt` (indexed)
- `canRetryAt` (indexed)
- `nextPaymentAttempt` — Stripe's scheduled retry, for admin visibility
- `result` — sanitised Stripe response (no PAN, no full PM objects)

Indexes:
- Compound **unique** on `(invoiceId, attemptedAt-day)` — DB-level idempotency
- Compound on `(customerId, attemptedAt)` — customer history reads
- Compound on `(adminId, attemptedAt)` — admin audit
- Compound on `(status, attemptedAt)` — analytics dashboards
- `canRetryAt` — retry-eligibility scans

Used by:
- `chargePastDueShared.ts` — write success/failure/skip rows
- Admin dashboard queries — show recent attempts per user/admin
