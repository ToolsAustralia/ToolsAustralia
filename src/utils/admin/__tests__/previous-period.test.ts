import assert from "node:assert/strict";
import { resolvePreviousPeriodAest } from "../resolveAestDateWindow";

/**
 * `resolvePreviousPeriodAest` decides what every admin comparison is measured AGAINST, so a
 * wrong answer here does not crash anything — it just quietly reports the wrong trend.
 *
 * The rule: the same span, one calendar month earlier, with the current side truncated at today.
 */

const TODAY = "2026-08-20";

function expectWindows(
  label: string,
  selected: { startDate: string; endDate: string },
  expected: { current: [string, string]; previous: [string, string] },
  today = TODAY,
) {
  const r = resolvePreviousPeriodAest(selected, today);
  assert.ok(r, `${label}: expected a comparison window, got null`);
  assert.deepEqual(
    [r.current.startDate, r.current.endDate],
    expected.current,
    `${label}: current window`,
  );
  assert.deepEqual(
    [r.previous.startDate, r.previous.endDate],
    expected.previous,
    `${label}: previous window`,
  );
}

function expectNull(label: string, selected: { startDate: string; endDate: string }, today = TODAY) {
  assert.equal(resolvePreviousPeriodAest(selected, today), null, label);
}

function testSingleDayComparesToTheSameDayLastMonth() {
  // "today august 20 should only be compared to July 20"
  expectWindows(
    "Today",
    { startDate: "2026-08-20", endDate: "2026-08-20" },
    { current: ["2026-08-20", "2026-08-20"], previous: ["2026-07-20", "2026-07-20"] },
  );
}

function testRunningDrawIsTruncatedThenShifted() {
  // THE CASE THIS EXISTS FOR. A draw window ends on the DRAW DATE, which is in the future while
  // the draw runs: on 20 Aug the current draw is 28 Jul → 27 Aug but only 28 Jul → 20 Aug has
  // happened. Truncate FIRST, then shift — so the benchmark is 28 Jun → 20 Jul (24d vs 24d).
  //
  // Shifting the FULL window instead would give 28 Jun → 27 Jul and pit 24 days of live data
  // against 31 days of history, manufacturing a decline out of the calendar.
  expectWindows(
    "Current draw, mid-flight",
    { startDate: "2026-07-28", endDate: "2026-08-27" },
    { current: ["2026-07-28", "2026-08-20"], previous: ["2026-06-28", "2026-07-20"] },
  );
}

function testCustomRangeShiftsWholesale() {
  // "range is July 31 to August 7 → compared to June to July"
  // 31 Jul − 1 month clamps to 30 Jun (June has no 31st); 7 Aug − 1 month is 7 Jul.
  expectWindows(
    "Custom range spanning a month boundary",
    { startDate: "2026-07-31", endDate: "2026-08-07" },
    { current: ["2026-07-31", "2026-08-07"], previous: ["2026-06-30", "2026-07-07"] },
  );
}

function testClosedWindowIsNotTruncated() {
  // A finished draw needs no clamp — the previous window is simply one month earlier.
  expectWindows(
    "Last draw, already closed",
    { startDate: "2026-06-28", endDate: "2026-07-27" },
    { current: ["2026-06-28", "2026-07-27"], previous: ["2026-05-28", "2026-06-27"] },
  );
}

function testCalendarMonthPresetStillWorks() {
  // "This month" on the 20th compares the first 20 days of each month, not 20 days vs 31.
  expectWindows(
    "This month",
    { startDate: "2026-08-01", endDate: "2026-08-31" },
    { current: ["2026-08-01", "2026-08-20"], previous: ["2026-07-01", "2026-07-20"] },
  );
}

