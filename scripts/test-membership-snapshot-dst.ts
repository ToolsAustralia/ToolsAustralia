/**
 * Tests the cron handler's date-key computation across Australia/Sydney DST boundaries.
 *
 * SCHEDULE HISTORY. The cron fired at 14:00 UTC and 15:00 UTC daily through 2026-08-24 — those
 * are the ~900-membership renewal-webhook burst hour and its trailing Stripe payment-wave hour
 * (2,235 / 3,551 events respectively on the 24 Aug renewal night), so both fires moved to
 * `30 17 * * *` / `30 20 * * *` UTC (17:30 / 20:30) that day. NOT `18:00`/`19:00` as first
 * shipped: `sync-meta-ads` and `sync-tiktok-ads` are hourly at the Vercel level but gated
 * IN-HANDLER to Sydney wall-clock slots {3,6,9,12,15,18,21}:00 — and 19:00 UTC is exactly the
 * Sydney-06:00 slot during AEDT (though not during AEST), so it would have collided five heavy
 * jobs into one minute from the first DST changeover onward. The `:30` minute offset structurally
 * avoids this: those syncs only do real work at `localMinute === 0` (or local 23:59), so ANY
 * `:30`-past-the-hour UTC time is safe in both DST regimes regardless of which Sydney hour it
 * happens to land on. See docs/infrastructure/gotchas.md for the full incident writeup.
 *
 * The test below still exercises the date-key FORMULA at the illustrative 14:00/15:00 UTC pair
 * (not the current literal schedule) because the formula is invariant to WHICH fixed UTC hour
 * the cron fires at, as long as that hour stays on the correct side of Sydney's local midnight in
 * both DST regimes and does not straddle the DST transition instant itself — true of the old
 * 14:00/15:00 pair, the current 17:30/20:30 pair, and the briefly-shipped-then-reverted
 * 18:00/19:00 pair alike. (The 18:00/19:00 collision bug was about the SYNC crons' in-handler
 * gate, not this date-key formula — the formula was never wrong.) At 14:00 UTC:
 *   - AEST winter (UTC+10): Sydney has just rolled into a new local day (00:00 local).
 *   - AEDT summer (UTC+11): Sydney is at 01:00 local of a new day.
 * At the current 17:30/20:30 UTC schedule, Sydney is at 03:30/04:30 local (AEST) or 04:30/05:30
 * local (AEDT) instead — still well after local midnight in either regime, so the same
 * "yesterday" date key is produced.
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
    name: "Mid-AEST winter day (cron at 17:30/20:30 UTC on Jul 15 → snapshot Jul 15)",
    cronTimes: ["2026-07-15T17:30:00Z", "2026-07-15T20:30:00Z"],
    expectedDateKey: "2026-07-15",
  },
  {
    name: "Mid-AEDT summer day (cron on Dec 15 → snapshot Dec 15)",
    cronTimes: ["2026-12-15T17:30:00Z", "2026-12-15T20:30:00Z"],
    expectedDateKey: "2026-12-15",
  },
  {
    name: "Day BEFORE AEDT starts (cron on Oct 3 UTC, still AEST → snapshot Oct 3)",
    cronTimes: ["2026-10-03T17:30:00Z", "2026-10-03T20:30:00Z"],
    expectedDateKey: "2026-10-03",
  },
  {
    name: "AEDT-start day (cron on Oct 4 UTC, hours after DST started → snapshot Oct 4)",
    cronTimes: ["2026-10-04T17:30:00Z", "2026-10-04T20:30:00Z"],
    expectedDateKey: "2026-10-04",
  },
  {
    name: "Day AFTER AEDT starts (cron on Oct 5 UTC, fully AEDT → snapshot Oct 5)",
    cronTimes: ["2026-10-05T17:30:00Z", "2026-10-05T20:30:00Z"],
    expectedDateKey: "2026-10-05",
  },
  {
    name: "Day BEFORE AEDT ends (cron on Apr 3 UTC, still AEDT → snapshot Apr 3)",
    cronTimes: ["2027-04-03T17:30:00Z", "2027-04-03T20:30:00Z"],
    expectedDateKey: "2027-04-03",
  },
  {
    name: "AEDT-end day (cron on Apr 4 UTC, hours after DST ended → snapshot Apr 4)",
    cronTimes: ["2027-04-04T17:30:00Z", "2027-04-04T20:30:00Z"],
    expectedDateKey: "2027-04-04",
  },
  {
    name: "Day AFTER AEDT ends (cron on Apr 5 UTC, fully AEST → snapshot Apr 5)",
    cronTimes: ["2027-04-05T17:30:00Z", "2027-04-05T20:30:00Z"],
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
