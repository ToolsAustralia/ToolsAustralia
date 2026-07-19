import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  buildRunsFilter,
  buildManualRetriesFilter,
  bucketDeclineCodeCounts,
  escapeUserSearchRegex,
  formatDurationMs,
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
  type RunsFilterInput,
} from "../chargePastDueHistory";

function testRunsFilterEmptyReturnsEmptyObject() {
  const f = buildRunsFilter({});
  assert.deepEqual(f, {});
}

function testRunsFilterDateRangeUsesGteAndLt() {
  const f = buildRunsFilter({
    startDate: new Date("2026-05-05T14:00:00.000Z"), // AEST start of May 6
    endDate: new Date("2026-05-06T14:00:00.000Z"),   // AEST start of May 7 (exclusive)
  });
  assert.ok(f.startedAt);
  assert.equal((f.startedAt as { $gte: Date }).$gte.toISOString(), "2026-05-05T14:00:00.000Z");
  assert.equal((f.startedAt as { $lt: Date }).$lt.toISOString(), "2026-05-06T14:00:00.000Z");
  assert.equal((f.startedAt as { $lte?: Date }).$lte, undefined);
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

function testManualRetriesFilterExcludesRecoveryStepAuditRows() {
  // Recovery machinery audit rows (void/finalize/create step audits, tagged
  // result.recovery.step) are not admin retries and must never surface in the
  // Manual Retries view — only real pay/outcome rows belong there.
  const f = buildManualRetriesFilter({});
  assert.deepEqual(
    (f as Record<string, unknown>)["result.recovery.step"],
    { $exists: false },
    "manual-retries filter must exclude recovery step-audit rows"
  );
}

function testManualRetriesFilterDateRangeUsesGteAndLt() {
  const f = buildManualRetriesFilter({
    startDate: new Date("2026-05-05T14:00:00.000Z"),
    endDate: new Date("2026-05-06T14:00:00.000Z"),
  });
  assert.ok(f.attemptedAt);
  assert.equal((f.attemptedAt as { $gte: Date }).$gte.toISOString(), "2026-05-05T14:00:00.000Z");
  assert.equal((f.attemptedAt as { $lt: Date }).$lt.toISOString(), "2026-05-06T14:00:00.000Z");
  assert.equal((f.attemptedAt as { $lte?: Date }).$lte, undefined);
}

function testFormatDurationMs() {
  assert.equal(formatDurationMs(null), "—");
  assert.equal(formatDurationMs(0), "0s");
  assert.equal(formatDurationMs(30 * 1000), "30s");
  assert.equal(formatDurationMs(2 * 60 * 1000), "2m");
  assert.equal(formatDurationMs(2 * 60 * 1000 + 30 * 1000), "2m 30s");
  assert.equal(formatDurationMs(60 * 60 * 1000), "1h");
}

function testParseAestDayStart() {
  // 2026-05-06 00:00 AEST = 2026-05-05 14:00 UTC (AEST = UTC+10, no DST in May)
  assert.equal(
    parseAestDayStartUtc("2026-05-06")?.toISOString(),
    "2026-05-05T14:00:00.000Z"
  );
}

function testParseAestDayEndExclusive() {
  // End of 2026-05-06 AEST exclusive = 2026-05-07 00:00 AEST = 2026-05-06 14:00 UTC
  assert.equal(
    parseAestDayEndExclusiveUtc("2026-05-06")?.toISOString(),
    "2026-05-06T14:00:00.000Z"
  );
}

function testParseAestDayHandlesInvalid() {
  assert.equal(parseAestDayStartUtc(null), undefined);
  assert.equal(parseAestDayStartUtc(""), undefined);
  assert.equal(parseAestDayStartUtc("not-a-date"), undefined);
  assert.equal(parseAestDayEndExclusiveUtc(null), undefined);
}

function testParseAestRespectsAestDstBoundary() {
  // 2026-04-05 is the AEDT->AEST transition (clocks go back from +11 to +10 at 03:00 local).
  // Start of 2026-04-05 in Sydney = AEDT midnight = 2026-04-04T13:00:00Z
  assert.equal(
    parseAestDayStartUtc("2026-04-05")?.toISOString(),
    "2026-04-04T13:00:00.000Z"
  );
  // End-exclusive of 2026-04-05 = start of 2026-04-06 in Sydney = AEST midnight = 2026-04-05T14:00:00Z
  assert.equal(
    parseAestDayEndExclusiveUtc("2026-04-05")?.toISOString(),
    "2026-04-05T14:00:00.000Z"
  );
}

function testEscapeUserSearchRegex() {
  assert.equal(escapeUserSearchRegex("foo@bar.com"), "foo@bar\\.com");
  assert.equal(escapeUserSearchRegex("a.b+c"), "a\\.b\\+c");
  assert.equal(escapeUserSearchRegex("(test)"), "\\(test\\)");
  assert.equal(escapeUserSearchRegex("$caret^"), "\\$caret\\^");
  assert.equal(escapeUserSearchRegex(""), "");
}

function testBucketEmpty() {
  const out = bucketDeclineCodeCounts([]);
  assert.deepEqual(out, { totalFailed: 0, topCodes: [] });
}

function testBucketSingleCode() {
  const out = bucketDeclineCodeCounts([{ _id: "lost_card", count: 4 }]);
  assert.equal(out.totalFailed, 4);
  assert.deepEqual(out.topCodes, [{ code: "lost_card", count: 4, pct: 100 }]);
}

function testBucketTopFiveAndOther() {
  const out = bucketDeclineCodeCounts([
    { _id: "lost_card", count: 18 },
    { _id: "insufficient_funds", count: 14 },
    { _id: "generic_decline", count: 11 },
    { _id: "do_not_honor", count: 6 },
    { _id: "stolen_card", count: 4 },
    { _id: "expired_card", count: 2 },
    { _id: "fraudulent", count: 1 },
  ]);
  assert.equal(out.totalFailed, 56);
  assert.equal(out.topCodes.length, 6);
  assert.equal(out.topCodes[0].code, "lost_card");
  assert.equal(out.topCodes[4].code, "stolen_card");
  assert.equal(out.topCodes[5].code, "other");
  assert.equal(out.topCodes[5].count, 3);
  assert.equal(out.topCodes[5].pct, Math.round((3 / 56) * 100));
}

function testBucketExactlyFiveCodesNoOther() {
  const out = bucketDeclineCodeCounts([
    { _id: "a", count: 5 },
    { _id: "b", count: 4 },
    { _id: "c", count: 3 },
    { _id: "d", count: 2 },
    { _id: "e", count: 1 },
  ]);
  assert.equal(out.topCodes.length, 5);
  assert.ok(!out.topCodes.some((r) => r.code === "other"));
}

function testBucketPercentRounding() {
  const out = bucketDeclineCodeCounts([
    { _id: "a", count: 3 },
    { _id: "b", count: 2 },
    { _id: "c", count: 2 },
  ]);
  assert.equal(out.totalFailed, 7);
  assert.equal(out.topCodes[0].pct, 43);
  assert.equal(out.topCodes[1].pct, 29);
  assert.equal(out.topCodes[2].pct, 29);
}

function testBucketCoercesNullIdToUnknown() {
  const out = bucketDeclineCodeCounts([{ _id: null as unknown as string, count: 2 }]);
  assert.equal(out.topCodes[0].code, "unknown");
}

function run() {
  testRunsFilterEmptyReturnsEmptyObject();
  testRunsFilterDateRangeUsesGteAndLt();
  testRunsFilterAdminId();
  testRunsFilterStatus();
  testRunsFilterIgnoresInvalidStatus();
  testManualRetriesFilterAlwaysSetsChargeRunIdNull();
  testManualRetriesFilterExcludesRecoveryStepAuditRows();
  testManualRetriesFilterDateRangeUsesGteAndLt();
  testFormatDurationMs();
  testParseAestDayStart();
  testParseAestDayEndExclusive();
  testParseAestDayHandlesInvalid();
  testParseAestRespectsAestDstBoundary();
  testEscapeUserSearchRegex();
  testBucketEmpty();
  testBucketSingleCode();
  testBucketTopFiveAndOther();
  testBucketExactlyFiveCodesNoOther();
  testBucketPercentRounding();
  testBucketCoercesNullIdToUnknown();
  console.log("chargePastDueHistory tests passed");
}

run();
