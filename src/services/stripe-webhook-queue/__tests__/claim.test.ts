import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";

// Load .env.local for tsx test execution
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

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
