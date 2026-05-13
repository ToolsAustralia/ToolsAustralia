import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";

// Load .env.local for tsx test execution
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueDoc } from "@/models/StripeWebhookQueue";
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
    const row = await StripeWebhookQueue.findOne({ eventId: "evt_ok" }).lean<StripeWebhookQueueDoc | null>();
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
    const row = await StripeWebhookQueue.findOne({ eventId: "evt_retry" }).lean<StripeWebhookQueueDoc | null>();
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
    const row = await StripeWebhookQueue.findOne({ eventId: "evt_dead" }).lean<StripeWebhookQueueDoc | null>();
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
