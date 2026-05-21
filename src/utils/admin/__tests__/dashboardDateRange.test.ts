import assert from "node:assert/strict";
import { parseAdminDashboardDateRange } from "@/utils/admin/dashboardDateRange";

function testTodayIsLiveMode() {
  const r = parseAdminDashboardDateRange({ dateRange: "today" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.membershipAsOfMode, "live");
  assert.equal(r.value.asOfDate, null);
}

function testYesterdayIsLiveMode() {
  const r = parseAdminDashboardDateRange({ dateRange: "yesterday" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.membershipAsOfMode, "live");
  assert.equal(r.value.asOfDate, null);
}

function testCustomIsLiveModeWithDates() {
  const r = parseAdminDashboardDateRange({
    dateRange: "custom",
    startDateParam: "2026-04-27",
    endDateParam: "2026-04-27",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.membershipAsOfMode, "live");
  assert.equal(r.value.asOfDate, null);
}

function testCustomRequiresDates() {
  const r = parseAdminDashboardDateRange({ dateRange: "custom" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, 400);
}

testTodayIsLiveMode();
testYesterdayIsLiveMode();
testCustomIsLiveModeWithDates();
testCustomRequiresDates();
console.log("dashboardDateRange tests passed");
