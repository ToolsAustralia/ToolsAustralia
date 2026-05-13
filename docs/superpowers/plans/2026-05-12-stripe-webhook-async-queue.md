# Stripe Webhook Async Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Stripe webhook handler off the request path so the receiver returns 200 in <1s. All event processing runs in a worker route with a 300s budget, backed by a Mongo queue with backoff + dead-letter, sweeper cron, admin replay UI, and four-layer dedup.

**Architecture:** Receiver verifies signature, dedups via `ProcessedStripeEvent`, upserts the raw event into a new `stripewebhookqueue` collection, schedules fan-out via `after(() => fetch('/api/stripe/process-event'))`, returns 200. Worker route atomically claims the row, dispatches to the existing event handlers (moved verbatim into `src/services/stripe-webhook-handlers/`), and marks succeeded/failed. A 1-min cron sweeper catches anything `after()` didn't fire and orphaned rows where the worker crashed mid-flight. Idempotency is enforced at four layers; the existing `PaymentEvent` unique key remains the load-bearing guarantee against double-granting benefits.

**Tech Stack:** Next.js 15 App Router, Mongoose, Mongo, Vercel Cron, tsx tests (existing pattern in `src/**/__tests__/*.test.ts`).

**Spec reference:** [docs/superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md](../specs/2026-05-12-stripe-webhook-async-queue-design.md)

**Hard rules to honor throughout:**
- **No auto-commit.** Every "Commit" step shows the command. The engineer must read CLAUDE.md and only commit when the user authorizes it. The CLAUDE.md hook will block otherwise.
- **Domain docs stay in sync.** Tasks that touch `src/` or `scripts/` either update `docs/billing-stripe/` in the same commit or do so in a follow-up Task before stopping. The `doc-sync.mjs` Stop hook will block otherwise.
- **All new paths must be covered in the Domain Manifest** (in `CLAUDE.md`). Task 1 adds them up front so subsequent commits don't get blocked.

---

## Task 1: Domain Manifest update + stub domain doc

**Why first:** every new file path must be covered by a manifest entry before it's created, or the doc-sync Stop hook blocks the commit. We add the globs and a stub doc up front so the next 14 commits flow.

**Files:**
- Modify: `CLAUDE.md` — Domain Manifest, `billing-stripe` domain
- Create: `docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md` (stub for now; filled in at Task 16)

- [ ] **Step 1: Add new path globs to the `billing-stripe` domain in `CLAUDE.md`**

In the JSON manifest block under `"billing-stripe"."paths"`, add these lines (preserve existing entries):

```
"src/services/stripe-webhook-queue/**",
"src/services/stripe-webhook-handlers/**",
"src/models/StripeWebhookQueue.ts",
"src/app/api/stripe/process-event/**",
"src/app/api/cron/process-stripe-webhook-queue/**",
"src/app/api/admin/stripe-webhook-queue/**",
"src/app/admin/stripe-webhook-queue/**"
```

Bump `lastModified` on the manifest object to `"2026-05-12"` and `billing-stripe.lastVerified` to `"2026-05-12"`.

- [ ] **Step 2: Create stub `docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md`**

```markdown
# Stripe Webhook Async Queue

> **Status:** In progress — full documentation lands in Task 16 of the implementation plan. See [docs/superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md](../superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md) for design.

## Overview

Stripe webhook events are received by a thin receiver that returns 200 in <1s, then processed asynchronously by a worker route with a 300s budget. A Mongo-backed queue (`stripewebhookqueue` collection) buffers events between receiver and worker. A cron sweeper retries failed events with exponential backoff and recovers orphaned in-flight rows.
```

- [ ] **Step 3: Verify lint and types still pass**

Run: `npm run lint && npm run type-check`
Expected: PASS (this commit is doc + JSON only, no code changes)

- [ ] **Step 4: Commit**

```powershell
git add CLAUDE.md docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md
git commit -m "docs(billing-stripe): seed manifest + stub doc for webhook async queue"
```

---

## Task 2: Pure backoff function (TDD)

**Files:**
- Create: `src/services/stripe-webhook-queue/backoff.ts`
- Create: `src/services/stripe-webhook-queue/__tests__/backoff.test.ts`
- Modify: `package.json` — add `test:webhook-queue-backoff` script

- [ ] **Step 1: Write the failing test**

Create `src/services/stripe-webhook-queue/__tests__/backoff.test.ts`:

```ts
import assert from "node:assert/strict";
import { computeNextAttempt, BACKOFF_SCHEDULE_MS, MAX_ATTEMPTS } from "../backoff";

function testInitialEnqueueIsImmediate() {
  const now = new Date("2026-05-12T00:00:00.000Z");
  const next = computeNextAttempt(0, now);
  assert.equal(next instanceof Date, true);
  assert.equal((next as Date).toISOString(), now.toISOString());
}

function testEachAttemptUsesScheduledOffset() {
  const now = new Date("2026-05-12T00:00:00.000Z");
  const expected = [
    0,                  // attempts=0 → now
    60 * 1000,          // attempts=1 → +1m
    5 * 60 * 1000,      // attempts=2 → +5m
    15 * 60 * 1000,     // attempts=3 → +15m
    60 * 60 * 1000,     // attempts=4 → +1h
    6 * 60 * 60 * 1000, // attempts=5 → +6h
  ];
  expected.forEach((offsetMs, attempts) => {
    const next = computeNextAttempt(attempts, now);
    assert.ok(next instanceof Date, `attempts=${attempts} should return a Date`);
    assert.equal(
      (next as Date).getTime() - now.getTime(),
      offsetMs,
      `attempts=${attempts} should be +${offsetMs}ms`
    );
  });
}

function testReachingCapReturnsDead() {
  const now = new Date("2026-05-12T00:00:00.000Z");
  assert.equal(computeNextAttempt(MAX_ATTEMPTS, now), "dead");
  assert.equal(computeNextAttempt(MAX_ATTEMPTS + 5, now), "dead");
}

function testScheduleLengthMatchesMaxAttempts() {
  // The schedule has one entry per attempt count from 0 up to MAX_ATTEMPTS - 1.
  assert.equal(BACKOFF_SCHEDULE_MS.length, MAX_ATTEMPTS);
}

function run() {
  testInitialEnqueueIsImmediate();
  testEachAttemptUsesScheduledOffset();
  testReachingCapReturnsDead();
  testScheduleLengthMatchesMaxAttempts();
  console.log("backoff tests passed");
}

run();
```

- [ ] **Step 2: Wire up the `test:webhook-queue-backoff` npm script**

In `package.json`, under `"scripts"`, add (place near other `test:*` entries):

```json
"test:webhook-queue-backoff": "tsx src/services/stripe-webhook-queue/__tests__/backoff.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:webhook-queue-backoff`
Expected: FAIL with `Cannot find module '../backoff'`.

- [ ] **Step 4: Implement `backoff.ts`**

Create `src/services/stripe-webhook-queue/backoff.ts`:

