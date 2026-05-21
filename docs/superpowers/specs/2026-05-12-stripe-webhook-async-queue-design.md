# Stripe Webhook Async Queue — Design

**Date:** 2026-05-12
**Status:** Approved, ready for implementation plan
**Trigger incident:** 2026-05-12 21:54 AEST — bulk "Charge Past Due" on 18 invoices caused ~1,000 `/api/stripe/webhook` 504 timeouts; only 4/18 users received entries+renewals because most `invoice.payment_succeeded` handlers exceeded Vercel's 30s function timeout under the concurrent burst.

> **2026-05-15 correction:** the "receiver is light / immune to the cascade / ~150ms ack" safety claim in this spec was **invalidated in production**. The implementation kept `connectDB()` + `ensureIndexesOnce()` (~25–30 serialized Atlas DDL ops on every cold lambda) in the receiver's synchronous pre-ack path, so a bulk-charge burst re-ran that DDL concurrently and the *receiver itself* 504'd — exactly the cascade this design promised to prevent. The separate worker route + HTTP self-call assumed here was also a failure amplifier under deployment saturation. Corrected design: index DDL moved to the `migrate:ensure-core-indexes` migration, the worker route/self-call deleted, and processing made in-process via `processQueuedEvent`. See [2026-05-15-stripe-webhook-receiver-collapse-design.md](./2026-05-15-stripe-webhook-receiver-collapse-design.md). The body below is the original 2026-05-12 design and is retained for history only.

## Problem

The Stripe webhook handler at `src/app/api/stripe/webhook/route.ts` (~4,810 lines) does all event processing synchronously inside the receiver. Per-event work for `invoice.payment_succeeded` is ~10–25s on the happy path: `stripe.invoices.retrieve` (expanded), `stripe.subscriptions.retrieve`, `stripe.paymentIntents.update`, multiple DB writes, `upsertRenewalCycleFromPaidInvoice`, `processPaymentBenefits` (entries + milestones + Klaviyo + FB CAPI), affiliate recording, and saving the payment method.

When events arrive in a burst (admin bulk-charge fires 15 invoices in parallel via `Promise.allSettled` per `BATCH_SIZE` in `charge-past-due/route.ts`), 15 concurrent Lambdas contend for the MongoDB connection pool, Stripe API rate limit, and external API timeouts. Most exceed the 30s `maxDuration` in `vercel.json:37`, return 504, and trigger Stripe's automatic retry (~16 attempts over 3 days) — which then dogpiles again, plus collateral starvation of unrelated webhook events. That's how 14 initial failures cascaded into ~1,000 timeouts.

With the business now bulk-charging 400 past-due users per run, the same architecture will fail much harder. This spec defines the async refactor that fixes the timeout class of bug entirely, matching Stripe's published best practice for webhook handling.

## Goals & Non-goals

**Goals**
- Receiver returns 200 in <1s regardless of event type or downstream load.
- All webhook event handling moves to a separate worker route with a 300s budget.
- Bursts of N concurrent events (N up to 400+) cannot cause cascading timeouts.
- Idempotency preserved end-to-end: no user can be granted benefits twice no matter how many times the same event is delivered/replayed.
- Failed events are visible and manually replayable from an admin page.
- Critical user-blocking API routes (`/api/payment-intent/**`, `/api/subscription/**`, `/api/stripe/**`, `/api/invoice/**`, `/api/orders/**`) get a 60s `maxDuration` so they don't fail under the same load profile.

**Non-goals**
- No queue/job vendor (no Inngest, no QStash, no SQS). Mongo + Vercel cron only.
- No rewrite of any existing handler. Handlers move file-to-file unchanged.
- No changes to `ProcessedStripeEvent` or `PaymentEvent` dedup semantics — they are load-bearing and stay as-is.
- No changes to the admin "Charge Past Due" endpoint itself (its batch size and delay stay the same — the queue absorbs the burst).
- No SLA/alerting infrastructure beyond an admin page. Slack/email on dead-letter is explicitly deferred per the brainstorm choice.

