/**
 * Picks N random AEST dates from the snapshot table and compares each day's
 * total revenue + bucket breakdown against a live aggregation. Reports drift.
 *
 * Usage: npx tsx scripts/verify-dashboard-stats-snapshot-drift.ts [--samples=10]
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import DashboardStatsDailySnapshot from "@/models/DashboardStatsDailySnapshot";
import { aestDayBounds } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";
import { aggregateRevenueForDay, loadRefundedPaymentIntentIds } from "@/services/admin/dashboard-stats/revenueAggregator";
import { REVENUE_BUCKET_KEYS } from "@/services/admin/dashboard-stats/snapshotSchema";

function argInt(flag: string, defaultValue: number): number {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!arg) return defaultValue;
  const n = parseInt(arg.split("=")[1], 10);
  return Number.isFinite(n) ? n : defaultValue;
}

async function main() {
  const samples = argInt("--samples", 10);
  await connectDB();

  const allDates = await DashboardStatsDailySnapshot.find({}).select("date").lean();
  if (allDates.length === 0) {
    console.log("No snapshots present.");
    await mongoose.disconnect();
    return;
  }

  // Random sample without replacement
  const pool = allDates.map((d) => d.date);
  const picked: string[] = [];
  for (let i = 0; i < samples && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }

  const refunded = await loadRefundedPaymentIntentIds();
  let driftCount = 0;
  for (const date of picked) {
    const snap = await DashboardStatsDailySnapshot.findOne({ date }).lean();
    if (!snap) continue;
    const { dayStartUTC, dayEndUTC } = aestDayBounds(date);
    const live = await aggregateRevenueForDay(dayStartUTC, dayEndUTC, refunded);

    const snapTotal = snap.revenue?.total ?? 0;
    if (Math.abs(snapTotal - live.total) > 0.01) {
      driftCount += 1;
      console.error(`x ${date}: snapshot total=${snapTotal} vs live=${live.total}`);
      continue;
    }

    const bucketsObj = snap.revenue?.buckets;
    const snapBuckets: Record<string, { revenue: number; purchaseCount: number }> =
      bucketsObj instanceof Map ? Object.fromEntries(bucketsObj.entries()) : (bucketsObj as Record<string, { revenue: number; purchaseCount: number }>) ?? {};

    let bucketDrift = false;
    for (const k of REVENUE_BUCKET_KEYS) {
      const s = snapBuckets[k] ?? { revenue: 0, purchaseCount: 0 };
      const l = live.buckets[k];
      if (Math.abs(s.revenue - l.revenue) > 0.01 || s.purchaseCount !== l.purchaseCount) {
        bucketDrift = true;
        console.error(`  bucket ${k}: snap=${JSON.stringify(s)} live=${JSON.stringify(l)}`);
      }
    }
    if (bucketDrift) driftCount += 1;
    else console.log(`ok ${date}: total=${snapTotal} matches`);
  }

  console.log(`\nSampled ${picked.length} day(s). Drift: ${driftCount}.`);
  await mongoose.disconnect();
  process.exit(driftCount === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
