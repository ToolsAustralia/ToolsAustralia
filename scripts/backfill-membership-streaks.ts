#!/usr/bin/env npx tsx

/**
 * Backfill / repair `subscription.streakMonths` + `subscription.streakGeneration`
 * for every member from the MembershipRenewalCycle ledger (Membership Streak P1).
 *
 * Spec: docs/superpowers/specs/2026-07-07-membership-streak-design.md §3
 * Walker: src/utils/subscription/streak.ts → computeStreakFromHistory
 *   - counts paid cycles (succeeded/recovered) ordered by dueAt
 *   - generation break = gap > 65 days (BREAK_GAP_DAYS) WITH cancel evidence — a
 *     "canceled"/"scheduled_cancel" history row within the 40-day lookback window;
 *     gaps without cancel evidence continue (recovery/pause lag)
 *   - --roundup-incomplete ONLY (the one-time LAUNCH run): history-incomplete
 *     (join predates ~2026-04-29 coverage) + active + no breaks → rounds UP to
 *     whole months since join (never under-credit veterans). Standing REPAIR
 *     runs must omit the flag: `now` advances every run, so re-applying the
 *     round-up would credit pure calendar months (e.g. unpaid past-due
 *     stretches) that were never paid.
 *
 * This script is RE-RUNNABLE and doubles as the drift-repair tool (pure $set from
 * recomputation — referenced by the webhook increment's error path).
 * It writes NO milestone issuances and grants NO entries (grants are P2).
 *
 * Usage:
 *   npm run backfill:membership-streaks:dry          # DEFAULT: dry-run, no writes
 *   npm run backfill:membership-streaks              # --live: REPAIR mode (no round-up)
 *   npx tsx scripts/backfill-membership-streaks.ts --live --roundup-incomplete   # LAUNCH run (once)
 *   npx tsx scripts/backfill-membership-streaks.ts --user=<mongoId>   [--live]
 *
 * Exit codes: 0 clean · 1 completed with anomalies (see CSV) · 2 fatal.
 * Env: .env.local must have MONGODB_URI.
 */

import { config } from "dotenv";
import * as fs from "fs";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const LIVE = process.argv.includes("--live");
const ROUNDUP_INCOMPLETE = process.argv.includes("--roundup-incomplete");
const USER_ARG = process.argv.find((a) => a.startsWith("--user="))?.split("=")[1];
const CSV_PATH = path.resolve(process.cwd(), `backfill-membership-streaks-${Date.now()}.csv`);

/** Status-history coverage start (see docs/subscription — complete from ~2026-04-29). */
const COVERAGE_START = new Date("2026-04-29T00:00:00Z");

