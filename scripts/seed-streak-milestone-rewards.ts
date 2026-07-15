#!/usr/bin/env npx tsx

/**
 * Seed the Membership Streak reward ladder (P2) — SAFE ORDER, three stages:
 *
 *   1. DROP the legacy MilestoneIssuance unique index (rewardId,userId,cycle) —
 *      replaced by the generation-scoped index defined in the schema.
 *   2. CREATE the 6 rungs as `isActive: false` (dark) — renewals 2/4/6/8/10 →
 *      +100..+500 non-recurring; renewal 12 → +600 `isRecurring` (anniversaries).
 *      All `autoGrant: true`, `neverExpires: true`.
 *   3. INSERT "backfilled" marker issuances for every rung a member passed
 *      BEFORE launch (spec §3: recognise, never retro-grant — markers block the
 *      engine from mass-granting historical rungs the moment rewards activate).
 *
 * Activation (P3 launch runbook ONLY): re-run with --activate to flip the six
 * rungs to isActive: true. NEVER activate before markers exist.
 *
 * Usage:
 *   npm run seed:streak-rewards:dry     # DEFAULT: dry-run, no writes
 *   npm run seed:streak-rewards         # --live: index + rewards + markers
 *   npx tsx scripts/seed-streak-milestone-rewards.ts --live --activate   # P3 launch
 *
 * Re-runnable: rewards upsert by code; markers skip existing rows (unique index).
 * Exit codes: 0 clean · 1 completed with row errors · 2 fatal.
 */

import { config } from "dotenv";
import * as fs from "fs";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const LIVE = process.argv.includes("--live");
const ACTIVATE = process.argv.includes("--activate");
const CSV_PATH = path.resolve(process.cwd(), `seed-streak-rewards-${Date.now()}.csv`);
const LEGACY_INDEX = "milestoneRewardId_1_userId_1_achievementCycle_1";

const RUNGS = [
  { threshold: 2, entriesAmount: 100, code: "STREAK-2R", isRecurring: false },
  { threshold: 4, entriesAmount: 200, code: "STREAK-4R", isRecurring: false },
  { threshold: 6, entriesAmount: 300, code: "STREAK-6R", isRecurring: false },
  { threshold: 8, entriesAmount: 400, code: "STREAK-8R", isRecurring: false },
  { threshold: 10, entriesAmount: 500, code: "STREAK-10R", isRecurring: false },
  // The 12-rung IS the recurring anniversary row: cycle 1 = 12 renewals
  // (+ Founding badge in the UI), cycle 2 = 24, ... (floor(streak/12) cycles).
  { threshold: 12, entriesAmount: 600, code: "STREAK-12R", isRecurring: true },
] as const;

