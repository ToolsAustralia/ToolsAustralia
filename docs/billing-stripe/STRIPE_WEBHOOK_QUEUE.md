# Stripe Webhook Async Queue

## Overview

Stripe webhook events are received by a thin receiver at `/api/stripe/webhook` that returns 200 in <1s, then processed asynchronously by a worker route at `/api/stripe/process-event` (300s budget). Events buffer in the `stripewebhookqueue` Mongo collection. A 1-minute cron sweeper retries failed events with exponential backoff and recovers in-flight rows whose worker crashed before completing.

This matches Stripe's documented webhook best practice: respond quickly, queue for async processing, retry idempotently, dead-letter permanent failures.

## Architecture

```
Stripe → POST /api/stripe/webhook  (receiver, maxDuration: 60s)
            │
            ├─ verify signature
            ├─ ProcessedStripeEvent dedup
            ├─ enqueueStripeEvent(event)       ← upsert by eventId, no-op on dup
            ├─ after(() => fetch('/api/stripe/process-event', { eventId }))
            └─ return 200

         /api/stripe/process-event  (worker, maxDuration: 300s, x-internal-secret auth)
            │
            ├─ claimNextAttempt(eventId)       ← atomic queued → processing
            ├─ dispatchStripeEvent(payload)    ← runs the lifted handler
            ├─ markSucceeded on success
            └─ markFailed on error  → attempts++, backoff or dead

         /api/cron/process-stripe-webhook-queue  (sweeper, * * * * *, 300s)
            │
            ├─ Recover orphans: status="processing" AND claimedAt < now-5min
            └─ Dispatch due queued rows: status="queued" AND nextAttemptAt <= now
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

Total retry window ~7.5h. Dead rows stay in the collection indefinitely (no TTL); succeeded rows are TTL'd after 30 days.

## Four-layer dedup (no double-grant guarantee)

| # | Layer | Where |
|---|---|---|
| 1 | `stripewebhookqueue.eventId` unique index | At enqueue |
| 2 | `ProcessedStripeEvent` dedup | At receiver, before enqueue |
| 3 | `claimNextAttempt` atomic findOneAndUpdate | At worker start |
| 4 | `PaymentEvent` unique key `BenefitsGranted-invoice_<id>` | Inside handler |

Layer 4 is load-bearing. The replay-safety regression test (`npm run test:webhook-queue-replay-safe`) proves dispatching the same event twice produces at most one `PaymentEvent` row.

## The sweeper does not charge or grant

The sweeper is purely a "kick the worker" trigger. It queries Mongo and POSTs to the worker. It never calls Stripe and never grants benefits itself.

## Required environment variables

| Var | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Existing — signature verification |
| `STRIPE_WORKER_INTERNAL_SECRET` | **New** — gates the worker route (`x-internal-secret` header) and is sent by the receiver fan-out + the sweeper. Generate a 32+ char random string. |
| `NEXT_PUBLIC_SITE_URL` | **Critical for async webhook to work on Vercel.** Must be set to your customer-facing custom domain (e.g. `https://staging.toolsaustralia.com.au` for preview, `https://toolsaustralia.com.au` for production). The internal fan-out from receiver → worker uses this URL. **If unset, the receiver falls back to `VERCEL_URL` (the `*.vercel.app` per-deployment alias), which is gated by Vercel's bot-mitigation challenge — non-browser POSTs get a 429 response with `x-vercel-mitigated: challenge` and the worker never runs. Symptom: receiver returns 200 but benefits never get granted, and there are zero Vercel logs for `/api/stripe/process-event`.** See `gotchas.md` for the full incident write-up. |
| `CRON_SECRET` | Existing — Vercel cron auth |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Optional — only needed if you've also enabled Vercel Deployment Protection. The `dispatchToWorker` helper attaches this as the `x-vercel-protection-bypass` header when set. Generate via Vercel Dashboard → Settings → Deployment Protection → Protection Bypass for Automation. |

## Receiver

### `POST /api/stripe/webhook` (receiver, maxDuration: 60s)

**As of Task 10, the receiver is ack-fast.** It no longer awaits handler completion.

Flow:
1. Verifies Stripe signature
2. Deduplicates via `ProcessedStripeEvent` and `user.processedPayments` (unchanged — runs before enqueue)
3. Calls `enqueueStripeEvent(event)` — idempotent Mongo upsert by eventId
4. Schedules `after(() => fetch('/api/stripe/process-event', ...))` — fires after the response is sent
5. Returns `{ received: true, queued: boolean }` **immediately** (target: <1s)

The receiver no longer calls `dispatchStripeEvent`, `ackProcessedStripeEventOnce` (for the happy path), or `markEventProcessed` — those are now owned entirely by the worker route. The dedup short-circuit paths (skipped events) still call `ackProcessedStripeEventOnce` to keep `ProcessedStripeEvent` consistent.

## Worker Route

### `/api/stripe/process-event` (POST, maxDuration: 300s)

