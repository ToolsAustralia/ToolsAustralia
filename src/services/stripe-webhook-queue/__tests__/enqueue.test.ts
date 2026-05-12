import assert from "node:assert/strict";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueDoc } from "@/models/StripeWebhookQueue";
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
    const row = (await StripeWebhookQueue.findOne({ eventId: "evt_one" }).lean()) as Omit<StripeWebhookQueueDoc, "_id" | "__v"> | null;
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
