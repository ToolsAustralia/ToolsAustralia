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
 * the SAME (date, packageId) key. Before this guard, the upsert was an unconditional `$set`,
 * so the second run silently overwrote the first. On a renewal-burst night the first run
 * captures PRE-burst counts (the true end-of-day figure) and the second captures POST-burst
 * counts (contaminated by an extra hour of next-day renewal processing) — so the overwrite
 * always picked the wrong number on exactly the nights this snapshot matters most.
 *
 * This test calls `upsertMembershipSnapshotRow` twice for the same (date, packageId) with
 * different counts and asserts: (1) the first call writes, (2) the second call reports
 * `written: false` and does NOT change the persisted row, and (3) a different date key still
 * writes independently (the guard is scoped per date, not global).
 */

const TEST_DATE = "1999-01-01";
const TEST_DATE_2 = "1999-01-02";
const TEST_PACKAGE_ID = "test_write_once_guard_pkg";

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
  const { default: MembershipDailySnapshot } = await import("@/models/MembershipDailySnapshot");
  const { upsertMembershipSnapshotRow } = await import("../membership-daily-snapshot/route");

  await connectDB();

  async function cleanup() {
    await MembershipDailySnapshot.deleteMany({ packageId: TEST_PACKAGE_ID });
  }

  await cleanup();

  try {
    const preBurst = {
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
    const postBurst = {
      date: TEST_DATE,
      packageId: TEST_PACKAGE_ID,
      activeCount: 999, // contaminated post-burst number
      pastDueCount: 50,
      scheduledCancelCount: 9,
      cancelledCount: 20,
      unitPriceCents: 2000,
      activeRevenue: 19980,
      pastDueRevenue: 1000,
      computedAt: new Date("1999-01-02T01:00:00.000Z"),
    };

    // -- First run: no row exists yet, so it writes --------------------------
    const firstResult = await upsertMembershipSnapshotRow(preBurst);
    expect("first run writes (no existing row)", firstResult.written, true);

    const afterFirst = await MembershipDailySnapshot.findOne({ date: TEST_DATE, packageId: TEST_PACKAGE_ID }).lean();
    expect("row persisted with pre-burst counts", afterFirst?.activeCount, 100);

    // -- Second run (same date key, later, post-burst counts): must NOT overwrite ---
    const secondResult = await upsertMembershipSnapshotRow(postBurst);
    expect("second run for the same date key reports written:false", secondResult.written, false);

    const afterSecond = await MembershipDailySnapshot.findOne({ date: TEST_DATE, packageId: TEST_PACKAGE_ID }).lean();
    expect(
      "row STILL carries pre-burst counts (not clobbered by the post-burst re-run)",
      afterSecond?.activeCount,
      100
    );
    expect(
      "computedAt STILL reflects the first run, not the second",
      afterSecond?.computedAt?.toISOString(),
      preBurst.computedAt.toISOString()
    );

    // -- A different date key is unaffected: the guard is scoped, not global --------
    const differentDateResult = await upsertMembershipSnapshotRow({ ...postBurst, date: TEST_DATE_2 });
    expect("a different date key still writes on its own first run", differentDateResult.written, true);
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