The worker route processes queued Stripe events.

**Request:**
- Headers: `x-internal-secret` — must match `process.env.STRIPE_WORKER_INTERNAL_SECRET` (32+ char string)
- Body: `{ eventId: string }`

**Processing flow:**
1. Authenticates the caller via the secret header
2. Validates the `eventId` parameter
3. Calls `claimNextAttempt(eventId)` — atomically reserves the queue row for processing
   - If the row is already being processed or does not exist, returns `{ skipped: true, reason: "not_claimable" }`
4. Dispatches the event to the handler via `dispatchStripeEvent(payload)`, which returns `{ shouldMarkAsProcessed }`
5. If the handler marked it for acknowledgment, calls `ackProcessedStripeEventOnce(payload)` to mark the event as fully processed in `ProcessedStripeEvent`
6. Marks the queue row as succeeded via `markSucceeded(eventId)`
7. Returns `{ processed: true }`

**Error handling:**
- If the handler throws, catches the error and calls `markFailed(eventId, errorMessage)`
- Returns `{ processed: false, error: message }` with **status 200** (intentionally not 5xx)
- Returning 200 tells the caller (sweeper or receiver) that we've recorded the failure internally; the queue row is already scheduled for the next retry attempt
- The sweeper will eventually retry via exponential backoff, not HTTP-layer retries

**Configuration:**
- Requires `STRIPE_WORKER_INTERNAL_SECRET` env var set to a random 32+ character string
- Must be called with the correct secret to prevent unauthorized event processing

## Sweeper Route

### `/api/cron/process-stripe-webhook-queue` (GET, maxDuration: 300s)

The sweeper route runs on a scheduled cron job (every minute, `* * * * *`) to:
1. **Recover orphaned rows** — Rows stuck in `processing` state for more than 5 minutes are rolled back to `queued` with an incremented attempt count
2. **Dispatch due rows** — Rows in `queued` state with `nextAttemptAt ≤ now` are fan-out posted to the worker route in fire-and-forget mode

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
   - For each due row, fire-and-forget POSTs to `/api/stripe/process-event` with the `eventId`
   - Uses the `STRIPE_WORKER_INTERNAL_SECRET` header for authentication
   - Catches and logs any network errors; does not retry failed POSTs (the sweeper will try again next cycle)
4. Returns JSON with counts: `{ orphansRecovered: number, dispatched: number }`

**Configuration:**
- Requires `CRON_SECRET` env var (same as other cron routes)
- Requires `STRIPE_WORKER_INTERNAL_SECRET` env var (passed to worker route)
- Optional: `VERCEL_URL` for production, or falls back to `NEXT_PUBLIC_SITE_URL` / `http://localhost:3000`
- Batch size: 20 rows per sweep (configurable via `SWEEP_BATCH_SIZE` constant)
- Orphan threshold: 5 minutes (configurable via `ORPHAN_THRESHOLD_MS` constant)

## Admin UI

`/admin/stripe-webhook-queue` lists rows by status with a Replay button per row. Replay:
1. Resets `status: "queued"`, `nextAttemptAt: now`, `claimedAt: null`, `lastError: null`.
2. Does NOT reset `attempts` — preserves the audit trail.
3. Immediately fires a fan-out POST to the worker (skips the 60s sweeper wait).

## Testing

| Script | Covers |
|---|---|
| `npm run test:webhook-queue-backoff` | Pure backoff function |
| `npm run test:webhook-queue-enqueue` | Idempotent enqueue |
| `npm run test:webhook-queue-claim` | Atomic claim, parallel race |
| `npm run test:webhook-queue-mark-result` | Success / fail / dead transitions |
| `npm run test:webhook-queue-replay-safe` | No double-grant on replay |
| `npm run test:webhook-queue-orphan-recovery` | Orphan rows are recovered |

## Operational playbook

**A user reports missing benefits after a successful Stripe charge:**
1. Open `/admin/stripe-webhook-queue`, filter by `dead`.
2. Find the event for that invoice (eventId matches Stripe Dashboard).
3. Click Replay. Wait ~30s.
4. If still failing, check `lastError` and investigate. Use Stripe Dashboard "Resend" as a last resort (safe — layer 4 still blocks double-grants).

**Vercel deployment shows high `stripewebhookqueue` row count in `queued`:**
- Normal during a burst (e.g., admin bulk charge). Should drain within minutes.
- If persistent (>10 min with rows older than 5 min), the worker route may be erroring — check Vercel logs for `/api/stripe/process-event`.

## Related

- Spec: [../superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md](../superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md)
- Plan: [../superpowers/plans/2026-05-12-stripe-webhook-async-queue.md](../superpowers/plans/2026-05-12-stripe-webhook-async-queue.md)
- Adjacent: [CHARGE_PAST_DUE_CUSTOMERS.md](CHARGE_PAST_DUE_CUSTOMERS.md), [PAYMENT_ATTRIBUTION.md](PAYMENT_ATTRIBUTION.md)
