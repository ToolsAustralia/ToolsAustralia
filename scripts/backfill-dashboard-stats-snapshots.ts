/**
 * One-shot backfill for DashboardStatsDailySnapshot.
 *
 * Usage:
 *   npx tsx scripts/backfill-dashboard-stats-snapshots.ts --dry-run
 *   npx tsx scripts/backfill-dashboard-stats-snapshots.ts
 *   npx tsx scripts/backfill-dashboard-stats-snapshots.ts --start-date 2026-01-01 --end-date 2026-03-31
 *
 * Defaults: --start-date=2025-11-27 (launch), --end-date=yesterday-AEST.
 *
 * Refund-aware: loads the refund set once and reuses it. Idempotent (upsert by date).
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import DashboardStatsDailySnapshot from "@/models/DashboardStatsDailySnapshot";
import {
  writeSnapshotForDate,
  expandDateKeyRange,
  aestDayBounds,
} from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";
import { loadRefundedPaymentIntentIds } from "@/services/admin/dashboard-stats/revenueAggregator";

const TZ = "Australia/Sydney";
const LAUNCH_DATE_KEY = "2025-11-27";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx < process.argv.length - 1 ? process.argv[idx + 1] : null;
}

function yesterdayKey(): string {
  const now = new Date();
  const todayKey = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  // Subtract 1 AEST day
  const { dayStartUTC } = aestDayBounds(todayKey);
  const minusOne = new Date(dayStartUTC.getTime() - 12 * 60 * 60 * 1000);
  return formatInTimeZone(minusOne, TZ, "yyyy-MM-dd");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const startKey = argValue("--start-date") ?? LAUNCH_DATE_KEY;
  const endKey = argValue("--end-date") ?? yesterdayKey();

  console.log(`${dryRun ? "DRY RUN" : "LIVE"} — backfill ${startKey} → ${endKey}`);

  await connectDB();

  const keys = expandDateKeyRange(startKey, endKey);
  console.log(`Will process ${keys.length} day(s)`);

  if (dryRun) {
    console.log("Sample keys:", keys.slice(0, 5), "...", keys.slice(-5));
    const existing = await DashboardStatsDailySnapshot.countDocuments({ date: { $in: keys } });
    console.log(`Existing snapshots in range: ${existing} (would be upserted)`);
    await mongoose.disconnect();
    return;
  }

  const refunded = await loadRefundedPaymentIntentIds();
  console.log(`Loaded ${refunded.size} refunded payment intent ids`);

  let okCount = 0;
  let failCount = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const result = await writeSnapshotForDate(k, refunded);
    if (result.ok) {
      okCount += 1;
    } else {
      failCount += 1;
      console.error(`  ✗ ${k}: ${result.error}`);
    }
    if ((i + 1) % 25 === 0) {
      console.log(`  progress: ${i + 1}/${keys.length} (ok=${okCount}, fail=${failCount})`);
    }
  }

  console.log(`\nDone. ok=${okCount}, fail=${failCount}`);
  await mongoose.disconnect();
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
