/**
 * Unit tests for per-draw net revenue windowing.
 *
 * Pure functions only — no DB. The DB wrapper (getRevenueByDraw) is a thin
 * compose of buildDrawRevenueWindows + one fetch + assignRevenueToWindows, so
 * covering the two pure halves covers the logic that can actually be wrong.
 *
 * Run: npm run test:draw-revenue
 */
import assert from "node:assert/strict";
import {
  buildDrawRevenueWindows,
  assignRevenueToWindows,
  type DrawWindowInput,
  type LeanRevenueRow,
} from "../drawRevenue";

const d = (iso: string) => new Date(iso);

let passed = 0;
function ok(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

function run() {
  console.log("\ndrawRevenue — buildDrawRevenueWindows");

  // Deliberately out of order: the builder must sort by freeze boundary.
  const draws: DrawWindowInput[] = [
    { _id: "jul", activationDate: d("2026-06-28T00:00:00Z"), freezeEntriesAt: d("2026-07-27T10:00:00Z") },
    { _id: "may", activationDate: d("2026-04-28T00:00:00Z"), freezeEntriesAt: d("2026-05-27T10:00:00Z") },
    { _id: "jun", activationDate: d("2026-05-28T00:00:00Z"), freezeEntriesAt: d("2026-06-27T10:00:00Z") },
  ];
  const windows = buildDrawRevenueWindows(draws);

  ok("sorts ascending by freeze boundary", () => {
    assert.equal(windows.length, 3);
    assert.deepEqual(
      windows.map((w) => w.drawId),
      ["may", "jun", "jul"]
    );
  });

  ok("earliest draw falls back to its own activationDate", () => {
    assert.equal(windows[0].start.toISOString(), "2026-04-28T00:00:00.000Z");
    assert.equal(windows[0].end.toISOString(), "2026-05-27T10:00:00.000Z");
  });

  ok("later draws chain off the PREVIOUS freeze, not their own activation", () => {
    // This is the whole point: the gap between one draw freezing (27th 10:00)
    // and the next activating (28th 00:00) is real money that getTargetMajorDraw
    // routes to the next draw. An activation-based start would drop it.
    assert.equal(windows[1].start.toISOString(), "2026-05-27T10:00:00.000Z");
    assert.equal(windows[2].start.toISOString(), "2026-06-27T10:00:00.000Z");
  });

  ok("windows are contiguous and non-overlapping", () => {
    assert.equal(windows[0].end.getTime(), windows[1].start.getTime());
    assert.equal(windows[1].end.getTime(), windows[2].start.getTime());
  });

  ok("a draw with no usable end boundary is dropped, not given an Invalid Date", () => {
    // An Invalid Date window would compare false against everything and silently
    // swallow or drop rows depending on the comparison — drop the draw instead.
    const ghost = buildDrawRevenueWindows([
      { _id: "ghost", activationDate: null, freezeEntriesAt: null, drawDate: null },
    ]);
    assert.equal(ghost.length, 0);
  });

  ok("freezeEntriesAt missing → drawDate is the fallback boundary", () => {
    const legacy = buildDrawRevenueWindows([
      { _id: "old", activationDate: d("2025-01-01T00:00:00Z"), drawDate: d("2025-01-27T10:30:00Z") },
    ]);
    assert.equal(legacy.length, 1);
    assert.equal(legacy[0].end.toISOString(), "2025-01-27T10:30:00.000Z");
  });

  ok("accepts ISO strings, not just Date objects", () => {
    // A .lean() read or a JSON round-trip hands us strings.
    const fromStrings = buildDrawRevenueWindows([
      { _id: "s", activationDate: "2026-04-28T00:00:00Z", freezeEntriesAt: "2026-05-27T10:00:00Z" },
    ]);
    assert.equal(fromStrings.length, 1);
    assert.equal(fromStrings[0].start.toISOString(), "2026-04-28T00:00:00.000Z");
  });

  ok("an unparseable date string is treated as absent, not NaN", () => {
    const junk = buildDrawRevenueWindows([{ _id: "j", freezeEntriesAt: "not-a-date" }]);
    assert.equal(junk.length, 0);
  });

  ok("a degenerate window (start >= end) is skipped", () => {
    const bad = buildDrawRevenueWindows([
      { _id: "a", activationDate: d("2026-05-01T00:00:00Z"), freezeEntriesAt: d("2026-04-01T00:00:00Z") },
    ]);
    assert.equal(bad.length, 0);
  });

  ok("a single draw with no activationDate opens at the epoch", () => {
    const solo = buildDrawRevenueWindows([{ _id: "only", freezeEntriesAt: d("2026-05-27T10:00:00Z") }]);
    assert.equal(solo.length, 1);
    assert.equal(solo[0].start.getTime(), 0);
  });

  console.log("\ndrawRevenue — assignRevenueToWindows");

  const events: LeanRevenueRow[] = [
    { timestamp: d("2026-05-01T00:00:00Z"), data: { price: 20 } }, // may
    { timestamp: d("2026-05-26T23:59:00Z"), data: { price: 30 } }, // may
    { timestamp: d("2026-05-27T10:00:00Z"), data: { price: 50 } }, // boundary → jun (end EXCLUSIVE)
    { timestamp: d("2026-06-27T09:59:00Z"), data: { price: 25 } }, // jun
    { timestamp: d("2026-07-01T00:00:00Z"), data: { price: 100 } }, // jul
    { timestamp: d("2026-01-01T00:00:00Z"), data: { price: 999 } }, // before all → dropped
    { timestamp: d("2026-12-01T00:00:00Z"), data: { price: 999 } }, // after all → dropped
    { timestamp: d("2026-07-02T00:00:00Z") }, // missing price → 0, not NaN
  ];
  const byDraw = assignRevenueToWindows(events, windows);

  ok("sums into the right window", () => {
    assert.equal(byDraw.get("may"), 50); // 20 + 30
  });

  ok("the end boundary is exclusive — a freeze-instant payment lands in the NEXT draw", () => {
    // Mirrors getTargetMajorDraw: a payment created at/after freeze is deferred.
    assert.equal(byDraw.get("jun"), 75); // 50 (boundary) + 25
  });

  ok("a missing price contributes 0, never NaN", () => {
    assert.equal(byDraw.get("jul"), 100);
    assert.ok(!Number.isNaN(byDraw.get("jul")!));
  });

  ok("events outside every window are dropped", () => {
    const total = [...byDraw.values()].reduce((s, v) => s + v, 0);
    assert.equal(total, 225, "the two 999 rows are excluded");
  });

  ok("every window is zero-filled — the UI never sees undefined", () => {
    const empty = assignRevenueToWindows([], windows);
    assert.deepEqual([...empty.keys()], ["may", "jun", "jul"]);
    assert.deepEqual([...empty.values()], [0, 0, 0]);
  });

  ok("no windows → empty map, no throw", () => {
    assert.equal(assignRevenueToWindows(events, []).size, 0);
  });

  ok("unsorted events still bucket correctly", () => {
    const shuffled = [...events].reverse();
    const r = assignRevenueToWindows(shuffled, windows);
    assert.equal(r.get("may"), 50);
    assert.equal(r.get("jun"), 75);
    assert.equal(r.get("jul"), 100);
  });

  ok("an event with no timestamp is skipped", () => {
    const r = assignRevenueToWindows([{ data: { price: 500 } }], windows);
    assert.deepEqual([...r.values()], [0, 0, 0]);
  });

  ok("ISO-string timestamps bucket the same as Date timestamps", () => {
    const r = assignRevenueToWindows([{ timestamp: "2026-05-01T00:00:00Z", data: { price: 11 } }], windows);
    assert.equal(r.get("may"), 11);
  });

  ok("a negative price (adjustment row) is not clamped away", () => {
    // We net refunds by excluding whole rows upstream, so a negative price here
    // would be a data anomaly — but silently dropping it would hide it.
    const r = assignRevenueToWindows([{ timestamp: d("2026-05-02T00:00:00Z"), data: { price: -5 } }], windows);
    assert.equal(r.get("may"), -5);
  });

  console.log(`\n========================================`);
  console.log(`Tests run: ${passed}, failed: 0`);
  console.log(`========================================\n`);
}

run();
