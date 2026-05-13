import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import DashboardStatsDailySnapshot, { DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION } from "@/models/DashboardStatsDailySnapshot";
import { readStatsForRange } from "../DashboardStatsSnapshotReader";
import { aestDayBounds } from "../DashboardStatsSnapshotWriter";

const TEST_DATES = ["2099-04-01", "2099-04-02", "2099-04-03"];

async function seedSnapshots() {
  for (const [date, total, membershipPurchase] of [
    ["2099-04-01", 100, 60],
    ["2099-04-02", 200, 120],
    ["2099-04-03", 150, 90],
  ] as const) {
    await DashboardStatsDailySnapshot.create({
      date,
      tz: "Australia/Sydney",
      revenue: {
        total,
        buckets: new Map([
          ["membershipPurchase", { revenue: membershipPurchase, purchaseCount: 1 }],
          ["membershipRenewal", { revenue: total - membershipPurchase, purchaseCount: 1 }],
          ["oneTimePurchase", { revenue: 0, purchaseCount: 0 }],
          ["additionalOneTimePurchase", { revenue: 0, purchaseCount: 0 }],
          ["miniDraw", { revenue: 0, purchaseCount: 0 }],
          ["upsell", { revenue: 0, purchaseCount: 0 }],
        ]),
      },
      users: { newSignups: 5, cancellationsInDay: 1 },
      adChannels: new Map([["facebook", { spend: 50, revenue: total * 2, roas: (total * 2) / 50 }]]),
      confidence: "live",
      computedAt: new Date(),
      sourceVersion: DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION,
    });
  }
}

async function run() {
  await connectDB();
  // Cleanup: only our test seed dates
  await DashboardStatsDailySnapshot.deleteMany({ date: { $in: TEST_DATES } });
  await seedSnapshots();

  const { dayStartUTC: start } = aestDayBounds("2099-04-01");
  const { dayEndUTC: end } = aestDayBounds("2099-04-03");

  const result = await readStatsForRange({ rangeStartUTC: start, rangeEndUTC: end });

  let passed = 0;
  let failed = 0;
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

  expect("total revenue = 100+200+150", result.revenue.total, 450);
  expect("membershipPurchase sum = 60+120+90", result.revenue.buckets.membershipPurchase.revenue, 270);
  expect("newSignupsInRange = 5*3", result.users.newSignupsInRange, 15);
  expect("cancellationsInRange = 1*3", result.users.cancellationsInRange, 3);
  expect("facebook spend = 50*3", result.adChannels.facebook.spend, 150);
  expect("facebook revenue sums correctly", result.adChannels.facebook.revenue, (100 + 200 + 150) * 2);
  expect("facebook ROAS recomputed as totalRev/totalSpend", result.adChannels.facebook.roas, 900 / 150);
  expect("snapshotDaysUsed = 3", result.meta.snapshotDaysUsed, 3);
  expect("liveDaysComputed = 0 (no today)", result.meta.liveDaysComputed, 0);
  expect("missingSnapshotDates is empty", result.meta.missingSnapshotDates, []);

  // Cleanup
  await DashboardStatsDailySnapshot.deleteMany({ date: { $in: TEST_DATES } });

  console.log(`\n${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
