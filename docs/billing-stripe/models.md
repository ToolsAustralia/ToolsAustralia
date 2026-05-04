# Billing-Stripe — Models

4 collections own this domain's state.

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

## `AllowlistAction`

[src/models/AllowlistAction.ts](../../src/models/AllowlistAction.ts) — append-only **decision log** for the Stripe card-fingerprint allowlist (collection: `allowlistactions`).

Schema:

| Field | Type | Notes |
|---|---|---|
| `cardFingerprint` | `string` (required) | Stripe card fingerprint — primary lookup key |
| `cardLast4` | `string` (required) | For admin display |
| `cardBrand` | `string` (required) | For admin display |
| `stripeCustomerId` | `string \| null` | Customer the failed PI belonged to |
| `userId` | `ObjectId<User> \| null` | Resolved User; null when no User found |
| `customerEmail` | `string \| null` | Snapshotted at decision time |
| `action` | `"added" \| "skipped" \| "removed"` | Required enum — what the service did |
| `reason` | enum (required) | `auto_eligible \| manual_admin \| manual_admin_override \| filter_not_member \| filter_fraud_signal \| filter_permanent_issue \| manual_reversal` |
| `declineCode` | `string \| null` | Stripe decline_code from the triggering charge |
| `failureCode` | `string \| null` | Stripe failure_code from the PI |
| `triggeringPaymentIntentId` | `string \| null` | The PI whose failure triggered the decision |
| `triggeringChargeId` | `string \| null` | The corresponding charge |
| `stripeListItemId` | `string \| null` | Returned by `radar.valueListItems.create` — used for later removal |
| `source` | `"webhook" \| "admin_bulk" \| "admin_reversal"` | Required enum — caller |
| `performedByUserId` | `ObjectId<User> \| null` | Admin who clicked the button (null for webhook) |
| `createdAt` | `Date` | `default: Date.now`; `timestamps` disabled |

Indexes:
- `{ cardFingerprint: 1, action: 1, createdAt: -1 }` — fast lookup of "is this fingerprint currently allowlisted by us?" (most-recent `added` row per fingerprint)
- `{ stripeCustomerId: 1, createdAt: -1 }` — for surfacing recent decisions on a user-detail admin page
- `{ action: 1, createdAt: -1 }` — supports admin "show only skipped" / "show only added" filter

**Source-of-truth principle:** `AllowlistAction` is a **decision log**, not a mirror of Stripe's `allow_card_fingerprint` Radar value list. Stripe is authoritative for what's currently in the allowlist; this collection records *why and when* we made each call. A row with `action: "added"` does not guarantee the fingerprint is still in Stripe's list — admins or other operators may have removed it via the Stripe dashboard.
