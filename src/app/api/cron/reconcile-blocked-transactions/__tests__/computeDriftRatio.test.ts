import assert from "node:assert/strict";
import { computeDriftRatio } from "../route";

// ---------- computeDriftRatio() tests ----------

function testBothZeroIsNoDrift() {
  assert.equal(
    computeDriftRatio(0, 0),
    0,
    "both zero must produce zero drift (no data, no signal)"
  );
}

function testPerfectMatchIsNoDrift() {
  assert.equal(
    computeDriftRatio(5, 5),
    0,
    "perfect match must produce zero drift"
  );
}

function testMongoNonZeroStripeZeroIsFullDrift() {
  assert.equal(
    computeDriftRatio(5, 0),
    1,
    "Mongo > 0 with Stripe 0 must produce 100% drift (we have rows Stripe doesn't)"
  );
}

function testMongoZeroStripeNonZeroIsFullDrift() {
  assert.equal(
    computeDriftRatio(0, 5),
    1,
    "Mongo 0 with Stripe 5 must produce |0-5|/5 = 1 (100% drift)"
  );
}

function testMongoUnderBy20Percent() {
  assert.equal(
    computeDriftRatio(4, 5),
    0.2,
    "Mongo under by 1 of 5 must produce 0.2 (20% drift, below threshold)"
  );
}

function testMongoOverBy20Percent() {
  assert.equal(
    computeDriftRatio(6, 5),
    0.2,
    "Mongo over by 1 of 5 must produce 0.2 (20% drift)"
  );
}

function testMongoDoubleStripeIs100PercentDrift() {
  assert.equal(
    computeDriftRatio(10, 5),
    1.0,
    "Mongo 10 vs Stripe 5 must produce |10-5|/5 = 1.0 (100% drift)"
  );
}

function run() {
  testBothZeroIsNoDrift();
  testPerfectMatchIsNoDrift();
  testMongoNonZeroStripeZeroIsFullDrift();
  testMongoZeroStripeNonZeroIsFullDrift();
  testMongoUnderBy20Percent();
  testMongoOverBy20Percent();
  testMongoDoubleStripeIs100PercentDrift();
  console.log("computeDriftRatio tests passed");
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
