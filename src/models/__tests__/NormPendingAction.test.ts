import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import NormPendingAction from "@/models/NormPendingAction";
import NormEndpointSettings from "@/models/NormEndpointSettings";

async function run() {
  await connectDB();
  const pendingIds: mongoose.Types.ObjectId[] = [];
  let settingsKey: string | null = null;
  try {
    // NormPendingAction round-trip
    const p = await NormPendingAction.create({
      receiptId: "norm_rcpt_TEST_P",
      registryKey: "klaviyo.blast",
      originalBody: { audience: "all" },
      plan: { summary: "send blast", affectedEntities: [], warnings: [] },
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    });
    pendingIds.push(p._id);
    const fetchedP = await NormPendingAction.findById(p._id).lean<{ status: string } | null>();
    assert.ok(fetchedP, "NormPendingAction persisted");
    assert.equal(fetchedP!.status, "pending");

    // NormEndpointSettings upsert + toggle
    settingsKey = "roas.summary";
    const s = await NormEndpointSettings.findOneAndUpdate(
      { registryKey: settingsKey },
      { $set: { disabled: true } },
      { upsert: true, new: true }
    );
    assert.equal(s.disabled, true);
    const fetchedS = await NormEndpointSettings.findOne({ registryKey: settingsKey }).lean<{ disabled: boolean } | null>();
    assert.ok(fetchedS, "NormEndpointSettings persisted");
    assert.equal(fetchedS!.disabled, true);

    console.log("✓ NormPendingAction + NormEndpointSettings ok");
  } finally {
    if (pendingIds.length) await NormPendingAction.deleteMany({ _id: { $in: pendingIds } });
    if (settingsKey) await NormEndpointSettings.deleteOne({ registryKey: settingsKey });
    await mongoose.disconnect();
  }
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