## Stripe Best Practice Alignment

This design implements Stripe's documented webhook best practices verbatim:

| Stripe practice | Implementation |
|---|---|
| Return 2xx before complex work | Receiver verifies sig, dedups, enqueues, returns 200 — total ~150ms |
| Process asynchronously | Worker route with 300s `maxDuration` runs the handler |
| Idempotent processing | 4-layer dedup (queue unique index, `ProcessedStripeEvent`, atomic claim, `PaymentEvent` unique key) |
| Don't depend on event order | Existing handlers are already self-contained per event |
| Handle Stripe's automatic retries | Receiver short-circuits already-processed events; queue unique index no-ops duplicate enqueues |

## Architecture

```
Stripe ──POST──▶ /api/stripe/webhook              (receiver, maxDuration: 60)
                    │
                    ├─ verify signature
                    ├─ ProcessedStripeEvent dedup (existing) ─── duplicate? ack 200 and return
                    ├─ enqueueStripeEvent(event) ───────────── upsert by eventId, no-op on dup
                    ├─ after(() => fetch('/api/stripe/process-event', { eventId }))
                    └─ return 200                              total ~150ms

                  /api/stripe/process-event       (worker, maxDuration: 300, internal-secret auth)
                    │
                    ├─ claimNextAttempt(eventId)              atomic: status queued → processing
                    ├─ dispatch via src/services/stripe-webhook-handlers
                    ├─ on success → markSucceeded
                    └─ on failure → markFailed (attempts++, nextAttemptAt per backoff; or "dead" at 5)

                  /api/cron/process-stripe-webhook-queue  (sweeper, every 1 min, maxDuration: 300)
                    │
                    ├─ find rows where status="queued" AND nextAttemptAt ≤ now
                    │       OR  status="processing" AND claimedAt < now-5min  (orphan recovery)
                    └─ POST each to /api/stripe/process-event (up to 20 per run)

                  /admin/stripe-webhook-queue     (admin UI)
                    └─ list/filter rows, "Replay" button (resets to queued, nextAttemptAt=now)
```

**Key invariants:**
- Receiver is light — effectively immune to cascade regardless of burst size.
- Fan-out POST gives sub-second processing latency on the happy path.
- Sweeper is the safety net for `after()` not firing (Lambda shutdown race) and for scheduled retries.
- Atomic claim guarantees that fan-out POST + sweeper racing on the same event yields exactly one worker invocation.
- All existing idempotency stays in place; replays cannot double-grant benefits.

## Data Model

**New collection: `stripewebhookqueue`**

```ts
{
  _id: ObjectId,
  eventId: string,             // Stripe event.id — UNIQUE
  type: string,                // e.g. "invoice.payment_succeeded" — indexed
  payload: Stripe.Event,       // full raw event so worker is self-contained
  status: "queued" | "processing" | "succeeded" | "dead",
  attempts: number,            // 0 on enqueue, incremented per failure
  nextAttemptAt: Date,         // sweeper pickup time
  claimedAt: Date | null,      // set by worker; null otherwise; orphan threshold = 5 min
  lastError: string | null,    // most recent failure message
  enqueuedAt: Date,
  processedAt: Date | null,    // set on success
  createdAt: Date,
  updatedAt: Date,
}
```

**Indexes**
- `eventId` — unique (idempotent enqueue from Stripe replays)
- `{ status: 1, nextAttemptAt: 1 }` — sweeper happy-path query
- `{ status: 1, claimedAt: 1 }` — orphan detection
- TTL on `processedAt` (30 days) for `succeeded` rows; `dead` rows kept indefinitely so they're manually replayable months later if needed

**No changes** to `ProcessedStripeEvent` or `PaymentEvent`. The new queue is purely a buffer between receiver and worker; the existing dedup layers continue to operate inside the handler.

