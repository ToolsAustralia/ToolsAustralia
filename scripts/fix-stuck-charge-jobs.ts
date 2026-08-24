#!/usr/bin/env npx tsx
/**
 * Finalize orphaned bulk-charge / recover `ChargeJobRun` documents and release a
 * stale global charge lock.
 *
 * WHY THIS EXISTS
 * The legacy bulk charge endpoint did all ~800 Stripe charges inside one request.
 * When that request hit Vercel's 300s timeout the process was killed BEFORE the
 * finalize block ran, so the `ChargeJobRun` stayed `status: "running"` with
 * `totals` frozen at `{ eligibleCount }` (attempted/succeeded/failed all 0) — even
 * though InvoiceChargeLog shows real charges happened. The `ChargeJobLock` was
 * also left held until its 30-min `lockedUntil` TTL expired.
 *
 * This script makes the history HONEST: it recomputes each orphaned run's totals
 * from its actual InvoiceChargeLog rows (so the 43 real successes show up), marks
 * the run `aborted` with an explanatory note, and releases the global lock if it
 * is held but expired.
 *
 * Usage:
 *   npx tsx scripts/fix-stuck-charge-jobs.ts            # local DB, LIVE (mutates)
 *   npx tsx scripts/fix-stuck-charge-jobs.ts --dry-run  # local DB, inspect only
 *   npx tsx scripts/fix-stuck-charge-jobs.ts --prod --dry-run   # PROD, inspect only (recommended first)
 *   npx tsx scripts/fix-stuck-charge-jobs.ts --prod             # PROD, LIVE
 *
 * Options:
 *   --dry-run        Report what would change; perform no writes.
 *   --prod           Target production (loads MONGODB_URI from .env.production).
 *   --older-than-min Override the orphan QUIET-TIME threshold in minutes (default 35).
 *
 * Safety:
 *   - Only touches runs with status === "running" that have made NO PROGRESS for
 *     longer than the threshold (default 35 min) — never an in-flight run.
 *     Liveness is `lastProgressAt ?? startedAt`, matching `isOrphanRun`
 *     (src/server/admin/charge-past-due-totals.ts). Keying on `startedAt` alone was
 *     the 2026-08-24 bug: real runs take 36-39 min, so an elapsed-time rule aborts
 *     healthy runs mid-charge. `lastProgressAt` is absent on runs created before
 *     that date, hence the fallback.
 *   - Lock is released ONLY when it is held AND its lockedUntil has passed.
 *   - Idempotent: a second run finds nothing to do.
 *
 * Env:
 *   MONGODB_URI (from .env.local, or .env.production when --prod).
 */

import { config } from "dotenv";
import path from "path";
// The SHARED liveness rule — imported, never re-implemented. Safe to import statically
// above the dotenv call (unlike the models below): charge-past-due-totals.ts is
// deliberately Mongoose-free and env-free, its ChargeJobRun import is `import type`
// (erased at compile), and its only value import (chargeSkipReasons) has no imports of
// its own. The dynamic-import dance further down exists solely to defer MODEL loading
// past dotenv, which does not apply here.
import {
  ORPHAN_RUN_THRESHOLD_MS,
  runLivenessAt,
} from "@/server/admin/charge-past-due-totals";

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const USE_PROD = ARGS.includes("--prod");
const olderThanArg = ARGS.find((a) => a.startsWith("--older-than-min="));
const DEFAULT_OLDER_THAN_MIN = ORPHAN_RUN_THRESHOLD_MS / 60_000;
const OLDER_THAN_MIN = olderThanArg ? Number(olderThanArg.split("=")[1]) : DEFAULT_OLDER_THAN_MIN;

config({ path: path.resolve(process.cwd(), USE_PROD ? ".env.production" : ".env.local") });

