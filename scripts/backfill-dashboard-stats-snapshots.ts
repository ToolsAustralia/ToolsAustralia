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

function ts(): string {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m${rem}s`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const startKey = argValue("--start-date") ?? LAUNCH_DATE_KEY;
  const endKey = argValue("--end-date") ?? yesterdayKey();

  console.log(`[${ts()}] ${dryRun ? "DRY RUN" : "LIVE"} — backfill ${startKey} → ${endKey}`);

  console.log(`[${ts()}] connecting to MongoDB…`);
  const t0Connect = Date.now();
  await connectDB();
  console.log(`[${ts()}] MongoDB connected (${formatDuration(Date.now() - t0Connect)})`);

  const keys = expandDateKeyRange(startKey, endKey);
  console.log(`[${ts()}] expanded date range: ${keys.length} day(s)`);

  if (dryRun) {
    console.log(`[${ts()}] sample keys: ${keys.slice(0, 5).join(", ")} … ${keys.slice(-5).join(", ")}`);
    const t0Count = Date.now();
    const existing = await DashboardStatsDailySnapshot.countDocuments({ date: { $in: keys } });
    console.log(
      `[${ts()}] existing snapshots in range: ${existing} (would be upserted) — query ${formatDuration(Date.now() - t0Count)}`
    );
    await mongoose.disconnect();
    return;
  }

  console.log(`[${ts()}] loading refunded payment intent set…`);
  const t0Refund = Date.now();
  const refunded = await loadRefundedPaymentIntentIds();
  console.log(
    `[${ts()}] loaded ${refunded.size} refunded payment intent ids (${formatDuration(Date.now() - t0Refund)})`
  );

  console.log(`[${ts()}] processing ${keys.length} day(s)…`);
  const t0Run = Date.now();
  const PROGRESS_EVERY = Math.max(1, Math.min(10, Math.floor(keys.length / 20))); // ~20 progress lines total, min every-1
  let okCount = 0;
  let failCount = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const t0Day = Date.now();
    const result = await writeSnapshotForDate(k, refunded);
    const dayMs = Date.now() - t0Day;

    if (result.ok) {
      okCount += 1;
      console.log(`[${ts()}]   ${k}  ok  (${formatDuration(dayMs)})`);
    } else {
      failCount += 1;
      console.error(`[${ts()}]   ${k}  FAIL  (${formatDuration(dayMs)})  ${result.error}`);
    }

    const done = i + 1;
    if (done % PROGRESS_EVERY === 0 || done === keys.length) {
      const elapsed = Date.now() - t0Run;
      const avgMs = elapsed / done;
      const remaining = keys.length - done;
      const etaMs = avgMs * remaining;
      const pct = Math.round((done / keys.length) * 100);
      console.log(
        `[${ts()}]   ── progress: ${done}/${keys.length} (${pct}%) │ ok=${okCount} fail=${failCount} │ avg ${formatDuration(avgMs)}/day │ elapsed ${formatDuration(elapsed)} │ ETA ${formatDuration(etaMs)}`
      );
    }
  }

  const totalMs = Date.now() - t0Run;
  console.log(
    `\n[${ts()}] Done. ok=${okCount}, fail=${failCount}, total ${formatDuration(totalMs)} (${formatDuration(totalMs / Math.max(keys.length, 1))}/day avg)`
  );
  await mongoose.disconnect();
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
