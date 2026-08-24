import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";

// Load .env.local for tsx test execution
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueDoc } from "@/models/StripeWebhookQueue";
import { computeNextAttempt, MAX_ATTEMPTS } from "@/services/stripe-webhook-queue/backoff";

/**
 * Verifies that a row stuck in `processing` with a stale claimedAt is
 * recovered properly: either transitioning to `queued` with a next retry time
 * (if retry budget remains) or to `dead` (if attempts are at capacity).
 * This test exercises the recovery logic by inlining the same query+update
 * the sweeper route runs, including the conditional branch on computeNextAttempt.
 *
 * ⚠ THE INLINED COPY MUST TRACK THE ROUTE. Because `recoverOrphans` below is a
 * COPY of the logic in `/api/cron/process-stripe-webhook-queue/route.ts` rather
 * than an import of it, this suite goes green against its own copy and can pass
 * while the real sweeper is broken. It did exactly that on 2026-08-24: the route
 * omitted `processedAt` on the dead transition, so `dead_processedAt_ttl` (a
 * partial TTL index on `processedAt`, and MongoDB TTL skips non-date values)
 * never reaped orphan-swept rows — they were immortal, and the un-windowed
 * dead-row alert in `/api/cron/reconcile-renewal-grants` would have fired on them
 * daily forever. When you change the sweeper, change this copy in the same edit.
 */

const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

async function recoverOrphans(now: Date) {
  const orphans = await StripeWebhookQueue.find({
    status: "processing",
    claimedAt: { $lt: new Date(now.getTime() - ORPHAN_THRESHOLD_MS) },
  }).lean();

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
            // TTL anchor — see the header warning. Must match the route.
            processedAt: new Date(),
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

  return orphans.length;
}

async function testOrphanRecoveredToQueued() {
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

  const now = new Date();
  const count = await recoverOrphans(now);

  assert.equal(count, 1, "should recover exactly one orphan");

  const recovered = await StripeWebhookQueue.findOne({ eventId: "evt_orphan_001" }).lean<StripeWebhookQueueDoc | null>();
  assert.ok(recovered, "recovered document should exist");
  assert.equal(recovered!.status, "queued", "should transition to queued");
  assert.equal(recovered!.attempts, 1, "should increment attempts to 1");
  assert.equal(recovered!.claimedAt, null, "should clear claimedAt");
  assert.ok(recovered!.nextAttemptAt, "should set nextAttemptAt");

  console.log("✓ testOrphanRecoveredToQueued passed");
}

async function testOrphanAtCapTransitionsToDead() {
  await StripeWebhookQueue.deleteMany({ eventId: /^evt_orphan_/ });

  const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
  // Seed with attempts at MAX_ATTEMPTS - 1, so recovery increments to MAX_ATTEMPTS and triggers "dead"
  await StripeWebhookQueue.create({
    eventId: "evt_orphan_002",
    type: "invoice.payment_succeeded",
    payload: { id: "evt_orphan_002" },
    status: "processing",
    attempts: MAX_ATTEMPTS - 1,
    nextAttemptAt: sixMinAgo,
    claimedAt: sixMinAgo,
    enqueuedAt: sixMinAgo,
  });

  const now = new Date();
  const count = await recoverOrphans(now);

  assert.equal(count, 1, "should detect the orphan at max attempts");

  const recovered = await StripeWebhookQueue.findOne({ eventId: "evt_orphan_002" }).lean<StripeWebhookQueueDoc | null>();
  assert.ok(recovered, "recovered document should exist");
  assert.equal(recovered!.status, "dead", "should transition to dead");
  assert.equal(recovered!.attempts, MAX_ATTEMPTS, `should set attempts to MAX_ATTEMPTS (${MAX_ATTEMPTS})`);
  assert.equal(recovered!.claimedAt, null, "should clear claimedAt");
  // Without this the row never expires: `dead_processedAt_ttl` is a partial index
  // on processedAt and MongoDB TTL ignores null/missing values.
  assert.ok(
    recovered!.processedAt instanceof Date,
    "should set processedAt so the 30-day dead-row TTL can reap it"
  );

  console.log("✓ testOrphanAtCapTransitionsToDead passed");
}

async function run() {
  await connectDB();
  await testOrphanRecoveredToQueued();
  await testOrphanAtCapTransitionsToDead();
  await StripeWebhookQueue.deleteMany({ eventId: /^evt_orphan_/ });
  console.log("\norphan-recovery tests passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