const LOCK_ID = "charge-job-lock";

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error(`MONGODB_URI missing from ${USE_PROD ? ".env.production" : ".env.local"}`);
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const mongoose = (await import("mongoose")).default;
  await connectDB();
  const dbName = mongoose.connection.db?.databaseName ?? "(unknown)";
  console.log(`🔌 fix-stuck-charge-jobs · ${USE_PROD ? "PROD" : "local"} · db="${dbName}" · ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE"}`);
  if (USE_PROD && !DRY_RUN) console.log("   ⚠️  Targeting PRODUCTION with writes. Ctrl-C now if unintended.");

  const ChargeJobRun = (await import("../src/models/ChargeJobRun")).default;
  const ChargeJobLock = (await import("../src/models/ChargeJobLock")).default;
  const InvoiceChargeLog = (await import("../src/models/InvoiceChargeLog")).default;

  const now = new Date();

  // 1. Find STALLED runs — `running` with no progress for longer than the threshold.
  //    Filtered in memory rather than in the query: Mongo cannot express
  //    `lastProgressAt ?? startedAt` without an index-defeating `$expr`, and the
  //    `running` set is at most a handful of documents.
  //    The fallback itself is NOT re-implemented here — `runLivenessAt` is imported, so
  //    this script and the automatic sweep cannot drift. The comparison is `>=` to match
  //    `isOrphanRun` exactly; an exclusive `<` would make the two disagree at the boundary.
  //    With the default threshold this predicate IS `isOrphanRun` (the query already
  //    restricts to status "running"); the only difference is --older-than-min.
  const thresholdMs = OLDER_THAN_MIN * 60 * 1000;
  const isStalled = (r: { startedAt: Date; lastProgressAt?: Date | null }): boolean =>
    now.getTime() - runLivenessAt(r).getTime() >= thresholdMs;
  const runningRuns = await ChargeJobRun.find({ status: "running" }).sort({ startedAt: 1 }).lean();
  const orphans = runningRuns.filter(isStalled);
  const stillProgressing = runningRuns.length - orphans.length;

  console.log(
    `\nFound ${orphans.length} stalled 'running' run(s) with no progress for ${OLDER_THAN_MIN}+ min.` +
      (stillProgressing > 0
        ? ` (${stillProgressing} other 'running' run(s) still progressing — left alone.)`
        : "")
  );

  let fixedRuns = 0;
  for (const run of orphans) {
    // Recompute REAL totals from the run's InvoiceChargeLog rows.
    const agg = await InvoiceChargeLog.aggregate<{ _id: string; n: number; revenue: number }>([
      { $match: { chargeRunId: run._id } },
      { $group: { _id: "$status", n: { $sum: 1 }, revenue: { $sum: { $cond: [{ $eq: ["$status", "success"] }, "$amount", 0] } } } },
    ]);
    const byStatus = new Map(agg.map((a) => [a._id, a]));
    const succeeded = byStatus.get("success")?.n ?? 0;
    const failed = byStatus.get("failed")?.n ?? 0;
    const skippedTotal = byStatus.get("skipped")?.n ?? 0;
    const revenueCents = byStatus.get("success")?.revenue ?? 0;
    const attempted = succeeded + failed;
    const eligibleCount = run.totals?.eligibleCount ?? attempted + skippedTotal;

    const newTotals = {
      eligibleCount,
      attempted,
      succeeded,
      failed,
      revenueCents,
      skipped: {
        total: skippedTotal,
        recentlyAttempted: 0,
        noLongerPastDue: 0,
        alreadyPaid: 0,
        missingPaymentMethod: 0,
        other: skippedTotal,
      },
    };

    const quietSince = runLivenessAt(run);
    const note = `Finalized by fix-stuck-charge-jobs: 'running' with no progress since ${quietSince?.toISOString?.() ?? quietSince} (started ${run.startedAt?.toISOString?.() ?? run.startedAt}). Recomputed from logs: ${attempted} attempted of ${eligibleCount} eligible (${succeeded} succeeded, ${failed} failed, ${skippedTotal} skipped).`;

    console.log(
      `\n  run ${String(run._id)} (kind=${run.kind ?? "charge"}) → eligible=${eligibleCount} attempted=${attempted} succeeded=${succeeded} failed=${failed} skipped=${skippedTotal} revenue=$${(revenueCents / 100).toFixed(2)}`
    );

    if (DRY_RUN) {
      console.log(`    [dry-run] would set status='aborted' + totals above + note`);
    } else {
      await ChargeJobRun.updateOne(
        { _id: run._id, status: "running" },
        { $set: { status: "aborted", finishedAt: now, totals: newTotals, error: note } }
      );
      console.log(`    ✓ aborted with honest totals`);
      fixedRuns++;
    }
  }

  // 2. Release the global lock if held but expired (and no genuinely-active run remains).
  const lock = await ChargeJobLock.findById(LOCK_ID).lean();
  // Same liveness rule: a LONG but still-progressing run must keep holding the lock.
  const orphanIds = new Set(orphans.map((o) => String(o._id)));
  const activeRunsRemaining = runningRuns.filter(
    (r) => !orphanIds.has(String(r._id))
  ).length;
  if (lock?.isLocked) {
    const expired = lock.lockedUntil ? new Date(lock.lockedUntil) <= now : true;
    if (expired && activeRunsRemaining === 0) {
      if (DRY_RUN) {
        console.log(`\n  [dry-run] lock is held but expired (lockedUntil=${lock.lockedUntil}) → would release`);
      } else {
        await ChargeJobLock.findByIdAndUpdate(LOCK_ID, { isLocked: false });
        console.log(`\n  ✓ released expired global charge lock`);
      }
    } else if (!expired) {
      console.log(`\n  lock is held and NOT expired (lockedUntil=${lock.lockedUntil}) → left untouched (a run may be active)`);
    } else if (activeRunsRemaining > 0) {
      console.log(`\n  lock held + ${activeRunsRemaining} still-progressing run(s) → left untouched`);
    }
  } else {
    console.log(`\n  global charge lock is already free.`);
  }

  console.log(
    `\n=== Summary ===\n  running runs scanned: ${runningRuns.length}\n  stalled runs found:   ${orphans.length}\n  runs finalized:       ${DRY_RUN ? 0 : fixedRuns}${DRY_RUN ? " (dry-run)" : ""}`
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("fix-stuck-charge-jobs failed:", e);
  process.exit(1);
});
