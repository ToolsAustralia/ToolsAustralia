# Stripe Webhook Async Queue

## Overview

Stripe webhook events are received by a thin receiver at `/api/stripe/webhook` that returns 200 in <1s, then processed asynchronously **in-process** via `processQueuedEvent` scheduled on `after()`. Events buffer in the `stripewebhookqueue` Mongo collection. A 1-minute cron sweeper retries failed events with exponential backoff and recovers in-flight rows whose processing crashed before completing.

> **2026-05-15:** the separate `/api/stripe/process-event` HTTP worker route and the receiver→worker `fetch` self-call were **deleted**. Processing now runs in-process through `processQueuedEvent` (called from the receiver's `after()`, the sweeper, and admin Replay). Index DDL was also moved off the request path into the `migrate:ensure-core-indexes` migration. See `gotchas.md` (2026-05-15 504 storm) for the why.

This matches Stripe's documented webhook best practice: respond quickly, queue for async processing, retry idempotently, dead-letter permanent failures.

## Architecture

```
Stripe → POST /api/stripe/webhook  (receiver, maxDuration: 60s)
            │
            ├─ connectDB
            ├─ verify signature
            ├─ enqueueStripeEvent(event)       ← idempotent upsert by eventId
            ├─ after(() => processQueuedEvent(event.id))   ← in-process, post-response
            └─ return 200

         processQueuedEvent(eventId)  (in-process — no HTTP, no separate route)
            │
            ├─ claimNextAttempt(eventId)        ← atomic queued → processing
            ├─ ProcessedStripeEvent short-circuit → markSucceeded, skipped "already_processed"
            ├─ dispatchStripeEvent(payload)     ← runs the lifted handler
            ├─ ACK GATE: handlerFailed? → markFailed, NO ack   ← never bury an ungranted renewal
            ├─ ackProcessedStripeEventOnce(payload)  if handler flagged it
            ├─ markSucceeded on success
            └─ markFailed on error  → attempts++, backoff or dead

         /api/cron/process-stripe-webhook-queue  (sweeper, * * * * *, 300s)
            │
            ├─ Recover orphans: status="processing" AND claimedAt < now-5min
            └─ Promise.allSettled(dueRows.map(r => processQueuedEvent(r.eventId)))
               for status="queued" AND nextAttemptAt <= now  (bounded by SWEEP_BATCH_SIZE=20)

         POST /api/admin/stripe-webhook-queue  (admin Replay)
            └─ requeue row, then `const result = await processQueuedEvent(row.eventId)`
```

## Backoff schedule

| Attempts | Wait before retry |
|---|---|
| 0 → 1 | 1 minute |
| 1 → 2 | 5 minutes |
| 2 → 3 | 15 minutes |
| 3 → 4 | 1 hour |
| 4 → 5 | 6 hours |
| 5 → dead | — (status: dead) |

Total retry window ~7.5h.

**Retention.** Both terminal states use partial TTL indexes on `processedAt`:

| Status | TTL | Index name | Rationale |
|---|---|---|---|
| `succeeded` | 24 hours | `succeeded_processedAt_ttl` | Successful webhooks have no replay value — drop them quickly to keep the collection lean. |
| `dead` | 30 days | `dead_processedAt_ttl` | Matches Stripe's own event-payload retention. Anything not investigated/replayed within 30d is unreplayable from Stripe's side anyway; an alert on new dead rows should fire within hours, not weeks. |

`markSucceeded` and the dead-transition branch of `markFailed` both set `processedAt = new Date()` so the TTL anchor is populated.

Both TTL indexes share the key pattern `{ processedAt: 1 }` and rely on partial filters to separate them, so they **must** have distinct explicit names. Without names, Mongoose's auto-derived `processedAt_1` would collide and only one TTL would install.

### Rollout for TTL tuning

MongoDB treats `expireAfterSeconds` as **immutable per index**. `Mongoose.syncIndexes()` will not change the TTL of an existing index — it only creates new ones and drops orphans by name. If either TTL is later retuned:

1. Add the new desired value in [src/models/StripeWebhookQueue.ts](src/models/StripeWebhookQueue.ts) **and rename the index** (e.g. bump a version suffix). Renaming forces Mongoose to create a fresh index with the new TTL.
2. Drop the old index by name in each environment that already has it deployed: `db.stripewebhookqueue.dropIndex("succeeded_processedAt_ttl")` (or the dead variant). Without this, the old index lingers with the old TTL.
3. Post-deploy, verify with `db.stripewebhookqueue.getIndexes()` that the new index has the expected `expireAfterSeconds`.

### Backfilling `processedAt` on dead rows

Before commit `b28795a6`, `markFailed`'s dead transition did not set `processedAt`, so any dead rows that already exist in production have `processedAt: null`. MongoDB TTL skips null/missing values, so those rows would never expire. To anchor them so the 30-day TTL applies:

```bash
npm run backfill:webhook-queue-processed-at:dry   # count + sample
npm run backfill:webhook-queue-processed-at       # live: sets processedAt = updatedAt
```

The script is idempotent (filter is `{ status: "dead", processedAt: null }`); re-running once complete is a no-op.

## Four-layer dedup (no double-grant guarantee)

| # | Layer | Where |
|---|---|---|
| 1 | `stripewebhookqueue.eventId` unique index | At enqueue |
| 2 | `ProcessedStripeEvent` dedup | In `processQueuedEvent`, after claim, before dispatch |
| 3 | `claimNextAttempt` atomic findOneAndUpdate | At start of `processQueuedEvent` |
| 4 | `PaymentEvent` unique key `BenefitsGranted-invoice_<id>` | Inside handler |

Layer 4 is load-bearing. The replay-safety regression test (`npm run test:webhook-queue-replay-safe`) proves dispatching the same event twice produces at most one `PaymentEvent` row.

## The sweeper does not charge or grant

The sweeper is purely a retry trigger. It queries Mongo and calls `processQueuedEvent` for each due row; that function is the only thing that dispatches handlers. The sweeper never calls Stripe and never grants benefits itself.

## Required environment variables

| Var | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Existing — signature verification |
| `NEXT_PUBLIC_SITE_URL` | Customer-facing custom domain. No longer load-bearing for webhook processing (processing is in-process; there is no receiver→worker self-call as of 2026-05-15), but still used elsewhere for absolute URLs. |
| `CRON_SECRET` | Existing — Vercel cron auth for the sweeper |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Optional Vercel Deployment Protection bypass. No longer relevant to this flow (the self-call it protected was deleted on 2026-05-15); kept for any other automation endpoints. |

## Receiver

### `POST /api/stripe/webhook` (receiver, maxDuration: 60s)

The receiver is thin and ack-fast. It does **no** index DDL, **no** inline dedup, and **no** HTTP self-call.

Flow:
1. `connectDB()`
2. Verifies Stripe signature (`stripe.webhooks.constructEvent`)
3. Calls `enqueueStripeEvent(event)` — idempotent Mongo upsert by eventId
4. If the row was newly created, schedules `after(() => processQueuedEvent(event.id))` — runs in-process after the response is sent. If the event was already queued, skips the `after()` (the existing row will be picked up by claim/sweeper).
5. Returns `{ received: true, queued: boolean }` **immediately** (target: <1s)

All dedup (including the `ProcessedStripeEvent` short-circuit that previously ran inline at the receiver) and all handler dispatch now live in `processQueuedEvent` — see below.

## Processing — `processQueuedEvent`

`src/services/stripe-webhook-queue/processQueuedEvent.ts` is the single in-process
processor. It replaced the deleted `/api/stripe/process-event` HTTP worker route
(no more separate route, no `x-internal-secret`, no HTTP hop). It is called from
three places: the receiver's `after()`, the sweeper cron, and admin Replay.

**Signature:** `processQueuedEvent(eventId: string) => Promise<{ processed: boolean; skipped?: "not_claimable" | "already_processed"; error?: string }>`

(A `deps` seam exists solely for unit-testing the state machine without running the
real handler — production always uses the default `dispatchStripeEvent`.)

**Flow:**
1. `claimNextAttempt(eventId)` — atomic `queued → processing`. If not claimable (already processing, or no such row), returns `{ processed: false, skipped: "not_claimable" }`.
2. **Relocated layer-2 dedup:** `ProcessedStripeEvent.findOne({ eventId: payload.id })`. Stripe dashboard *resends* carry a fresh `event.id` and bypass enqueue idempotency, so this short-circuit must run on the processing path (it used to be inline at the receiver). If already processed → `markSucceeded(eventId)`, return `{ processed: false, skipped: "already_processed" }`.
3. `dispatchStripeEvent(payload)` → `{ shouldMarkAsProcessed, handlerFailed }`.
4. **ACK GATE** — if `handlerFailed`, `markFailed(eventId, "handler reported grant did not complete")` and return `{ processed: false, error: "not_granted" }`. No `ProcessedStripeEvent` row is written.
5. If `shouldMarkAsProcessed`, `ackProcessedStripeEventOnce(payload)`.
6. `markSucceeded(eventId)`, return `{ processed: true }`.
7. On any throw: `markFailed(eventId, message)` (attempts++, backoff or dead), return `{ processed: false, error: message }`.

**The five-result shape:** `{processed:true}` (handled), `{skipped:"not_claimable"}` (another worker/claim won the row), `{skipped:"already_processed"}` (resend of a done event), `{error:"not_granted"}` (handler ran but did not do its work — row scheduled for retry), `{error}` (handler threw — row already scheduled for retry). Callers never throw on a failed event; the queue row owns retry state.

## The ACK gate (added 2026-08-24 after the renewal-surge incident)

**A handler that returns normally is not automatically a success.** `dispatchStripeEvent` returns two flags that answer *different* questions, and conflating them is a production incident in either direction:

| Flag | Question | Who sets it |
|---|---|---|
| `shouldMarkAsProcessed` | Write the `ProcessedStripeEvent` dedup row (the payment-idempotency ACK)? | Only the money-moving events. ~19 of the 21 subscribed event types leave it `false`, and that is **healthy success**. |
| `handlerFailed` | Did the handler run to completion but *not do its work* — e.g. a renewal whose entry grant never landed? | `invoice.payment_succeeded` only, from `handleInvoicePaymentSucceeded`'s return value. |

**Gate `markSucceeded` on `handlerFailed`, never on `shouldMarkAsProcessed`.** Gating on the latter would dead-letter every `invoice.created`, `customer.subscription.updated`, `charge.refunded`… i.e. almost the whole event surface. `ack-gate.test.ts` case B pins this specifically.

**What it prevents.** On 2026-08-23 14:00 UTC (anchor-24 renewal burst), Stripe returned HTTP 429 inside `handleInvoicePaymentSucceeded`. Its outer catch swallowed the error and returned normally; the dispatcher's hard-coded `shouldMarkAsProcessed = true` then acked it, and `processQueuedEvent` called `markSucceeded` unconditionally. **11 members were charged $300.00 in total, received no entries, and the queue rows read `succeeded`.** Worse, the `ProcessedStripeEvent` row that got written is unique-indexed, so a later Stripe replay was rejected — the standard healing path was closed off. Both halves are now fixed: the handler reports grant success, and the worker honours it.

**Retries are safe.** `PaymentEvent._id = BenefitsGranted-invoice_<invoiceId>` is unique, so a retried `invoice.payment_succeeded` cannot double-grant. That is what makes un-acking the correct response rather than a double-charge risk.

**`handleInvoicePaymentSucceeded` return contract** (`src/services/stripe-webhook-handlers/index.ts`):

| Outcome | Returns | Why |
|---|---|---|
| Grant succeeded (`processPaymentBenefits` → `{success:true}`) | `true` | Work done. |
| `isZeroAmountTrialUpdateInvoice` — Stripe's $0 trial-bookkeeping invoice | `true` | **Legitimate "nothing to grant."** Un-acking it would spin an infinite retry → dead-letter loop on every past-due reanchor / anchor-billing migration / join-anchor. Pinned by `test:zero-trial-guard` and `ack-gate.test.ts` case D. |
| No subscription id (invoice, pending, or canonical) | `true` | Not a membership subscription invoice — there is nothing to grant, and a retry resolves to the same nothing. |
| Unrecognised `billing_reason` | `true` | Explicit classification: this invoice type grants nothing. |
| `processPaymentBenefits` → `{success:false}` | `false` | Previously only logged and fell through — half of RC-1. |
| Missing `packageId` / unknown package / customer mismatch / non-manageable subscription status / user not found / no customer on invoice | `false` | Money collected, nothing granted. Must surface as a queue failure, not vanish. |
| An exception, and no grant had landed yet | **throws** | So the real error text (e.g. Stripe's 429) reaches the row's `lastError`, instead of a generic message. |
| An exception *after* the grant landed (affiliate commission, Klaviyo, endDate sync) | `true` | The entries are already granted; un-acking would retry a completed renewal for nothing. The handler tracks this with a `benefitsGranted` flag read by the outer catch. |

**Test:** `npm run test:ack-gate` (`src/services/stripe-webhook-queue/__tests__/ack-gate.test.ts`). Cases A/B drive the `deps` seam; **C and D drive the real dispatcher and handler** with only `stripe.invoices.retrieve` stubbed, so they pin production wiring rather than the mock.

## Sweeper Route

### `/api/cron/process-stripe-webhook-queue` (GET, maxDuration: 300s)

The sweeper route runs on a scheduled cron job (every minute, `* * * * *`) to:
1. **Recover orphaned rows** — Rows stuck in `processing` state for more than 5 minutes are rolled back to `queued` with an incremented attempt count
2. **Dispatch due rows** — Rows in `queued` state with `nextAttemptAt ≤ now` are processed in-process via `Promise.allSettled(dueRows.map(r => processQueuedEvent(r.eventId)))`

**Request:**
- Headers: `Authorization: Bearer ${CRON_SECRET}` — validated against `process.env.CRON_SECRET`
- Method: GET

**Processing flow:**
1. Authenticates via the `CRON_SECRET` Bearer token (same as other cron routes)
2. Fetches up to 20 rows stuck in `processing` with `claimedAt` older than 5 minutes
   - For each orphan, increments `attempts` and computes the next retry time via `computeNextAttempt()`
   - If retry budget is exhausted, marks as `dead` with error message
   - Otherwise, rolls back to `queued` with the new retry time
3. Fetches up to 20 rows in `queued` state with `nextAttemptAt ≤ now`
   - Calls `processQueuedEvent(row.eventId)` for each, awaited together via `Promise.allSettled` (bounded by `SWEEP_BATCH_SIZE`; no HTTP hop)
   - `Promise.allSettled` means one failing row never aborts the batch; each row's own retry state is owned by `markFailed`
4. Returns JSON with counts: `{ orphansRecovered: number, dispatched: number }`

**Configuration:**
- Requires `CRON_SECRET` env var (same as other cron routes)
- Batch size: 20 rows per sweep (configurable via `SWEEP_BATCH_SIZE` constant)
- Orphan threshold: 5 minutes (configurable via `ORPHAN_THRESHOLD_MS` constant)

## Admin UI

`/admin/stripe-webhook-queue` lists rows by status with a Replay button per row. Replay:
1. Resets `status: "queued"`, `nextAttemptAt: now`, `claimedAt: null`, `lastError: null`.
2. Does NOT reset `attempts` — preserves the audit trail.
3. `const result = await processQueuedEvent(row.eventId)` — runs in-process synchronously (no fan-out, no sweeper wait) and returns `result` in the JSON response (`{ replayed: true, eventId, result }`) so the admin sees the outcome immediately.

### `GET /api/admin/stripe-webhook-queue`

Permission: `errorReports.view`. Returns one paged page of queue rows for the admin UI table — `{ rows, total, limit, skip }` — sorted by `enqueuedAt` desc. Query params: optional `status` (one of `queued | processing | succeeded | dead`), `limit` (default 50, clamped to `[1, 200]`), `skip` (default 0). The list query lives in `src/services/stripe-webhook-queue/listQueue.ts` (`listStripeWebhookQueue`) so the admin route and the Norm projection at `GET /api/internal/norm/v1/stripe-webhook-queue` call the same code. The raw event `payload` is NOT in the response — only the row's `eventId`, `type`, `status`, `attempts`, `nextAttemptAt`, `claimedAt`, `lastError`, `enqueuedAt`, `processedAt`.

## Index management

Core MongoDB indexes are **no longer ensured on the request path**. The
`ensureIndexesOnce()` runtime wrapper was deleted; `ensureCriticalIndexes()`
(in `src/utils/database/ensure-indexes.ts`) is now called only by the
out-of-band migration:

```bash
npm run migrate:ensure-core-indexes:dry   # prints what it would do
npm run migrate:ensure-core-indexes        # live (script: scripts/migrate-ensure-core-indexes.ts)
```

This migration **must be run on every index-affecting deploy, BEFORE deploying
receiver changes**, because it creates the
`paymentIntentId_1_eventType_1_unique` index on `PaymentEvent` — that unique
index is **dedup layer 4** and is load-bearing for the no-double-grant
guarantee. See `gotchas.md` (2026-05-15 504 storm) for why this DDL was
removed from the synchronous webhook path, and
`docs/infrastructure/` for the migration script catalog.

## Testing

| Script | Covers |
|---|---|
| `npm run test:webhook-queue-backoff` | Pure backoff function |
| `npm run test:webhook-queue-enqueue` | Idempotent enqueue |
| `npm run test:webhook-queue-claim` | Atomic claim, parallel race |
| `npm run test:webhook-queue-mark-result` | Success / fail / dead transitions |
| `npm run test:webhook-queue-process` | `processQueuedEvent` state machine (claim → dedup → dispatch → mark, 4-result shape) |
| `npm run test:webhook-queue-replay-safe` | No double-grant on replay |
| `npm run test:webhook-queue-orphan-recovery` | Orphan rows are recovered |

## Operational playbook

**A user reports missing benefits after a successful Stripe charge:**
1. Open `/admin/stripe-webhook-queue`, filter by `dead`.
2. Find the event for that invoice (eventId matches Stripe Dashboard).
3. Click Replay — it runs `processQueuedEvent` in-process and the response carries the `result`, so the outcome is immediate (no ~30s wait).
4. If `result.error` is set, investigate via `lastError`. Use Stripe Dashboard "Resend" as a last resort (safe — layer 4 still blocks double-grants; resends are also caught by the layer-2 `already_processed` short-circuit).

**Vercel deployment shows high `stripewebhookqueue` row count in `queued`:**
- Normal during a burst (e.g., admin bulk charge). Should drain within minutes (receiver `after()` plus the 1-minute sweeper, both calling `processQueuedEvent`).
- If persistent (>10 min with rows older than 5 min), processing is erroring — check Vercel logs for the receiver (`/api/stripe/webhook`) and the sweeper (`/api/cron/process-stripe-webhook-queue`), and inspect `lastError` on stuck rows.

## Related

- Spec: [../superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md](../superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md)
- Plan: [../superpowers/plans/2026-05-12-stripe-webhook-async-queue.md](../superpowers/plans/2026-05-12-stripe-webhook-async-queue.md)
- Adjacent: [CHARGE_PAST_DUE_CUSTOMERS.md](CHARGE_PAST_DUE_CUSTOMERS.md), [PAYMENT_ATTRIBUTION.md](PAYMENT_ATTRIBUTION.md)
