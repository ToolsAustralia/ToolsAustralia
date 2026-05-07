import assert from "node:assert/strict";
import { computeEligibility, type EligibilityMaps } from "../AllowlistService";

// These tests focus on the pure pieces of listBlocked that don't touch Mongo:
// the eligibility post-filter mapping, and the verdict logic shared with the
// UI. Mongo-bound query construction (regex, $in) is covered by integration
// in dev — we don't spin up Mongo for unit tests.
//
// Wired via npm run test:list-blocked-filters.

function makeMaps(opts: { hasUser?: boolean; hasPaid?: boolean } = {}): EligibilityMaps {
  const userByCustomerId = new Map<string, { _id: string }>();
  const userByEmail = new Map<string, { _id: string }>();
  const paidUserIds = new Set<string>();
  if (opts.hasUser) {
    userByCustomerId.set("cus_1", { _id: "u_1" });
    userByEmail.set("a@b.com", { _id: "u_1" });
  }
  if (opts.hasPaid) {
    paidUserIds.add("u_1");
  }
  return { userByCustomerId, userByEmail, paidUserIds };
}

function testFraudSignalShortCircuits() {
  const result = computeEligibility(
    { declineCode: "lost_card", stripeCustomerId: "cus_1", customerEmail: "a@b.com" },
    makeMaps({ hasUser: true, hasPaid: true })
  );
  assert.deepEqual(result, { eligible: false, reason: "filter_fraud_signal" });
}

function testPermanentIssueShortCircuits() {
  const result = computeEligibility(
    { declineCode: "expired_card", stripeCustomerId: "cus_1", customerEmail: "a@b.com" },
    makeMaps({ hasUser: true, hasPaid: true })
  );
  assert.deepEqual(result, { eligible: false, reason: "filter_permanent_issue" });
}

function testNotMemberWhenNoUser() {
  const result = computeEligibility(
    { declineCode: "generic_decline", stripeCustomerId: "cus_unknown", customerEmail: "x@y.com" },
    makeMaps({ hasUser: false, hasPaid: false })
  );
  assert.deepEqual(result, { eligible: false, reason: "filter_not_member" });
}

function testNotMemberWhenUnpaid() {
  const result = computeEligibility(
    { declineCode: "generic_decline", stripeCustomerId: "cus_1", customerEmail: "a@b.com" },
    makeMaps({ hasUser: true, hasPaid: false })
  );
  assert.deepEqual(result, { eligible: false, reason: "filter_not_member" });
}

function testEligibleWhenPaidMember() {
  const result = computeEligibility(
    { declineCode: "generic_decline", stripeCustomerId: "cus_1", customerEmail: "a@b.com" },
    makeMaps({ hasUser: true, hasPaid: true })
  );
  assert.deepEqual(result, { eligible: true });
}

testFraudSignalShortCircuits();
testPermanentIssueShortCircuits();
testNotMemberWhenNoUser();
testNotMemberWhenUnpaid();
testEligibleWhenPaidMember();
console.log("✓ listBlockedFilters — all tests passed");
