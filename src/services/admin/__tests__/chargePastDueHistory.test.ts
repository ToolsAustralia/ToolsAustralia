import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  buildRunsFilter,
  buildManualRetriesFilter,
  formatDurationMs,
  type RunsFilterInput,
} from "../chargePastDueHistory";

function testRunsFilterEmptyReturnsEmptyObject() {
  const f = buildRunsFilter({});
  assert.deepEqual(f, {});
}

function testRunsFilterDateRange() {
  const f = buildRunsFilter({
    startDate: new Date("2026-05-01T00:00:00Z"),
    endDate: new Date("2026-05-05T23:59:59Z"),
  });
  assert.ok(f.startedAt);
  assert.equal((f.startedAt as { $gte: Date }).$gte.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal((f.startedAt as { $lte: Date }).$lte.toISOString(), "2026-05-05T23:59:59.000Z");
}

function testRunsFilterAdminId() {
  const id = new Types.ObjectId();
  const f = buildRunsFilter({ adminId: id });
  assert.equal(String((f.adminId as Types.ObjectId)), String(id));
}

function testRunsFilterStatus() {
  const f = buildRunsFilter({ status: "completed" });
  assert.equal(f.status, "completed");
}

function testRunsFilterIgnoresInvalidStatus() {
  const f = buildRunsFilter({ status: "garbage" as RunsFilterInput["status"] });
  assert.equal(f.status, undefined);
}

function testManualRetriesFilterAlwaysSetsChargeRunIdNull() {
  const f = buildManualRetriesFilter({});
  assert.equal(f.chargeRunId, null);
}

function testManualRetriesFilterDateRange() {
  const f = buildManualRetriesFilter({
    startDate: new Date("2026-05-01T00:00:00Z"),
    endDate: new Date("2026-05-05T23:59:59Z"),
  });
  assert.ok(f.attemptedAt);
}

function testFormatDurationMs() {
  assert.equal(formatDurationMs(null), "—");
  assert.equal(formatDurationMs(0), "0s");
  assert.equal(formatDurationMs(30 * 1000), "30s");
  assert.equal(formatDurationMs(2 * 60 * 1000), "2m");
  assert.equal(formatDurationMs(2 * 60 * 1000 + 30 * 1000), "2m 30s");
  assert.equal(formatDurationMs(60 * 60 * 1000), "1h");
}

function run() {
  testRunsFilterEmptyReturnsEmptyObject();
  testRunsFilterDateRange();
  testRunsFilterAdminId();
  testRunsFilterStatus();
  testRunsFilterIgnoresInvalidStatus();
  testManualRetriesFilterAlwaysSetsChargeRunIdNull();
  testManualRetriesFilterDateRange();
  testFormatDurationMs();
  console.log("chargePastDueHistory tests passed");
}

run();
