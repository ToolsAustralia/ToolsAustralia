#!/usr/bin/env npx tsx
/**
 * Migration 2026-07-29 — drop the two superseded NON-partial build-prize indexes.
 *
 * Pairs with the schema change in `src/models/PromoAnalyticsVisit.ts` and `src/models/User.ts`,
 * which redeclare the same two key patterns as PARTIAL indexes under NEW names
 * (`builtPrizeSlug_ts_partial`, `signupBuiltPrize_createdAt_partial`).
 *
 * ## Why the rename, and why this script must exist
 *
 * Both indexes were added for the prize-build aggregations and neither narrows anything: every
 * query that would use them filters on `$exists: true`, and a non-sparse index stores a missing
 * field as `null`, so the bounds span the entire key range (`[MinKey, "") ("", MaxKey]`). Measured
 * on the dev DB — 764 docs, 8 carrying `builtPrizeSlug` — the scan examined 764 keys / 764 docs
 * with the index forced AND without it. They paid write amplification for zero read benefit
 * (panel findings F-020 / F-021).
 *
 * Mongoose cannot alter an index in place. Re-declaring the SAME index NAME with a changed
 * `partialFilterExpression` is rejected by the server — measured against this deployment as code
 * **86**, "An existing index has the same name as the requested index" (the conflict is commonly
 * cited as `IndexOptionsConflict`/85; 86 is what MongoDB actually returned here). `autoIndex`
 * swallows that error, so the partial index would silently never build. Hence: new names in the
 * schema, and the old names dropped here. The two steps cannot be collapsed into one.
 *
 * ## Ordering is NOT a hazard — verified
 *
 * A *differently named* partial index is allowed to coexist with the old non-partial one on the
 * same key pattern (probed directly: creating `builtPrizeSlug_ts_partial` alongside
 * `builtPrizeSlug_1_timestamp_-1` succeeds). So it does not matter whether the deploy (autoIndex)
 * or this migration runs first, and there is never a window with no usable index.
 *
 * ## What this does NOT do
 *
 * It does not create the partial indexes. `src/lib/mongodb.ts` leaves mongoose's `autoIndex` at
 * its default (`true`), so the app builds them from the schema on next start. This script reports
 * whether they are present so the operator can see the end state either way.
 *
 * Deliberately uses the raw driver collections rather than importing the Mongoose models —
 * importing a model after `connectDB()` triggers `autoIndex`, which would make a "dry run" write.
 *
 * Usage:
 *   npm run migrate:partial-build-prize-indexes:dry   # DRY-RUN (default) — reports, writes nothing
 *   npm run migrate:partial-build-prize-indexes       # LIVE (passes --live) — drops the two indexes
 *   npx tsx scripts/migrations/2026-07-29-partial-build-prize-indexes.ts [--live]
 *
 * Idempotent: dropping an already-absent index is a reported no-op (`IndexNotFound`, code 27),
 * never a throw. Re-running after success exits 0 with "already migrated".
 *
 * Exit: 0 clean · 2 partial (a drop failed) · 3 outer/fatal · 1 unhandled.
 * Env: .env.local must have MONGODB_URI.
 * @module scripts/migrations/2026-07-29-partial-build-prize-indexes
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";

const LIVE = process.argv.includes("--live");

/** One entry per index this migration retires. */
const TARGETS: Array<{
  collection: string;
  /** The non-partial index this migration drops. */
  dropName: string;
  /** The partial index the schema now declares in its place (built by mongoose autoIndex). */
  expectName: string;
}> = [
  {
    collection: "promoanalyticsvisits",
    dropName: "builtPrizeSlug_1_timestamp_-1",
    expectName: "builtPrizeSlug_ts_partial",
  },
  {
    collection: "users",
    dropName: "signupAttribution.builtPrizeSlug_1_createdAt_1",
    expectName: "signupBuiltPrize_createdAt_partial",
  },
];

/** MongoDB `IndexNotFound`. Dropping an absent index is a no-op here, not a failure. */
const INDEX_NOT_FOUND = 27;

