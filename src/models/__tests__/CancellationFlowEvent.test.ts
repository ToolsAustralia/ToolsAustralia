import assert from "node:assert/strict";
import CancellationFlowEvent from "../CancellationFlowEvent";

function testValidDoc() {
  const doc = new CancellationFlowEvent({
    userId: "000000000000000000000001",
    reason: "too_expensive",
    outcome: "in_progress",
    pastDue: false,
    offersShown: [],
    startedAt: new Date(),
  });
  assert.strictEqual(doc.validateSync(), undefined, "valid doc should pass validation");
}
function testInvalidReason() {
  const bad = new CancellationFlowEvent({ userId: "000000000000000000000001", reason: "nope", outcome: "in_progress", startedAt: new Date() });
  assert.ok(bad.validateSync(), "invalid reason enum should fail validation");
}
function testMissingStartedAt() {
  const bad = new CancellationFlowEvent({ userId: "000000000000000000000001", reason: "too_expensive", outcome: "in_progress" });
  assert.ok(bad.validateSync(), "missing startedAt should fail validation (required)");
}
function testInvalidRetention90() {
  const bad = new CancellationFlowEvent({
    userId: "000000000000000000000001",
    reason: "too_expensive",
    outcome: "in_progress",
    startedAt: new Date(),
    retention90: "invalid",
  });
  assert.ok(bad.validateSync(), "invalid retention90 enum value should fail validation");
}
function run() {
  testValidDoc();
  testInvalidReason();
  testMissingStartedAt();
  testInvalidRetention90();
  console.log("PASS CancellationFlowEvent model");
}
run();