async function main(): Promise<number> {
  const connectDB = (await import("../src/lib/mongodb")).default;
  const User = (await import("../src/models/User")).default;
  const MilestoneReward = (await import("../src/models/MilestoneReward")).default;
  const MilestoneIssuance = (await import("../src/models/MilestoneIssuance")).default;

  await connectDB();
  console.log(`\n🔥 Streak reward ladder seed — ${LIVE ? "LIVE" : "DRY-RUN (no writes)"}${ACTIVATE ? " + ACTIVATE" : ""}\n`);

  // ---- Stage 1: legacy index ----
  try {
    const indexes = await MilestoneIssuance.collection.indexes();
    const hasLegacy = indexes.some((ix) => ix.name === LEGACY_INDEX);
    if (hasLegacy) {
      if (LIVE) {
        await MilestoneIssuance.collection.dropIndex(LEGACY_INDEX);
        console.log(`🧹 Dropped legacy index ${LEGACY_INDEX}`);
      } else {
        console.log(`🧹 Would drop legacy index ${LEGACY_INDEX}`);
      }
    } else {
      console.log(`✓ Legacy index already gone`);
    }
    if (LIVE) {
      await MilestoneIssuance.syncIndexes();
      console.log(`✓ Schema indexes synced (generation-scoped unique index in place)`);
    }
  } catch (ixErr) {
    console.error(`💥 Index stage failed: ${ixErr}`);
    return 2;
  }

  // ---- Stage 2: rungs (upsert by code, isActive:false unless --activate) ----
  const rewardIdByThreshold = new Map<number, string>();
  for (const rung of RUNGS) {
    const existing = await MilestoneReward.findOne({ code: rung.code });
    if (existing) {
      rewardIdByThreshold.set(rung.threshold, String(existing._id));
      if (ACTIVATE && !existing.isActive && LIVE) {
        await MilestoneReward.updateOne({ _id: existing._id }, { $set: { isActive: true } });
        console.log(`🟢 Activated ${rung.code}`);
      } else {
        console.log(`✓ ${rung.code} exists (isActive: ${existing.isActive})`);
      }
      continue;
    }
    if (LIVE) {
      const created = await MilestoneReward.create({
        name: `Membership Streak — ${rung.threshold}th renewal`,
        displayLabel: `+${rung.entriesAmount} free entries`,
        milestoneType: "streak-months",
        threshold: rung.threshold,
        entriesAmount: rung.entriesAmount,
        code: rung.code,
        isActive: ACTIVATE, // dark by default; --activate only at P3 launch
        neverExpires: true,
        isRecurring: rung.isRecurring,
        autoGrant: true,
      });
      rewardIdByThreshold.set(rung.threshold, String(created._id));
      console.log(`＋ Created ${rung.code} (+${rung.entriesAmount} @ renewal ${rung.threshold}${rung.isRecurring ? ", recurring" : ""}, isActive: ${ACTIVATE})`);
    } else {
      console.log(`＋ Would create ${rung.code} (+${rung.entriesAmount} @ renewal ${rung.threshold}${rung.isRecurring ? ", recurring" : ""})`);
    }
  }

  // ---- Stage 3: backfilled markers ----
  const selector = { "subscription.streakMonths": { $gte: 2 } };
  const total = await User.countDocuments(selector);
  console.log(`\n📋 Members with streak ≥ 2 (marker candidates): ${total} · CSV: ${CSV_PATH}`);
  fs.appendFileSync(CSV_PATH, "userId,streakMonths,generation,markersCreated,markersExisting,error\n");

  const progressEvery = Math.max(1, Math.floor(total / 20));
  const t0 = Date.now();
  let processed = 0;
  let markersCreated = 0;
  let markersExisting = 0;
  let rowErrors = 0;

  const cursor = User.find(selector)
    .select("subscription.streakMonths subscription.streakGeneration")
    .lean()
    .cursor({ batchSize: 200 });

  for await (const user of cursor) {
    processed++;
    const streak = user.subscription?.streakMonths ?? 0;
    const generation = user.subscription?.streakGeneration ?? 1;
    let created = 0;
    let existed = 0;
    try {
      for (const rung of RUNGS) {
        if (streak < rung.threshold) continue;
        const rewardId = rewardIdByThreshold.get(rung.threshold);
        if (!rewardId) continue; // dry-run without existing rewards — counted below
        const cycles = rung.isRecurring ? Math.max(1, Math.floor(streak / rung.threshold)) : 1;
        for (let cycle = 1; cycle <= cycles; cycle++) {
          if (!LIVE) {
            created++;
            continue;
          }
          try {
            await MilestoneIssuance.create({
              milestoneRewardId: rewardId,
              userId: user._id,
              milestoneType: "streak-months",
              thresholdReached: rung.threshold * cycle,
              achievementCycle: cycle,
              streakGeneration: generation,
              entriesAmount: rung.entriesAmount,
              status: "backfilled", // recognition only — zero entries granted
              issuedAt: new Date(),
            });
            created++;
          } catch (e: unknown) {
            const code = e && typeof e === "object" && "code" in e ? (e as { code?: number }).code : undefined;
            if (code === 11000) {
              existed++;
            } else {
              throw e;
            }
          }
        }
      }
      markersCreated += created;
      markersExisting += existed;
      fs.appendFileSync(CSV_PATH, `${user._id},${streak},${generation},${created},${existed},\n`);
    } catch (rowErr) {
      rowErrors++;
      fs.appendFileSync(CSV_PATH, `${user._id},${streak},${generation},${created},${existed},"${String(rowErr).replace(/[,"\n]/g, " ")}"\n`);
    }

    if (processed % progressEvery === 0 || processed === total) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = processed / Math.max(elapsed, 0.001);
      console.log(
        `  ${processed}/${total} (${Math.round((processed / total) * 100)}%) · ${rate.toFixed(1)}/sec · ETA ${Math.round((total - processed) / Math.max(rate, 0.001))}s`
      );
    }
  }

  console.log(`\n✅ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`   members: ${processed} · markers ${LIVE ? "created" : "would create"}: ${markersCreated} · already existed: ${markersExisting} · row errors: ${rowErrors}`);
  console.log(`   rungs active: ${ACTIVATE && LIVE ? "YES — grants are LIVE" : "no (dark)"} · audit CSV: ${CSV_PATH}`);
  if (!LIVE) console.log(`   (dry-run — re-run with --live to write)`);
  return rowErrors > 0 ? 1 : 0;
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