**Backoff schedule** (per attempt count)

```
attempts=0 → nextAttemptAt = now    (initial enqueue — sweeper picks immediately if fan-out failed)
attempts=1 → +1 minute
attempts=2 → +5 minutes
attempts=3 → +15 minutes
attempts=4 → +1 hour
attempts=5 → +6 hours
attempts=6 → status: "dead"         (stops retrying)
```

Total retry window ~7.5h — long enough to ride out external API outages, short enough not to mask bugs.

## Components & Files

### New files

| Path | Purpose | maxDuration |
|---|---|---|
| `src/models/StripeWebhookQueue.ts` | Mongoose schema | — |
| `src/services/stripe-webhook-queue/enqueue.ts` | `enqueueStripeEvent(event)` — upsert by eventId | — |
| `src/services/stripe-webhook-queue/claim.ts` | `claimNextAttempt(eventId)` — atomic findOneAndUpdate | — |
| `src/services/stripe-webhook-queue/markResult.ts` | `markSucceeded` / `markFailed` — increment attempt count, compute backoff, transition to dead at the cap | — |
| `src/services/stripe-webhook-queue/backoff.ts` | Pure `computeNextAttempt(attempts) → Date \| "dead"` | — |
| `src/services/stripe-webhook-handlers/index.ts` | All event-handler functions lifted out of the route file (mechanical move) | — |
| `src/app/api/stripe/process-event/route.ts` | Worker: claim → dispatch → mark result. Authed via `x-internal-secret` | 300 |
| `src/app/api/cron/process-stripe-webhook-queue/route.ts` | Sweeper: find queued/orphaned rows, fan out POSTs | 300 |
| `src/app/admin/stripe-webhook-queue/page.tsx` | Admin list view (server component) | — |
| `src/app/admin/stripe-webhook-queue/QueueTable.tsx` | Client table w/ filter + Replay button | — |
| `src/app/api/admin/stripe-webhook-queue/route.ts` | GET (list) + POST (replay) for admin UI | 60 |
| `docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md` | Domain doc covering the four-layer dedup, sweeper behavior, admin replay | — |

### Refactored files

| Path | Change |
|---|---|
| `src/app/api/stripe/webhook/route.ts` | Shrinks from ~4,810 → ~150 lines. Keeps signature verification + `ProcessedStripeEvent` dedup. Replaces the `switch` with `enqueueStripeEvent + after(fetch(worker))`. Returns 200 immediately. |
| `vercel.json` | Add entries for the 3 new routes + bump webhook receiver to 60 + add 60s entries for user-blocking critical paths (see below) + add new cron entry |
| `CLAUDE.md` Domain Manifest | Add new paths to the `billing-stripe` domain |

### `vercel.json` changes

**Add** (new routes):
```jsonc
"src/app/api/stripe/process-event/route.ts":               { "memory": 1024, "maxDuration": 300 },
"src/app/api/cron/process-stripe-webhook-queue/route.ts":  { "memory": 1024, "maxDuration": 300 },
"src/app/api/admin/stripe-webhook-queue/route.ts":         { "memory": 1024, "maxDuration": 60 },
```

**New cron entry**:
```jsonc
{ "path": "/api/cron/process-stripe-webhook-queue", "schedule": "* * * * *" }
```

**Bump** webhook receiver from 30 → 60 (safety margin even though the receiver is light post-refactor).

**Add 60s entries for user-blocking critical paths** (currently inheriting the 10s default and matching the same recipe — Stripe API + Mongo writes + sometimes Klaviyo/FB CAPI — that caused the incident):
```jsonc
"src/app/api/stripe/**/route.ts":          { "memory": 512, "maxDuration": 60 },
"src/app/api/payment-intent/**/route.ts":  { "memory": 512, "maxDuration": 60 },
"src/app/api/subscription/**/route.ts":    { "memory": 512, "maxDuration": 60 },
"src/app/api/invoice/**/route.ts":         { "memory": 512, "maxDuration": 60 },
"src/app/api/orders/**/route.ts":          { "memory": 512, "maxDuration": 60 },
```

