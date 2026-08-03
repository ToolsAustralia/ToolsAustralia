/**
 * Page Analytics cleanup — drop the dead cross-visit index and retire an inert permission.
 *
 * Run:
 *   npm run migrate:promo-analytics-cleanup:dry   # default-safe, changes nothing
 *   npm run migrate:promo-analytics-cleanup       # applies
 *
 * WHAT IT DOES
 *  1. Drops `referrerSlug_1_slug_1_timestamp_-1` from `promoanalyticsvisits`.
 *     The `referrerSlug` field measured arrivals from the "Explore other toolsets" carousel,
 *     which the in-place two-reel configurator replaced on 2026-07-22 (commit 87f18d78). Nothing
 *     has written it since — the last row carrying one is dated 2026-07-22 — so the index costs
 *     write throughput on the highest-traffic collection in the product for a metric that is a
 *     structural zero. Removing the field from the Mongoose schema does NOT drop the index in
 *     Mongo; only this does.
 *  2. Pulls the inert `promoAnalytics.view` permission from every role.
 *     It is checked by ZERO routes (the Page Analytics tab and its three API routes all gate on
 *     `pageAnalytics.view`). Left in place it is a trap: an admin could revoke it believing it
 *     locks down promo analytics, and nothing would change.
 *
 * ORDERING NOTE (matters): the catalog entry for `promoAnalytics.view` is deliberately KEPT in
 * `src/lib/permissions.ts` for now, because `Role` validates every permission string against the
 * catalog on save — so removing the entry while roles still hold the string would make editing
 * those roles fail. Run this migration first; the catalog entry can then be deleted safely in a
 * follow-up change.
 *
 * Data safety: it never deletes documents or fields. Dropping an index is reversible (recreate
 * it); `$pull` on an unused permission string is reversible by re-granting.
 */
import { config } from "dotenv";
import path from "node:path";

/**
 * Which env file to load. Defaults to `.env.local`; `--production` targets `.env.production`.
 *
 * MUST be resolved and loaded before importing anything that reads MONGODB_URI —
 * `src/lib/mongodb.ts` resolves the URI from `process.env` at import time and throws if unset,
 * and nothing else in a plain `tsx` process loads an env file. Matches the sibling migrations.
 */
const ENV_FILE = process.argv.includes("--production") ? ".env.production" : ".env.local";
config({ path: path.resolve(process.cwd(), ENV_FILE) });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";

const DRY_RUN = !process.argv.includes("--apply");

const VISITS_COLLECTION = "promoanalyticsvisits";
const DEAD_INDEX = "referrerSlug_1_slug_1_timestamp_-1";
const DEAD_PERMISSION = "promoAnalytics.view";

/** MongoDB error code for "index not found" — a no-op, not a failure. */
const INDEX_NOT_FOUND = 27;

type Summary = {
  indexDropped: boolean;
  indexAlreadyAbsent: boolean;
  rolesWithDeadPermission: number;
  rolesUpdated: number;
  warnings: string[];
};

