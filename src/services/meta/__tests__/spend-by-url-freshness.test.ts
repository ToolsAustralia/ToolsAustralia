import assert from "node:assert/strict";
import {
  addDaysToDateString,
  resolveOnReadRefreshWindow,
  isFreshEnough,
  FRESHNESS_MAX_AGE_MS,
} from "../spendByUrlFreshness";

const TODAY = "2026-07-17";

function testDateStringMath() {
  assert.equal(addDaysToDateString("2026-07-17", -1), "2026-07-16");
  assert.equal(addDaysToDateString("2026-07-01", -1), "2026-06-30", "month boundary");
  assert.equal(addDaysToDateString("2026-01-01", -1), "2025-12-31", "year boundary");
  assert.equal(addDaysToDateString("2026-02-28", 1), "2026-03-01", "non-leap Feb");
}

function testTodayOnlyRange() {
  assert.deepEqual(
    resolveOnReadRefreshWindow({ since: TODAY, until: TODAY, todayAest: TODAY }),
    { since: TODAY, until: TODAY },
    "today-only range refreshes today",
  );
}

function testTrailingWindowCap() {
  assert.deepEqual(
    resolveOnReadRefreshWindow({ since: "2026-07-10", until: TODAY, todayAest: TODAY }),
    { since: "2026-07-16", until: TODAY },
    "a week-long range refreshes only the trailing 2 days",
  );
}

function testYesterdayRange() {
  assert.deepEqual(
    resolveOnReadRefreshWindow({ since: "2026-07-16", until: "2026-07-16", todayAest: TODAY }),
    { since: "2026-07-16", until: "2026-07-16" },
    "a yesterday-only range still qualifies (Meta restates it intraday)",
  );
}

function testHistoricalRangeIsCronTerritory() {
  assert.equal(
    resolveOnReadRefreshWindow({ since: "2026-07-01", until: "2026-07-10", todayAest: TODAY }),
    null,
    "ranges ending before yesterday never refresh on read",
  );
}

function testFutureUntilClamped() {
  assert.deepEqual(
    resolveOnReadRefreshWindow({ since: TODAY, until: "2026-07-20", todayAest: TODAY }),
    { since: TODAY, until: TODAY },
    "future end clamps to today",
  );
}

function testInvalidRanges() {
  assert.equal(resolveOnReadRefreshWindow({ since: TODAY, until: "2026-07-16", todayAest: TODAY }), null, "since > until");
  assert.equal(resolveOnReadRefreshWindow({ since: "", until: TODAY, todayAest: TODAY }), null, "empty since");
  assert.equal(
    resolveOnReadRefreshWindow({ since: "2026-07-18", until: "2026-07-19", todayAest: TODAY }),
    null,
    "entirely-future range clamps to empty → null",
  );
}

function testThrottle() {
  const now = 1_000_000_000_000;
  assert.equal(isFreshEnough(null, now), false, "never-materialized data is stale");
  assert.equal(isFreshEnough(now - FRESHNESS_MAX_AGE_MS + 1000, now), true, "4:59-old data is fresh");
  assert.equal(isFreshEnough(now - FRESHNESS_MAX_AGE_MS - 1000, now), false, "5:01-old data is stale");
}

function run() {
  testDateStringMath();
  testTodayOnlyRange();
  testTrailingWindowCap();
  testYesterdayRange();
  testHistoricalRangeIsCronTerritory();
  testFutureUntilClamped();
  testInvalidRanges();
  testThrottle();
  console.log("spend-by-url freshness tests passed");
}

run();
