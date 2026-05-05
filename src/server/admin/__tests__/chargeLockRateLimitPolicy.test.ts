// src/server/admin/__tests__/chargeLockRateLimitPolicy.test.ts
import assert from "node:assert/strict";
import {
  RECENT_ATTEMPT_WINDOW_HOURS,
  MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW,
  MIN_SECONDS_BETWEEN_ATTEMPTS,
  cutoffForDebounce,
  buildForceChargeIdempotencyKey,
  countForceChargeAttempts,
  hasForceChargeBudgetExhausted,
  isDebouncedTooSoon,
} from "../past-due-charge-idempotency";

function testWindowConstant() {
  assert.equal(RECENT_ATTEMPT_WINDOW_HOURS, 6);
}

function testForceChargeBudgetConstant() {
  assert.equal(MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW, 3);
}

function testDebounceConstant() {
  assert.equal(MIN_SECONDS_BETWEEN_ATTEMPTS, 30);
}

function testCutoffForDebounce() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const cutoff = cutoffForDebounce(now);
  assert.equal(cutoff.toISOString(), "2026-05-06T11:59:30.000Z");
}

function testBuildForceChargeKeyAdmin() {
  assert.equal(
    buildForceChargeIdempotencyKey("in_x", "admin", 1),
    "admin-charge-in_x-fc-admin-1"
  );
  assert.equal(
    buildForceChargeIdempotencyKey("in_x", "admin", 3),
    "admin-charge-in_x-fc-admin-3"
  );
}

function testBuildForceChargeKeyUser() {
  assert.equal(
    buildForceChargeIdempotencyKey("in_x", "user", 2),
    "admin-charge-in_x-fc-user-2"
  );
}

function testKeysAreDistinctAcrossPathsAndAttempts() {
  const keys = [
    buildForceChargeIdempotencyKey("in_x", "admin", 1),
    buildForceChargeIdempotencyKey("in_x", "admin", 2),
    buildForceChargeIdempotencyKey("in_x", "admin", 3),
    buildForceChargeIdempotencyKey("in_x", "user", 1),
    buildForceChargeIdempotencyKey("in_x", "user", 2),
    buildForceChargeIdempotencyKey("in_x", "user", 3),
  ];
  assert.equal(new Set(keys).size, 6);
}

function testCountForceChargeAttemptsZeroOnEmpty() {
  assert.equal(countForceChargeAttempts([], "admin"), 0);
}

function testCountForceChargeAttemptsAdminOnly() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z"), result: { forceCharge: { triggeredBy: "user" } } },
    { attemptedAt: new Date("2026-05-06T11:30:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(countForceChargeAttempts(rows, "admin", now), 2);
  assert.equal(countForceChargeAttempts(rows, "user", now), 1);
}

function testCountForceChargeAttemptsExcludesOutsideWindow() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  // 7h ago — outside the 6h window
  const rows = [
    { attemptedAt: new Date("2026-05-06T05:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    // 5h ago — inside
    { attemptedAt: new Date("2026-05-06T07:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(countForceChargeAttempts(rows, "admin", now), 1);
}

function testCountForceChargeAttemptsIgnoresUntaggedRows() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  // Bulk past-due charger row — no forceCharge tag
  const rows = [
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: {} },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z") }, // no result at all
  ];
  assert.equal(countForceChargeAttempts(rows, "admin", now), 0);
  assert.equal(countForceChargeAttempts(rows, "user", now), 0);
}

function testHasBudgetExhaustedFalseAtTwo() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(hasForceChargeBudgetExhausted(rows, "admin", now), false);
}

function testHasBudgetExhaustedTrueAtThree() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T09:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(hasForceChargeBudgetExhausted(rows, "admin", now), true);
}

function testHasBudgetExhaustedSeparatePerPath() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  // 3 admin attempts but 0 user attempts — admin exhausted, user not
  const rows = [
    { attemptedAt: new Date("2026-05-06T09:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T10:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
    { attemptedAt: new Date("2026-05-06T11:00:00.000Z"), result: { forceCharge: { triggeredBy: "admin" } } },
  ];
  assert.equal(hasForceChargeBudgetExhausted(rows, "admin", now), true);
  assert.equal(hasForceChargeBudgetExhausted(rows, "user", now), false);
}

function testIsDebouncedTooSoonTrueWithin30s() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T11:59:50.000Z") }, // 10s ago
  ];
  assert.equal(isDebouncedTooSoon(rows, now), true);
}

function testIsDebouncedTooSoonFalseAfter30s() {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows = [
    { attemptedAt: new Date("2026-05-06T11:59:00.000Z") }, // 60s ago
  ];
  assert.equal(isDebouncedTooSoon(rows, now), false);
}

function testIsDebouncedTooSoonFalseOnEmpty() {
  assert.equal(isDebouncedTooSoon([]), false);
}

function run() {
  testWindowConstant();
  testForceChargeBudgetConstant();
  testDebounceConstant();
  testCutoffForDebounce();
  testBuildForceChargeKeyAdmin();
  testBuildForceChargeKeyUser();
  testKeysAreDistinctAcrossPathsAndAttempts();
  testCountForceChargeAttemptsZeroOnEmpty();
  testCountForceChargeAttemptsAdminOnly();
  testCountForceChargeAttemptsExcludesOutsideWindow();
  testCountForceChargeAttemptsIgnoresUntaggedRows();
  testHasBudgetExhaustedFalseAtTwo();
  testHasBudgetExhaustedTrueAtThree();
  testHasBudgetExhaustedSeparatePerPath();
  testIsDebouncedTooSoonTrueWithin30s();
  testIsDebouncedTooSoonFalseAfter30s();
  testIsDebouncedTooSoonFalseOnEmpty();
  console.log("chargeLockRateLimitPolicy tests passed");
}

run();