async function main(): Promise<number> {
  const connectDB = (await import("../src/lib/mongodb")).default;
  const User = (await import("../src/models/User")).default;
  const MembershipRenewalCycle = (await import("../src/models/MembershipRenewalCycle")).default;
  const MembershipStatusHistory = (await import("../src/models/MembershipStatusHistory")).default;
  const { computeStreakFromHistory, wholeMonthsBetween } = await import("../src/utils/subscription/streak");

  await connectDB();

  const selector: Record<string, unknown> = USER_ARG
    ? { _id: USER_ARG }
    : {
        subscription: { $exists: true },
        $or: [
          { "subscription.isActive": true },
          { "subscription.lastMonthAccumulatedEntries": { $exists: true } },
        ],
      };

  const total = await User.countDocuments(selector);
  console.log(`\n🔥 Membership Streak backfill — ${LIVE ? "LIVE (writing)" : "DRY-RUN (no writes)"}`);
  console.log(`   Users matched: ${total} · CSV audit: ${CSV_PATH}\n`);
  if (total === 0) return 0;

  fs.appendFileSync(
    CSV_PATH,
    "userId,email,previousStreak,computedStreak,generation,breaks,confidence,cyclesCounted,anomaly\n"
  );

  const progressEvery = Math.max(1, Math.floor(total / 20));
  const t0 = Date.now();
  const now = new Date();
  let processed = 0;
  let updated = 0;
  let wouldUpdate = 0;
  let unchanged = 0;
  let anomalies = 0;
  let liveResetsPreserved = 0;
  const byConfidence: Record<string, number> = {};

  const cursor = User.find(selector)
    .select("email subscription.startDate subscription.isActive subscription.streakMonths subscription.streakGeneration")
    .lean()
    .cursor({ batchSize: 100 });

  try {
    for await (const user of cursor) {
      processed++;
      try {
        const userId = String(user._id);
        const [cycles, cancels] = await Promise.all([
          MembershipRenewalCycle.find({ userId: user._id, status: { $in: ["succeeded", "recovered"] } })
            .select("dueAt")
            .sort({ dueAt: 1 })
            .lean(),
          // Cancel EVIDENCE for the walker: the dominant cancel path writes
          // "scheduled_cancel" (period-end cancel — the click), "canceled" only
          // covers immediate cancels. Both count (see streak.ts break rule).
          MembershipStatusHistory.find({
            userId: user._id,
            membershipStatus: { $in: ["canceled", "scheduled_cancel"] },
          })
            .select("effectiveAt")
            .sort({ effectiveAt: 1 })
            .lean(),
        ]);

        const joinDate = user.subscription?.startDate ? new Date(user.subscription.startDate) : null;
        const result = computeStreakFromHistory({
          joinDate,
          coverageStart: COVERAGE_START,
          cycles: cycles.map((c) => ({ dueAt: new Date(c.dueAt) })),
          cancelDates: cancels.map((c) => new Date(c.effectiveAt)),
          isCurrentlyActive: Boolean(user.subscription?.isActive),
          now,
          // Launch-only veterans' round-up; repair runs recompute from the ledger alone.
          roundUpIncomplete: ROUNDUP_INCOMPLETE,
        });
        byConfidence[result.confidence] = (byConfidence[result.confidence] ?? 0) + 1;

        // Anomaly: computed streak exceeds the physically possible months-since-join (+1 slack for anchor shifts).
        const maxPlausible = joinDate ? wholeMonthsBetween(joinDate, now) + 1 : Number.POSITIVE_INFINITY;
        const isAnomaly = result.streakMonths > maxPlausible;
        if (isAnomaly) anomalies++;

        const prev = user.subscription?.streakMonths ?? 0;
        const prevGen = user.subscription?.streakGeneration ?? 1;
        const changed = prev !== result.streakMonths || prevGen !== result.streakGeneration;
        // MONOTONIC GUARD: a live-written reset (webhook bumped the generation on an
        // out-of-grace resubscribe) always wins — the ledger cannot see every reset
        // (the live grace test uses subscription.endDate). Never regress it.
        const liveResetWins = result.streakGeneration < prevGen;
        const willWrite = changed && !isAnomaly && !liveResetWins;

        if (willWrite) {
          wouldUpdate++;
          if (LIVE) {
            await User.updateOne(
              { _id: user._id },
              {
                $set: {
                  "subscription.streakMonths": result.streakMonths,
                  "subscription.streakGeneration": result.streakGeneration,
                },
              }
            );
            updated++;
          }
        } else if (!changed) {
          unchanged++;
        } else if (liveResetWins) {
          liveResetsPreserved++;
        }

        fs.appendFileSync(
          CSV_PATH,
          `${userId},${user.email ?? ""},${prev},${result.streakMonths},${result.streakGeneration},${result.breaks},${result.confidence},${cycles.length},${isAnomaly ? "ANOMALY" : liveResetWins ? "LIVE-RESET-PRESERVED" : ""}\n`
        );
      } catch (rowErr) {
        anomalies++;
        console.error(`  ❌ user ${user._id}: ${rowErr}`);
        fs.appendFileSync(
          CSV_PATH,
          `${user._id},${user.email ?? ""},,,,,,,"ERROR: ${String(rowErr).replace(/[,"\n]/g, " ")}"\n`
        );
      }

      if (processed % progressEvery === 0 || processed === total) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = processed / Math.max(elapsed, 0.001);
        const eta = Math.round((total - processed) / Math.max(rate, 0.001));
        console.log(
          `  ${processed}/${total} (${Math.round((processed / total) * 100)}%) · ${rate.toFixed(1)}/sec · ETA ${eta}s`
        );
      }
    }
  } catch (outerErr) {
    console.error(`\n💥 Cursor/connection failure after ${processed}/${total}: ${outerErr}`);
    console.error(`   Partial audit preserved at ${CSV_PATH}`);
    return 2;
  }

  console.log(`\n✅ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`   processed: ${processed} · ${LIVE ? "updated" : "would update"}: ${LIVE ? updated : wouldUpdate} · unchanged: ${unchanged} · live-resets preserved: ${liveResetsPreserved} · anomalies: ${anomalies}`);
  console.log(`   confidence: ${JSON.stringify(byConfidence)}`);
  console.log(`   audit CSV: ${CSV_PATH}`);
  if (!LIVE) console.log(`   (dry-run — re-run with --live to write)`);
  return anomalies > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect().catch(() => {});
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(`💥 Fatal: ${err}`);
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect().catch(() => {});
    process.exit(2);
  });
