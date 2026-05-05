# Billing-Stripe — Models

5 collections own this domain's state.

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

**Source-of-truth principle:** `AllowlistAction` is a **decision log**, not a mirror of Stripe's `card_fingerprint_allowlist` Radar value list. Stripe is authoritative for what's currently in the allowlist; this collection records *why and when* we made each call. A row with `action: "added"` does not guarantee the fingerprint is still in Stripe's list — admins or other operators may have removed it via the Stripe dashboard.

## `BlockedTransaction`

[src/models/BlockedTransaction.ts](../../src/models/BlockedTransaction.ts) — captured copy of every Stripe `payment_intent.payment_failed` event whose charge has `outcome.type === "blocked"` (collection: `blockedtransactions`). Predicate intentionally matches the Stripe Dashboard's "Blocked" status pill — normal issuer declines (`network_status === "declined_by_network"` with `outcome.type === "issuer_declined"`) are **not** captured because they aren't candidates for the auto-allowlist mechanism.

Exists so the admin `/admin/blocked-transactions` page can read from Mongo instead of paginating Stripe at request time. Webhook captures new rows; [scripts/backfill-blocked-transactions.ts](../../scripts/backfill-blocked-transactions.ts) handles historical data.

Schema:

| Field | Type | Notes |
|---|---|---|
| `_id` | `string` (required) | Equals `paymentIntentId` — natural idempotency key for Stripe webhook retries |
| `paymentIntentId` | `string` (required) | Same value as `_id`; kept as field for query clarity |
| `chargeId` | `string` (required) | Stripe charge id |
| `cardFingerprint` | `string` (required) | Stripe card fingerprint — admin lookup key |
| `cardLast4` | `string` | For admin display |
| `cardBrand` | `string` | For admin display |
| `stripeCustomerId` | `string \| null` | Captured raw — user resolution happens at read time, not denormalized |
| `customerEmail` | `string \| null` | `pi.receipt_email` then `charge.billing_details.email` |
| `declineCode` | `string \| null` | Raw — fraud/permanent/recoverable classification deliberately at read time |
| `failureCode` | `string \| null` | Raw `last_payment_error.code` |
| `outcomeType` | `string \| null` | `charge.outcome.type` |
| `outcomeNetworkStatus` | `string \| null` | `charge.outcome.network_status` |
| `outcomeReason` | `string \| null` | `charge.outcome.reason` |
| `amount` | `number` (required) | Subunits |
| `currency` | `string` (required) | ISO code |
| `rawOutcome` | `Mixed` | Full `charge.outcome` object snapshotted for forensics |
| `createdAt` | `Date` (required) | PI created time, NOT row insertion time |
| `capturedAt` | `Date` | When we wrote the row; bumped on each upsert |

Indexes:
- `{ createdAt: -1 }` — primary admin query (date range + sort)
- `{ cardFingerprint: 1 }` — by-card lookup
- `{ stripeCustomerId: 1, createdAt: -1 }` — by-customer history
- `{ declineCode: 1, createdAt: -1 }` — decline-reason filter

**Deliberate non-decisions** (documented so a future change doesn't unwittingly add coupling):
- `userId` is not denormalized — captured `stripeCustomerId`/`customerEmail` are the keys; user resolution happens at read time so newly-signed-up users' historical blocks reflect the up-to-date verdict.
- `alreadyAllowlisted` is not denormalized — admins act on `AllowlistAction` rows, which would force cross-collection updates. Computed in the read path with a single `$in` lookup.
- Decline-code classification (fraud / permanent / recoverable) is not stored — kept as logic in `src/services/allowlist/declineCodes.ts` so changing the rules doesn't require a backfill.
- `rawOutcome` IS stored as `Mixed` — cheap insurance against Stripe surfacing fields we'll later want to filter on.

Writers:
- Webhook: [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts) `payment_intent.payment_failed` branch — best-effort, wrapped in its own try/catch so a Mongo write failure does not block the allowlist evaluation that follows it.
- Backfill: [scripts/backfill-blocked-transactions.ts](../../scripts/backfill-blocked-transactions.ts) — uses Stripe Search API (`status:"failed"` query) for efficiency. Idempotent on `_id`.

Both write paths share `buildBlockedTransactionRecord()` from [src/services/allowlist/blockedTransactionRepo.ts](../../src/services/allowlist/blockedTransactionRepo.ts) so live and historical rows are byte-identical.