function testYearBoundary() {
  // January must walk back to the PREVIOUS year's December, not month 0 of the same year.
  expectWindows(
    "January",
    { startDate: "2026-01-10", endDate: "2026-01-10" },
    { current: ["2026-01-10", "2026-01-10"], previous: ["2025-12-10", "2025-12-10"] },
    "2026-01-10",
  );
  expectWindows(
    "January range",
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    { current: ["2026-01-01", "2026-01-31"], previous: ["2025-12-01", "2025-12-31"] },
    "2026-02-15",
  );
}

function testShortMonthClamping() {
  // 31 Mar − 1 month has no 31 Feb, so it clamps to the last day of February. Same for 31 May
  // → 30 Apr. The resulting one-day length difference is absorbed by the per-day normalisation
  // in periodComparisonModel; inventing a 31 Feb would be worse.
  expectWindows(
    "31 March → 28 Feb (non-leap)",
    { startDate: "2026-03-31", endDate: "2026-03-31" },
    { current: ["2026-03-31", "2026-03-31"], previous: ["2026-02-28", "2026-02-28"] },
    "2026-03-31",
  );
  expectWindows(
    "31 March → 29 Feb (leap year)",
    { startDate: "2024-03-31", endDate: "2024-03-31" },
    { current: ["2024-03-31", "2024-03-31"], previous: ["2024-02-29", "2024-02-29"] },
    "2024-03-31",
  );
}

function testDstTransitionsDoNotShiftTheDay() {
  // AEDT ends the first Sunday of April and starts the first Sunday of October. The arithmetic
  // is on calendar NUMBERS only — no UTC instant is built from them — so a 23h/25h day cannot
  // slide the result into a neighbouring date.
  expectWindows(
    "Across the April DST end",
    { startDate: "2026-04-05", endDate: "2026-04-05" },
    { current: ["2026-04-05", "2026-04-05"], previous: ["2026-03-05", "2026-03-05"] },
    "2026-04-05",
  );
  expectWindows(
    "Across the October DST start",
    { startDate: "2026-10-04", endDate: "2026-10-04" },
    { current: ["2026-10-04", "2026-10-04"], previous: ["2026-09-04", "2026-09-04"] },
    "2026-10-04",
  );
}

function testNothingHonestToCompare() {
  // A window entirely in the future has no data on either side — the card must hide the Δ
  // rather than render a comparison of two zeroes as "0%".
  expectNull("Window entirely in the future", {
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });
  // Unresolved bounds: draw presets resolve to "" until the draw dates load.
  expectNull("Empty start", { startDate: "", endDate: "2026-08-20" });
  expectNull("Empty end", { startDate: "2026-08-01", endDate: "" });
  expectNull("Malformed", { startDate: "20/08/2026", endDate: "2026-08-20" });
  // Inverted range — never valid, and shifting it would silently produce a plausible answer.
  expectNull("Inverted range", { startDate: "2026-08-20", endDate: "2026-08-01" });
}

function testTruncationBoundaryIsInclusive() {
  // Today itself counts as (a partial) part of the window — a window ending exactly today must
  // not be truncated to yesterday.
  expectWindows(
    "Window ending exactly today",
    { startDate: "2026-08-18", endDate: "2026-08-20" },
    { current: ["2026-08-18", "2026-08-20"], previous: ["2026-07-18", "2026-07-20"] },
  );
  // A window that STARTS today and ends in the future collapses to today alone.
  expectWindows(
    "Starts today, ends in the future",
    { startDate: "2026-08-20", endDate: "2026-08-31" },
    { current: ["2026-08-20", "2026-08-20"], previous: ["2026-07-20", "2026-07-20"] },
  );
}

function run() {
  testSingleDayComparesToTheSameDayLastMonth();
  testRunningDrawIsTruncatedThenShifted();
  testCustomRangeShiftsWholesale();
  testClosedWindowIsNotTruncated();
  testCalendarMonthPresetStillWorks();
  testYearBoundary();
  testShortMonthClamping();
  testDstTransitionsDoNotShiftTheDay();
  testNothingHonestToCompare();
  testTruncationBoundaryIsInclusive();
  console.log("previous-period tests passed");
}

run();