The webhook + process-event keep their own more-specific entries above; Vercel uses the most-specific match. The `**` catch-all stays at the bottom of the `functions` block.

## Request Flow & Failure Handling

### Happy path

```
T=0     Stripe → receiver
T+50ms  sig verified
T+70ms  ProcessedStripeEvent dedup checked
T+100ms enqueued, after() scheduled
T+150ms receiver returns 200
T+200ms worker invocation begins (fan-out POST landed)
T+250ms worker claims event (atomic; status: queued → processing)
T+5-25s handler completes; markSucceeded
```

End-to-end Stripe → benefits granted: typically sub-second to a few seconds.

### Failure modes

| Failure | Detection | Recovery |
|---|---|---|
| Receiver crashes before enqueue | Stripe sees non-2xx | Stripe retries (~16 attempts / 3 days) |
| `after()` fan-out POST never lands | Row sits in `queued`, `nextAttemptAt ≤ now` | Sweeper picks within 60s |
| Worker crashes mid-flight | Row stuck in `processing`, `claimedAt < now-5min` | Sweeper treats as orphan, re-claims |
| Worker throws (DB hiccup, Stripe blip) | `markFailed` increments attempts, schedules per backoff | Sweeper picks at next attempt |
| Permanent handler bug | After the 5 retries exhaust (`attempts` reaches 6), status flips to `dead` | Surfaces on admin page; fix bug, click Replay |
| Stripe duplicate delivery | Layer 1: queue unique index on eventId. Layer 2: ProcessedStripeEvent dedup at receiver. | Both no-op duplicates |
| Fan-out POST + sweeper race | `claimNextAttempt` atomic findOneAndUpdate | Loser returns `{ skipped: true }` |

### Four-layer dedup (cannot double-grant benefits)

1. **`stripewebhookqueue` unique index on `eventId`** — at enqueue. Duplicate Stripe deliveries no-op.
2. **`ProcessedStripeEvent.findOne(eventId)`** — at receiver, before enqueue. Already-fully-processed events short-circuit immediately.
3. **`claimNextAttempt` atomic claim** — at worker start. Only one worker wins the atomic update; the other returns `{ skipped: true }`.
4. **`PaymentEvent` unique key `BenefitsGranted-invoice_<id>`** — inside the handler, before any benefit grant. Last-line defense; if all upper layers somehow failed, the handler exits early on duplicate-key error.

**Layer 4 is the existing protection** that has prevented double-grants all along. Layers 1 and 3 don't add safety on top — they make the system efficient (no wasted handler runs) and the queue auditable. The no-double-grant guarantee is still 4.

### Sweeper does not charge or grant

The sweeper is purely a "kick the worker" trigger. It runs every 1 min, queries Mongo for queued/orphaned rows, and POSTs each to the worker. It never calls Stripe and never grants benefits itself.

### Concurrency caps

- Sweeper batches at most 20 events per run.
- Cron runs every 1 min → floor throughput ~1,200 events/hour; much higher when fan-out hits directly.
- For a 400-user bulk charge: receiver acks all 400 in <30s, fan-out fires ~400 worker invocations, Vercel handles concurrency, sweeper catches any stragglers.

## Testing

| Test | What it covers |
|---|---|
| `test:webhook-queue-backoff` | Pure unit test of `computeNextAttempt(attempts)` — verifies each attempt returns the right Date or `"dead"` |
| `test:webhook-queue-enqueue` | `enqueueStripeEvent` is idempotent — same `eventId` twice = 1 row |
| `test:webhook-queue-claim` | `claimNextAttempt` is atomic — two parallel claimers, exactly one wins |
| `test:webhook-queue-replay-safe` | Running `handleInvoicePaymentSucceeded` twice with the same invoice fixture does NOT double-grant — `PaymentEvent` unique key blocks. **Regression-prevention test for the entire dedup concern.** |
| `test:webhook-queue-orphan-recovery` | Insert a row with `claimedAt = 6min ago`; run sweeper; assert it re-claims and re-enqueues |

