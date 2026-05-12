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