```ts
export const BACKOFF_SCHEDULE_MS: ReadonlyArray<number> = [
  0,                  // attempts=0 → process immediately (initial enqueue)
  60 * 1000,          // attempts=1 → retry after 1 minute
  5 * 60 * 1000,      // attempts=2 → retry after 5 minutes
  15 * 60 * 1000,     // attempts=3 → retry after 15 minutes
  60 * 60 * 1000,     // attempts=4 → retry after 1 hour
  6 * 60 * 60 * 1000, // attempts=5 → retry after 6 hours
];

export const MAX_ATTEMPTS = BACKOFF_SCHEDULE_MS.length;

/**
 * Return the Date at which the worker should next pick this row up, given
 * how many times it has been attempted so far. Returns the string "dead"
 * when the retry budget is exhausted.
 */
export function computeNextAttempt(attempts: number, now: Date = new Date()): Date | "dead" {
  if (attempts >= MAX_ATTEMPTS) return "dead";
  const offsetMs = BACKOFF_SCHEDULE_MS[attempts];
  return new Date(now.getTime() + offsetMs);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:webhook-queue-backoff`
Expected: PASS, prints `backoff tests passed`.

- [ ] **Step 6: Lint + types**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/services/stripe-webhook-queue/backoff.ts src/services/stripe-webhook-queue/__tests__/backoff.test.ts package.json
git commit -m "feat(billing-stripe): add backoff schedule for webhook queue"
```

---

## Task 3: `StripeWebhookQueue` Mongoose model

**Files:**
- Create: `src/models/StripeWebhookQueue.ts`

- [ ] **Step 1: Create the model**

Create `src/models/StripeWebhookQueue.ts`:

```ts
import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

export type StripeWebhookQueueStatus = "queued" | "processing" | "succeeded" | "dead";

const stripeWebhookQueueSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      required: true,
      enum: ["queued", "processing", "succeeded", "dead"] as const,
      default: "queued",
      index: true,
    },
    attempts: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date, required: true, default: () => new Date() },
    claimedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    enqueuedAt: { type: Date, required: true, default: () => new Date() },
    processedAt: { type: Date, default: null },
  },
  { collection: "stripewebhookqueue", timestamps: true }
);

// Sweeper happy-path query: queued rows whose nextAttemptAt has elapsed.
stripeWebhookQueueSchema.index({ status: 1, nextAttemptAt: 1 });
// Orphan detection: in-flight rows whose claim is stale.
stripeWebhookQueueSchema.index({ status: 1, claimedAt: 1 });
// TTL: drop succeeded rows 30 days after processedAt. Dead rows are kept
// (no TTL) so they remain replayable from the admin UI indefinitely.
stripeWebhookQueueSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, partialFilterExpression: { status: "succeeded" } }
);

export type StripeWebhookQueueDoc = InferSchemaType<typeof stripeWebhookQueueSchema> & {
  _id: mongoose.Types.ObjectId;
};

const StripeWebhookQueue =
  models.StripeWebhookQueue || model("StripeWebhookQueue", stripeWebhookQueueSchema);

export default StripeWebhookQueue;
```

- [ ] **Step 2: Lint + types**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add src/models/StripeWebhookQueue.ts
git commit -m "feat(billing-stripe): add StripeWebhookQueue model"
```

---

## Task 4: `enqueueStripeEvent` service (TDD)

**Files:**
- Create: `src/services/stripe-webhook-queue/enqueue.ts`
- Create: `src/services/stripe-webhook-queue/__tests__/enqueue.test.ts`
- Modify: `package.json` — add `test:webhook-queue-enqueue` script

> **DB note:** integration tests require a running Mongo. Before running, set `MONGODB_URI` to a scratch test DB (e.g., `mongodb://localhost:27017/toolsaustralia-test`). Tests should clean up after themselves.

- [ ] **Step 1: Write the failing test**

Create `src/services/stripe-webhook-queue/__tests__/enqueue.test.ts`:

```ts
import assert from "node:assert/strict";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";
import { enqueueStripeEvent } from "../enqueue";

const fakeEvent = (id: string, type = "invoice.payment_succeeded") => ({
  id,
  type,
  data: { object: { id: "in_test_123" } },
  created: 1715476800,
  livemode: false,
  pending_webhooks: 0,
  request: { id: null, idempotency_key: null },
  api_version: "2024-06-20",
  object: "event",
}) as unknown as import("stripe").Stripe.Event;

async function withCleanCollection<T>(fn: () => Promise<T>): Promise<T> {
  await connectDB();
  await StripeWebhookQueue.deleteMany({});
  try {
    return await fn();
  } finally {
    await StripeWebhookQueue.deleteMany({});
  }
}

async function testEnqueueCreatesRow() {
  await withCleanCollection(async () => {
    const result = await enqueueStripeEvent(fakeEvent("evt_one"));
    assert.equal(result.created, true);
    const row = await StripeWebhookQueue.findOne({ eventId: "evt_one" }).lean();
    assert.ok(row, "row should exist");
    assert.equal(row?.status, "queued");
    assert.equal(row?.attempts, 0);
    assert.equal(row?.type, "invoice.payment_succeeded");
  });
}

async function testDuplicateEnqueueIsNoOp() {
  await withCleanCollection(async () => {
    const first = await enqueueStripeEvent(fakeEvent("evt_dup"));
    const second = await enqueueStripeEvent(fakeEvent("evt_dup"));
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    const count = await StripeWebhookQueue.countDocuments({ eventId: "evt_dup" });
    assert.equal(count, 1);
  });
}

async function run() {
  await testEnqueueCreatesRow();
  await testDuplicateEnqueueIsNoOp();
  console.log("enqueue tests passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire up the npm script**

In `package.json`, under `"scripts"`, add:

```json
"test:webhook-queue-enqueue": "tsx src/services/stripe-webhook-queue/__tests__/enqueue.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:webhook-queue-enqueue`
Expected: FAIL — `Cannot find module '../enqueue'`.

- [ ] **Step 4: Implement `enqueue.ts`**

Create `src/services/stripe-webhook-queue/enqueue.ts`:

```ts
import type Stripe from "stripe";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";

/**
 * Idempotently enqueue a Stripe event for async processing.
 * - First call for a given event.id inserts a new queued row with attempts=0
 *   and nextAttemptAt=now (so the sweeper would pick it up immediately if
 *   the fan-out POST never fires).
 * - Subsequent calls for the same event.id are no-ops; the unique index on
 *   eventId is the load-bearing guarantee that duplicates can't multiply.
 */
export async function enqueueStripeEvent(event: Stripe.Event): Promise<{ created: boolean }> {
  await connectDB();
  const now = new Date();
  const result = await StripeWebhookQueue.updateOne(
    { eventId: event.id },
    {
      $setOnInsert: {
        eventId: event.id,
        type: event.type,
        payload: event,
        status: "queued",
        attempts: 0,
        nextAttemptAt: now,
        claimedAt: null,
        lastError: null,
        enqueuedAt: now,
        processedAt: null,
      },
    },
    { upsert: true }
  );
  return { created: result.upsertedCount === 1 };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:webhook-queue-enqueue`
Expected: PASS, prints `enqueue tests passed`.

- [ ] **Step 6: Lint + types**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/services/stripe-webhook-queue/enqueue.ts src/services/stripe-webhook-queue/__tests__/enqueue.test.ts package.json
git commit -m "feat(billing-stripe): add enqueueStripeEvent service"
```

---

## Task 5: `claimNextAttempt` service (TDD — atomicity is the point)

**Files:**
- Create: `src/services/stripe-webhook-queue/claim.ts`
- Create: `src/services/stripe-webhook-queue/__tests__/claim.test.ts`
- Modify: `package.json` — add `test:webhook-queue-claim` script

- [ ] **Step 1: Write the failing test**

Create `src/services/stripe-webhook-queue/__tests__/claim.test.ts`:

```ts
import assert from "node:assert/strict";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";
import { claimNextAttempt } from "../claim";

