import assert from "node:assert/strict";
import { parseAdminDashboardDateRange } from "@/utils/admin/dashboardDateRange";

/**
 * WHY THIS FILE CHANGED (2026-09-04)
 *
 * Every case here used to assert `membershipAsOfMode === "live"` and `asOfDate === null`,
 * including for `yesterday`. That has been wrong since 2026-04-29 and the suite had been
 * failing ever since; it was added to CI's skip list on 2026-08-19 with a note to fix it,
 * and then sat there.
 *
 * The TEST was stale, not the code. Evidence, in order of weight:
 *   - The test was last touched 2026-04-28 (3a905dbf); dashboardDateRange.ts was changed
 *     the following day (7821c819), which is when snapshot mode arrived.
 *   - The mechanism is fully built and running in production: MembershipDailySnapshot,
 *     two `membership-daily-snapshot` cron entries in vercel.json, dedicated suites
 *     (test:membership-snapshot-dst, test:membership-snapshot-write-once) and a backfill.
 *   - The contract is documented as snapshot-for-past in five places, e.g.
 *     docs/admin/backend.md:334 "getMembershipByPackageSnapshot(asOfDate) — point-in-time
 *     counts from MembershipDailySnapshot" and docs/admin/api.md:63.
 *
 * The rule the code implements (dashboardDateRange.ts:128-129):
 *   live      — the range includes today, is in the future, or is "all-time".
 *               Read the CURRENT User.subscription.
 *   snapshot  — the range ends in the past. Read MembershipDailySnapshot as at
 *               `asOfDate`, so historical membership counts reflect what was true THEN
 *               rather than what is true now.
 *
 * If you are here because this file is failing again: check which side actually moved
 * before editing an assertion. Making a test agree with the code is only correct when
 * the code is the thing that is right.
 */

function testTodayIsLiveMode() {
  const r = parseAdminDashboardDateRange({ dateRange: "today" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.membershipAsOfMode, "live", "today includes now — must read live membership");
  assert.equal(r.value.asOfDate, null, "live mode carries no asOfDate");
}

function testYesterdayIsSnapshotMode() {
  const r = parseAdminDashboardDateRange({ dateRange: "yesterday" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(
    r.value.membershipAsOfMode,
    "snapshot",
    "yesterday ended in the past — membership must come from MembershipDailySnapshot, " +
      "not from today's User.subscription"
  );
  assert.ok(r.value.asOfDate instanceof Date, "snapshot mode must carry the asOfDate to read");
  assert.ok(
    r.value.asOfDate!.getTime() <= Date.now(),
    "asOfDate must not be in the future — there is no snapshot for a day that has not happened"
  );
}

function testPastCustomRangeIsSnapshotMode() {
  const r = parseAdminDashboardDateRange({
    dateRange: "custom",
    startDateParam: "2026-04-27",
    endDateParam: "2026-04-27",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.membershipAsOfMode, "snapshot", "a custom range wholly in the past reads a snapshot");
  assert.ok(r.value.asOfDate instanceof Date, "snapshot mode must carry the asOfDate to read");
}

function testAllTimeIsLiveMode() {
  const r = parseAdminDashboardDateRange({ dateRange: "all-time" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.membershipAsOfMode, "live", "all-time runs up to now, so membership is live");
  assert.equal(r.value.asOfDate, null);
}

function testCustomRequiresDates() {
  const r = parseAdminDashboardDateRange({ dateRange: "custom" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, 400);
}

testTodayIsLiveMode();
testYesterdayIsSnapshotMode();
testPastCustomRangeIsSnapshotMode();
testAllTimeIsLiveMode();
testCustomRequiresDates();
console.log("dashboardDateRange tests passed");
