# Stripe Webhook Receiver Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠ CLAUDE.md hard rule #1 — no auto-commit.** The `git commit` steps below must NOT run unless the user has explicitly authorized commits this session (`commit`/`push`/`ship it`/etc.). A PreToolUse hook enforces this. If unauthorized, complete the task, stage nothing, and ask the user.

**Goal:** Remove the index-DDL prelude and the fragile HTTP self-call from the Stripe webhook path so the receiver is the sub-150ms verify→enqueue→ack path the async-queue spec always claimed.

**Architecture:** Index creation moves to a one-shot migration script. The worker route's logic is extracted into an in-process `processQueuedEvent(eventId)` service called directly from the receiver's `after()`, the sweeper, and admin Replay. The HTTP worker route, `dispatchWorker`, and `STRIPE_WORKER_INTERNAL_SECRET` are deleted.

**Tech Stack:** Next.js 15 App Router, Mongoose, Stripe, `tsx` test scripts (no jest/vitest), Vercel serverless.

**Source spec:** [../specs/2026-05-15-stripe-webhook-receiver-collapse-design.md](../specs/2026-05-15-stripe-webhook-receiver-collapse-design.md)

---

### Task 1: Index-ensure migration script (must land + run before Task 3)

**Files:**
- Create: `scripts/migrate-ensure-core-indexes.ts`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Create the migration script**

`scripts/migrate-ensure-core-indexes.ts`:

```ts
/**
 * Migration: ensure core MongoDB indexes exist (moved off the webhook hot path).
 *
 * Previously src/utils/database/ensure-indexes.ts#ensureIndexesOnce() ran ~25-30
 * serialized Atlas admin/DDL commands on every cold webhook lambda. Under a
 * bulk-charge burst this caused the 2026-05-15 504 storm. Index management is a
 * deploy-time concern, not a per-request one — this script is the new home.
 *
 * MUST be run on every deploy that could change indexes, and BEFORE deploying
 * the receiver slimming (Task 3). It creates paymentIntentId_1_eventType_1_unique
 * on PaymentEvent, which is dedup layer 4 — load-bearing for no-double-grant.
 *
 * Usage:
 *   npx tsx scripts/migrate-ensure-core-indexes.ts [--dry-run]
 *
 * Env: .env.local must have MONGODB_URI.
 *
 * @module scripts/migrate-ensure-core-indexes
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const connectDB = (await import("../src/lib/mongodb")).default;
  await connectDB();

  if (DRY_RUN) {
    console.log(
      "[dry-run] Would ensure core indexes (drop redundant + create unique " +
        "PaymentEvent/User/Order indexes) via ensureCriticalIndexes()."
    );
    process.exit(0);
  }

  const { ensureCriticalIndexes } = await import(
    "../src/utils/database/ensure-indexes"
  );
  await ensureCriticalIndexes();
  console.log("✅ Core indexes ensured.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ migrate-ensure-core-indexes failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Export `ensureCriticalIndexes` from the util**

In `src/utils/database/ensure-indexes.ts:42`, change `async function ensureCriticalIndexes()` to `export async function ensureCriticalIndexes()`. Leave `ensureIndexesOnce` exported as-is for now (Task 3/6 removes its only caller; Task 6 deletes the wrapper).

- [ ] **Step 3: Add npm scripts**

In `package.json`, in the scripts block next to the other `migrate:*` entries:

```json
"migrate:ensure-core-indexes": "tsx scripts/migrate-ensure-core-indexes.ts",
"migrate:ensure-core-indexes:dry": "tsx scripts/migrate-ensure-core-indexes.ts --dry-run",
```

- [ ] **Step 4: Verify dry-run works**

Run: `npm run migrate:ensure-core-indexes:dry`
Expected: connects, prints `[dry-run] Would ensure core indexes...`, exits 0. No DDL executed.

- [ ] **Step 5: Run live against the target DB**

Run: `npm run migrate:ensure-core-indexes`
Expected: prints `✅ Core indexes ensured.` exit 0. Idempotent (re-run = no-op, code-27/85/86 swallowed by existing util logic).

- [ ] **Step 6: Commit** (only if commits authorized — see header)

```bash
git add scripts/migrate-ensure-core-indexes.ts src/utils/database/ensure-indexes.ts package.json
git commit -m "feat(infra): move core-index DDL off webhook hot path into migration"
```

---

### Task 2: `processQueuedEvent` service + regression test (TDD)

**Files:**
- Create: `src/services/stripe-webhook-queue/processQueuedEvent.ts`
- Create: `src/services/stripe-webhook-queue/__tests__/processQueuedEvent.test.ts`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Write the failing test**

`src/services/stripe-webhook-queue/__tests__/processQueuedEvent.test.ts`:

```ts
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import assert from "node:assert";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";
import ProcessedStripeEvent from "@/models/ProcessedStripeEvent";
import { processQueuedEvent } from "@/services/stripe-webhook-queue/processQueuedEvent";

