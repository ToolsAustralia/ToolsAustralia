import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";

// Load .env.local for tsx test execution
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueDoc } from "@/models/StripeWebhookQueue";

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

  const recovered = await StripeWebhookQueue.findOne({ eventId: "evt_orphan_001" }).lean<StripeWebhookQueueDoc | null>();
  assert.ok(recovered, "recovered document should exist");
  assert.equal(recovered!.status, "queued");
  assert.equal(recovered!.attempts, 1);
  assert.equal(recovered!.claimedAt, null);

  await StripeWebhookQueue.deleteMany({ eventId: /^evt_orphan_/ });
  console.log("orphan-recovery test passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
