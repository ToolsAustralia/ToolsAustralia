import assert from "node:assert/strict";
import { nextWatermark } from "../KlaviyoProfileReconciliationService";

const T0 = new Date("2026-08-26T00:00:00.000Z");
const T1 = new Date("2026-08-26T00:05:00.000Z");

// A clean run advances the watermark to the newest updatedAt it actually covered.
function testCleanRunAdvances() {
  assert.equal(nextWatermark(T0, T1, 0).toISOString(), T1.toISOString());
}

// THE SELF-HEALING PROPERTY. If ANY user in the batch failed to sync, the watermark must NOT
// move, so the next run re-covers the same window. Without this a transient Klaviyo outage
// silently drops every user in that window — the exact class of bug this subsystem exists to
// remove.
function testFailedRunDoesNotAdvance() {
  assert.equal(nextWatermark(T0, T1, 1).toISOString(), T0.toISOString());
  assert.equal(nextWatermark(T0, T1, 47).toISOString(), T0.toISOString());
}

// Nothing to do: hold position rather than jumping to "now", which would skip any user
// mutated between the query and the write.
function testEmptyBatchHoldsPosition() {
  assert.equal(nextWatermark(T0, null, 0).toISOString(), T0.toISOString());
}

// Never move backwards, whatever the batch reports.
function testNeverGoesBackwards() {
  const earlier = new Date("2026-08-25T00:00:00.000Z");
  assert.equal(nextWatermark(T0, earlier, 0).toISOString(), T0.toISOString());
}

// An identical timestamp is not "progress" but must not regress either.
function testEqualTimestampHoldsPosition() {
  assert.equal(nextWatermark(T0, new Date(T0.getTime()), 0).toISOString(), T0.toISOString());
}

function run() {
  testCleanRunAdvances();
  testFailedRunDoesNotAdvance();
  testEmptyBatchHoldsPosition();
  testNeverGoesBackwards();
  testEqualTimestampHoldsPosition();
  console.log("klaviyo-reconciliation tests passed");
}

run();