function fakeEvent(id: string) {
  return { id, type: "customer.updated", data: { object: { id: "obj_x" } } };
}

async function run() {
  await connectDB();
  const prefix = `test_pqe_${Date.now()}`;

  // (a) happy path: queued row → succeeded
  const idA = `${prefix}_a`;
  await StripeWebhookQueue.create({
    eventId: idA, type: "customer.updated", payload: fakeEvent(idA),
    status: "queued", attempts: 0, nextAttemptAt: new Date(),
    claimedAt: null, lastError: null, enqueuedAt: new Date(), processedAt: null,
  });
  const rA = await processQueuedEvent(idA, {
    dispatch: async () => ({ shouldMarkAsProcessed: false }),
  });
  assert.equal(rA.processed, true, "a: processed");
  const rowA = await StripeWebhookQueue.findOne({ eventId: idA }).lean();
  assert.equal(rowA?.status, "succeeded", "a: status succeeded");

  // (b) not claimable (no queued row) → skipped
  const rB = await processQueuedEvent(`${prefix}_missing`, {
    dispatch: async () => ({ shouldMarkAsProcessed: false }),
  });
  assert.equal(rB.processed, false, "b: not processed");
  assert.equal(rB.skipped, "not_claimable", "b: skipped reason");

  // (c) handler throws → markFailed (status back to queued, attempts incremented)
  const idC = `${prefix}_c`;
  await StripeWebhookQueue.create({
    eventId: idC, type: "customer.updated", payload: fakeEvent(idC),
    status: "queued", attempts: 0, nextAttemptAt: new Date(),
    claimedAt: null, lastError: null, enqueuedAt: new Date(), processedAt: null,
  });
  const rC = await processQueuedEvent(idC, {
    dispatch: async () => { throw new Error("boom"); },
  });
  assert.equal(rC.processed, false, "c: not processed");
  const rowC = await StripeWebhookQueue.findOne({ eventId: idC }).lean();
  assert.equal(rowC?.status, "queued", "c: requeued");
  assert.equal(rowC?.attempts, 1, "c: attempts incremented");
  assert.equal(rowC?.lastError, "boom", "c: lastError set");

  // (d) already in ProcessedStripeEvent → skip without dispatch
  const idD = `${prefix}_d`;
  await StripeWebhookQueue.create({
    eventId: idD, type: "customer.updated", payload: fakeEvent(idD),
    status: "queued", attempts: 0, nextAttemptAt: new Date(),
    claimedAt: null, lastError: null, enqueuedAt: new Date(), processedAt: null,
  });
  await ProcessedStripeEvent.create({ eventId: idD });
  let dispatched = false;
  const rD = await processQueuedEvent(idD, {
    dispatch: async () => { dispatched = true; return { shouldMarkAsProcessed: false }; },
  });
  assert.equal(dispatched, false, "d: handler NOT dispatched");
  assert.equal(rD.skipped, "already_processed", "d: skipped reason");
  const rowD = await StripeWebhookQueue.findOne({ eventId: idD }).lean();
  assert.equal(rowD?.status, "succeeded", "d: row marked succeeded");

  // cleanup
  await StripeWebhookQueue.deleteMany({ eventId: { $regex: `^${prefix}` } });
  await ProcessedStripeEvent.deleteMany({ eventId: { $regex: `^${prefix}` } });

  console.log("✅ processQueuedEvent.test passed");
  process.exit(0);
}