function errCode(e: unknown): number | undefined {
  return typeof e === "object" && e !== null && "code" in e
    ? Number((e as { code: unknown }).code)
    : undefined;
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function processTarget(
  db: mongoose.mongo.Db,
  target: (typeof TARGETS)[number],
  step: string,
): Promise<{ dropped: number; alreadyGone: number; wouldDrop: number; failed: number; missingPartial: number }> {
  const tally = { dropped: 0, alreadyGone: 0, wouldDrop: 0, failed: 0, missingPartial: 0 };
  const col = db.collection(target.collection);

  const before = await col.indexes();
  console.log(`\n${step} ${target.collection} — indexes BEFORE (${before.length}):`);
  for (const idx of before) {
    console.log(`        ${idx.name}${idx.partialFilterExpression ? "  (partial)" : ""}`);
  }

  const hasOld = before.some((idx) => idx.name === target.dropName);
  const hasNew = before.some((idx) => idx.name === target.expectName);
  console.log(`  superseded "${target.dropName}": ${hasOld ? "PRESENT — must drop" : "absent"}`);
  console.log(
    `  partial    "${target.expectName}": ` +
      (hasNew ? "present" : "ABSENT — mongoose autoIndex builds it on next app start"),
  );
  if (!hasNew) tally.missingPartial++;

  if (!hasOld) {
    tally.alreadyGone++;
    console.log(`  ${step} no-op — "${target.dropName}" is already gone.`);
    return tally;
  }
  if (!LIVE) {
    tally.wouldDrop++;
    console.log(`  ${step} [DRY-RUN] would drop "${target.dropName}" from ${target.collection}.`);
    return tally;
  }

  try {
    await col.dropIndex(target.dropName);
    tally.dropped++;
    console.log(`  ${step} dropped "${target.dropName}".`);
  } catch (e) {
    // Idempotency: another run (or another operator) may have dropped it between the listing
    // above and this call. That is success, not failure.
    if (errCode(e) === INDEX_NOT_FOUND) {
      tally.alreadyGone++;
      console.log(`  ${step} no-op — "${target.dropName}" vanished before the drop (IndexNotFound).`);
    } else {
      tally.failed++;
      console.error(`  ${step} DROP FAILED for "${target.dropName}": ${errMsg(e)}`);
    }
  }

  const after = await col.indexes();
  console.log(`  ${step} ${target.collection} — indexes AFTER (${after.length}):`);
  for (const idx of after) {
    console.log(`        ${idx.name}${idx.partialFilterExpression ? "  (partial)" : ""}`);
  }
  return tally;
}

async function main() {
  console.log(`\n=== partial build-prize indexes (${LIVE ? "LIVE" : "DRY-RUN"}) ===\n`);

  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("no db handle after connectDB()");

  // Up-front total, so the per-index lines below have a denominator.
  console.log(`Indexes to retire: ${TARGETS.length}`);
  for (const [i, t] of TARGETS.entries()) {
    console.log(`  ${i + 1}. ${t.collection}.${t.dropName}  →  ${t.expectName} (partial)`);
  }

  const total = { dropped: 0, alreadyGone: 0, wouldDrop: 0, failed: 0, missingPartial: 0 };
  const startMs = Date.now();
  let outerError: unknown = null;

  try {
    for (const [i, target] of TARGETS.entries()) {
      const tally = await processTarget(db, target, `[${i + 1}/${TARGETS.length}]`);
      total.dropped += tally.dropped;
      total.alreadyGone += tally.alreadyGone;
      total.wouldDrop += tally.wouldDrop;
      total.failed += tally.failed;
      total.missingPartial += tally.missingPartial;
    }
  } catch (e) {
    outerError = e;
    console.error(`\nOuter error after ${total.dropped + total.alreadyGone} target(s): ${errMsg(e)}`);
  }

  console.log(`\nSummary\n=======`);
  console.log(`  Mode:            ${LIVE ? "LIVE" : "DRY-RUN"}`);
  console.log(`  Elapsed:         ${(Math.round((Date.now() - startMs) / 100) / 10).toFixed(1)}s`);
  console.log(`  Targets:         ${TARGETS.length}`);
  console.log(`  Dropped:         ${total.dropped}`);
  console.log(`  Already absent:  ${total.alreadyGone}`);
  if (!LIVE) console.log(`  Would drop:      ${total.wouldDrop}`);
  console.log(`  Failed:          ${total.failed}`);
  console.log(`  Partial index not yet built (autoIndex will create): ${total.missingPartial}`);
  if (outerError) console.log(`  Outer error — partial run`);

  if (outerError) {
    // fall through to the exit below
  } else if (!LIVE) {
    console.log(
      total.wouldDrop === 0
        ? `\nNothing to drop — already migrated. A --live run would be a no-op.`
        : `\nRe-run with --live (npm run migrate:partial-build-prize-indexes) to apply.`,
    );
  } else {
    console.log(
      total.failed === 0
        ? `\nMigration complete.`
        : `\n${total.failed} drop(s) failed — investigate before assuming the old indexes are gone.`,
    );
  }

  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }

  if (outerError) process.exit(3);
  process.exit(total.failed > 0 ? 2 : 0);
}

main().catch(async (err) => {
  console.error("\nMigration aborted with unhandled error:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
