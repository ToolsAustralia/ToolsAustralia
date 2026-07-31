/**
 * Promo-analytics date range — regression guard.
 *
 * Run: `npm run test:promo-analytics-range`
 *
 * Locks three things that each shipped broken:
 *  1. The requested range is HONOURED. The resolver's parameter was named `range` while every
 *     route passed a `dateRange`-keyed object straight through, so `input.range` was always
 *     undefined, the `?? "today"` default won, and EVERY selection silently returned today.
 *     `tsc` could not see it (optional field + non-literal argument = no excess-property check).
 *  2. `yesterday` is DST-correct. It used `subDays()` on a UTC instant, i.e. a fixed 24h, but two
 *     adjacent AEST midnights are 23h or 25h apart across a Sydney transition.
 *  3. The window is clamped to the visit-retention floor, so complete signups are never divided
 *     by truncated visits.
 */

import assert from "node:assert/strict";
import { formatInTimeZone } from "date-fns-tz";
import {
  resolvePromoAnalyticsRange,
  type PromoAnalyticsRangeKey,
} from "../PromoAnalyticsService";
import { PROMO_VISIT_RETENTION_DAYS } from "@/models/PromoAnalyticsVisit";

const AEST = "Australia/Sydney";
const HOUR = 3_600_000;

let failures = 0;
function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** yyyy-MM-dd for a UTC instant, in AEST. */
const ymd = (d: Date) => formatInTimeZone(d, AEST, "yyyy-MM-dd");

console.log("\nPromo analytics range");

// ---------------------------------------------------------------------------
// 1. The requested range is honoured (the bug that made the filter inert)
// ---------------------------------------------------------------------------

run("custom range returns the REQUESTED days, not today", () => {
  // Inside the retention floor so the clamp cannot interfere.
  const start = new Date(Date.now() - 10 * 24 * HOUR);
  const end = new Date(Date.now() - 5 * 24 * HOUR);
  const startYmd = ymd(start);
  const endYmd = ymd(end);

  const r = resolvePromoAnalyticsRange({ dateRange: "custom", startDate: startYmd, endDate: endYmd });

  assert.equal(ymd(r.start), startYmd, "start must be the requested day");
  assert.equal(ymd(r.end), endYmd, "end must be the requested day");
  assert.notEqual(
    ymd(r.start),
    ymd(new Date()),
    "a custom range must NOT resolve to today — that was the whole bug"
  );
});

run("yesterday returns yesterday, not today", () => {
  const r = resolvePromoAnalyticsRange({ dateRange: "yesterday" });
  const todayYmd = ymd(new Date());
  assert.notEqual(ymd(r.start), todayYmd, "yesterday must not resolve to today");
  assert.equal(ymd(r.start), ymd(r.end), "yesterday is a single AEST day");
});

run("today is the default when no range is given", () => {
  const r = resolvePromoAnalyticsRange({});
  assert.equal(ymd(r.start), ymd(new Date()));
  assert.equal(ymd(r.end), ymd(new Date()));
});

run("every range key is reachable — none silently collapses to today", () => {
  const keys: PromoAnalyticsRangeKey[] = ["today", "yesterday", "custom"];
  const seen = new Set<string>();
  for (const dateRange of keys) {
    const r =
      dateRange === "custom"
        ? resolvePromoAnalyticsRange({
            dateRange,
            startDate: ymd(new Date(Date.now() - 3 * 24 * HOUR)),
            endDate: ymd(new Date(Date.now() - 3 * 24 * HOUR)),
          })
        : resolvePromoAnalyticsRange({ dateRange });
    seen.add(ymd(r.start));
  }
  assert.equal(seen.size, 3, `expected 3 distinct start days, got ${[...seen].join(", ")}`);
});

// ---------------------------------------------------------------------------
// 2. DST correctness
// ---------------------------------------------------------------------------

run("a single AEST day spans 23h, 24h or 25h — never always 24h", () => {
  // Sydney 2026: DST ends Sun 5 April (clocks back, 25h day), starts Sun 4 October (23h day).
  // `now` is pinned just after each day so the retention clamp cannot move the window — the
  // clamp is asserted separately below.
  const cases: Array<[string, number]> = [
    ["2026-04-05", 25], // DST ends — the day gains an hour
    ["2026-10-04", 23], // DST starts — the day loses an hour
    ["2026-06-15", 24], // ordinary day
  ];
  for (const [day, expectedHours] of cases) {
    const now = new Date(`${day}T23:00:00Z`);
    const r = resolvePromoAnalyticsRange({ dateRange: "custom", startDate: day, endDate: day, now });
    assert.equal(r.clampedToRetention, false, `${day} must not be clamped in this fixture`);
    // end is 23:59:59.999, so add 1ms to get the true span.
    const spanHours = (r.end.getTime() + 1 - r.start.getTime()) / HOUR;
    assert.equal(
      spanHours,
      expectedHours,
      `${day} should span ${expectedHours}h in Australia/Sydney, got ${spanHours}h`
    );
  }
});

