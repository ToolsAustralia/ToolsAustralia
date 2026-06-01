import assert from "node:assert/strict";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ANCHOR_DAY_OF_MONTH,
  clampReanchorDay,
  daysInMonthUTC,
  getReanchorTrialEndTimestamp,
} from "../anchor-billing";

const AEST = "Australia/Sydney";

/** AEST wall-clock of a trial_end (unix seconds), e.g. "2026-06-10 00:00". */
function aestWall(ts: number): string {
  return formatInTimeZone(new Date(ts * 1000), AEST, "yyyy-MM-dd HH:mm");
}
/** Build a UTC Date from an AEST wall-clock string like "2026-05-10 09:30". */
function aest(wall: string): Date {
  return fromZonedTime(wall.replace(" ", "T") + ":00", AEST);
}

function testClamp() {
  assert.equal(clampReanchorDay(aest("2026-05-25 12:00")), ANCHOR_DAY_OF_MONTH); // 24
  assert.equal(clampReanchorDay(aest("2026-05-26 12:00")), 24);
  assert.equal(clampReanchorDay(aest("2026-05-27 12:00")), 24);
  assert.equal(clampReanchorDay(aest("2026-05-24 12:00")), 24);
  assert.equal(clampReanchorDay(aest("2026-05-23 12:00")), 23);
  assert.equal(clampReanchorDay(aest("2026-05-28 12:00")), 28);
  assert.equal(clampReanchorDay(aest("2026-05-01 12:00")), 1);
}

function testDaysInMonth() {
  assert.equal(daysInMonthUTC(2026, 2), 28); // Feb non-leap
  assert.equal(daysInMonthUTC(2028, 2), 29); // Feb leap
  assert.equal(daysInMonthUTC(2026, 4), 30); // Apr
  assert.equal(daysInMonthUTC(2026, 12), 31); // Dec
  assert.equal(daysInMonthUTC(2026, 1), 31); // Jan
}

function testNextOccurrenceAndSameDayRoll() {
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-05-10 09:30"))), "2026-06-10 00:00");
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-05-01 00:00"))), "2026-06-01 00:00");
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-05-26 09:00"))), "2026-06-24 00:00");
  // Recovery exactly at the anchor day's midnight rolls forward to next month (<= boundary).
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-07-24 00:00"))), "2026-08-24 00:00");
}

function testShortMonths() {
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-01-30 12:00"))), "2026-02-28 00:00");
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2028-01-31 12:00"))), "2028-02-29 00:00");
  // Kept day 31 into a 30-day month -> last day (Apr 30), guards the Math.min for non-Feb months.
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-03-31 12:00"))), "2026-04-30 00:00");
}

function testYearRollover() {
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-12-26 10:00"))), "2027-01-24 00:00");
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-12-31 10:00"))), "2027-01-31 00:00");
}

function testDstBoundaries() {
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-10-02 10:00"))), "2026-11-02 00:00");
  assert.equal(aestWall(getReanchorTrialEndTimestamp(aest("2026-04-03 10:00"))), "2026-05-03 00:00");
}

function testInvariants() {
  const recoveries = ["2026-02-15 23:59", "2026-07-24 00:01", "2026-09-29 12:00", "2026-11-30 18:00"];
  for (const w of recoveries) {
    const r = aest(w);
    const ts = getReanchorTrialEndTimestamp(r);
    assert.ok(Number.isFinite(ts), `finite for ${w}`);
    assert.ok(ts > Math.floor(r.getTime() / 1000), `strictly future for ${w}`);
    assert.match(aestWall(ts), /\d{4}-\d{2}-\d{2} 00:00/, `midnight AEST for ${w}`);
  }
}

function testInvalidInputThrows() {
  assert.throws(() => getReanchorTrialEndTimestamp(new Date(NaN)));
  assert.throws(() => getReanchorTrialEndTimestamp(new Date(0)));
}

function run() {
  testClamp();
  testDaysInMonth();
  testNextOccurrenceAndSameDayRoll();
  testShortMonths();
  testYearRollover();
  testDstBoundaries();
  testInvariants();
  testInvalidInputThrows();
  console.log("anchor-billing tests passed");
}

run();
