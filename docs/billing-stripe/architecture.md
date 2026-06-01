# Billing-Stripe — Architecture

## Position in the stack

This domain is the **Stripe boundary layer**. It owns:
- The Stripe SDK clients (`lib/stripe.ts` server, `lib/stripe-client.ts` browser).
- The webhook receiver — single ingestion point for all Stripe events.
- The `PaymentEvent` ledger — append-only event log of every billing-relevant action.
- The `/api/stripe/**` and `/api/invoice/**` route handlers (~25 routes) that wrap Stripe API calls.

Other domains (subscription, payment, rewards) consume this layer's helpers and read the ledger; they don't talk to Stripe directly.

## Webhook flow

```
Stripe → POST /api/stripe/webhook
                  │
                  ▼
        verify signature
                  │
                  ▼
   ProcessedStripeEvent.findOne(eventId) ──► dedupe (return 200 if seen)
                  │
                  ▼
        switch (event.type)
        ├── customer.subscription.created       → write User.subscription, write MembershipStatusHistory active/trialing
        ├── customer.subscription.updated       → reconcile Mongo state with Stripe; write MembershipStatusHistory active/trialing on non-active→active recovery
        ├── customer.subscription.deleted       → fire cancellation analytics events (single source!)
        ├── invoice.payment_succeeded           → resumeAfterSuccessfulRenewalPayment, processPaymentBenefits, write PaymentEvent BenefitsGranted; on past_due/unpaid recovery: reanchorAfterPastDueRecovery (trial_end, proration_behavior:'none') + Klaviyo re-push
        ├── invoice.payment_failed              → pauseAfterRenewalFailure, write MembershipStatusHistory past_due
        ├── invoice.finalized                   → ensure MembershipRenewalCycle row exists
        ├── charge.failed                       → upsert BlockedTransaction (issuer-blocked dual-write; no allowlist apply here)
        ├── charge.refunded                     → processRefundReversal (full) or write RefundPartial (partial)
        ├── charge.dispute.closed (lost)        → reverse benefits (treat as full refund)
        └── charge.dispute.funds_withdrawn      → reverse benefits (provisional)
                  │
                  ▼
        ProcessedStripeEvent.create(eventId) ──► commit dedupe lock
                  │
                  ▼
        return 200
```

Implementation: [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts).

## Ledger model — `PaymentEvent`

Every billing action becomes a row in `PaymentEvent` with one of these `type`s:

| `type` | Written when | Holds in `data` |
|---|---|---|
| `BenefitsGranted` | Successful payment for membership / one-time / mini-draw | `grants` ledger (entries, packageId, lastMonthDelta, rewardsPoints, milestoneIds, promoIds...) |
| `RefundProcessed` | Full refund completed AND benefits reversed | reverse-grants summary, `reversalIssues[]` for any non-blocking failures |
| `RefundPartial` | Partial refund detected (no reversal performed) | `status: "partial-skipped"` for admin visibility |
| _(others)_ | _TODO: enumerate full type set in next refresh_ |

