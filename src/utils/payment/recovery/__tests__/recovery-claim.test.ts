/**
 * RecoveryClaim per-subscription lock — integration test (hits the .env.local Mongo, cleans up).
 * Run: npm run test:recovery-claim
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import {
  acquireRecoveryClaim,
  releaseRecoveryClaim,
  RECOVERY_CLAIM_STALE_MS,
} from "../recovery-claim";

// Deterministic, obviously-test subscription id (no Math.random / Date.now for the id).
const SUB = "sub_TEST_recovery_claim_fixture";

async function run() {
  await connectDB();
  try {
    // Clean any leftover from a prior interrupted run.
    await releaseRecoveryClaim(SUB);

    // 1. First acquire wins (no existing claim → upsert insert).
    assert.equal(await acquireRecoveryClaim(SUB, "test-a"), true, "first acquire should win");

    // 2. A second acquire while the claim is live must lose.
    assert.equal(
      await acquireRecoveryClaim(SUB, "test-b"),
      false,
      "second acquire while held should lose"
    );

    // 3. After release, acquire wins again.
    await releaseRecoveryClaim(SUB);
    assert.equal(await acquireRecoveryClaim(SUB, "test-c"), true, "acquire after release should win");

    // 4. Stale reclaim: view "now" as far in the future so the live claim looks abandoned.
    const future = new Date(Date.now() + RECOVERY_CLAIM_STALE_MS + 60_000);
    assert.equal(
      await acquireRecoveryClaim(SUB, "test-d", future),
      true,
      "a claim older than RECOVERY_CLAIM_STALE_MS should be reclaimable"
    );

    console.log("RecoveryClaim acquire/release tests passed");
  } finally {
    await releaseRecoveryClaim(SUB);
    await mongoose.disconnect();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
