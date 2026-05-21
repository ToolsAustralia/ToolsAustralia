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
3. `dispatchStripeEvent(payload)` → `{ shouldMarkAsProcessed }`.
4. If `shouldMarkAsProcessed`, `ackProcessedStripeEventOnce(payload)`.
5. `markSucceeded(eventId)`, return `{ processed: true }`.
6. On any throw: `markFailed(eventId, message)` (attempts++, backoff or dead), return `{ processed: false, error: message }`.

**The four-result shape:** `{processed:true}` (handled), `{skipped:"not_claimable"}` (another worker/claim won the row), `{skipped:"already_processed"}` (resend of a done event), `{error}` (handler threw — row already scheduled for retry). Callers never throw on a failed event; the queue row owns retry state.

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