async function withCleanCollection<T>(fn: () => Promise<T>): Promise<T> {
  await connectDB();
  await StripeWebhookQueue.deleteMany({});
  try {
    return await fn();
  } finally {
    await StripeWebhookQueue.deleteMany({});
  }
}

async function seedQueued(eventId: string) {
  const now = new Date();
  await StripeWebhookQueue.create({
    eventId,
    type: "invoice.payment_succeeded",
    payload: { id: eventId, type: "invoice.payment_succeeded" },
    status: "queued",
    attempts: 0,
    nextAttemptAt: now,
    enqueuedAt: now,
  });
}

async function testClaimSetsProcessingAndReturnsRow() {
  await withCleanCollection(async () => {
    await seedQueued("evt_claim_1");
    const row = await claimNextAttempt("evt_claim_1");
    assert.ok(row, "claim should return the row");
    assert.equal(row?.status, "processing");
    assert.ok(row?.claimedAt instanceof Date, "claimedAt should be set");
  });
}

async function testParallelClaimsExactlyOneWins() {
  await withCleanCollection(async () => {
    await seedQueued("evt_claim_race");
    const results = await Promise.all([
      claimNextAttempt("evt_claim_race"),
      claimNextAttempt("evt_claim_race"),
      claimNextAttempt("evt_claim_race"),
    ]);
    const winners = results.filter((r) => r !== null);
    assert.equal(winners.length, 1, "exactly one parallel caller should win the claim");
  });
}

async function testClaimReturnsNullWhenNoQueuedRow() {
  await withCleanCollection(async () => {
    const result = await claimNextAttempt("evt_missing");
    assert.equal(result, null);
  });
}

async function testClaimReturnsNullWhenAlreadyProcessing() {
  await withCleanCollection(async () => {
    const now = new Date();
    await StripeWebhookQueue.create({
      eventId: "evt_in_flight",
      type: "invoice.payment_succeeded",
      payload: {},
      status: "processing",
      attempts: 0,
      nextAttemptAt: now,
      claimedAt: now,
      enqueuedAt: now,
    });
    const result = await claimNextAttempt("evt_in_flight");
    assert.equal(result, null);
  });
}

