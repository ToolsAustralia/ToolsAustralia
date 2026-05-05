import assert from "node:assert/strict";
import {
  RECENT_ATTEMPT_WINDOW_HOURS,
  buildAdminChargeIdempotencyKey,
  cutoffForRecentAttempt,
} from "../past-due-charge-idempotency";

function testWindowConstant() {
  assert.equal(RECENT_ATTEMPT_WINDOW_HOURS, 24);
}

function testCutoffIs24hBeforeNow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const cutoff = cutoffForRecentAttempt(now);
  assert.equal(cutoff.toISOString(), "2026-05-04T12:00:00.000Z");
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

function run() {
  testWindowConstant();
  testCutoffIs24hBeforeNow();
  testCutoffMovesWithNow();
  testIdempotencyKeyIsStableForSameInvoice();
  testIdempotencyKeyDiffersByInvoice();
  console.log("chargePastDueShared helpers tests passed");
}

run();