run().catch((e) => { console.error("❌ test failed:", e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `package.json` next to the other `test:webhook-queue-*` entries:

```json
"test:webhook-queue-process": "tsx src/services/stripe-webhook-queue/__tests__/processQueuedEvent.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:webhook-queue-process`
Expected: FAIL — `Cannot find module '@/services/stripe-webhook-queue/processQueuedEvent'`.

- [ ] **Step 4: Implement `processQueuedEvent`**

`src/services/stripe-webhook-queue/processQueuedEvent.ts`:

```ts
import type Stripe from "stripe";
import ProcessedStripeEvent from "@/models/ProcessedStripeEvent";
import { claimNextAttempt } from "@/services/stripe-webhook-queue/claim";
import { markFailed, markSucceeded } from "@/services/stripe-webhook-queue/markResult";
import {
  ackProcessedStripeEventOnce,
  dispatchStripeEvent,
} from "@/services/stripe-webhook-handlers";

export interface ProcessQueuedEventResult {
  processed: boolean;
  skipped?: "not_claimable" | "already_processed";
  error?: string;
}

interface ProcessDeps {
  dispatch: (
    event: Stripe.Event
  ) => Promise<{ shouldMarkAsProcessed: boolean }>;
}

const defaultDeps: ProcessDeps = { dispatch: dispatchStripeEvent };

/**
 * Process a single queued Stripe webhook row in-process. Single source of
 * truth replacing the deleted /api/stripe/process-event HTTP worker route.
 * Called from the receiver's after(), the sweeper cron, and admin Replay.
 *
 * The `deps` seam exists solely so the state machine can be unit-tested
 * without executing the 4,800-line handler. Production always uses defaults.
 */
export async function processQueuedEvent(
  eventId: string,
  deps: ProcessDeps = defaultDeps
): Promise<ProcessQueuedEventResult> {
  const row = await claimNextAttempt(eventId);
  if (!row) return { processed: false, skipped: "not_claimable" };

  const payload = row.payload as Stripe.Event;

  // Relocated layer-2 dedup (was inline in the receiver pre-refactor).
  // Stripe dashboard *resends* carry a fresh event.id and bypass enqueue
  // idempotency, so this short-circuit must run on the processing path.
  const alreadyProcessed = await ProcessedStripeEvent.findOne({
    eventId: payload.id,
  }).lean();
  if (alreadyProcessed) {
    await markSucceeded(eventId);
    return { processed: false, skipped: "already_processed" };
  }

  try {
    const { shouldMarkAsProcessed } = await deps.dispatch(payload);
    if (shouldMarkAsProcessed) {
      await ackProcessedStripeEventOnce(payload);
    }
    await markSucceeded(eventId);
    return { processed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(eventId, message);
    return { processed: false, error: message };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:webhook-queue-process`
Expected: PASS — `✅ processQueuedEvent.test passed`.

- [ ] **Step 6: Run the existing replay-safety test (must stay green)**

Run: `npm run test:webhook-queue-replay-safe`
Expected: PASS (no double-grant unaffected).

- [ ] **Step 7: Commit** (only if commits authorized — see header)

```bash
git add src/services/stripe-webhook-queue/processQueuedEvent.ts src/services/stripe-webhook-queue/__tests__/processQueuedEvent.test.ts package.json
git commit -m "feat(billing-stripe): add in-process processQueuedEvent service + test"
```

---

### Task 3: Slim the receiver (do NOT deploy before Task 1 migration has run)

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Replace the handler body**

Rewrite `src/app/api/stripe/webhook/route.ts` to:

```ts
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import Stripe from "stripe";
import { webhookLog } from "@/services/stripe-webhook-handlers";
import { enqueueStripeEvent } from "@/services/stripe-webhook-queue/enqueue";
import { processQueuedEvent } from "@/services/stripe-webhook-queue/processQueuedEvent";

/**
 * POST /api/stripe/webhook — thin receiver.
 * Verifies signature, enqueues (idempotent upsert), schedules in-process
 * processing via after(), returns 200 immediately. No index DDL, no inline
 * dedup, no HTTP self-call. Dedup is owned by processQueuedEvent + the
 * 4-layer guarantee (enqueue eventId-unique / claim / PaymentEvent unique).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    await connectDB();

    const body = await request.text();
    const signature = (await headers()).get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const { created } = await enqueueStripeEvent(event);

    if (!created) {
      webhookLog("info", `Event ${event.id} already queued; skipping fan-out`);
    } else {
      after(async () => {
        await processQueuedEvent(event.id);
      });
    }

    const enqueuedIn = Date.now() - startTime;
    if (enqueuedIn > 1000) {
      webhookLog("warn", `⚠️ Webhook receiver took ${enqueuedIn}ms to enqueue event ${event.type}`);
    } else {
      webhookLog("info", `✅ Webhook enqueued in ${enqueuedIn}ms for event ${event.type}`);
    }

    return NextResponse.json({ received: true, queued: created });
  } catch (error) {
    const enqueuedIn = Date.now() - startTime;
    webhookLog("error", `Error in webhook receiver: ${error} (after ${enqueuedIn}ms)`);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
```

This removes: the `ensureIndexesOnce()` call, the `ProcessedStripeEvent`/`isEventProcessed`/`User.findOne` inline dedup block, and the now-unused imports (`User`, `ProcessedStripeEvent`, `ensureIndexesOnce`, `ackProcessedStripeEventOnce`, `isEventProcessed`, `dispatchToWorker`).

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS — no unused-import or missing-symbol errors for the webhook route.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS (no unused vars — repo convention is genuine deletion, not `_` prefix).

- [ ] **Step 4: Commit** (only if commits authorized — see header)

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "fix(billing-stripe): slim webhook receiver to verify+enqueue+ack"
```

---

### Task 4: Sweeper processes in-process

**Files:**
- Modify: `src/app/api/cron/process-stripe-webhook-queue/route.ts:5,77-79`

- [ ] **Step 1: Swap dispatch for in-process processing**

In `src/app/api/cron/process-stripe-webhook-queue/route.ts`:

Replace the import line 5:
```ts
import { dispatchToWorker } from "@/services/stripe-webhook-queue/dispatchWorker";
```
with:
```ts
import { processQueuedEvent } from "@/services/stripe-webhook-queue/processQueuedEvent";
```

Replace the dispatch loop (lines 77-79):
```ts
  for (const row of dueRows) {
    void dispatchToWorker(row.eventId, "webhook-sweeper");
  }
```
with:
```ts
  await Promise.allSettled(
    dueRows.map((row) => processQueuedEvent(row.eventId))
  );
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Run orphan-recovery regression (unchanged behavior must hold)**

Run: `npm run test:webhook-queue-orphan-recovery`
Expected: PASS.

- [ ] **Step 4: Commit** (only if commits authorized — see header)

```bash
git add src/app/api/cron/process-stripe-webhook-queue/route.ts
git commit -m "fix(billing-stripe): sweeper processes events in-process, no self-call"
```

---

### Task 5: Admin Replay processes in-process

**Files:**
- Modify: `src/app/api/admin/stripe-webhook-queue/route.ts:7,76-79`

- [ ] **Step 1: Swap the import**

Replace line 7:
```ts
import { dispatchToWorker } from "@/services/stripe-webhook-queue/dispatchWorker";
```
with:
```ts
import { processQueuedEvent } from "@/services/stripe-webhook-queue/processQueuedEvent";
```

- [ ] **Step 2: Replace the fan-out call**

Replace lines 76-79:
```ts
  // Immediate fan-out so the engineer doesn't wait up to 60s for the sweeper.
  void dispatchToWorker(row.eventId, "webhook-replay");

  return NextResponse.json({ replayed: true, eventId: row.eventId });
```
with:
```ts
  // Process immediately in-process so the admin sees the result now.
  const result = await processQueuedEvent(row.eventId);

  return NextResponse.json({ replayed: true, eventId: row.eventId, result });
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit** (only if commits authorized — see header)

```bash
git add src/app/api/admin/stripe-webhook-queue/route.ts
git commit -m "fix(billing-stripe): admin replay processes in-process"
```

---

### Task 6: Delete the worker route, dispatchWorker, and the secret

**Files:**
- Delete: `src/app/api/stripe/process-event/route.ts`
- Delete: `src/services/stripe-webhook-queue/dispatchWorker.ts`
- Modify: `src/utils/database/ensure-indexes.ts` (drop the now-unused `ensureIndexesOnce` wrapper)
- Modify: `vercel.json` (remove process-event entry)
- Modify: `.env.example` (remove `STRIPE_WORKER_INTERNAL_SECRET`)
- Modify: `CLAUDE.md` (manifest: drop `src/app/api/stripe/process-event/**`)

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "process-event\|dispatchToWorker\|STRIPE_WORKER_INTERNAL_SECRET\|ensureIndexesOnce" src/ scripts/`
Expected: zero hits in `src/` and `scripts/` (docs hits are fine; Task 7 fixes docs).

- [ ] **Step 2: Delete the files**

```bash
rm src/app/api/stripe/process-event/route.ts
rm src/services/stripe-webhook-queue/dispatchWorker.ts
```

- [ ] **Step 3: Remove the `ensureIndexesOnce` wrapper**

In `src/utils/database/ensure-indexes.ts`, delete `ensureIndexesOnce` (lines ~20-40, the `indexesEnsured`/`ensureIndexesPromise` singleton + function). Keep `export async function ensureCriticalIndexes()` and helpers — they are now used only by the Task 1 migration.

- [ ] **Step 4: Remove the vercel.json entry**

In `vercel.json`, delete the line:
```json
"src/app/api/stripe/process-event/route.ts": { "memory": 1024, "maxDuration": 300 },
```
(`src/app/api/stripe/**/route.ts` catch-all still covers any stray; the route no longer exists.)

- [ ] **Step 5: Remove the env var from `.env.example`**

Delete the `STRIPE_WORKER_INTERNAL_SECRET=` block (the comment + the line) added on 2026-05-15.

- [ ] **Step 6: Update the CLAUDE.md manifest**

In the `billing-stripe` domain `paths`, delete the `"src/app/api/stripe/process-event/**"` entry. The remaining `"src/app/api/stripe/**"` continues to cover the webhook route.

- [ ] **Step 7: Type-check + lint + targeted tests**

Run: `npm run type-check && npm run lint && npm run test:webhook-queue-process && npm run test:webhook-queue-replay-safe && npm run test:webhook-queue-orphan-recovery`
Expected: all PASS.

- [ ] **Step 8: Commit** (only if commits authorized — see header)

```bash
git add -A
git commit -m "refactor(billing-stripe): delete HTTP worker route, dispatchWorker, worker secret"
```

---

### Task 7: Docs

**Files:**
- Modify: `docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md`
- Modify: `docs/billing-stripe/gotchas.md`
- Modify: `docs/superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md`
- Modify: `docs/infrastructure/architecture.md`

- [ ] **Step 1: STRIPE_WEBHOOK_QUEUE.md** — replace the architecture diagram so it shows `receiver → enqueue → after(processQueuedEvent)` and `sweeper → processQueuedEvent` (no worker route, no self-call). Delete the `STRIPE_WORKER_INTERNAL_SECRET` row from the env table and the entire "Worker Route" section; replace with a short "Processing (`processQueuedEvent`)" section. Update the Admin Replay description (now in-process). Update the operational playbook to drop self-call/429 troubleshooting.

- [ ] **Step 2: gotchas.md** — add a section "## 2026-05-15 504 storm — index DDL in the receiver prelude" summarizing the proven root cause (per the spec's Root Cause section) and the fix (this plan). One paragraph + the introducing commit `8031be29`.

- [ ] **Step 3: 2026-05-12 spec** — add a dated addendum at the top: the receiver cascade-immunity claim was invalidated by the un-removed `connectDB`+`ensureIndexesOnce` prelude; corrected by the 2026-05-15 receiver-collapse design. Link to the new spec.

- [ ] **Step 4: infrastructure/architecture.md** — update the `.env.example` note (remove the `STRIPE_WORKER_INTERNAL_SECRET` mention; the var no longer exists) and add `migrate:ensure-core-indexes` to the migration/scripts list with a one-line "must run on every index-affecting deploy" note.

- [ ] **Step 5: Doc-sync + commit** (only if commits authorized — see header)

Run: `npm run type-check`
Expected: PASS.

```bash
git add docs/ CLAUDE.md
git commit -m "docs(billing-stripe): document receiver collapse + correct queue spec safety claim"
```

---

## Deployment runbook (post-implementation, operator-run)

1. Wait until the production 504 storm has subsided (no new bulk-charge bursts; receiver back to 200s).
2. **Run `npm run migrate:ensure-core-indexes` against production FIRST** (Task 1). Verify `paymentIntentId_1_eventType_1_unique` exists: it is dedup layer 4.
3. Deploy the slimmed receiver + collapse (Tasks 3-6).
4. Monitor `/admin/stripe-webhook-queue`: `queued` count should drain (sweeper now processes in-process, no self-call).
5. Filter `dead`; Replay each (now in-process; layer-4 dedup blocks double-grant).
6. Cross-check `/admin/past-due-history` `InvoiceChargeLog` rows for the incident bulk run against drained/replayed queue rows to confirm every charged user was granted.

## Self-review

- **Spec coverage:** Index→migration (T1) ✓; processQueuedEvent + relocated dedup + test (T2) ✓; slim receiver (T3) ✓; sweeper in-process (T4) ✓; admin replay (T5) ✓; deletions incl. secret/vercel/manifest/.env.example (T6) ✓; all five doc targets incl. spec correction (T7) ✓; migration-before-deploy hard gate (runbook) ✓.
- **Placeholders:** none — every code/step is concrete.
- **Type consistency:** `processQueuedEvent(eventId, deps?)` returning `{processed, skipped?, error?}` used identically in T2 test, T3 receiver, T4 sweeper, T5 admin. `ProcessDeps.dispatch` matches `dispatchStripeEvent`'s `(event) => Promise<{shouldMarkAsProcessed:boolean}>`. `ensureCriticalIndexes` exported in T1, wrapper removed in T6 — no caller references the removed `ensureIndexesOnce` after T3.