The ledger is the **single source of truth** for "what benefits were granted." Refunds replay the ledger backward — see [rules](./rules.md#ledger-symmetry).

## Refund reversal architecture

(Migrated from former `docs/REFUND_REVERSAL.md`.)

### Principle

**Ledger symmetry:** every side effect of a successful payment is recorded on the `BenefitsGranted` `PaymentEvent` (`data.grants`). A full refund replays that ledger **backward** (`reverseLedgerBenefits` → `RefundProcessed`), so we don't re-derive benefits from package type alone.

### Code paths

| Step | Location |
|---|---|
| Grant | [src/utils/payment/payment-processing.ts](../../src/utils/payment/payment-processing.ts) — `grantBenefits` / `processPaymentBenefits` updates `data.grants` |
| Reverse | [src/utils/payment/refund-processing.ts](../../src/utils/payment/refund-processing.ts) — `processRefundReversal` |
| Ledger replay | [src/utils/payment/refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts) — `reverseLedgerBenefits` orchestrates `src/utils/payment/reversers/` |
| Webhook | [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts) — `charge.refunded`, `charge.dispute.closed` (lost), `charge.dispute.funds_withdrawn` |
| Admin replay | `POST /api/admin/users/[id]/payment-events/[eventId]/reverse` → `replayRefundReversalForBenefitsGrantedEvent` |

### Invariants

1. **Full refund only** reverses benefits. Partial refunds → `RefundPartial` row with `status: "partial-skipped"` (admin-visible).
2. **`RefundProcessed-<paymentIntentId>`** (same key as `BenefitsGranted`, e.g. `invoice_in_…` for subscriptions) is the idempotency lock.
3. **`rewardsPoints`** are always decremented from the ledger when present.
4. **`subscription.lastMonthAccumulatedEntries`** atomic `$inc` by `-grants.lastMonthDelta`, `$max` 0, then `$unset` when no non-refunded membership `BenefitsGranted` remain (`countNonRefundedMembershipGrants`).
5. **Promo / campaign / milestone** rollback failures append to `RefundProcessed.data.reversalIssues` — they don't block core user/draw updates.

### Klaviyo

After DB writes + 500ms barrier, `trackRefundedOrder` and `ensureUserProfileSynced` run; failures → `reversalIssues` entry `klaviyo-sync`.

## Upgrade entries — Mode A / Mode B

The `invoice.payment_succeeded` handler ([src/services/stripe-webhook-handlers/index.ts](../../src/services/stripe-webhook-handlers/index.ts) — `handleInvoicePaymentSucceeded`) routes upgrade events to one of two entry-calculation modes:

```
isUpgrade branch (handleInvoicePaymentSucceeded)
        │
        ▼
hasGrantThisDraw = await hasMembershipGrantInCurrentDrawPeriod(user._id)
        │
        ▼
calculateSubscriptionEntries({ ..., hasMembershipGrantInCurrentDrawPeriod: hasGrantThisDraw })
        │
        ├── false → Mode A: grant = lastAccum + (newBase × promo); newAccum = grant   ← default
        └── true  → Mode B: grant = newBase × promo;               newAccum = lastAccum + grant
```

`hasMembershipGrantInCurrentDrawPeriod` is the helper from the [draws](../draws/) domain at [src/utils/draws/has-membership-grant-this-draw.ts](../../src/utils/draws/has-membership-grant-this-draw.ts) — it checks `entriesBySource.membership` on the user's row in the active `MajorDraw`. The helper fails open to `false` (Mode A). The flag is also serialised into the structured `webhookLog` payload (`hasMembershipGrantInCurrentDrawPeriod`) and emitted as a focused `🎯 UPGRADE MODE: A / B` log line inside the `isUpgrade` branch for staging diagnostics.

Full math and worked examples live in [subscription/backend.md](../subscription/backend.md#entry-calculation-dispatcher--calculatesubscriptionentries). Tests: `npm run test:subscription-entries-calculator`.

## Anchor billing — 24th of month

(Detail in [subscription/architecture.md](../subscription/architecture.md#anchor-billing-day) and [subscription/rules.md](../subscription/rules.md#billing-anchor-24th).)

The helper `getSubscriptionCreateParamsForAnchor(joinDate)` lives in [src/utils/billing/anchor-billing.ts](../../src/utils/billing/anchor-billing.ts) and is consumed by:
- `/api/stripe/create-subscription/route.ts`
- `/api/stripe/create-subscription-existing-user/route.ts`
- `/api/stripe/renew-subscription/route.ts`

Migration script: `scripts/migrate-anchor-billing-24.ts` (`npm run migrate:anchor-billing-24:dry` for dry-run).

### Past-due reanchor — second anchor-move trigger

There is now a **second** trigger that moves the billing anchor: past-due recovery. When a `past_due`/`unpaid` subscription recovers (any of the five channels), `handleInvoicePaymentSucceeded` calls `reanchorAfterPastDueRecovery` to move future renewals to the recovery-payment date (AEST), clamping 25/26/27 → 24.

Mechanism: `stripe.subscriptions.update(id, { trial_end, proration_behavior: 'none' })` — **not** `billing_cycle_anchor`. `trial_end` is future-floored (a non-future value aborts the reanchor non-fatally rather than charging immediately).

Helpers in `src/utils/billing/anchor-billing.ts`: `clampReanchorDay`, `daysInMonthUTC`, `getReanchorTrialEndTimestamp`, `BILLING_ANCHOR_RULE_VERSION` (bumped to 2).

See [docs/PAST_DUE_REANCHOR.md](../PAST_DUE_REANCHOR.md) for the full rule, trigger gate, idempotency semantics, and pre-ship verification checklist.

## Service inventory — `AllowlistService`

[src/services/allowlist/AllowlistService.ts](../../src/services/allowlist/AllowlistService.ts) gates **auto-allowlisting** of cards that Stripe has issuer-directed-blocked, and exposes the bulk admin operations (apply / reverse / read) backing `/admin/blocked-transactions`.

**Three callers:**
1. **Webhook** — the `payment_intent.payment_failed` branch in [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts) calls `service.evaluateAndApply()` best-effort when the failed PI's charge looks blocked (see [gotchas](./gotchas.md#stripe-issuer-directed-auto-block--allowlist-override)).
2. **Admin bulk page** — `/admin/blocked-transactions` lists candidates and POSTs the selected rows to `/api/admin/allowlist/apply` (`source: "admin_bulk"`). Each row also has a per-row "Allowlist" button that calls the same endpoint with a single-row payload.
3. **Admin reverse button** — same page; `POST /api/admin/allowlist/reverse` removes a previously-allowlisted fingerprint.

**Constructor DI** — `{ repo: AllowlistRepository, stripeRadar: Stripe["radar"] }`. The singleton at [src/services/allowlist/index.ts](../../src/services/allowlist/index.ts) wires `stripe.radar` + `MongoAllowlistRepository`; tests inject fakes.

**Filter rule** — never auto-allowlist if the decline_code ∈ `{lost_card, stolen_card, pickup_card, fraudulent}` (real fraud signals), or ∈ `{expired_card, incorrect_cvc, invalid_account, invalid_number, invalid_expiry_year, invalid_expiry_month}` (permanent / customer-action-required issues), or no User can be resolved from the customer, or the user has zero successful `PaymentEvent` rows. Skip reasons recorded as `filter_fraud_signal`, `filter_permanent_issue`, or `filter_not_member` respectively. Admin override is available via the bulk page button.

**Source-of-truth split** — Stripe's `card_fingerprint_allowlist` Radar value list **is** the live allowlist; our `AllowlistAction` collection is the audit log of decisions (added / skipped / removed) and is never assumed to mirror Stripe's value-list state.

**Webhook dual-write for blocked PIs** — alongside the allowlist eligibility check, the `payment_intent.payment_failed` branch also persists the blocked PI to the [BlockedTransaction](./models.md#blockedtransaction) collection via `upsertBlockedTransaction()` from [src/services/allowlist/blockedTransactionRepo.ts](../../src/services/allowlist/blockedTransactionRepo.ts). Both writes are best-effort and wrapped in *independent* try/catch blocks so a failure in one cannot block the other. The persisted rows back the admin `/admin/blocked-transactions` page (see [`listBlocked`](#listblocked-mongo-backed-read-path) below). The shared `buildBlockedTransactionRecord()` projector is reused by [scripts/backfill-blocked-transactions.ts](../../scripts/backfill-blocked-transactions.ts) so historical and live rows have identical shape.

Capture also runs from `charge.failed` — the universal "any failed charge" event — to cover issuer-blocked subscription renewals where `payment_intent.payment_failed` is sometimes not emitted. The `charge.failed` branch only writes the `BlockedTransaction` row; `AllowlistService.apply()` stays on `payment_intent.payment_failed` so we never double-record `AllowlistAction` rows.

### `listBlocked` — Mongo-backed read path

The admin page's read path. Cursor-paged query over the `blockedtransactions` collection populated by Phase A (webhook) and Phase B (backfill). Phase E removed the legacy `listBlockedFromStripe` request-time Stripe pagination — `listBlocked` is now the only read path.

**Signature:** `listBlocked(filter: BlockedFilter, opts?: { cursor?: string | null; limit?: number }): Promise<BlockedPageResult>` — returns `{ rows, nextCursor, total }`. `limit` is clamped 1–100 (default 50).

**Query shape (per page):**
1. **Parallel:** `BlockedTransaction.countDocuments(filter)` + `BlockedTransaction.find(filter + cursor predicate).sort({createdAt:-1, _id:-1}).limit(N)`.
2. **Serial:** `User.find({ $or: [stripeCustomerId $in, email $in] })` — gates the paid-user check that needs user IDs.
3. **Parallel:** `AllowlistAction.find({ cardFingerprint: $in, action: "added" })` + `PaymentEvent.distinct("userId", { userId: $in, eventType: $in SUCCEEDED_EVENT_TYPES })`.

Per-page cost is bounded — independent of the date-window size.

**Pagination.** Stable on `(createdAt DESC, _id DESC)`. Cursor is base64 JSON `{c: ISO, i: _id}` via the exported `encodeCursor` / `decodeCursor` helpers; malformed cursors decode to `null` (silently treated as page 1).

**Verdict logic.** Extracted as the pure top-level helper `computeEligibility(doc, maps: EligibilityMaps)` — same branch order as `evaluate` (fraud signal → permanent issue → user lookup → has-paid) but driven by pre-fetched maps, not new DB queries. Exported alongside the `EligibilityMaps` type so unit tests can exercise verdicts without Mongo.

**Filter handling.** `email` is pushed into the Mongo query as a case-insensitive `$regex` against `customerEmail` (specials escaped); the `customerEmail` sparse index keeps this bounded. `declineCodes` is pushed as `$in`. `eligibility` is applied **post-join** via `computeEligibilityKind` ([src/utils/admin/blockedTransactionEligibility.ts](../../src/utils/admin/blockedTransactionEligibility.ts)) — the same mapper the UI badge uses, so they cannot disagree. `nextCursor` encodes the last *raw* doc on the page, not the last filtered row, so pagination advances even when the post-join filter drops every row on a page. Each row also exposes a resolved `userId` for the matched User (or `null` for guest / unmatched), so the admin UI can pass it straight to `ClickableUserDisplay`.

**Caveat — duplicated `SUCCEEDED_EVENT_TYPES`.** The list (`PaymentProcessed`, `BenefitsGranted`, `SubscriptionActivated`) is re-declared at the top of `AllowlistService.ts` so the batched `PaymentEvent.distinct` matches `MongoAllowlistRepository.userHasSucceededPayment` semantics. Keep both in lockstep until extracted (TODO marker in code).

### Reconciliation cron — Phase D

[src/app/api/cron/reconcile-blocked-transactions/route.ts](../../src/app/api/cron/reconcile-blocked-transactions/route.ts) is the daily safety net that detects drift between the `BlockedTransaction` Mongo collection and Stripe's blocked-PI universe.

**What it does.** Once per UTC day, against the **last 48 hours** (widened from yesterday-only to handle late-arriving events + DST edge cases):
1. Counts `BlockedTransaction` documents with `createdAt` inside the window.
2. Iterates `stripe.charges.search({ query: "status:\"failed\" AND created>${from} AND created<${to}" })` with `data.payment_intent` expanded; collects charges where `outcome.type === "blocked"`.
3. **Self-heals**: for every blocked charge whose PI is missing in Mongo, calls `upsertBlockedTransaction()` — same projector as the live webhook. Drift is no longer just an alert; the cron patches the gap so the admin page is correct by the next morning.
4. Computes drift via the exported `computeDriftRatio(mongoCount, stripeCount)` helper.
5. If drift > 5% **or** any rows were recovered, logs a `console.error` with the structured summary (window / counts / ratio / `recovered` / `recoverErrors` / durationMs). Otherwise logs a `console.log` "OK" line.

**Schedule.** `15 3 * * *` (03:15 UTC daily) — registered in `vercel.json`. Offset from the existing 03:00 UTC `ab-testing-aggregate-metrics` cron to avoid simultaneous Stripe API contention and easier log triage.

**Where it logs.** `console.error` for drift alerts, `console.log` for OK runs. Production builds strip `console.log/info/debug/warn` (`next.config.ts` `compiler.removeConsole`) so the OK rows are dev-only; only the drift alerts survive into production logs.

**Why `console.error`, not `ErrorReport`.** `ErrorReport` is for user-submitted toast errors (a different abstraction). System-monitoring drift uses console.error, which Vercel's log drains pick up.

**Unit-tested helper.** `computeDriftRatio` is exported and covered by `npm run test:reconcile-drift` ([src/app/api/cron/reconcile-blocked-transactions/__tests__/computeDriftRatio.test.ts](../../src/app/api/cron/reconcile-blocked-transactions/__tests__/computeDriftRatio.test.ts)) — both-zero, perfect-match, mongo-only, stripe-only, ±20% drift, and 100% drift cases.
