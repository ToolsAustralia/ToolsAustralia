/**
 * Locks the 2026-08-25 fix: a snapshot row must never describe a day that has not closed.
 *
 * The regression it guards: `writeSlidingWindow` used to enumerate `todayAESTDateKey` itself,
 * so the 03:20 UTC cron fire (13:20 AEST) froze a HALF-FINISHED day under that key. The reader
 * only bypasses a snapshot for the CURRENT day, so at 00:00 AEST that partial silently became
 * the authoritative answer — AEST 2026-08-24 showed $25,079.95 instead of its true $30,782.43
 * for the 3.5 hours until the next fire corrected it.
 */
import {
  resolveSlidingWindowKeys,
  aestPreviousDateKey,
  writeSnapshotForDate,
} from "../DashboardStatsSnapshotWriter";

let passed = 0,
  failed = 0;
function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.error(`✗ ${name}\n  exp: ${JSON.stringify(expected)}\n  got: ${JSON.stringify(actual)}`);
  }
}
function expectTrue(name: string, actual: boolean) {
  expect(name, actual, true);
}

// ── aestPreviousDateKey ────────────────────────────────────────────────────────────────────
expect("previous day, mid-month", aestPreviousDateKey("2026-08-24"), "2026-08-23");
expect("previous day across a month boundary", aestPreviousDateKey("2026-09-01"), "2026-08-31");
expect("previous day across a year boundary", aestPreviousDateKey("2026-01-01"), "2025-12-31");
// April 5 2026 = AEDT→AEST (25h day); October 4 2026 = AEST→AEDT (23h day).
expect("previous day across the April DST switch", aestPreviousDateKey("2026-04-06"), "2026-04-05");
expect("previous day INTO the 25h April day", aestPreviousDateKey("2026-04-05"), "2026-04-04");
expect("previous day across the October DST switch", aestPreviousDateKey("2026-10-05"), "2026-10-04");
expect("previous day INTO the 23h October day", aestPreviousDateKey("2026-10-04"), "2026-10-03");

// ── the window never contains today ────────────────────────────────────────────────────────
const keys = resolveSlidingWindowKeys("2026-08-25", 90);
expectTrue("90-day window excludes today", !keys.includes("2026-08-25"));
expect("90-day window ends at yesterday", keys[keys.length - 1], "2026-08-24");
expect("90-day window yields exactly 90 complete days", keys.length, 90);
expect("90-day window starts 89 days before yesterday", keys[0], "2026-05-27");

const oneDay = resolveSlidingWindowKeys("2026-08-25", 1);
expect("windowDays=1 writes yesterday only", oneDay, ["2026-08-24"]);
expect("windowDays=0 writes nothing", resolveSlidingWindowKeys("2026-08-25", 0), []);

// A window spanning each DST switch still yields exactly windowDays keys — no skip, no dupe.
expect("window across April DST is exactly 10 days", resolveSlidingWindowKeys("2026-04-10", 10).length, 10);
expect("window across October DST is exactly 10 days", resolveSlidingWindowKeys("2026-10-09", 10).length, 10);
expectTrue(
  "window across April DST excludes today",
  !resolveSlidingWindowKeys("2026-04-10", 10).includes("2026-04-10")
);

// ── writeSnapshotForDate refuses an unclosed day ───────────────────────────────────────────
// The guard returns BEFORE any database access, so this needs no connection.
const todayInAest = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function main() {
  const refusedToday = await writeSnapshotForDate(todayInAest, new Set<string>());
  expect("refuses the in-progress AEST day", refusedToday.ok, false);
  expectTrue(
    "refusal names the unclosed day",
    (refusedToday.error ?? "").includes("has not closed yet")
  );

  const refusedFuture = await writeSnapshotForDate("2099-01-01", new Set<string>());
  expect("refuses a future AEST day", refusedFuture.ok, false);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
