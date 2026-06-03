import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import NormTriggerReceipt from "@/models/NormTriggerReceipt";

async function run() {
  await connectDB();
  const created: string[] = [];
  try {
    const r = await NormTriggerReceipt.create({
      receiptId: "norm_rcpt_TEST",
      registryKey: "charge-past-due.retry-one",
      inputsHash: "h",
      plan: { summary: "test", affectedEntities: [], warnings: [] },
      signature: "sig",
      used: false,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    created.push(r.receiptId);

    // Re-fetch to verify persistence
    const fetched = await NormTriggerReceipt.findOne({ receiptId: "norm_rcpt_TEST" }).lean<{
      used: boolean;
      expiresAt: Date;
    } | null>();
    assert.ok(fetched, "doc persisted and fetchable");
    assert.equal(fetched!.used, false);
    assert.ok(fetched!.expiresAt > new Date());

    // Verify atomic-flip pattern works (single-use guarantee):
    const flipped = await NormTriggerReceipt.findOneAndUpdate(
      { receiptId: "norm_rcpt_TEST", used: false },
      { $set: { used: true, usedAt: new Date() } },
      { new: true }
    );
    assert.ok(flipped, "first flip succeeds");
    const refusedFlip = await NormTriggerReceipt.findOneAndUpdate(
      { receiptId: "norm_rcpt_TEST", used: false },
      { $set: { used: true } },
      { new: true }
    );
    assert.equal(refusedFlip, null, "second flip refused (single-use)");
    console.log("✓ NormTriggerReceipt single-use semantics ok");
  } finally {
    if (created.length) await NormTriggerReceipt.deleteMany({ receiptId: { $in: created } });
    await mongoose.disconnect();
  }
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
