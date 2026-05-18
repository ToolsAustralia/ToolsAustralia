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
function run() {
  testValidDoc();
  testInvalidReason();
  console.log("PASS CancellationFlowEvent model");
}
run();
