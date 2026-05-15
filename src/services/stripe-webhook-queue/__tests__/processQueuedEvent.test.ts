import { config } from "dotenv";
import path from "path";

// Load .env.local before any import that reads env vars at module load.
// processQueuedEvent transitively imports @/lib/stripe (which throws if
// STRIPE_SECRET_KEY is unset), so the heavy imports below are dynamic and
// happen inside run() AFTER config() — same convention as
// stripe-webhook-handlers/__tests__/replay-safety.test.ts.
config({ path: path.resolve(process.cwd(), ".env.local") });

import assert from "node:assert/strict";
// Type-only import: erased at compile time, so it does NOT trigger the
// eager @/lib/stripe module load that forces the dynamic imports below.
import type { StripeWebhookQueueDoc } from "@/models/StripeWebhookQueue";

function fakeEvent(id: string) {
  return { id, type: "customer.updated", data: { object: { id: "obj_x" } } };
}

async function run() {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: StripeWebhookQueue } = await import("@/models/StripeWebhookQueue");
  const { default: ProcessedStripeEvent } = await import("@/models/ProcessedStripeEvent");
  const { processQueuedEvent } = await import(
    "@/services/stripe-webhook-queue/processQueuedEvent"
  );

  await connectDB();
  const prefix = `test_pqe_${Date.now()}`;

  try {
  // (a) happy path: queued row -> succeeded
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
  const rowA = await StripeWebhookQueue.findOne({ eventId: idA }).lean<StripeWebhookQueueDoc | null>();
  assert.equal(rowA?.status, "succeeded", "a: status succeeded");

  // (b) not claimable (no queued row) -> skipped
  const rB = await processQueuedEvent(`${prefix}_missing`, {
    dispatch: async () => ({ shouldMarkAsProcessed: false }),
  });
  assert.equal(rB.processed, false, "b: not processed");
  assert.equal(rB.skipped, "not_claimable", "b: skipped reason");

  // (c) handler throws -> markFailed (status back to queued, attempts incremented)
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
  const rowC = await StripeWebhookQueue.findOne({ eventId: idC }).lean<StripeWebhookQueueDoc | null>();
  assert.equal(rowC?.status, "queued", "c: requeued");
  assert.equal(rowC?.attempts, 1, "c: attempts incremented");
  assert.equal(rowC?.lastError, "boom", "c: lastError set");

  // (d) already in ProcessedStripeEvent -> skip without dispatch
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
  const rowD = await StripeWebhookQueue.findOne({ eventId: idD }).lean<StripeWebhookQueueDoc | null>();
  assert.equal(rowD?.status, "succeeded", "d: row marked succeeded");
  } finally {
    await StripeWebhookQueue.deleteMany({ eventId: { $regex: `^${prefix}` } });
    await ProcessedStripeEvent.deleteMany({ eventId: { $regex: `^${prefix}` } });
  }

  console.log("✅ processQueuedEvent.test passed");
  process.exit(0);
}

run().catch((e) => { console.error("❌ test failed:", e); process.exit(1); });
