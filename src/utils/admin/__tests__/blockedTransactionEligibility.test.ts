import assert from "node:assert/strict";
import { computeEligibilityKind } from "../blockedTransactionEligibility";

function testAlreadyAllowlistedWins() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: true,
    preview: { eligible: true },
  });
  assert.equal(kind, "already_allowlisted");
}

function testAutoEligible() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: false,
    preview: { eligible: true },
  });
  assert.equal(kind, "auto_eligible");
}

function testFraudSignal() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: false,
    preview: { eligible: false, reason: "filter_fraud_signal" },
  });
  assert.equal(kind, "fraud_signal");
}

function testPermanentIssue() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: false,
    preview: { eligible: false, reason: "filter_permanent_issue" },
  });
  assert.equal(kind, "permanent_issue");
}

function testNotMember() {
  const kind = computeEligibilityKind({
    alreadyAllowlisted: false,
    preview: { eligible: false, reason: "filter_not_member" },
  });
  assert.equal(kind, "not_member");
}

testAlreadyAllowlistedWins();
testAutoEligible();
testFraudSignal();
testPermanentIssue();
testNotMember();
console.log("✓ blockedTransactionEligibility — all tests passed");
