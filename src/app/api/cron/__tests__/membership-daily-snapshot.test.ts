import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";

// Load .env.local BEFORE any import that reads env at module scope (connectDB needs
// MONGODB_URI). `.env.local` points at the DEV cluster — never production.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Regression test for the membership-daily-snapshot write-once guard.
 *
 * WHAT THIS PINS. `/api/cron/membership-daily-snapshot` is scheduled twice a day (see
 * vercel.json) so a missed/failed first run still gets a snapshot — but both runs resolve to
 * the SAME (date, packageId) key. Before this guard, the upsert was an unconditional `$set`, so
 * the second run silently overwrote the first every time, regardless of which one had the more
 * trustworthy numbers.
 *
 * CORRECTED FRAMING (2026-08-24 review): `getMembershipByPackageLiveForSnapshot` is a purely
 * LIVE census with no date filtering — every fire, first or second, captures "membership state
 * right now" and stamps it with yesterday's date. There is no run that is absolutely
 * "pre-burst"; there is only "closer to the Sydney day boundary" (less renewal churn baked in)
 * versus "further from it" (more). The guard's job is to keep whichever run got there FIRST —
 * i.e. closer to the boundary — not to distinguish a "clean" run from a "dirty" one in any
 * absolute sense.
 *
 * THREE THINGS THIS FILE PROVES:
 *  1. `testVulnerablePatternOverwrites` — a **self-contained regression pin of the bug itself**:
 *     reproduces the OLD unconditional `$set`-upsert pattern inline (not by importing anything
 *     from the route, so it doesn't depend on the fix existing) and asserts the second write
 *     DOES clobber the first. This is the "RED" that actually demonstrates the vulnerability,
 *     as opposed to a RED that only proves a function is missing.
 *  2. `testWriteOnceGuard` — the real `upsertMembershipSnapshotRow` guard: first call writes,
 *     second call for the same date key is a no-op (row unchanged), and a different date key is
 *     unaffected (the guard is scoped per date, not global).
 *  3. `testDegenerateRowSelfHeals` — the escape hatch: if the existing row is degenerate (every
 *     count zero — the signature of an aggregate that silently returned nothing), the guard
 *     treats it as absent so a later run can still correct it instead of the zero being locked
 *     in forever (nothing else in the system repairs `MembershipDailySnapshot` rows —
 *     `getMembershipSnapshotHealth` only checks existence, not sanity).
 */

const TEST_DATE = "1999-01-01";
const TEST_DATE_2 = "1999-01-02";
const TEST_PACKAGE_ID = "test_write_once_guard_pkg";
const VULN_TEST_DATE = "1999-02-01";
const VULN_TEST_PACKAGE_ID = "test_vulnerable_pattern_pkg";
const DEGENERATE_TEST_DATE = "1999-03-01";
const DEGENERATE_TEST_PACKAGE_ID = "test_degenerate_self_heal_pkg";

let failures = 0;
function expect(label: string, actual: unknown, expected: unknown) {
  try {
    assert.deepEqual(actual, expected);
    console.log(`  PASS  ${label}`);
  } catch {
    failures++;
    console.error(`  FAIL  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

async function run() {
  const mongoose = (await import("mongoose")).default;
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: MembershipDailySnapshot, SNAPSHOT_SOURCE_VERSION } = await import(
    "@/models/MembershipDailySnapshot"
  );
  const { upsertMembershipSnapshotRow } = await import("../membership-daily-snapshot/route");

  await connectDB();

  async function cleanup() {
    await MembershipDailySnapshot.deleteMany({
      packageId: { $in: [TEST_PACKAGE_ID, VULN_TEST_PACKAGE_ID, DEGENERATE_TEST_PACKAGE_ID] },
    });
  }

  await cleanup();

  try {
    // =====================================================================
    // 1. VULNERABILITY PIN — reproduces the pre-fix pattern in isolation and
    //    proves the second write overwrites the first. This does NOT import
    //    upsertMembershipSnapshotRow, so it stays red-if-broken independent
    //    of whether the guard exists at all.
    // =====================================================================
    async function vulnerableUnconditionalUpsert(row: {
      date: string;
      packageId: string;
      activeCount: number;
      computedAt: Date;
    }) {
      await MembershipDailySnapshot.findOneAndUpdate(
        { date: row.date, packageId: row.packageId },
        {
          $set: {
            tz: "Australia/Sydney",
            activeCount: row.activeCount,
            pastDueCount: 0,
            scheduledCancelCount: 0,
            cancelledCount: 0,
            unitPriceCents: 2000,
            activeRevenue: row.activeCount * 20,
            pastDueRevenue: 0,
            confidence: "live",
            computedAt: row.computedAt,
            sourceVersion: SNAPSHOT_SOURCE_VERSION,
          },
        },
        { upsert: true }
      );
    }

    await vulnerableUnconditionalUpsert({
      date: VULN_TEST_DATE,
      packageId: VULN_TEST_PACKAGE_ID,
      activeCount: 100,
      computedAt: new Date("1999-02-02T00:00:00.000Z"),
    });
    await vulnerableUnconditionalUpsert({
      date: VULN_TEST_DATE,
      packageId: VULN_TEST_PACKAGE_ID,
      activeCount: 999,
      computedAt: new Date("1999-02-02T01:00:00.000Z"),
    });
    const vulnRow = await MembershipDailySnapshot.findOne({
      date: VULN_TEST_DATE,
      packageId: VULN_TEST_PACKAGE_ID,
    }).lean();
    expect(
      "VULNERABILITY PIN: an unconditional $set upsert lets the second write overwrite the first",
      vulnRow?.activeCount,
      999
    );

    // =====================================================================
    // 2. THE REAL GUARD — upsertMembershipSnapshotRow
    // =====================================================================
    const earlierRun = {
      date: TEST_DATE,
      packageId: TEST_PACKAGE_ID,
      activeCount: 100,
      pastDueCount: 5,
      scheduledCancelCount: 1,
      cancelledCount: 2,
      unitPriceCents: 2000,
      activeRevenue: 2000,
      pastDueRevenue: 100,
      computedAt: new Date("1999-01-02T00:00:00.000Z"),
    };
    const laterRun = {
      date: TEST_DATE,
      packageId: TEST_PACKAGE_ID,
      activeCount: 999, // a different live census, hours further from the day boundary
      pastDueCount: 50,
      scheduledCancelCount: 9,
      cancelledCount: 20,
      unitPriceCents: 2000,
      activeRevenue: 19980,
      pastDueRevenue: 1000,
      computedAt: new Date("1999-01-02T03:30:00.000Z"),
    };

    // -- First fire: no row exists yet, so it writes -------------------------
    const firstResult = await upsertMembershipSnapshotRow(earlierRun);
    expect("first fire writes (no existing row)", firstResult.written, true);

    const afterFirst = await MembershipDailySnapshot.findOne({ date: TEST_DATE, packageId: TEST_PACKAGE_ID }).lean();
    expect("row persisted with the earlier fire's counts", afterFirst?.activeCount, 100);

    // -- Second fire (same date key, later census): must NOT overwrite -------
    const secondResult = await upsertMembershipSnapshotRow(laterRun);
    expect("second fire for the same date key reports written:false", secondResult.written, false);

    const afterSecond = await MembershipDailySnapshot.findOne({ date: TEST_DATE, packageId: TEST_PACKAGE_ID }).lean();
    expect(
      "row STILL carries the earlier fire's counts (not clobbered by the later re-run)",
      afterSecond?.activeCount,
      100
    );
    expect(
      "computedAt STILL reflects the first fire, not the second",
      afterSecond?.computedAt?.toISOString(),
      earlierRun.computedAt.toISOString()
    );

    // -- A different date key is unaffected: the guard is scoped, not global --------
    const differentDateResult = await upsertMembershipSnapshotRow({ ...laterRun, date: TEST_DATE_2 });
    expect("a different date key still writes on its own first fire", differentDateResult.written, true);

    // =====================================================================
    // 3. DEGENERATE-ROW SELF-HEAL — the escape hatch
    // =====================================================================
    // Seed a degenerate row directly (simulating a first run that silently wrote all-zero
    // counts — e.g. the aggregate returned an empty result with no error).
    await MembershipDailySnapshot.create({
      date: DEGENERATE_TEST_DATE,
      packageId: DEGENERATE_TEST_PACKAGE_ID,
      tz: "Australia/Sydney",
      activeCount: 0,
      pastDueCount: 0,
      scheduledCancelCount: 0,
      cancelledCount: 0,
      unitPriceCents: 2000,
      activeRevenue: 0,
      pastDueRevenue: 0,
      confidence: "live",
      computedAt: new Date("1999-03-02T00:00:00.000Z"),
      sourceVersion: SNAPSHOT_SOURCE_VERSION,
    });

    const healResult = await upsertMembershipSnapshotRow({
      date: DEGENERATE_TEST_DATE,
      packageId: DEGENERATE_TEST_PACKAGE_ID,
      activeCount: 250,
      pastDueCount: 10,
      scheduledCancelCount: 3,
      cancelledCount: 5,
      unitPriceCents: 2000,
      activeRevenue: 5000,
      pastDueRevenue: 200,
      computedAt: new Date("1999-03-02T03:30:00.000Z"),
    });
    expect("a degenerate (all-zero) existing row is treated as writable", healResult.written, true);

    const healedRow = await MembershipDailySnapshot.findOne({
      date: DEGENERATE_TEST_DATE,
      packageId: DEGENERATE_TEST_PACKAGE_ID,
    }).lean();
    expect("the degenerate row is corrected by the next run", healedRow?.activeCount, 250);

    // A HEALTHY existing row must still block a subsequent write — the escape hatch is
    // specifically for degenerate rows, not a general "always let the second run win".
    const noOverwriteResult = await upsertMembershipSnapshotRow({
      date: DEGENERATE_TEST_DATE,
      packageId: DEGENERATE_TEST_PACKAGE_ID,
      activeCount: 999,
      pastDueCount: 99,
      scheduledCancelCount: 9,
      cancelledCount: 9,
      unitPriceCents: 2000,
      activeRevenue: 19980,
      pastDueRevenue: 1980,
      computedAt: new Date("1999-03-02T06:30:00.000Z"),
    });
    expect("a THIRD fire against the now-healthy row is still guarded (written:false)", noOverwriteResult.written, false);
    const afterThird = await MembershipDailySnapshot.findOne({
      date: DEGENERATE_TEST_DATE,
      packageId: DEGENERATE_TEST_PACKAGE_ID,
    }).lean();
    expect("the healed row is not re-clobbered by a third fire", afterThird?.activeCount, 250);
  } finally {
    await cleanup();
    await mongoose.connection.close().catch(() => {});
  }

  if (failures > 0) {
    console.error(`membership-daily-snapshot write-once guard test FAILED (${failures} assertion(s))`);
    process.exit(1);
  }
  console.log("membership-daily-snapshot write-once guard test passed");
  process.exit(0);
}

run().catch((err) => {
  console.error("membership-daily-snapshot write-once guard test crashed:", err);
  process.exit(1);
});
