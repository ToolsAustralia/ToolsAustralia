/**
 * Regression test: activity-log keyset pagination stability.
 *
 * The admin "Recent activity" feed duplicated rows because `getActivityLog` used OFFSET
 * pagination over a live, top-growing, time-sorted list: new activity inserted at the top
 * between page fetches shifted every row down, so page N+1's numeric offset re-included rows
 * already shown on page N (and the client rendered both). It was replaced with KEYSET (cursor)
 * pagination on a deterministic (timestamp DESC, id DESC) total order.
 *
 * This fences the invariant that makes the duplication structurally impossible: paginating
 * with a page's cursor returns the SAME window even after newer rows are prepended.
 *
 * Run via: npm run test:activity-log-keyset
 */

import assert from "node:assert/strict";
import {
  compareActivitiesNewestFirst,
  paginateActivitiesByCursor,
  type ActivityLogItem,
} from "../ActivityLogService";

function item(id: string, tsMs: number): ActivityLogItem {
  return {
    id,
    type: "user_signup",
    user: "Test User",
    firstName: "Test",
    action: "Signed up for an account",
    time: "1 min ago",
    status: "success",
    timestamp: new Date(tsMs),
  };
}

/** Sorted feed of N rows (a0..a{n-1}), newest-first. a{n-1} is the newest. */
function feed(n: number, baseMs = 1_000_000): ActivityLogItem[] {
  return Array.from({ length: n }, (_, i) => item(`a${i}`, baseMs + i)).sort(compareActivitiesNewestFirst);
}

function testFirstPageIsNewest() {
  const { rows, hasMore, nextCursor } = paginateActivitiesByCursor(feed(10), null, 3);
  assert.deepEqual(rows.map((r) => r.id), ["a9", "a8", "a7"], "first page = newest 3, newest first");
  assert.equal(hasMore, true);
  assert.ok(nextCursor, "nextCursor present when more rows exist");
}

function testConsecutivePagesNoOverlapNoGap() {
  const sorted = feed(10);
  const p1 = paginateActivitiesByCursor(sorted, null, 3);
  const p2 = paginateActivitiesByCursor(sorted, p1.nextCursor, 3);
  const p3 = paginateActivitiesByCursor(sorted, p2.nextCursor, 3);
  const seen = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id);
  assert.deepEqual(
    seen,
    ["a9", "a8", "a7", "a6", "a5", "a4", "a3", "a2", "a1"],
    "pages are contiguous — no overlap, no gap"
  );
  assert.equal(new Set(seen).size, seen.length, "no duplicate ids across pages");
}

// The core of the fix: this is exactly the scenario that duplicated rows under offset paging.
function testTopInsertionsDoNotShiftWindow() {
  const before = feed(10);
  const p1 = paginateActivitiesByCursor(before, null, 3); // a9, a8, a7

  // Between fetches, 5 NEWER rows are prepended (site-wide activity keeps arriving).
  const withInserts = [
    ...before,
    ...Array.from({ length: 5 }, (_, i) => item(`new${i}`, 2_000_000 + i)),
  ].sort(compareActivitiesNewestFirst);

  const p2 = paginateActivitiesByCursor(withInserts, p1.nextCursor, 3);
  assert.deepEqual(
    p2.rows.map((r) => r.id),
    ["a6", "a5", "a4"],
    "page 2 is unchanged by top-insertions — offset-drift duplication is impossible with keyset"
  );
  const p1ids = new Set(p1.rows.map((r) => r.id));
  assert.ok(p2.rows.every((r) => !p1ids.has(r.id)), "no page-1 row reappears on page 2 after inserts");
}

function testSameTimestampTiebreakById() {
  const sorted = [item("aaa", 5000), item("bbb", 5000)].sort(compareActivitiesNewestFirst);
  assert.deepEqual(sorted.map((r) => r.id), ["bbb", "aaa"], "ties break by id DESC → deterministic total order");
  const p1 = paginateActivitiesByCursor(sorted, null, 1);
  const p2 = paginateActivitiesByCursor(sorted, p1.nextCursor, 1);
  assert.deepEqual(p1.rows.map((r) => r.id), ["bbb"]);
  assert.deepEqual(p2.rows.map((r) => r.id), ["aaa"], "same-timestamp rows page cleanly via the id tiebreaker");
}

function testLastPageEndsCleanly() {
  const sorted = feed(4);
  const p1 = paginateActivitiesByCursor(sorted, null, 3);
  const p2 = paginateActivitiesByCursor(sorted, p1.nextCursor, 3);
  assert.deepEqual(p2.rows.map((r) => r.id), ["a0"]);
  assert.equal(p2.hasMore, false, "no more rows");
  assert.equal(p2.nextCursor, null, "nextCursor is null on the last page");
}

function testMalformedCursorTreatedAsFirstPage() {
  const sorted = feed(5);
  const { rows } = paginateActivitiesByCursor(sorted, "not-a-cursor", 3);
  assert.deepEqual(rows.map((r) => r.id), ["a4", "a3", "a2"], "a malformed cursor safely falls back to the first page");
}

function run() {
  testFirstPageIsNewest();
  testConsecutivePagesNoOverlapNoGap();
  testTopInsertionsDoNotShiftWindow();
  testSameTimestampTiebreakById();
  testLastPageEndsCleanly();
  testMalformedCursorTreatedAsFirstPage();
  console.error("✓ activity-log-keyset: stable under top-insertions — no overlap, no gap, deterministic ties");
}

run();
