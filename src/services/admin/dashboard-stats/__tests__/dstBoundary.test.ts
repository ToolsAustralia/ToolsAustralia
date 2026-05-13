import { aestDayBounds, expandDateKeyRange } from "../DashboardStatsSnapshotWriter";

let passed = 0, failed = 0;
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

// April 5 2026 is the AEDT → AEST DST switch (first Sunday April).
// AEDT day = 25h, but our bounds should still produce a contiguous start/end.
const april5 = aestDayBounds("2026-04-05");
expect("April 5 2026 start has midnight AEDT (UTC -11h)", april5.dayStartUTC.toISOString(), "2026-04-04T13:00:00.000Z");
expect("April 5 2026 end has midnight AEST next day (25h later)", april5.dayEndUTC.toISOString(), "2026-04-05T14:00:00.000Z");

// October 4 2026 is the AEST → AEDT switch (first Sunday October). Day = 23h.
const oct4 = aestDayBounds("2026-10-04");
expect("Oct 4 2026 start has midnight AEST (UTC -10h)", oct4.dayStartUTC.toISOString(), "2026-10-03T14:00:00.000Z");
expect("Oct 4 2026 end has midnight AEDT next day (23h later)", oct4.dayEndUTC.toISOString(), "2026-10-04T13:00:00.000Z");

// Range expansion across the DST boundary should not skip or duplicate days.
const aroundFallBack = expandDateKeyRange("2026-04-04", "2026-04-06");
expect("range across April DST has exactly 3 days", aroundFallBack, ["2026-04-04", "2026-04-05", "2026-04-06"]);

const aroundSpringForward = expandDateKeyRange("2026-10-03", "2026-10-05");
expect("range across October DST has exactly 3 days", aroundSpringForward, ["2026-10-03", "2026-10-04", "2026-10-05"]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
