import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import DashboardStatsDailySnapshot, { DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION } from "@/models/DashboardStatsDailySnapshot";
import { readStatsForRange } from "../DashboardStatsSnapshotReader";
import { aestDayBounds } from "../DashboardStatsSnapshotWriter";

// Additional test dates for attributedRevenue assertions (far-future to avoid collisions)
const AR_TEST_DATES = ["2099-05-01", "2099-05-02"];

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

  // Cleanup original test dates
  await DashboardStatsDailySnapshot.deleteMany({ date: { $in: TEST_DATES } });

  // ── attributedRevenue tests ──────────────────────────────────────────────
  await DashboardStatsDailySnapshot.deleteMany({ date: { $in: AR_TEST_DATES } });

  // Day 1: meta newRevenue=100, renewalRevenue=20, conversions=4, click=70, utm_only=30, inferred_backfill=0
  await DashboardStatsDailySnapshot.create({
    date: "2099-05-01",
    tz: "Australia/Sydney",
    revenue: {
      total: 0,
      buckets: new Map([
        ["membershipPurchase", { revenue: 0, purchaseCount: 0 }],
        ["membershipRenewal", { revenue: 0, purchaseCount: 0 }],
        ["oneTimePurchase", { revenue: 0, purchaseCount: 0 }],
        ["additionalOneTimePurchase", { revenue: 0, purchaseCount: 0 }],
        ["miniDraw", { revenue: 0, purchaseCount: 0 }],
        ["upsell", { revenue: 0, purchaseCount: 0 }],
      ]),
    },
    users: { newSignups: 0, cancellationsInDay: 0 },
    adChannels: new Map(),
    attributedRevenue: new Map([
      ["meta", { newRevenue: 100, renewalRevenue: 20, conversions: 4, byConfidence: { click: 70, utm_only: 30, inferred_backfill: 0 } }],
    ]),
    confidence: "live",
    computedAt: new Date(),
    sourceVersion: DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION,
  });

  // Day 2: meta newRevenue=50, renewalRevenue=10, conversions=2, click=50, utm_only=0, inferred_backfill=0
  await DashboardStatsDailySnapshot.create({
    date: "2099-05-02",
    tz: "Australia/Sydney",
    revenue: {
      total: 0,
      buckets: new Map([
        ["membershipPurchase", { revenue: 0, purchaseCount: 0 }],
        ["membershipRenewal", { revenue: 0, purchaseCount: 0 }],
        ["oneTimePurchase", { revenue: 0, purchaseCount: 0 }],
        ["additionalOneTimePurchase", { revenue: 0, purchaseCount: 0 }],
        ["miniDraw", { revenue: 0, purchaseCount: 0 }],
        ["upsell", { revenue: 0, purchaseCount: 0 }],
      ]),
    },
    users: { newSignups: 0, cancellationsInDay: 0 },
    adChannels: new Map(),
    attributedRevenue: new Map([
      ["meta", { newRevenue: 50, renewalRevenue: 10, conversions: 2, byConfidence: { click: 50, utm_only: 0, inferred_backfill: 0 } }],
    ]),
    confidence: "live",
    computedAt: new Date(),
    sourceVersion: DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION,
  });

  const { dayStartUTC: arStart } = aestDayBounds("2099-05-01");
  const { dayEndUTC: arEnd } = aestDayBounds("2099-05-02");
  const arResult = await readStatsForRange({ rangeStartUTC: arStart, rangeEndUTC: arEnd });

  expect("attributedRevenue.meta.newRevenue = 100+50", arResult.attributedRevenue.meta.newRevenue, 150);
  expect("attributedRevenue.meta.renewalRevenue = 20+10", arResult.attributedRevenue.meta.renewalRevenue, 30);
  expect("attributedRevenue.meta.conversions = 4+2", arResult.attributedRevenue.meta.conversions, 6);
  expect("attributedRevenue.meta.byConfidence.click = 70+50", arResult.attributedRevenue.meta.byConfidence.click, 120);
  expect("attributedRevenue.meta.byConfidence.utm_only = 30+0", arResult.attributedRevenue.meta.byConfidence.utm_only, 30);
  expect("attributedRevenue.meta.byConfidence.inferred_backfill = 0", arResult.attributedRevenue.meta.byConfidence.inferred_backfill, 0);

  // Cleanup attributedRevenue test dates
  await DashboardStatsDailySnapshot.deleteMany({ date: { $in: AR_TEST_DATES } });

  console.log(`\n${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
