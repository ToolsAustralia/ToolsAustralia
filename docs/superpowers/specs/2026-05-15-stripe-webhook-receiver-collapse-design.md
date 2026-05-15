# Stripe Webhook Receiver Collapse — Design

**Date:** 2026-05-15
**Status:** Approved (design), pending implementation plan
**Supersedes the safety argument of:** [2026-05-12-stripe-webhook-async-queue-design.md](2026-05-12-stripe-webhook-async-queue-design.md)

## Incident

Production `POST /api/stripe/webhook` returned a storm of `504 — Task timed out after 60 seconds` on 2026-05-15, triggered by an admin bulk past-due charge. Concurrently the queue sweeper's self-call to `https://toolsaustralia.com.au/api/stripe/process-event` failed with HTTP `429` and `ECONNRESET` (TLS reset before secure connection). Users were charged by Stripe but did not receive benefits during the storm.

## Root cause (proven — closed evidence loop)

The 2026-05-13 async-queue cutover (commit `8031be29`) made the receiver "ack-fast" **in the post-dedup `switch` only**. It left the pre-existing `connectDB()` + `ensureIndexesOnce()` prelude — legacy since the initial commit `bf26b092` — untouched at the very top of the handler ([webhook/route.ts:38-42](../../../src/app/api/stripe/webhook/route.ts#L38-L42)).

`ensureIndexesOnce()` runs ~25-30 serialized MongoDB admin/DDL commands (14 `dropIndex`, multiple `createIndex`/`listIndexes` across the large `User` / `PaymentEvent` collections — [ensure-indexes.ts:42-198](../../../src/utils/database/ensure-indexes.ts#L42-L198)). It is guarded by a **module-scope (per-lambda-instance) singleton**, so warm instances no-op it — which is why the bug stayed latent for ~2 days and only detonated under burst.

The admin bulk charge (~100 invoices × ~7 Stripe events ≈ 700 events) forced Stripe to fan out to a fleet of **cold** Vercel instances. Every cold instance re-ran the full admin-command routine against Atlas simultaneously; Atlas serializes admin/DDL commands far more aggressively than CRUD, so per-command latency exploded under the herd and each receiver hung in the prelude past the 60s `maxDuration` → the 504 storm. The storm saturated deployment concurrency, so the HTTP self-call surge-failed (429) and the edge shed TLS (`ECONNRESET`).

Evidence loop (any one is suggestive; together they are conclusive):
1. The async-queue spec's cascade-immunity argument explicitly assumes a "~150ms" receiver doing only verify+dedup+enqueue — it never accounts for `ensureIndexesOnce`.
2. `git show 8031be29` proves the heavy prelude was left in by omission ("Pre-enqueue dedup checks are unchanged").
3. `git blame` traces `ensureIndexesOnce()` to the initial commit — unaudited pre-queue legacy.
4. Production 504s show none of the receiver's own progress log lines → it died in the lines 38-42 prelude, before enqueue. A `connectDB` failure fast-fails to **500** via the circuit breaker; a clean 60s **504** is reachable only by a synchronous hang.
5. Commit `6bc91a0d` documents the self-call already failing with a 429 once before — its fragility under load is a known, recurring amplifier, strictly downstream of the receiver storm.

The self-call 429/`ECONNRESET` is an amplifier, **not** the root, and is categorically distinct from clean Vercel Deployment-Protection gating (which returns a tidy HTTP 429 with `x-vercel-mitigated` and no TLS reset).

## Goal

Make the receiver what the async-queue spec always claimed it was — a sub-150ms verify→enqueue→ack path — and remove the fragile HTTP self-call so receiver/worker/sweeper no longer share one public ingress and one function-concurrency pool.

## Design

Net change is a code **deletion**. No new infrastructure.

### 1. Index DDL leaves the request path → migration script

- Delete the `ensureIndexesOnce()` call from `webhook/route.ts`.
- Keep the index logic in `src/utils/database/ensure-indexes.ts` as a pure util; expose it through a new one-shot `scripts/migrations/2026-05-15-ensure-core-indexes.ts` with `migrate:ensure-core-indexes` + `migrate:ensure-core-indexes:dry` in `package.json` (repo convention).
- **Hard deploy gate:** that migration creates `paymentIntentId_1_eventType_1_unique` — dedup layer 4, load-bearing for no-double-grant. Running it is a mandatory pre/at-deploy step, documented in the runbook. The replay-safe test assumes this index exists.

### 2. New `processQueuedEvent(eventId)` service

- New `src/services/stripe-webhook-queue/processQueuedEvent.ts`.
- Body = exactly today's `process-event/route.ts` logic minus the HTTP/secret/JSON shell: `claimNextAttempt` → (null ⇒ skipped) → `dispatchStripeEvent` → `ackProcessedStripeEventOnce` if flagged → `markSucceeded` / `markFailed`.
- The `ProcessedStripeEvent` / `isEventProcessed` dedup check **relocates here, before dispatch** (not deleted). This preserves resend-safety: Stripe dashboard *resends* carry a new `event.id` and bypass enqueue idempotency, so the ProcessedStripeEvent check must run on the processing path.

### 3. Slim receiver

`webhook/route.ts` becomes: `connectDB` → verify signature → `enqueueStripeEvent` (one idempotent upsert) → `after(() => processQueuedEvent(event.id))` → return 200.

Removed: `ensureIndexesOnce()` and the inline pre-enqueue dedup block ([webhook/route.ts:66-154](../../../src/app/api/stripe/webhook/route.ts#L66-L154)). Double-grant safety is unaffected — layer 1 (enqueue eventId unique), layer 3 (atomic claim), layer 4 (PaymentEvent unique) remain; resend-safety is preserved by the relocated check in #2. Ack-path Mongo work drops from ~30 ops to **one write**.

### 4. Sweeper + Admin Replay process in-process

- Sweeper ([cron/process-stripe-webhook-queue/route.ts](../../../src/app/api/cron/process-stripe-webhook-queue/route.ts:77-79)): replace `void dispatchToWorker(...)` with `await Promise.allSettled(dueRows.map(r => processQueuedEvent(r.eventId)))`. 300s budget; 20 I/O-bound rows in parallel is safe. Orphan recovery unchanged.
- Admin Replay ([admin/stripe-webhook-queue/route.ts](../../../src/app/api/admin/stripe-webhook-queue/route.ts)): reset row (queued, nextAttemptAt=now, claimedAt=null) then call `processQueuedEvent` directly instead of the fan-out POST.

### Deletions

- `src/app/api/stripe/process-event/route.ts` (worker route)
- `src/services/stripe-webhook-queue/dispatchWorker.ts`
- `STRIPE_WORKER_INTERNAL_SECRET` (all usages + the `.env.example` line + docs)
- `process-event` entry in `vercel.json`
- `src/app/api/stripe/process-event/**` glob in the CLAUDE.md manifest

## Non-goals

- Pool tuning / removing `connectDB`'s per-call `admin().ping()` — separate follow-up, out of scope.
- Smoothing the bulk-charge emission rate — the receiver fix makes it unnecessary.
- A real external queue (QStash/SQS/Inngest) — overengineering; in-process + Mongo buffer is sufficient.

## Risks

1. **Vercel `after()` is bounded by the route's `maxDuration` (60s), not 300s.** A slow handler in `after()` is killed at 60s → row stuck `processing` → sweeper orphan-recovers after 5min (300s budget). Acceptable: sweeper is the reliable path, `after()` is best-effort acceleration. Confirm `after()` execution/maxDuration semantics during implementation.
2. **Concurrency:** 20-in-one-lambda (sweeper) vs. old 20-parallel-lambdas. Handlers are I/O-bound so fine; add bounded concurrency only if measured tight.
3. **Migration-before-deploy is a hard gate** (layer-4 unique index). Runbook must enforce; do not deploy the receiver slimming without the index migration having run.
4. **This deploy is also the incident remediation.** Sequence: deploy when load has subsided → run migration → monitor queue drain → replay any `dead` rows from `/admin/stripe-webhook-queue`.

## Test plan

- All six existing `test:webhook-queue-*` stay green — especially `test:webhook-queue-replay-safe` (no double-grant).
- New `test:webhook-queue-process` (add `test:*` entry to `package.json`): happy path → succeeded; not-claimable → skipped; handler throws → markFailed; **already-in-ProcessedStripeEvent → skip without re-dispatch** (proves relocated dedup / resend-safety).

## Docs to update

- `docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md` — arch diagram, env table (drop `STRIPE_WORKER_INTERNAL_SECRET`), worker-route section, operational playbook, replay description.
- `docs/billing-stripe/gotchas.md` — incident write-up.
- `docs/superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md` — correct the receiver safety argument so the "~150ms / immune to cascade" claim reflects reality and the regression cannot silently return.
- `docs/infrastructure/architecture.md` — the `.env.example` note (var being removed) + new `migrate:ensure-core-indexes` script.
- `.env.example` — remove `STRIPE_WORKER_INTERNAL_SECRET`.
- `CLAUDE.md` manifest — drop `src/app/api/stripe/process-event/**`.

## Manifest check

- `processQueuedEvent.ts` → `src/services/stripe-webhook-queue/**` — already in `billing-stripe` manifest. ✓
- `scripts/migrations/2026-05-15-ensure-core-indexes.ts` → `scripts/migrations/**` — already in `infrastructure` manifest. ✓
- No orphans; the deleted `process-event` route's glob is removed, the rest stays under `src/app/api/stripe/**`.
