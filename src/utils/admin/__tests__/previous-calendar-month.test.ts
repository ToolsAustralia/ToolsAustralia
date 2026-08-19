import assert from "node:assert/strict";
import { resolvePreviousCalendarMonthAest } from "../resolveAestDateWindow";

/**
 * `resolvePreviousCalendarMonthAest` is the fixed benchmark the admin period-comparison
 * table measures against. It must be correct on the two days a naive implementation breaks:
 * the year boundary, and either side of an AEST/AEDT transition.
 */

function expect(now: string, startDate: string, endDate: string, why: string) {
  assert.deepEqual(resolvePreviousCalendarMonthAest(new Date(now)), { startDate, endDate }, why);
}

function testMidMonth() {
  expect("2026-08-19T04:00:00.000Z", "2026-07-01", "2026-07-31", "August → all of July");
  expect("2026-05-15T00:00:00.000Z", "2026-04-01", "2026-04-30", "30-day month");
}

function testYearBoundary() {
  // January must walk back to the PREVIOUS year's December, not month 0 of the same year.
  expect("2026-01-01T13:00:00.000Z", "2025-12-01", "2025-12-31", "January → previous December");
  expect("2026-01-20T02:00:00.000Z", "2025-12-01", "2025-12-31", "mid-January → same answer");

  // 2026-01-31T23:00Z is 2026-02-01 10:00 in Sydney (AEDT, UTC+11) — the AEST calendar has
  // ALREADY rolled into February, so the previous month is January, not December. Reading the
  // UTC date here gives the wrong month; this is the whole reason the function anchors on AEST.
  expect(
    "2026-01-31T23:00:00.000Z",
    "2026-01-01",
    "2026-01-31",
    "an instant that is already February in AEST must report January",
  );
}

function testFebruaryLengths() {
  expect("2026-03-10T00:00:00.000Z", "2026-02-01", "2026-02-28", "2026 is not a leap year");
  expect("2024-03-10T00:00:00.000Z", "2024-02-01", "2024-02-29", "2024 is a leap year");
}

function testAestAnchoringNotUtc() {
  // Sydney is UTC+10/+11, so late-UTC-evening instants are ALREADY the next AEST day. On the
  // last UTC day of a month that means the AEST calendar has rolled into the next month and
  // the answer must roll with it. Anchoring on UTC would return the wrong month here.
  //
  // 2026-07-31T23:00Z is 2026-08-01 09:00 in Sydney → previous calendar month is JULY.
  expect(
    "2026-07-31T23:00:00.000Z",
    "2026-07-01",
    "2026-07-31",
    "an instant that is already August in AEST must report July",
  );
  // 2026-08-01T01:00Z is 2026-08-01 11:00 in Sydney → still July.
  expect("2026-08-01T01:00:00.000Z", "2026-07-01", "2026-07-31", "same AEST day, later UTC");

  // 2026-06-30T23:00Z is 2026-07-01 09:00 in Sydney → previous month is JUNE, not May.
  expect(
    "2026-06-30T23:00:00.000Z",
    "2026-06-01",
    "2026-06-30",
    "AEST has rolled into July while UTC is still June",
  );
}

function testDstTransitions() {
  // AEDT ends first Sunday of April; AEST→AEDT starts first Sunday of October. The result is
  // a pure calendar-date computation, so a 23h/25h day must not shift either bound.
  expect("2026-04-06T00:00:00.000Z", "2026-03-01", "2026-03-31", "just after DST ends");
  expect("2026-10-05T00:00:00.000Z", "2026-09-01", "2026-09-30", "just after DST starts");
}

function testShapeIsAlwaysWellFormed() {
  // Walk a full year of month-starts and assert the invariants rather than 12 hand-written
  // expectations: start is always day 01, end is always the true last day, and start <= end.
  for (let m = 1; m <= 12; m++) {
    const iso = `2026-${String(m).padStart(2, "0")}-15T02:00:00.000Z`;
    const { startDate, endDate } = resolvePreviousCalendarMonthAest(new Date(iso));

    assert.match(startDate, /^\d{4}-\d{2}-01$/, `${iso}: start must be the 1st`);
    assert.match(endDate, /^\d{4}-\d{2}-\d{2}$/, `${iso}: end must be yyyy-MM-dd`);
    assert.ok(startDate <= endDate, `${iso}: start must not exceed end`);
    assert.equal(startDate.slice(0, 7), endDate.slice(0, 7), `${iso}: both bounds in one month`);

    // The end date must be the real last day — one more day would roll the month over.
    const [y, mo, d] = endDate.split("-").map(Number);
    assert.equal(
      new Date(Date.UTC(y, mo - 1, d + 1)).getUTCMonth(),
      mo % 12,
      `${iso}: ${endDate} must be the last day of its month`,
    );
  }
}

function run() {
  testMidMonth();
  testYearBoundary();
  testFebruaryLengths();
  testAestAnchoringNotUtc();
  testDstTransitions();
  testShapeIsAlwaysWellFormed();
  console.log("previous-calendar-month tests passed");
}

run();
