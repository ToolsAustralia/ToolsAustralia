/**
 * Remove the dead `upsellStats` sub-document from every user.
 *
 * WHY
 * `upsellStats` was written only by `POST /api/upsell/track`, which was reachable only from
 * `UpsellManager.tsx` — a component imported nowhere in the app. Measured against production
 * on 2026-08-26: **0 of 56,360 users had `upsellStats.totalShown > 0`**, while 2,290 users had
 * real `upsellPurchases`. The field was five permanent zeros that read like measured data, and
 * it was published to Klaviyo as five profile properties until those were retired.
 *
 * The component, the API route, the tracking hooks and the schema field are all deleted. This
 * strips the residue from the stored documents so the collection matches the model.
 *
 * SAFETY
 * - `$unset` only. Touches no other field, creates nothing, and cannot alter entry counts,
 *   billing, or draw participation.
 * - Batched by `_id` so a long single write never sits on the hot `users` collection, and an
 *   interrupted run simply resumes (already-unset documents stop matching the filter).
 * - Idempotent: re-running finds nothing left to do.
 * - `--dry-run` reports what WOULD be unset and writes nothing.
 *
 * Usage:
 *   npm run migrate:remove-upsell-stats:dry -- --prod     # report only
 *   npm run migrate:remove-upsell-stats -- --prod         # perform the unset
 *
 * Options:
 *   --dry-run   report only, no writes
 *   --prod      target PROD_MONGODB_URI (via connectOpsDb) instead of the local DB
 *
 * Env: MONGODB_URI (or PROD_MONGODB_URI with --prod), read from .env.local
 *
 * Exit codes: 0 = clean (or nothing to do), 1 = fatal, 2 = completed with per-batch errors.
 */
import path from "node:path";
import { config } from "dotenv";
import { connectOpsDb } from "./connect-ops-db";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 1000;
const FILTER = { upsellStats: { $exists: true } } as const;

async function main() {
  await connectOpsDb("migrate-remove-upsell-stats");

  const { default: User } = await import("../src/models/User");

  // `upsellStats` is no longer on the schema, so strict mode would drop it from a typed
  // filter/update. Go through the raw collection.
  const collection = User.collection;

  const total = await collection.countDocuments(FILTER);
  const usersTotal = await collection.countDocuments({});

  console.log("\n=== Remove dead upsellStats sub-document ===");
  console.log(`mode        : ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`users total : ${usersTotal.toLocaleString()}`);
  console.log(`to unset    : ${total.toLocaleString()}`);
  console.log(`batch size  : ${BATCH_SIZE}\n`);

  if (total === 0) {
    console.log("Nothing to do — no document carries upsellStats.");
    process.exit(0);
  }

  // Sanity gate: this migration assumes the field is genuinely dead. If ANY user has real
  // tracking data, stop and let a human look rather than silently discarding it.
  const withRealData = await collection.countDocuments({ "upsellStats.totalShown": { $gt: 0 } });
  console.log(`users with upsellStats.totalShown > 0 : ${withRealData}`);
  if (withRealData > 0) {
    console.error(
      `\nREFUSING: ${withRealData} user(s) carry non-zero upsell tracking data.\n` +
        `This migration assumes the field is dead. Investigate before discarding real data.`
    );
    process.exit(1);
  }
  console.log("  → confirmed dead: every value is zero/default.\n");

  if (DRY_RUN) {
    console.log(`DRY RUN — would $unset upsellStats from ${total.toLocaleString()} document(s).`);
    console.log("Re-run without --dry-run to perform it.");
    process.exit(0);
  }

  const startedAt = Date.now();
  // ~20 progress lines regardless of size, so even a small run visibly moves.
  const logEvery = Math.max(1, Math.floor(total / BATCH_SIZE / 20));

  let processed = 0;
  let modified = 0;
  let errors = 0;
  let batch = 0;

  for (;;) {
    const docs = await collection.find(FILTER).project({ _id: 1 }).limit(BATCH_SIZE).toArray();
    if (docs.length === 0) break;

    batch++;
    const ids = docs.map((d) => d._id);

    try {
      const res = await collection.updateMany({ _id: { $in: ids } }, { $unset: { upsellStats: "" } });
      processed += docs.length;
      modified += res.modifiedCount;
    } catch (err) {
      errors++;
      console.error(
        `batch ${batch} FAILED (${docs.length} docs) — action: skip`,
        err instanceof Error ? err.message : String(err)
      );
      // Skip past this batch so a persistent failure cannot spin forever.
      processed += docs.length;
      if (errors > 5) {
        console.error("aborting: more than 5 batch failures");
        break;
      }
    }

    if (batch % logEvery === 0 || docs.length < BATCH_SIZE) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const rate = processed / Math.max(elapsedSec, 1);
      const remaining = Math.max(0, total - processed);
      const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : 0;
      console.log(
        `${processed.toLocaleString()}/${total.toLocaleString()} ` +
          `(${((processed / total) * 100).toFixed(1)}%) · ${rate.toFixed(0)}/sec · ` +
          `ETA ~${etaMin}m · modified ${modified.toLocaleString()} · errors ${errors}`
      );
    }
  }

  const remainingAfter = await collection.countDocuments(FILTER);

  console.log("\n=== Summary ===");
  console.log(`batches        : ${batch}`);
  console.log(`documents seen : ${processed.toLocaleString()}`);
  console.log(`modified       : ${modified.toLocaleString()}`);
  console.log(`batch errors   : ${errors}`);
  console.log(`still carrying : ${remainingAfter.toLocaleString()}`);
  console.log(`duration       : ${Math.round((Date.now() - startedAt) / 1000)}s`);

  process.exit(errors > 0 || remainingAfter > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
