import assert from "node:assert/strict";
import {
  RECENT_ATTEMPT_WINDOW_HOURS,
  SKIP_REASON_NO_LONGER_PAST_DUE,
  buildAdminChargeIdempotencyKey,
  cutoffForRecentAttempt,
  shouldSkipForNotPastDue,
} from "../past-due-charge-idempotency";

function testWindowConstant() {
  assert.equal(RECENT_ATTEMPT_WINDOW_HOURS, 6);
}

function testCutoffIs6hBeforeNow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const cutoff = cutoffForRecentAttempt(now);
  assert.equal(cutoff.toISOString(), "2026-05-05T06:00:00.000Z");
}

function testCutoffMovesWithNow() {
  const earlier = cutoffForRecentAttempt(new Date("2026-05-05T00:00:00.000Z"));
  const later = cutoffForRecentAttempt(new Date("2026-05-06T00:00:00.000Z"));
  assert.ok(later.getTime() > earlier.getTime());
  assert.equal(later.getTime() - earlier.getTime(), 24 * 60 * 60 * 1000);
}

function testIdempotencyKeyIsStableForSameInvoice() {
  const k1 = buildAdminChargeIdempotencyKey("in_123");
  const k2 = buildAdminChargeIdempotencyKey("in_123");
  assert.equal(k1, k2);
  assert.equal(k1, "admin-charge-in_123");
}

function testIdempotencyKeyDiffersByInvoice() {
  const a = buildAdminChargeIdempotencyKey("in_aaa");
  const b = buildAdminChargeIdempotencyKey("in_bbb");
  assert.notEqual(a, b);
}

function testSkipReasonConstantStable() {
  assert.equal(SKIP_REASON_NO_LONGER_PAST_DUE, "no_longer_past_due");
}

function testShouldSkipWhenStatusActive() {
  assert.equal(shouldSkipForNotPastDue("active"), true);
}

function testShouldSkipWhenStatusUndefined() {
  assert.equal(shouldSkipForNotPastDue(undefined), true);
  assert.equal(shouldSkipForNotPastDue(null), true);
  assert.equal(shouldSkipForNotPastDue(""), true);
}

function testShouldNotSkipWhenStatusPastDue() {
  assert.equal(shouldSkipForNotPastDue("past_due"), false);
}

function testShouldNotSkipWhenStatusPastDueWithUppercase() {
  assert.equal(shouldSkipForNotPastDue("Past_Due"), false);
}

function run() {
  testWindowConstant();
  testCutoffIs6hBeforeNow();
  testCutoffMovesWithNow();
  testIdempotencyKeyIsStableForSameInvoice();
  testIdempotencyKeyDiffersByInvoice();
  testSkipReasonConstantStable();
  testShouldSkipWhenStatusActive();
  testShouldSkipWhenStatusUndefined();
  testShouldNotSkipWhenStatusPastDue();
  testShouldNotSkipWhenStatusPastDueWithUppercase();
  console.log("chargePastDueShared helpers tests passed");
}

run();