async function main() {
  const started = Date.now();
  console.log("\n=== Page Analytics cleanup ===");
  console.log(DRY_RUN ? "MODE: DRY RUN (no writes) — pass --apply to execute" : "MODE: APPLY");

  // Name the target BEFORE touching it. Several clusters are reachable from this repo and the
  // env file is chosen by a flag, so "which database am I about to change" must never be an
  // inference. Host only — credentials are never printed.
  const uri = process.env.MONGODB_URI ?? "";
  let host = "(unparseable)";
  try {
    host = new URL(uri.replace("mongodb+srv://", "https://")).hostname;
  } catch {
    /* leave as unparseable */
  }
  console.log(`ENV FILE: ${ENV_FILE}`);
  console.log(`CLUSTER:  ${host}`);

  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("No database handle after connectDB()");
  console.log(`DB:       ${db.databaseName}\n`);

  const summary: Summary = {
    indexDropped: false,
    indexAlreadyAbsent: false,
    rolesWithDeadPermission: 0,
    rolesUpdated: 0,
    warnings: [],
  };

  // ── Step 1: the dead cross-visit index ────────────────────────────────────
  console.log(`[1/2] Index ${DEAD_INDEX} on ${VISITS_COLLECTION}`);
  const visits = db.collection(VISITS_COLLECTION);

  const totalVisits = await visits.countDocuments({});
  const stillCarrying = await visits.countDocuments({ referrerSlug: { $exists: true, $ne: null } });
  console.log(`      ${totalVisits} visit docs; ${stillCarrying} still carry referrerSlug`);
  if (stillCarrying > 0) {
    const newest = await visits
      .find({ referrerSlug: { $exists: true, $ne: null } })
      .sort({ timestamp: -1 })
      .limit(1)
      .project({ timestamp: 1 })
      .toArray();
    console.log(
      `      newest such row: ${newest[0]?.timestamp?.toISOString?.() ?? "unknown"} ` +
        `(they age out with the 90-day TTL; the index is not needed to read them)`
    );
  }

  const indexes = await visits.indexes();
  const present = indexes.some((i) => i.name === DEAD_INDEX);
  if (!present) {
    summary.indexAlreadyAbsent = true;
    console.log(`      ✓ already absent — nothing to do`);
  } else if (DRY_RUN) {
    console.log(`      would DROP ${DEAD_INDEX}`);
  } else {
    try {
      await visits.dropIndex(DEAD_INDEX);
      summary.indexDropped = true;
      console.log(`      ✓ dropped`);
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === INDEX_NOT_FOUND) {
        summary.indexAlreadyAbsent = true;
        console.log(`      ✓ already absent (raced) — treated as a no-op`);
      } else {
        throw error;
      }
    }
  }

  // ── Step 2: the inert permission ──────────────────────────────────────────
  console.log(`\n[2/2] Permission "${DEAD_PERMISSION}"`);
  const roles = db.collection("roles");
  const holders = await roles.find({ permissions: DEAD_PERMISSION }).project({ name: 1 }).toArray();
  summary.rolesWithDeadPermission = holders.length;

  if (holders.length === 0) {
    console.log(`      ✓ no role holds it — nothing to do`);
  } else {
    console.log(`      held by ${holders.length} role(s): ${holders.map((r) => r.name).join(", ")}`);
    if (DRY_RUN) {
      console.log(`      would $pull it from each`);
    } else {
      const res = await roles.updateMany(
        { permissions: DEAD_PERMISSION },
        { $pull: { permissions: DEAD_PERMISSION } } as never
      );
      summary.rolesUpdated = res.modifiedCount;
      console.log(`      ✓ removed from ${res.modifiedCount} role(s)`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log("\n=== Summary ===");
  console.log(`  mode:                 ${DRY_RUN ? "dry-run" : "applied"}`);
  console.log(`  index dropped:        ${summary.indexDropped}`);
  console.log(`  index already absent: ${summary.indexAlreadyAbsent}`);
  console.log(`  roles holding perm:   ${summary.rolesWithDeadPermission}`);
  console.log(`  roles updated:        ${summary.rolesUpdated}`);
  console.log(`  elapsed:              ${elapsed}s`);
  if (summary.warnings.length) {
    console.log("\n  WARNINGS:");
    for (const w of summary.warnings) console.log(`   - ${w}`);
  }
  console.log(
    DRY_RUN
      ? "\nDry run only. Re-run with --apply to execute.\n"
      : "\nDone. `promoAnalytics.view` may now be removed from src/lib/permissions.ts safely.\n"
  );

  await mongoose.disconnect();
  // 0 = clean, 2 = applied with warnings. 1 is reserved for a thrown failure below.
  process.exit(summary.warnings.length > 0 ? 2 : 0);
}

main().catch(async (error) => {
  console.error("\n✗ Migration failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