run("consecutive AEST days abut exactly, with no gap or overlap across a DST boundary", () => {
  // The old subDays() arithmetic left a 1h hole (or overlap) on exactly these days.
  for (const [d1, d2] of [
    ["2026-04-04", "2026-04-05"],
    ["2026-04-05", "2026-04-06"],
    ["2026-10-03", "2026-10-04"],
    ["2026-10-04", "2026-10-05"],
  ]) {
    const now = new Date(`${d2}T23:00:00Z`);
    const a = resolvePromoAnalyticsRange({ dateRange: "custom", startDate: d1, endDate: d1, now });
    const b = resolvePromoAnalyticsRange({ dateRange: "custom", startDate: d2, endDate: d2, now });
    assert.equal(
      b.start.getTime() - a.end.getTime(),
      1,
      `${d1} -> ${d2} must abut exactly (1ms), so no visit falls in a gap or is double-counted`
    );
  }
});

run("yesterday is DST-correct — one whole AEST day, even across a transition", () => {
  // 6 April 2026 AEST: "yesterday" is the 25-hour day the old fixed-24h subtraction got wrong.
  const r = resolvePromoAnalyticsRange({
    dateRange: "yesterday",
    now: new Date("2026-04-06T06:00:00Z"), // 2026-04-06 16:00 AEST
  });
  assert.equal(ymd(r.start), "2026-04-05");
  assert.equal(ymd(r.end), "2026-04-05");
  assert.equal(
    (r.end.getTime() + 1 - r.start.getTime()) / HOUR,
    25,
    "yesterday must cover the whole 25h AEST day, not a fixed 24h"
  );
});

run("a window lying entirely before the floor collapses instead of inverting", () => {
  // Asked for April in August: every visit row is gone. Clamping only `start` would leave
  // start > end — an inverted range Mongo answers with zero rows and no error.
  const r = resolvePromoAnalyticsRange({
    dateRange: "custom",
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    now: new Date("2026-08-15T00:00:00Z"),
  });
  assert.equal(r.clampedToRetention, true);
  assert.ok(
    r.start.getTime() <= r.end.getTime(),
    `range must never invert: got start ${r.start.toISOString()} > end ${r.end.toISOString()}`
  );
});

run("multi-day custom windows cover whole AEST days on both ends", () => {
  const r = resolvePromoAnalyticsRange({
    dateRange: "custom",
    startDate: "2026-04-03",
    endDate: "2026-04-06",
    now: new Date("2026-04-06T23:00:00Z"),
  });
  assert.equal(r.clampedToRetention, false, "fixture must sit inside the retention window");
  assert.equal(formatInTimeZone(r.start, AEST, "HH:mm:ss"), "00:00:00");
  assert.equal(formatInTimeZone(r.end, AEST, "HH:mm:ss"), "23:59:59");
});

// ---------------------------------------------------------------------------
// 3. Retention clamp
// ---------------------------------------------------------------------------

run("a range older than the retention floor is clamped and flagged", () => {
  const longAgo = ymd(new Date(Date.now() - 400 * 24 * HOUR));
  const r = resolvePromoAnalyticsRange({
    dateRange: "custom",
    startDate: longAgo,
    endDate: ymd(new Date()),
  });
  assert.equal(r.clampedToRetention, true, "must report that it clamped");
  assert.equal(
    r.start.getTime(),
    r.visitsRetainedFrom.getTime(),
    "start must be moved up to the retention floor"
  );
  const spanDays = (r.end.getTime() + 1 - r.start.getTime()) / (24 * HOUR);
  assert.ok(
    spanDays <= PROMO_VISIT_RETENTION_DAYS + 1,
    `clamped window should be ~${PROMO_VISIT_RETENTION_DAYS} days, got ${spanDays.toFixed(1)}`
  );
});

run("a range inside the retention window is NOT clamped", () => {
  const recent = ymd(new Date(Date.now() - 5 * 24 * HOUR));
  const r = resolvePromoAnalyticsRange({
    dateRange: "custom",
    startDate: recent,
    endDate: ymd(new Date()),
  });
  assert.equal(r.clampedToRetention, false);
  assert.equal(ymd(r.start), recent, "an in-window start must be left alone");
});

run("today and yesterday are never clamped", () => {
  for (const dateRange of ["today", "yesterday"] as const) {
    const r = resolvePromoAnalyticsRange({ dateRange });
    assert.equal(r.clampedToRetention, false, `${dateRange} must not clamp`);
  }
});

// ---------------------------------------------------------------------------
// 4. Input validation
// ---------------------------------------------------------------------------

run("custom without both dates is rejected", () => {
  assert.throws(() => resolvePromoAnalyticsRange({ dateRange: "custom", startDate: "2026-06-01" }));
  assert.throws(() => resolvePromoAnalyticsRange({ dateRange: "custom", endDate: "2026-06-01" }));
  assert.throws(() => resolvePromoAnalyticsRange({ dateRange: "custom" }));
});

run("malformed or inverted dates are rejected, not silently coerced", () => {
  assert.throws(
    () => resolvePromoAnalyticsRange({ dateRange: "custom", startDate: "01/06/2026", endDate: "2026-06-30" }),
    /YYYY-MM-DD/,
    "a non-ISO date must throw rather than produce NaN boundaries"
  );
  assert.throws(
    () => resolvePromoAnalyticsRange({ dateRange: "custom", startDate: "2026-06-30", endDate: "2026-06-01" }),
    /after/,
    "start after end must throw rather than return an empty window"
  );
});

console.log(failures === 0 ? "\nAll passed\n" : `\n${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
