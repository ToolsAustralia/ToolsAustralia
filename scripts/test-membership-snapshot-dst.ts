/**
 * Tests the cron handler's date-key computation across Australia/Sydney DST boundaries.
 *
 * The cron fired at 14:00 UTC and 15:00 UTC daily through 2026-08-24; it was moved to 18:00
 * UTC / 19:00 UTC that day to clear the renewal-surge hour (~900 membership renewals land at
 * 14:00 UTC, with the trailing Stripe payment wave peaking at 15:00 UTC — see
 * docs/infrastructure/architecture.md). The test below still exercises the formula at the
 * 14:00/15:00 pair, which remains a valid (if no longer literal) fixture: the date-key formula
 * is invariant to WHICH fixed UTC hour the cron fires at, as long as that hour stays on the same
 * side of Sydney's local midnight in both DST regimes and does not straddle the DST transition
 * instant itself — true of both the old 14:00/15:00 pair and the new 18:00/19:00 pair. At 14:00
 * UTC:
 *   - AEST winter (UTC+10): Sydney has just rolled into a new local day (00:00 local).
 *   - AEDT summer (UTC+11): Sydney is at 01:00 local of a new day.
 * At the current 18:00/19:00 UTC schedule, Sydney is at 04:00-06:00 local instead — still well
 * after local midnight in either regime, so the same "yesterday" date key is produced.
 *
 * So when the cron fires on UTC date X at 14:00 UTC, Sydney is on local date X+1,
 * and "yesterday in Sydney" — the day we want to snapshot — is local date X.
 *
 * The handler's date-key logic mirrors `src/app/api/cron/membership-daily-snapshot/route.ts`:
 *   const yesterday = new Date(utcInstant);
 *   yesterday.setUTCDate(yesterday.getUTCDate() - 1);
 *   return formatInTimeZone(yesterday, "Australia/Sydney", "yyyy-MM-dd");
 *
 * This test verifies the produced date key matches the actual yesterday-in-Sydney
 * across mid-AEST, mid-AEDT, and both DST transition boundaries.
 *
 * Usage: npx tsx scripts/test-membership-snapshot-dst.ts
 */

import { formatInTimeZone } from "date-fns-tz";

const TZ = "Australia/Sydney";

function dateKeyForCronAt(utcInstant: Date): string {
  const yesterday = new Date(utcInstant);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return formatInTimeZone(yesterday, TZ, "yyyy-MM-dd");
}

interface DstCase {
  name: string;
  cronTimes: string[];
  expectedDateKey: string;
}

// AEDT 2026 starts at 02:00 AEST on 2026-10-04 (= 2026-10-03T16:00:00Z).
// AEDT 2027 ends at 03:00 AEDT on 2027-04-04 (= 2027-04-03T16:00:00Z).
const cases: DstCase[] = [
  {
    name: "Mid-AEST winter day (cron at 14:00/15:00 UTC on Jul 15 → snapshot Jul 15)",
    cronTimes: ["2026-07-15T14:00:00Z", "2026-07-15T15:00:00Z"],
    expectedDateKey: "2026-07-15",
  },
  {
    name: "Mid-AEDT summer day (cron on Dec 15 → snapshot Dec 15)",
    cronTimes: ["2026-12-15T14:00:00Z", "2026-12-15T15:00:00Z"],
    expectedDateKey: "2026-12-15",
  },
  {
    name: "Day BEFORE AEDT starts (cron on Oct 3 UTC, still AEST → snapshot Oct 3)",
    cronTimes: ["2026-10-03T14:00:00Z", "2026-10-03T15:00:00Z"],
    expectedDateKey: "2026-10-03",
  },
  {
    name: "AEDT-start day (cron on Oct 4 UTC, ~22h after DST started → snapshot Oct 4)",
    cronTimes: ["2026-10-04T14:00:00Z", "2026-10-04T15:00:00Z"],
    expectedDateKey: "2026-10-04",
  },
  {
    name: "Day AFTER AEDT starts (cron on Oct 5 UTC, fully AEDT → snapshot Oct 5)",
    cronTimes: ["2026-10-05T14:00:00Z", "2026-10-05T15:00:00Z"],
    expectedDateKey: "2026-10-05",
  },
  {
    name: "Day BEFORE AEDT ends (cron on Apr 3 UTC, still AEDT → snapshot Apr 3)",
    cronTimes: ["2027-04-03T14:00:00Z", "2027-04-03T15:00:00Z"],
    expectedDateKey: "2027-04-03",
  },
  {
    name: "AEDT-end day (cron on Apr 4 UTC, ~22h after DST ended → snapshot Apr 4)",
    cronTimes: ["2027-04-04T14:00:00Z", "2027-04-04T15:00:00Z"],
    expectedDateKey: "2027-04-04",
  },
  {
    name: "Day AFTER AEDT ends (cron on Apr 5 UTC, fully AEST → snapshot Apr 5)",
    cronTimes: ["2027-04-05T14:00:00Z", "2027-04-05T15:00:00Z"],
    expectedDateKey: "2027-04-05",
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const keys = c.cronTimes.map((t) => dateKeyForCronAt(new Date(t)));
  const allMatch = keys.every((k) => k === c.expectedDateKey);
  if (allMatch) {
    console.log(`PASS  ${c.name} → ${c.expectedDateKey}`);
    pass += 1;
  } else {
    console.error(`FAIL  ${c.name} → got ${keys.join(", ")}, expected ${c.expectedDateKey}`);
    fail += 1;
  }
}

console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
