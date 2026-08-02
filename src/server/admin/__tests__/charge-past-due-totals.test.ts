import assert from "node:assert/strict";
import {
  ORPHAN_RUN_THRESHOLD_MS,
  aggregateRunTotals,
  isOrphanRun,
  normalizeRunTotals,
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

function testNamedSkipBucketsNoHeldDraftAndAwaitingRetry() {
  const t = aggregateRunTotals([
    row({ status: "skipped", skipReason: "no_held_draft" }),
    row({ status: "skipped", skipReason: "no_held_draft" }),
    row({ status: "skipped", skipReason: "awaiting_retry" }),
    row({ status: "skipped", skipReason: "already_paid" }),
    row({ status: "skipped", skipReason: "totally_unknown" }),
  ]);
  assert.equal(t.skipped.total, 5);
  assert.equal(t.skipped.noHeldDraft, 2);
  assert.equal(t.skipped.awaitingRetry, 1);
  assert.equal(t.skipped.alreadyPaid, 1);
  assert.equal(t.skipped.other, 1);
  // Named buckets must not leak into the legacy "other" bucket.
  assert.equal(t.skipped.recentlyAttempted, 0);
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

// ─── normalizeRunTotals (legacy persisted runs) ──────────────────────────────
//
// Runs finalized before `noHeldDraft` / `awaitingRetry` existed (2026-07-20) have no
// such keys. The Norm mirror validates its response against a Zod schema where those
// are REQUIRED, so one legacy run on the page made /v1/charge-past-due/runs return a
// 500 `response_schema_invalid` (caught by `npm run norm:smoke`, invisible to tsc).

function testNormalizeBackfillsLegacySkipBuckets() {
  // Exactly the shape of a real pre-2026-07-20 run.
  const legacy = {
    eligibleCount: 8,
    attempted: 3,
    succeeded: 0,
    failed: 3,
    revenueCents: 0,
    skipped: {
      total: 5,
      recentlyAttempted: 0,
      noLongerPastDue: 0,
      alreadyPaid: 0,
      missingPaymentMethod: 0,
      other: 5,
    },
  };
  const out = normalizeRunTotals(legacy as never);
  assert.equal(out.skipped.noHeldDraft, 0, "missing bucket must back-fill to 0");
  assert.equal(out.skipped.awaitingRetry, 0, "missing bucket must back-fill to 0");
  // Real values must survive untouched.
  assert.equal(out.skipped.total, 5);
  assert.equal(out.skipped.other, 5);
  assert.equal(out.eligibleCount, 8);
  assert.equal(out.attempted, 3);
  assert.equal(out.failed, 3);
  // Every key the Norm schema requires must now be a number.
  for (const [k, v] of Object.entries(out.skipped)) {
    assert.equal(typeof v, "number", `skipped.${k} must be a number`);
  }
  for (const k of ["eligibleCount", "attempted", "succeeded", "failed", "revenueCents"] as const) {
    assert.equal(typeof out[k], "number", `${k} must be a number`);
  }
}

function testNormalizeHandlesNullAndPreservesRealValues() {
  // A run with no totals at all (or an absent skipped subdoc) must not throw.
  for (const input of [null, undefined, {}, { eligibleCount: 4 }]) {
    const out = normalizeRunTotals(input as never);
    assert.equal(typeof out.skipped.noHeldDraft, "number");
    assert.equal(typeof out.revenueCents, "number");
  }
  assert.equal(normalizeRunTotals({ eligibleCount: 4 } as never).eligibleCount, 4);
  // A modern, complete totals object must round-trip unchanged.
  const modern = aggregateRunTotals(
    [
      { status: "success", amount: 2000 },
      { status: "skipped", amount: 0, skipReason: "no_held_draft" },
    ],
    2
  );
  assert.deepEqual(normalizeRunTotals(modern), modern);
}

function run() {
  testNormalizeBackfillsLegacySkipBuckets();
  testNormalizeHandlesNullAndPreservesRealValues();
  testEmptyRowsZeroes();
  testSucceededAndRevenueSum();
  testFailedExcludedFromRevenue();
  testSkippedBreakdown();
  testNamedSkipBucketsNoHeldDraftAndAwaitingRetry();
  testAttemptedExcludesSkipped();
  testOrphanThresholdConstant();
  testIsOrphanRunPositive();
  testIsOrphanRunNotOrphanIfRecent();
  testIsOrphanRunNotOrphanIfFinished();
  console.log("charge-past-due-totals tests passed");
}

run();