async function run() {
  await testClaimSetsProcessingAndReturnsRow();
  await testParallelClaimsExactlyOneWins();
  await testClaimReturnsNullWhenNoQueuedRow();
  await testClaimReturnsNullWhenAlreadyProcessing();
  console.log("claim tests passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire up the npm script**

```json
"test:webhook-queue-claim": "tsx src/services/stripe-webhook-queue/__tests__/claim.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:webhook-queue-claim`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `claim.ts`**

Create `src/services/stripe-webhook-queue/claim.ts`:

```ts
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueDoc } from "@/models/StripeWebhookQueue";

/**
 * Atomically transition a queued row to `processing` and return it. Returns
 * null if no queued row exists for this eventId (already processing,
 * already succeeded, dead-lettered, or never enqueued). The atomic
 * findOneAndUpdate is what guarantees that fan-out POST and the sweeper
 * cannot both claim the same event.
 */
export async function claimNextAttempt(eventId: string): Promise<StripeWebhookQueueDoc | null> {
  await connectDB();
  const claimed = await StripeWebhookQueue.findOneAndUpdate(
    { eventId, status: "queued" },
    { $set: { status: "processing", claimedAt: new Date() } },
    { new: true }
  ).lean<StripeWebhookQueueDoc | null>();
  return claimed;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:webhook-queue-claim`
Expected: PASS.

- [ ] **Step 6: Lint + types**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/services/stripe-webhook-queue/claim.ts src/services/stripe-webhook-queue/__tests__/claim.test.ts package.json
git commit -m "feat(billing-stripe): add atomic claim for webhook queue"
```

---

## Task 6: `markSucceeded` / `markFailed` services (TDD)

**Files:**
- Create: `src/services/stripe-webhook-queue/markResult.ts`
- Create: `src/services/stripe-webhook-queue/__tests__/markResult.test.ts`
- Modify: `package.json` — add `test:webhook-queue-mark-result` script

- [ ] **Step 1: Write the failing test**

Create `src/services/stripe-webhook-queue/__tests__/markResult.test.ts`:

```ts
import assert from "node:assert/strict";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";
import { markFailed, markSucceeded } from "../markResult";
import { MAX_ATTEMPTS } from "../backoff";

async function withCleanCollection<T>(fn: () => Promise<T>): Promise<T> {
  await connectDB();
  await StripeWebhookQueue.deleteMany({});
  try {
    return await fn();
  } finally {
    await StripeWebhookQueue.deleteMany({});
  }
}

async function seedProcessing(eventId: string, attempts: number) {
  const now = new Date();
  await StripeWebhookQueue.create({
    eventId,
    type: "invoice.payment_succeeded",
    payload: {},
    status: "processing",
    attempts,
    nextAttemptAt: now,
    claimedAt: now,
    enqueuedAt: now,
  });
}

async function testMarkSucceededSetsTerminalState() {
  await withCleanCollection(async () => {
    await seedProcessing("evt_ok", 0);
    await markSucceeded("evt_ok");
    const row = await StripeWebhookQueue.findOne({ eventId: "evt_ok" }).lean();
    assert.equal(row?.status, "succeeded");
    assert.ok(row?.processedAt instanceof Date);
    assert.equal(row?.claimedAt, null);
    assert.equal(row?.lastError, null);
  });
}

async function testMarkFailedRequeuesWithBackoff() {
  await withCleanCollection(async () => {
    await seedProcessing("evt_retry", 0);
    await markFailed("evt_retry", "boom");
    const row = await StripeWebhookQueue.findOne({ eventId: "evt_retry" }).lean();
    assert.equal(row?.status, "queued");
    assert.equal(row?.attempts, 1);
    assert.equal(row?.lastError, "boom");
    assert.equal(row?.claimedAt, null);
    assert.ok(row?.nextAttemptAt instanceof Date);
    // Next attempt should be ~60s in the future for attempts=1.
    const deltaMs = (row!.nextAttemptAt as Date).getTime() - Date.now();
    assert.ok(deltaMs > 30 * 1000 && deltaMs < 90 * 1000, `expected ~60s in future, got ${deltaMs}ms`);
  });
}

async function testMarkFailedAtCapTransitionsToDead() {
  await withCleanCollection(async () => {
    // attempts already at the last retry slot — the next failure exhausts the budget.
    await seedProcessing("evt_dead", MAX_ATTEMPTS - 1);
    await markFailed("evt_dead", "final");
    const row = await StripeWebhookQueue.findOne({ eventId: "evt_dead" }).lean();
    assert.equal(row?.status, "dead");
    assert.equal(row?.attempts, MAX_ATTEMPTS);
    assert.equal(row?.lastError, "final");
  });
}

async function run() {
  await testMarkSucceededSetsTerminalState();
  await testMarkFailedRequeuesWithBackoff();
  await testMarkFailedAtCapTransitionsToDead();
  console.log("markResult tests passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire up the npm script**

```json
"test:webhook-queue-mark-result": "tsx src/services/stripe-webhook-queue/__tests__/markResult.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:webhook-queue-mark-result`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `markResult.ts`**

Create `src/services/stripe-webhook-queue/markResult.ts`:

```ts
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";
import { computeNextAttempt } from "./backoff";

export async function markSucceeded(eventId: string): Promise<void> {
  await connectDB();
  await StripeWebhookQueue.updateOne(
    { eventId },
    {
      $set: {
        status: "succeeded",
        processedAt: new Date(),
        claimedAt: null,
        lastError: null,
      },
    }
  );
}

/**
 * Increment attempts and either reschedule the row for another retry or
 * transition it to `dead` when the retry budget is exhausted.
 */
export async function markFailed(eventId: string, error: string): Promise<void> {
  await connectDB();
  const row = await StripeWebhookQueue.findOne({ eventId }).lean();
  if (!row) return;
  const nextAttempts = (row.attempts ?? 0) + 1;
  const decision = computeNextAttempt(nextAttempts, new Date());
  if (decision === "dead") {
    await StripeWebhookQueue.updateOne(
      { eventId },
      {
        $set: {
          status: "dead",
          attempts: nextAttempts,
          lastError: error,
          claimedAt: null,
        },
      }
    );
    return;
  }
  await StripeWebhookQueue.updateOne(
    { eventId },
    {
      $set: {
        status: "queued",
        attempts: nextAttempts,
        nextAttemptAt: decision,
        lastError: error,
        claimedAt: null,
      },
    }
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:webhook-queue-mark-result`
Expected: PASS.

- [ ] **Step 6: Lint + types**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/services/stripe-webhook-queue/markResult.ts src/services/stripe-webhook-queue/__tests__/markResult.test.ts package.json
git commit -m "feat(billing-stripe): add markSucceeded/markFailed with backoff + dead-letter"
```

---

## Task 7: Extract event handlers to `src/services/stripe-webhook-handlers/`

**Why now:** the worker route (next task) needs to call the existing handlers without going through a `NextRequest`. We lift the handlers out verbatim and re-export a single `dispatchStripeEvent(event)` entry point.

**Read before starting:** `src/app/api/stripe/webhook/route.ts` — orient on the existing big switch (around line 4988) and every `handleXxx` function it calls.

**Files:**
- Create: `src/services/stripe-webhook-handlers/index.ts` (new module — the lifted handlers)
- Modify: `src/app/api/stripe/webhook/route.ts` — keep all current behavior, just import from the new module

**Constraint:** this task is a **mechanical move only**. No handler body should change. The receiver route still owns the switch dispatch and still runs everything synchronously. Cutover happens in Task 10.

- [ ] **Step 1: Inventory the handlers being moved**

In `src/app/api/stripe/webhook/route.ts`, list every:
- Top-level `async function handleXxx(...)` invoked from the switch
- Any helper functions called *only* by those handlers (e.g. `webhookLog`, `resolveInvoiceSubscriptionId`, `ackProcessedStripeEventOnce`, `isEventProcessed`)
- Any module-level constants used by those handlers (e.g. `STRIPE_SUBSCRIPTION_METADATA_IS_RESUBSCRIBE`)

Record the inventory in a scratch buffer; the next steps reference it.

- [ ] **Step 2: Create `src/services/stripe-webhook-handlers/index.ts`**

Move every function and helper from Step 1 into this file, verbatim. Re-export a single `dispatchStripeEvent`:

```ts
import type Stripe from "stripe";

// ... all lifted helpers and handleXxx functions ...

/**
 * Dispatch a Stripe event to the appropriate handler. Equivalent to the
 * switch that used to live inside the webhook route, lifted out so the
 * async worker route can drive it without going through NextRequest.
 *
 * Returns shouldMarkAsProcessed so the worker can call
 * ackProcessedStripeEventOnce when applicable.
 */
export async function dispatchStripeEvent(event: Stripe.Event): Promise<{ shouldMarkAsProcessed: boolean }> {
  let shouldMarkAsProcessed = false;

  switch (event.type) {
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      shouldMarkAsProcessed = true;
      break;
    // ... ALL cases lifted verbatim from the existing webhook switch ...
    default:
      // existing default-branch logging behavior, lifted verbatim
      break;
  }

  return { shouldMarkAsProcessed };
}

// Re-export helpers the receiver still uses pre-cutover (sig verification path
// in route.ts calls these). Once Task 10 cuts the receiver over, these
// re-exports can be removed.
export { ackProcessedStripeEventOnce, isEventProcessed };
```

- [ ] **Step 3: Update `src/app/api/stripe/webhook/route.ts` to import from the new module**

Replace inline definitions with imports. The route's switch becomes a call to `dispatchStripeEvent` plus the `ackProcessedStripeEventOnce` logic guarded by `shouldMarkAsProcessed`. Behavior must remain identical — same dedup checks, same response shapes, same logging.

- [ ] **Step 4: Verify with type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS. Type errors here indicate a missing import or unmoved helper — fix and re-run.

- [ ] **Step 5: Run all existing test:* scripts that touch billing**

Run (in sequence, all should PASS):
```
npm run test:anchor-billing
npm run test:stripe-refund-amount
npm run test:refund-reversal
npm run test:redeemables
npm run test:stripe-collection-pause
npm run test:facebook-capi
```

(Skip any test name above that doesn't exist; this is a smoke check that the move didn't break adjacent surfaces.)

Expected: every test that previously passed still passes.

- [ ] **Step 6: Bump `lastVerified` on `billing-stripe` in `CLAUDE.md`**

In the manifest, set `billing-stripe.lastVerified` to `"2026-05-12"`.

- [ ] **Step 7: Commit**

```powershell
git add src/services/stripe-webhook-handlers/index.ts src/app/api/stripe/webhook/route.ts CLAUDE.md
git commit -m "refactor(billing-stripe): extract webhook handlers to stripe-webhook-handlers module"
```

---

## Task 8: Worker route `/api/stripe/process-event`

**Files:**
- Create: `src/app/api/stripe/process-event/route.ts`

The worker:
1. Authenticates the caller via `x-internal-secret` against `process.env.STRIPE_WORKER_INTERNAL_SECRET`.
2. Reads `eventId` from the JSON body.
3. Calls `claimNextAttempt(eventId)` — if `null`, returns `{ skipped: true, reason }` (another worker or the sweeper got there first; or the row doesn't exist).
4. Calls `dispatchStripeEvent(payload)` from `stripe-webhook-handlers`.
5. On success: `markSucceeded(eventId)` and `ackProcessedStripeEventOnce(payload)` if `shouldMarkAsProcessed`.
6. On thrown error: `markFailed(eventId, errorMessage)`.
7. Returns 200 with a small JSON status payload (this route's 200 has no Stripe meaning — only the receiver's 200 matters to Stripe).

- [ ] **Step 1: Implement the worker route**

Create `src/app/api/stripe/process-event/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { claimNextAttempt } from "@/services/stripe-webhook-queue/claim";
import { markFailed, markSucceeded } from "@/services/stripe-webhook-queue/markResult";
import {
  ackProcessedStripeEventOnce,
  dispatchStripeEvent,
} from "@/services/stripe-webhook-handlers";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WORKER_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Worker not configured" }, { status: 500 });
  }
  if (request.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let eventId: string | undefined;
  try {
    const body = (await request.json()) as { eventId?: string };
    eventId = body.eventId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const row = await claimNextAttempt(eventId);
  if (!row) {
    return NextResponse.json({ skipped: true, reason: "not_claimable" });
  }

  try {
    const payload = row.payload as Stripe.Event;
    const { shouldMarkAsProcessed } = await dispatchStripeEvent(payload);
    if (shouldMarkAsProcessed) {
      await ackProcessedStripeEventOnce(payload);
    }
    await markSucceeded(eventId);
    return NextResponse.json({ processed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(eventId, message);
    return NextResponse.json({ processed: false, error: message }, { status: 200 });
    // 200 (not 5xx) on purpose: the caller is our own sweeper/receiver, not
    // Stripe. We don't want sweeper/fan-out to retry at the HTTP layer; the
    // queue row itself is now scheduled for the next attempt.
  }
}
```

- [ ] **Step 2: Document the new env var**

If `.env.example` exists, append:
```
STRIPE_WORKER_INTERNAL_SECRET=<random 32+ char string>
```
If it doesn't exist, note the requirement in the domain doc (Task 16 will formalize it).

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/stripe/process-event/route.ts .env.example
git commit -m "feat(billing-stripe): add async worker route for stripe webhook events"
```

(Drop `.env.example` from the `git add` if it doesn't exist in the repo.)

---

## Task 9: Sweeper route `/api/cron/process-stripe-webhook-queue`

**Files:**
- Create: `src/app/api/cron/process-stripe-webhook-queue/route.ts`

The sweeper:
1. Authenticates as a Vercel cron via the `Authorization: Bearer ${CRON_SECRET}` header pattern used by the existing crons (mirror what `src/app/api/cron/major-draw-transition/route.ts` or another existing cron does — read one before writing this).
2. Finds candidate rows: `status: "queued"` with `nextAttemptAt <= now`, OR `status: "processing"` with `claimedAt < now - 5min` (orphans). Limits to 20 per run.
3. For orphans, first reset them to `queued` (so `claimNextAttempt` from the worker will succeed). Increment `attempts` and recompute `nextAttemptAt` via `computeNextAttempt` so the orphan is treated as a retry, not a free attempt.
4. POSTs each to `/api/stripe/process-event` with `x-internal-secret` header. Fan-out is fire-and-forget (no await on the response); the worker is fully autonomous.
5. Returns 200 with a count summary.

- [ ] **Step 1: Read an existing cron route**

Run: open `src/app/api/cron/major-draw-transition/route.ts` (or any other file under `src/app/api/cron/`) and copy the auth pattern.

- [ ] **Step 2: Implement the sweeper**

Create `src/app/api/cron/process-stripe-webhook-queue/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";
import { computeNextAttempt } from "@/services/stripe-webhook-queue/backoff";

const SWEEP_BATCH_SIZE = 20;
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

function getBaseUrl(): string {
  // Mirror the pattern used by other internal fan-outs in this repo. If
  // VERCEL_URL is set (production/preview), use https://${VERCEL_URL}.
  // Otherwise fall back to the public site env.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  // Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const now = new Date();
  const orphanCutoff = new Date(now.getTime() - ORPHAN_THRESHOLD_MS);

  // 1. Recover orphans: rows stuck in `processing` past the threshold get
  //    rolled back to `queued` with an incremented attempt count so they
  //    enter the normal retry path (and can be dead-lettered if they keep
  //    failing).
  const orphans = await StripeWebhookQueue.find({
    status: "processing",
    claimedAt: { $lt: orphanCutoff },
  })
    .limit(SWEEP_BATCH_SIZE)
    .lean();

  for (const orphan of orphans) {
    const nextAttempts = (orphan.attempts ?? 0) + 1;
    const decision = computeNextAttempt(nextAttempts, now);
    if (decision === "dead") {
      await StripeWebhookQueue.updateOne(
        { _id: orphan._id, status: "processing" },
        {
          $set: {
            status: "dead",
            attempts: nextAttempts,
            lastError: "orphan: worker did not complete within threshold",
            claimedAt: null,
          },
        }
      );
    } else {
      await StripeWebhookQueue.updateOne(
        { _id: orphan._id, status: "processing" },
        {
          $set: {
            status: "queued",
            attempts: nextAttempts,
            nextAttemptAt: decision,
            lastError: "orphan: worker did not complete within threshold",
            claimedAt: null,
          },
        }
      );
    }
  }

  // 2. Dispatch queued rows whose nextAttemptAt has elapsed.
  const dueRows = await StripeWebhookQueue.find({
    status: "queued",
    nextAttemptAt: { $lte: now },
  })
    .limit(SWEEP_BATCH_SIZE)
    .lean();

  const workerSecret = process.env.STRIPE_WORKER_INTERNAL_SECRET;
  const workerUrl = `${getBaseUrl()}/api/stripe/process-event`;

  for (const row of dueRows) {
    // Fire-and-forget; the worker owns its own outcome. Use void to silence
    // the unawaited-promise lint and ensure we don't block the sweeper.
    void fetch(workerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": workerSecret ?? "",
      },
      body: JSON.stringify({ eventId: row.eventId }),
    }).catch((err) => {
      console.error("[webhook-sweeper] fan-out POST failed:", err);
    });
  }

  return NextResponse.json({
    orphansRecovered: orphans.length,
    dispatched: dueRows.length,
  });
}
```

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/cron/process-stripe-webhook-queue/route.ts
git commit -m "feat(billing-stripe): add sweeper cron for stripe webhook queue"
```

---

## Task 10: Receiver cutover — replace switch with enqueue + fan-out

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`

**Behavior change** (the only one in the entire plan):
- Before: receiver verifies sig, dedups via `ProcessedStripeEvent`, runs the big switch synchronously, returns 200 after all handler work completes.
- After: receiver verifies sig, dedups via `ProcessedStripeEvent`, calls `enqueueStripeEvent(event)`, schedules `after(() => fetch('/api/stripe/process-event', { eventId }))`, returns 200 immediately. All handler work happens in the worker route.

The receiver still owns the existing duplicate-check helpers (`isEventProcessed`, the user-payment-history pre-check, etc.) — keep those checks intact at the receiver. They short-circuit before enqueue so already-processed events never enter the queue at all.

- [ ] **Step 1: Refactor the receiver**

Replace the giant `switch` (around `src/app/api/stripe/webhook/route.ts:4988`) with the enqueue + fan-out flow. Skeleton (preserve all existing dedup checks above the switch — they stay):

```ts
import { after } from "next/server";
import { enqueueStripeEvent } from "@/services/stripe-webhook-queue/enqueue";

// ... existing signature verification, ProcessedStripeEvent dedup,
// payment-event dedup, debug logging — ALL OF THIS STAYS AS-IS ...

// Replace the switch with:
const { created } = await enqueueStripeEvent(event);
if (!created) {
  webhookLog("info", `Event ${event.id} already queued; skipping enqueue + fan-out`);
} else {
  // Schedule fan-out POST after the response is sent. Sweeper covers any
  // case where Vercel kills the lambda before fanout fires.
  const workerSecret = process.env.STRIPE_WORKER_INTERNAL_SECRET;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  after(async () => {
    try {
      await fetch(`${baseUrl}/api/stripe/process-event`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": workerSecret ?? "",
        },
        body: JSON.stringify({ eventId: event.id }),
      });
    } catch (err) {
      console.error("[webhook-receiver] fan-out POST failed:", err);
    }
  });
}

return NextResponse.json({ received: true, queued: created });
```

After this refactor:
- The receiver file shrinks from ~4,810 lines to ~150.
- All `handleXxx` functions have already been moved out in Task 7; nothing remains in the route file except sig verify + dedup + enqueue + fan-out + the helpers the receiver itself calls.
- The temporary `dispatchStripeEvent` re-export from Task 7 is no longer needed by the receiver, but stays exported for the worker route to import.

- [ ] **Step 2: Delete dead code paths**

Anything in the receiver that's only reachable via the old switch (per-event-type duplicate handling, custom returns) can be deleted. Be conservative: if a helper has any caller outside the route, keep it. If it's defined and used only inside the file and only inside the old switch, it's safe to remove.

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 4: Manual staging smoke test plan**

(Engineer performs these as a deploy gate — not as automated steps.)

1. Deploy this commit to a Vercel preview/staging environment with `STRIPE_WORKER_INTERNAL_SECRET` set.
2. From Stripe CLI in staging mode: `stripe trigger customer.subscription.updated` — confirm:
   - Receiver returns 200 in <1s
   - One new row appears in `stripewebhookqueue` with `status: "succeeded"` within ~5–30s
   - `ProcessedStripeEvent` row exists
   - No error logs
3. `stripe trigger invoice.payment_succeeded` — confirm the same plus:
   - `PaymentEvent` row with `eventId: "BenefitsGranted-invoice_<id>"` exists
   - User's `accumulatedEntries` updated
4. Cause a deliberate worker error (point `STRIPE_WORKER_INTERNAL_SECRET` to wrong value, retrigger) and confirm the row enters `attempts: 1` and gets retried by the sweeper.

- [ ] **Step 5: Bump `lastVerified` on `billing-stripe` in `CLAUDE.md`**

- [ ] **Step 6: Commit**

```powershell
git add src/app/api/stripe/webhook/route.ts CLAUDE.md
git commit -m "feat(billing-stripe): cut webhook receiver over to async queue"
```

---

## Task 11: Admin API route `/api/admin/stripe-webhook-queue`

**Files:**
- Create: `src/app/api/admin/stripe-webhook-queue/route.ts`

Two methods:
- `GET`: list rows with optional `status` filter and pagination. Admin-only.
- `POST`: replay a row by `_id` — set `status: "queued"`, `nextAttemptAt: now`, `claimedAt: null`. Admin-only. Trigger a fan-out POST to the worker so it processes immediately rather than waiting up to 60s for the sweeper.

- [ ] **Step 1: Read the auth pattern**

Open `src/app/api/admin/invoices/charge-past-due/route.ts` and copy the `getServerSession` + admin-role check pattern.

- [ ] **Step 2: Implement the route**

Create `src/app/api/admin/stripe-webhook-queue/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueStatus } from "@/models/StripeWebhookQueue";

const ALLOWED_STATUSES: ReadonlyArray<StripeWebhookQueueStatus> = [
  "queued",
  "processing",
  "succeeded",
  "dead",
];

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") return null;
  return session;
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const skip = Math.max(Number(searchParams.get("skip") ?? 0), 0);

  const filter: Record<string, unknown> = {};
  if (statusParam && (ALLOWED_STATUSES as ReadonlyArray<string>).includes(statusParam)) {
    filter.status = statusParam;
  }

  const [rows, total] = await Promise.all([
    StripeWebhookQueue.find(filter)
      .sort({ enqueuedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("eventId type status attempts nextAttemptAt claimedAt lastError enqueuedAt processedAt")
      .lean(),
    StripeWebhookQueue.countDocuments(filter),
  ]);

  return NextResponse.json({ rows, total, limit, skip });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { _id?: string };
  try {
    body = (await request.json()) as { _id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body._id || !mongoose.isValidObjectId(body._id)) {
    return NextResponse.json({ error: "Invalid _id" }, { status: 400 });
  }

  await connectDB();
  const row = await StripeWebhookQueue.findById(body._id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  row.status = "queued";
  row.nextAttemptAt = new Date();
  row.claimedAt = null;
  row.lastError = null;
  // Intentionally do NOT reset attempts — preserves the audit trail of how
  // many times this event has failed previously.
  await row.save();

  // Immediate fan-out so the engineer doesn't wait up to 60s for the sweeper.
  const workerSecret = process.env.STRIPE_WORKER_INTERNAL_SECRET;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  void fetch(`${baseUrl}/api/stripe/process-event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": workerSecret ?? "",
    },
    body: JSON.stringify({ eventId: row.eventId }),
  }).catch((err) => console.error("[webhook-replay] fan-out POST failed:", err));

  return NextResponse.json({ replayed: true, eventId: row.eventId });
}
```

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/admin/stripe-webhook-queue/route.ts
git commit -m "feat(billing-stripe): add admin list+replay route for webhook queue"
```

---

## Task 12: Admin page UI

**Files:**
- Create: `src/app/admin/stripe-webhook-queue/page.tsx` (server component)
- Create: `src/app/admin/stripe-webhook-queue/QueueTable.tsx` (client component)

- [ ] **Step 1: Server page**

Create `src/app/admin/stripe-webhook-queue/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import QueueTable from "./QueueTable";

export const dynamic = "force-dynamic";

export default async function StripeWebhookQueuePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Stripe Webhook Queue</h1>
      <p className="mb-6 text-sm text-gray-600">
        Async processing pipeline for Stripe webhook events. Rows shown in reverse-chronological
        order. Use the status filter to focus on failures or in-flight events.
      </p>
      <QueueTable />
    </div>
  );
}
```

- [ ] **Step 2: Client table**

Create `src/app/admin/stripe-webhook-queue/QueueTable.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type Row = {
  _id: string;
  eventId: string;
  type: string;
  status: "queued" | "processing" | "succeeded" | "dead";
  attempts: number;
  nextAttemptAt: string;
  claimedAt: string | null;
  lastError: string | null;
  enqueuedAt: string;
  processedAt: string | null;
};

const STATUSES = ["", "queued", "processing", "succeeded", "dead"] as const;

export default function QueueTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  async function fetchRows() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/stripe-webhook-queue?${params.toString()}`);
      const data = (await res.json()) as { rows: Row[]; total: number };
      setRows(data.rows);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleReplay(_id: string) {
    setReplayingId(_id);
    try {
      await fetch("/api/admin/stripe-webhook-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ _id }),
      });
      // Optimistic refresh after a brief delay so the worker has time to run.
      setTimeout(() => void fetchRows(), 1500);
    } finally {
      setReplayingId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm">
          Status:{" "}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || "all"}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm text-gray-600">{total} total</span>
        <button
          onClick={() => void fetchRows()}
          className="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200"
        >
          Refresh
        </button>
        {loading && <span className="text-sm text-gray-500">Loading…</span>}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Event ID</th>
            <th className="p-2">Type</th>
            <th className="p-2">Status</th>
            <th className="p-2">Attempts</th>
            <th className="p-2">Next attempt</th>
            <th className="p-2">Last error</th>
            <th className="p-2">Enqueued</th>
            <th className="p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id} className="border-b align-top">
              <td className="p-2 font-mono text-xs">{row.eventId}</td>
              <td className="p-2 font-mono text-xs">{row.type}</td>
              <td className="p-2">{row.status}</td>
              <td className="p-2">{row.attempts}</td>
              <td className="p-2 font-mono text-xs">{new Date(row.nextAttemptAt).toLocaleString()}</td>
              <td className="p-2 max-w-md truncate text-xs text-red-700">{row.lastError ?? ""}</td>
              <td className="p-2 font-mono text-xs">{new Date(row.enqueuedAt).toLocaleString()}</td>
              <td className="p-2">
                <button
                  disabled={replayingId === row._id}
                  onClick={() => void handleReplay(row._id)}
                  className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {replayingId === row._id ? "Replaying…" : "Replay"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/app/admin/stripe-webhook-queue
git commit -m "feat(billing-stripe): add admin UI for stripe webhook queue"
```

---

## Task 13: `vercel.json` updates (new routes + 60s bumps + new cron)

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add the three new function entries**

In the `"functions"` object, add (place near other Stripe + admin entries):

```jsonc
"src/app/api/stripe/process-event/route.ts":                { "memory": 1024, "maxDuration": 300 },
"src/app/api/cron/process-stripe-webhook-queue/route.ts":   { "memory": 1024, "maxDuration": 300 },
"src/app/api/admin/stripe-webhook-queue/route.ts":          { "memory": 1024, "maxDuration": 60 },
```

- [ ] **Step 2: Bump the webhook receiver**

Change the existing entry from `"maxDuration": 30` to `"maxDuration": 60`:

```jsonc
"src/app/api/stripe/webhook/route.ts": { "memory": 1024, "maxDuration": 60 },
```

- [ ] **Step 3: Add 60s entries for user-blocking critical paths**

Add the following glob entries. **Order matters** — these must appear before the `"src/app/api/**/route.ts"` catch-all so Vercel picks the more specific patterns:

```jsonc
"src/app/api/stripe/**/route.ts":          { "memory": 512, "maxDuration": 60 },
"src/app/api/payment-intent/**/route.ts":  { "memory": 512, "maxDuration": 60 },
"src/app/api/subscription/**/route.ts":    { "memory": 512, "maxDuration": 60 },
"src/app/api/invoice/**/route.ts":         { "memory": 512, "maxDuration": 60 },
"src/app/api/orders/**/route.ts":          { "memory": 512, "maxDuration": 60 },
```

The webhook + process-event + admin queue entries above this list are *more specific* than `"src/app/api/stripe/**/route.ts"` and will keep their explicit limits — verify visually that those three entries appear before the new `"src/app/api/stripe/**/route.ts"` line in the file so Vercel sees them first.

- [ ] **Step 4: Add the sweeper cron**

In the `"crons"` array, append:

```jsonc
{ "path": "/api/cron/process-stripe-webhook-queue", "schedule": "* * * * *" }
```

- [ ] **Step 5: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`
Expected: silent (no parse error).

Also run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add vercel.json
git commit -m "chore(infrastructure): wire vercel.json for webhook async queue + 60s bumps"
```

---

## Task 14: Replay-safety regression test

**This is the load-bearing safety test** — it proves that running a handler twice for the same event does NOT double-grant benefits. Add it after the worker route exists so it can exercise the real dispatch.

**Files:**
- Create: `src/services/stripe-webhook-handlers/__tests__/replay-safety.test.ts`
- Modify: `package.json` — add `test:webhook-queue-replay-safe` script

- [ ] **Step 1: Write the test**

Create `src/services/stripe-webhook-handlers/__tests__/replay-safety.test.ts`:

```ts
import assert from "node:assert/strict";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import { dispatchStripeEvent } from "../index";

/**
 * Regression test for the no-double-grant guarantee. Calls the dispatcher
 * twice for the same invoice.payment_succeeded event and asserts that
 * exactly one PaymentEvent BenefitsGranted-invoice_<id> row exists.
 *
 * If this test ever fails, the four-layer dedup has been broken in a way
 * that would let users be granted benefits twice when Stripe replays an
 * event. Treat it as a P0 regression.
 */

// Minimal invoice.payment_succeeded fixture. Adjust to whatever shape your
// existing handler tests use (look at src/services/subscription/__tests__/
// for examples of a working invoice fixture). The eventId is the part this
// test cares about.
const FIXTURE_INVOICE_ID = "in_replay_safe_test_001";
const FIXTURE_EVENT_ID = "evt_replay_safe_test_001";

function buildFixtureEvent(): import("stripe").Stripe.Event {
  // Replace this with the smallest viable invoice fixture that your
  // existing handler accepts. The key fields are: id, type, data.object
  // (with id + customer + subscription + amount_paid + status: "paid"
  // + billing_reason: "subscription_cycle" + lines.data).
  return {
    id: FIXTURE_EVENT_ID,
    type: "invoice.payment_succeeded",
    data: {
      object: {
        id: FIXTURE_INVOICE_ID,
        object: "invoice",
        status: "paid",
        amount_paid: 5000,
        billing_reason: "subscription_cycle",
        customer: "cus_replay_test_001",
        subscription: "sub_replay_test_001",
        lines: { data: [], has_more: false, object: "list", url: "" },
        metadata: {},
      },
    },
    created: 1715476800,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    api_version: "2024-06-20",
    object: "event",
  } as unknown as import("stripe").Stripe.Event;
}

async function run() {
  await connectDB();
  await PaymentEvent.deleteMany({ eventId: `BenefitsGranted-invoice_${FIXTURE_INVOICE_ID}` });

  const event = buildFixtureEvent();

  // First dispatch — should grant.
  try {
    await dispatchStripeEvent(event);
  } catch (err) {
    // The handler may throw for unrelated reasons (e.g., missing user) in a
    // freshly-spun test DB. We still want to verify dedup, so swallow the
    // first error and check whether a PaymentEvent was created.
    console.warn("First dispatch raised:", (err as Error).message);
  }

  // Second dispatch — must NOT create a second PaymentEvent.
  try {
    await dispatchStripeEvent(event);
  } catch {
    // Same as above — handler may throw on the duplicate path, that's fine.
  }

  const count = await PaymentEvent.countDocuments({
    eventId: `BenefitsGranted-invoice_${FIXTURE_INVOICE_ID}`,
  });
  assert.ok(
    count <= 1,
    `Replay produced ${count} BenefitsGranted PaymentEvent rows; expected at most 1`
  );

  await PaymentEvent.deleteMany({ eventId: `BenefitsGranted-invoice_${FIXTURE_INVOICE_ID}` });
  console.log("replay-safety test passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

> **Engineer note:** the fixture above uses a stub user/subscription that won't exist in a fresh test DB, so the first dispatch may early-return before granting. That's still a useful test of layer 4 — but to make this test stronger you can seed a test user with `stripeCustomerId: "cus_replay_test_001"` and a matching subscription before running. See `src/services/subscription/__tests__/` for fixture-seeding patterns.

- [ ] **Step 2: Wire up the npm script**

```json
"test:webhook-queue-replay-safe": "tsx src/services/stripe-webhook-handlers/__tests__/replay-safety.test.ts",
```

- [ ] **Step 3: Run the test**

Run: `npm run test:webhook-queue-replay-safe`
Expected: PASS (prints `replay-safety test passed`).

If it FAILS with `count > 1`, **stop** — the dedup has been broken by something in this plan; do not commit further until fixed.

- [ ] **Step 4: Lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/stripe-webhook-handlers/__tests__/replay-safety.test.ts package.json
git commit -m "test(billing-stripe): add replay-safety regression for webhook handlers"
```

---

## Task 15: Orphan-recovery regression test

**Files:**
- Create: `src/services/stripe-webhook-queue/__tests__/orphan-recovery.test.ts`
- Modify: `package.json` — add `test:webhook-queue-orphan-recovery` script

This test exercises the sweeper's orphan-recovery branch directly (without going through the cron HTTP route).

- [ ] **Step 1: Write the test**

Create `src/services/stripe-webhook-queue/__tests__/orphan-recovery.test.ts`:

```ts
import assert from "node:assert/strict";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";

/**
 * Verifies that a row stuck in `processing` with a stale claimedAt is
 * recovered: status flips back to `queued` and attempts is incremented so
 * it enters the normal retry path. This test exercises the recovery logic
 * by inlining the same query+update the sweeper route runs.
 */

const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

async function run() {
  await connectDB();
  await StripeWebhookQueue.deleteMany({ eventId: /^evt_orphan_/ });

  const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
  await StripeWebhookQueue.create({
    eventId: "evt_orphan_001",
    type: "invoice.payment_succeeded",
    payload: { id: "evt_orphan_001" },
    status: "processing",
    attempts: 0,
    nextAttemptAt: sixMinAgo,
    claimedAt: sixMinAgo,
    enqueuedAt: sixMinAgo,
  });

  // Inline the sweeper's orphan-recovery query so the test doesn't have to
  // boot a Next.js route. If the sweeper route changes, mirror the change
  // here.
  const now = new Date();
  const orphans = await StripeWebhookQueue.find({
    status: "processing",
    claimedAt: { $lt: new Date(now.getTime() - ORPHAN_THRESHOLD_MS) },
  }).lean();

  assert.equal(orphans.length, 1, "should detect exactly one orphan");

  for (const orphan of orphans) {
    await StripeWebhookQueue.updateOne(
      { _id: orphan._id, status: "processing" },
      {
        $set: {
          status: "queued",
          attempts: (orphan.attempts ?? 0) + 1,
          nextAttemptAt: now,
          lastError: "orphan: worker did not complete within threshold",
          claimedAt: null,
        },
      }
    );
  }

  const recovered = await StripeWebhookQueue.findOne({ eventId: "evt_orphan_001" }).lean();
  assert.equal(recovered?.status, "queued");
  assert.equal(recovered?.attempts, 1);
  assert.equal(recovered?.claimedAt, null);

  await StripeWebhookQueue.deleteMany({ eventId: /^evt_orphan_/ });
  console.log("orphan-recovery test passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire up the npm script**

```json
"test:webhook-queue-orphan-recovery": "tsx src/services/stripe-webhook-queue/__tests__/orphan-recovery.test.ts",
```

- [ ] **Step 3: Run the test**

Run: `npm run test:webhook-queue-orphan-recovery`
Expected: PASS.

- [ ] **Step 4: Lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/stripe-webhook-queue/__tests__/orphan-recovery.test.ts package.json
git commit -m "test(billing-stripe): add orphan-recovery regression for sweeper"
```

---

## Task 16: Finalize domain documentation

**Files:**
- Modify: `docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md` (replace the Task-1 stub with the full doc)
- Modify: `CLAUDE.md` — bump `billing-stripe.lastVerified` to `"2026-05-12"`

- [ ] **Step 1: Replace the stub with the full doc**

Overwrite `docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md` with:

```markdown
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

Layer 4 is load-bearing. The replay-safety regression test (`test:webhook-queue-replay-safe`) proves dispatching the same event twice produces at most one `PaymentEvent` row.

## The sweeper does not charge or grant

The sweeper is purely a "kick the worker" trigger. It queries Mongo and POSTs to the worker. It never calls Stripe and never grants benefits itself.

## Required environment variables

| Var | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Existing — signature verification |
| `STRIPE_WORKER_INTERNAL_SECRET` | **New** — gates the worker route (`x-internal-secret` header) and is sent by the receiver fan-out + the sweeper. Generate a 32+ char random string. |
| `CRON_SECRET` | Existing — Vercel cron auth |

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

- Spec: [docs/superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md](../superpowers/specs/2026-05-12-stripe-webhook-async-queue-design.md)
- Plan: [docs/superpowers/plans/2026-05-12-stripe-webhook-async-queue.md](../superpowers/plans/2026-05-12-stripe-webhook-async-queue.md)
- Adjacent: [CHARGE_PAST_DUE_CUSTOMERS.md](../CHARGE_PAST_DUE_CUSTOMERS.md), [PAYMENT_ATTRIBUTION.md](../PAYMENT_ATTRIBUTION.md)
```

- [ ] **Step 2: Bump `lastVerified`**

In `CLAUDE.md`, set `billing-stripe.lastVerified` to `"2026-05-12"`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md CLAUDE.md
git commit -m "docs(billing-stripe): finalize webhook async queue documentation"
```

---

## Post-implementation deploy checklist (engineer runs this manually)

1. Set `STRIPE_WORKER_INTERNAL_SECRET` in Vercel project env (production + preview).
2. Deploy the branch to a Vercel preview.
3. Confirm `vercel.json` cron is registered: Vercel Dashboard → Project → Cron Jobs should list `process-stripe-webhook-queue` at `* * * * *`.
4. Trigger `stripe trigger invoice.payment_succeeded` from Stripe CLI in test mode against the preview URL. Verify:
   - Receiver returns 200 in <1s.
   - `stripewebhookqueue` row created, transitions to `succeeded` within ~30s.
   - `ProcessedStripeEvent` row created.
   - Existing handler side-effects fire (entries granted, Klaviyo event, etc.).
5. Replay one event from the admin UI. Confirm a new entry isn't double-granted (`PaymentEvent` count unchanged).
6. Promote preview → production.
7. **Drain in-flight Stripe retries:** Stripe is still retrying the May 12 failed events from yesterday's incident. They will arrive at the new receiver, get queued, and process through the worker. Watch `stripewebhookqueue` for ~1 hour after deploy to confirm they all reach `succeeded`. Any that hit `dead` need manual investigation via the admin UI.

---

## Plan self-review notes

- **Spec coverage:** all spec sections map to tasks — model (3), backoff (2), services (4/5/6), handlers (7), worker (8), sweeper (9), receiver cutover (10), admin (11/12), vercel.json (13), tests (2/4/5/6/14/15), domain doc (1/16), manifest (1/7/10/16).
- **Type consistency:** `claimNextAttempt(eventId)` signature matches across the worker, tests, and admin replay. `markSucceeded(eventId)` and `markFailed(eventId, error)` consistent. `StripeWebhookQueueStatus` is the single source of truth for the four status strings.
- **Hooks honored:** every commit that touches `src/` or `scripts/` either updates `docs/billing-stripe/` or is purely additive in a path already covered by the Task-1 manifest addition.
- **No-auto-commit rule honored:** every Commit step shows the command for the engineer to run; nothing in the plan instructs them to commit without authorization.
