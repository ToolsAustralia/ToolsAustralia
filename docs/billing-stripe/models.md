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

`packageType`: `"one-time" | "membership" | "upsell" | "mini-draw" | "shop"`. **This union is declared twice** — once on the `IPaymentEvent` TS interface and once as the Mongoose `enum` — and the two must be widened together. Widening only the interface leaves `tsc` green and throws a Mongoose `ValidationError` at `save()`; widening only the enum leaves `tsc` rejecting the write. Neither half fails in a way the other one warns you about.

`"shop"` (merchandise orders, added 2026-08-17) is **declared but unused** — no code path writes a `PaymentEvent` with this `packageType` yet, so no such row exists. It is wired ahead of a grant gated on a trade-promotion permit variation. Note that revenue aggregations which enumerate package types explicitly (see [admin/backend.md](../admin/backend.md) — the `packageType ∈ {one-time, mini-draw, upsell}` renewal-exclusion query, `classifyRevenueBucket`) do **not** include `"shop"`; whoever lands the grant must decide how merchandise revenue buckets rather than assume it flows through.

Attribution fields (denormalized from Stripe metadata for ad-level aggregation):
- `attributionAdId: string | null` (indexed) — Facebook ad ID extracted from Stripe metadata
- `attributionAdsetId: string | null` (indexed) — Facebook ad set ID extracted from Stripe metadata
- `attributionCampaignId: string | null` (indexed) — Facebook campaign ID extracted from Stripe metadata

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
- `actor: "admin" | "member" | "system"` (indexed, default `"admin"`) — who initiated the row. Member self-serve recovery (Pay-Now / Force-Charge on a stranded invoice) writes `member` rows with no `adminId`.
- `adminId` (indexed, ref `User`) — who triggered; **required only when `actor === "admin"`** (member/system rows omit it). Readers tolerate absence (`adminLabel()` → "(unknown admin)").
- `status: "success" | "failed" | "skipped"`
- `errorCode` — generic Stripe error code (e.g. `card_declined`, `expired_card`)
- `declineCode` (optional, no index) — Stripe's specific decline reason from `error.decline_code` (e.g. `do_not_honor`, `insufficient_funds`, `lost_card`); complements the generic `errorCode`. `error.code` answers _what kind of failure_; `error.decline_code` answers _why the issuer specifically declined_ — both are persisted so admins can distinguish recoverable issues (insufficient funds → retry later) from permanent ones (lost/stolen card → stop retrying).
- `errorMessage`
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
- `{ customerEmail: 1 }` (sparse) — added 2026-05-07 to support the admin email-substring filter without a collection scan

**Deliberate non-decisions** (documented so a future change doesn't unwittingly add coupling):
- `userId` is not denormalized — captured `stripeCustomerId`/`customerEmail` are the keys; user resolution happens at read time so newly-signed-up users' historical blocks reflect the up-to-date verdict.
- `alreadyAllowlisted` is not denormalized — admins act on `AllowlistAction` rows, which would force cross-collection updates. Computed in the read path with a single `$in` lookup.
- Decline-code classification (fraud / permanent / recoverable) is not stored — kept as logic in `src/services/allowlist/declineCodes.ts` so changing the rules doesn't require a backfill.
- `rawOutcome` IS stored as `Mixed` — cheap insurance against Stripe surfacing fields we'll later want to filter on.

Writers:
- Webhook `payment_intent.payment_failed` branch — best-effort; also calls `AllowlistService.apply()`.
- Webhook `charge.failed` branch (added 2026-05-07) — covers issuer-blocked subscription renewals where the PI event sometimes does not fire. Write-side only; does NOT call `AllowlistService.apply()` (avoids double-recording).
- Backfill: [scripts/backfill-blocked-transactions.ts](../../scripts/backfill-blocked-transactions.ts) — uses Stripe Search API (`status:"failed"` query). Idempotent on `_id`.
- Reconcile cron (self-healing): [src/app/api/cron/reconcile-blocked-transactions/route.ts](../../src/app/api/cron/reconcile-blocked-transactions/route.ts) — daily, 48h window, upserts any rows the live path missed.

Both write paths share `buildBlockedTransactionRecord()` from [src/services/allowlist/blockedTransactionRepo.ts](../../src/services/allowlist/blockedTransactionRepo.ts) so live and historical rows are byte-identical.
