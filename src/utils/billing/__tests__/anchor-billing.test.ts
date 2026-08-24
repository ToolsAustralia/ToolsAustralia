import assert from "node:assert/strict";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ANCHOR_DAY_OF_MONTH,
  clampReanchorDay,
  daysInMonthUTC,
  getReanchorTrialEndTimestamp,
  MIN_REAPPLIED_ANCHOR_RUNWAY_SECONDS,
  resolveReappliedAnchor,
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

/** Unix seconds for an AEST wall-clock string. */
function aestSec(wall: string): number {
  return Math.floor(aest(wall).getTime() / 1000);
}

/**
 * The double-charge floor on the re-applied upgrade anchor.
 *
 * `trial_end` is a BILLING boundary: Stripe charges the full amount when it arrives. An upgrading
 * member has just paid a full month, so re-applying an anchor a few days out would charge them
 * twice within days with no proration credit. These cases pin the DECISION to advance — the helper
 * it delegates to is covered above, but the decision is what actually guards the money.
 */
function testResolveReappliedAnchor() {
  const now = aestSec("2026-08-20 10:00");

  // ── Pass-through: a comfortable anchor is returned byte-for-byte, no month shift.
  const farAnchor = aestSec("2026-09-09 00:00"); // 20 days out
  assert.equal(resolveReappliedAnchor(farAnchor, now), farAnchor);

  // Exactly at the floor is still comfortable (>=, not >).
  const exactlyAtFloor = now + MIN_REAPPLIED_ANCHOR_RUNWAY_SECONDS;
  assert.equal(resolveReappliedAnchor(exactlyAtFloor, now), exactlyAtFloor);

  // ── The production case: the 24th is 4 days away -> advance to the NEXT 24th, same day.
  const nearAnchor = aestSec("2026-08-24 00:00");
  const shifted = resolveReappliedAnchor(nearAnchor, now);
  assert.equal(aestWall(shifted), "2026-09-24 00:00");
  assert.ok(shifted >= now + MIN_REAPPLIED_ANCHOR_RUNWAY_SECONDS, "shifted anchor clears the floor");

  // One second under the floor must shift; that boundary is the whole guard.
  const justUnder = now + MIN_REAPPLIED_ANCHOR_RUNWAY_SECONDS - 1;
  assert.notEqual(resolveReappliedAnchor(justUnder, now), justUnder);

  // ── Fallback path: an anchor an hour out (getNextAnchorTimestamp can return one) must advance.
  const oneHourOut = now + 3600;
  const fallbackShifted = resolveReappliedAnchor(oneHourOut, now);
  assert.ok(fallbackShifted > now + MIN_REAPPLIED_ANCHOR_RUNWAY_SECONDS, "one-hour anchor advances clear");

  // ── Short-month safety: a 30th/31st anchor must not overflow into the next month.
  assert.equal(aestWall(resolveReappliedAnchor(aestSec("2026-01-31 00:00"), aestSec("2026-01-29 10:00"))), "2026-02-28 00:00");
  assert.equal(aestWall(resolveReappliedAnchor(aestSec("2028-01-31 00:00"), aestSec("2028-01-29 10:00"))), "2028-02-29 00:00"); // leap
  assert.equal(aestWall(resolveReappliedAnchor(aestSec("2026-03-30 00:00"), aestSec("2026-03-28 10:00"))), "2026-04-30 00:00");

  // ── A non-24 anchor day (past-due reanchor cohort) keeps ITS day, not the 24th.
  assert.equal(aestWall(resolveReappliedAnchor(aestSec("2026-08-22 00:00"), aestSec("2026-08-20 10:00"))), "2026-09-22 00:00");

  // ── Year rollover.
  assert.equal(aestWall(resolveReappliedAnchor(aestSec("2026-12-24 00:00"), aestSec("2026-12-20 10:00"))), "2027-01-24 00:00");

  // ── Every shift clears the floor, across a full year of anchor days. Worst case is Feb (28d).
  for (let month = 1; month <= 12; month++) {
    for (const day of [1, 15, 24, 28, 31]) {
      const dim = daysInMonthUTC(2026, month);
      const safeDay = Math.min(day, dim);
      const anchor = aestSec(`2026-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")} 00:00`);
      const nowJustBefore = anchor - 3600; // 1h before the anchor: deep inside the floor
      const out = resolveReappliedAnchor(anchor, nowJustBefore);
      assert.ok(
        out >= nowJustBefore + MIN_REAPPLIED_ANCHOR_RUNWAY_SECONDS,
        `one advance must clear the floor for 2026-${month}-${safeDay}`
      );
    }
  }

  // ── Invalid input throws so the caller can abort the re-anchor non-fatally.
  assert.throws(() => resolveReappliedAnchor(NaN, now));
  assert.throws(() => resolveReappliedAnchor(0, now));
  assert.throws(() => resolveReappliedAnchor(-1, now));
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
  testResolveReappliedAnchor();
  console.log("anchor-billing tests passed");
}

run();
