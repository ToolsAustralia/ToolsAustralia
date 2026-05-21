import assert from "node:assert/strict";
import {
  ORPHAN_RUN_THRESHOLD_MS,
  aggregateRunTotals,
  isOrphanRun,
  type ChargeLogRowForAggregation,
} from "../charge-past-due-totals";

function row(overrides: Partial<ChargeLogRowForAggregation>): ChargeLogRowForAggregation {
  return {
    status: "success",
    amount: 0,
    skipReason: undefined,
    ...overrides,
  };
}

function testEmptyRowsZeroes() {
  const t = aggregateRunTotals([]);
  assert.equal(t.attempted, 0);
  assert.equal(t.succeeded, 0);
  assert.equal(t.failed, 0);
  assert.equal(t.skipped.total, 0);
  assert.equal(t.revenueCents, 0);
}

function testSucceededAndRevenueSum() {
  const t = aggregateRunTotals([
    row({ status: "success", amount: 1500 }),
    row({ status: "success", amount: 2500 }),
  ]);
  assert.equal(t.attempted, 2);
  assert.equal(t.succeeded, 2);
  assert.equal(t.revenueCents, 4000);
}

function testFailedExcludedFromRevenue() {
  const t = aggregateRunTotals([
    row({ status: "success", amount: 1000 }),
    row({ status: "failed", amount: 9999 }),
  ]);
  assert.equal(t.succeeded, 1);
  assert.equal(t.failed, 1);
  assert.equal(t.revenueCents, 1000);
}

function testSkippedBreakdown() {
  const t = aggregateRunTotals([
    row({ status: "skipped", skipReason: "recently_attempted", amount: 100 }),
    row({ status: "skipped", skipReason: "recently_attempted", amount: 200 }),
    row({ status: "skipped", skipReason: "no_longer_past_due", amount: 300 }),
    row({ status: "skipped", skipReason: "already_paid", amount: 400 }),
    row({ status: "skipped", skipReason: "missing_payment_method", amount: 500 }),
    row({ status: "skipped", skipReason: "weird_reason_we_dont_recognise", amount: 600 }),
    row({ status: "skipped", skipReason: undefined, amount: 700 }),
  ]);
  assert.equal(t.skipped.total, 7);
  assert.equal(t.skipped.recentlyAttempted, 2);
  assert.equal(t.skipped.noLongerPastDue, 1);
  assert.equal(t.skipped.alreadyPaid, 1);
  assert.equal(t.skipped.missingPaymentMethod, 1);
  assert.equal(t.skipped.other, 2);
  assert.equal(t.attempted, 0);
  assert.equal(t.revenueCents, 0);
}

function testAttemptedExcludesSkipped() {
  const t = aggregateRunTotals([
    row({ status: "success", amount: 100 }),
    row({ status: "failed" }),
    row({ status: "skipped", skipReason: "recently_attempted" }),
  ]);
  assert.equal(t.attempted, 2);
}

function testOrphanThresholdConstant() {
  assert.equal(ORPHAN_RUN_THRESHOLD_MS, 35 * 60 * 1000);
}

function testIsOrphanRunPositive() {
  const now = new Date("2026-05-05T12:00:00Z");
  const startedAt = new Date(now.getTime() - 36 * 60 * 1000);
  assert.equal(isOrphanRun({ status: "running", startedAt }, now), true);
}

function testIsOrphanRunNotOrphanIfRecent() {
  const now = new Date("2026-05-05T12:00:00Z");
  const startedAt = new Date(now.getTime() - 10 * 60 * 1000);
  assert.equal(isOrphanRun({ status: "running", startedAt }, now), false);
}

function testIsOrphanRunNotOrphanIfFinished() {
  const now = new Date("2026-05-05T12:00:00Z");
  const startedAt = new Date(now.getTime() - 60 * 60 * 1000);
  assert.equal(isOrphanRun({ status: "completed", startedAt }, now), false);
  assert.equal(isOrphanRun({ status: "failed", startedAt }, now), false);
  assert.equal(isOrphanRun({ status: "aborted", startedAt }, now), false);
}

function run() {
  testEmptyRowsZeroes();
  testSucceededAndRevenueSum();
  testFailedExcludedFromRevenue();
  testSkippedBreakdown();
  testAttemptedExcludesSkipped();
  testOrphanThresholdConstant();
  testIsOrphanRunPositive();
  testIsOrphanRunNotOrphanIfRecent();
  testIsOrphanRunNotOrphanIfFinished();
  console.log("charge-past-due-totals tests passed");
}

run();