Each gets a `test:*` entry in `package.json`. No changes to existing tests under `src/services/subscription/__tests__/` or `src/utils/payment/__tests__/` — handler behavior is unchanged.

## Rollout

1. **Ship queue infrastructure first** — new model, services, worker route, sweeper route, admin page, `vercel.json` updates. Receiver still runs the existing inline `switch`. Worker is dark (no events routed yet).
2. **Verify on a single low-stakes event type in staging** — temporarily route `customer.subscription.updated` through the queue. Confirm enqueue → claim → process → success path works end-to-end. Confirm admin page shows it.
3. **Cut over the receiver** — replace the giant `switch` with `enqueueStripeEvent + after(fan-out)`. All event types now flow through the queue. Run in staging for an hour with synthetic events.
4. **Deploy to prod** — monitor `stripewebhookqueue` for ~24h. Watch for: `dead` rows (should be 0), `processing` rows older than a few minutes (should be 0 once sweeper kicks in), throughput vs Stripe-sent events.
5. **Drain in-flight Stripe retries** — Stripe is still retrying the May 12 21:54 failures. Those arrive at the new receiver, get enqueued, and process through the queue. Side effect: the 14 missing users from the incident self-heal through the new system.

**Backwards compatibility** — none needed. Stripe still POSTs to `/api/stripe/webhook` and still gets 200. No external clients depend on the internal handler shape.

**In-flight events at cutover** — none. There is no existing queue. Stripe owns the only "in-flight" state and its retries land naturally on the new receiver.

## Domain Manifest update (`CLAUDE.md`)

Add to the `billing-stripe` domain's `paths`:

```
src/services/stripe-webhook-queue/**
src/services/stripe-webhook-handlers/**
src/models/StripeWebhookQueue.ts
src/app/api/stripe/process-event/**
src/app/api/cron/process-stripe-webhook-queue/**
src/app/api/admin/stripe-webhook-queue/**
src/app/admin/stripe-webhook-queue/**
```

## Risks

- **Big code move** — ~4,500 lines of handlers move from `webhook/route.ts` into `src/services/stripe-webhook-handlers/`. Mitigation: pure copy-paste with import surface adjusted, no behavior changes. PR diff will be reviewable because the moved code is byte-identical.
- **`after()` reliability** — stable in Next.js 15 but only fires reliably when the response has been sent. Anything thrown before `after()` schedules would skip fan-out. Sweeper covers this within 60s.
- **Cron volume** — `* * * * *` is 1,440 sweeper invocations/day. Each is light (one Mongo query + maybe a few POSTs). Vercel Pro tier handles this without issue.
- **Internal-secret auth on worker route** — environment variable `STRIPE_WORKER_INTERNAL_SECRET` must be configured on Vercel. Without it the worker rejects all requests; document this prominently in the domain doc.

## Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Scope | All events go async | User chose uniformity over surgical fix |
| Trigger | Fan-out POST + cron sweeper | Sub-second latency, no vendor, sweeper is safety net |
| Retry budget | Initial attempt + 5 retries spaced 1m → 5m → 15m → 1h → 6h; then dead-letter | Matches Stripe's own behavior; surfaces bugs without spamming |
| Visibility | Admin page + Mongo query, no Slack | Build the page now; add alerts only if needed later |
| Queue tech | Mongo collection | Zero new vendor cost; existing infra |
| Critical-path 60s bumps | `/api/stripe/**`, `/api/payment-intent/**`, `/api/subscription/**`, `/api/invoice/**`, `/api/orders/**` | Routes with same recipe (Stripe + Mongo + Klaviyo/FB) that caused the 504 cascade |
