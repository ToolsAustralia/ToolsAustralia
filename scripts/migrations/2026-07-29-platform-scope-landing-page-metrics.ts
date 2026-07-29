/**
 * Migration 2026-07-29 — platform-scope the landing-page rollup.
 *
 * `LandingPageMetricsDaily` gains a `platform` field so Meta and TikTok rollups can
 * coexist. Same shape as the AdDestination migration: stamp first, then swap the index.
 *
 * ## Why this one is especially unforgiving
 *
 * `SpendByUrlAggregationService.recomputeForDateRange` DELETES then re-inserts a day's
 * rows. Its delete filter must include `platform`, or a TikTok recompute wipes that day's
 * META rows. This collection has **no TTL**, so those rows are permanently gone — only
 * rebuildable while the source insights still exist (60-day TTL). Stamping every existing
 * row `platform: "meta"` before the aggregation service starts passing a platform is what
 * makes the scoped delete match the right documents.
 *
 * Usage:
 *   npx tsx scripts/migrations/2026-07-29-platform-scope-landing-page-metrics.ts        # dry-run
 *   npx tsx scripts/migrations/2026-07-29-platform-scope-landing-page-metrics.ts --live
 *
 * Idempotent.
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";

const COLLECTION = "landingpagemetricsdailies";
const OLD_UNIQUE = "adAccountId_1_date_1_canonicalUrl_1";
const NEW_UNIQUE = "platform_1_adAccountId_1_date_1_canonicalUrl_1";

async function main() {
  const live = process.argv.includes("--live");
  console.log(`\n=== platform-scope landing-page metrics (${live ? "LIVE" : "DRY-RUN"}) ===\n`);

  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("no db handle");
  const col = db.collection(COLLECTION);

  const total = await col.countDocuments();
  const unstamped = await col.countDocuments({ platform: { $exists: false } });
  console.log(`collection "${COLLECTION}"`);
  console.log(`  documents          : ${total}`);
  console.log(`  need platform=meta : ${unstamped}`);

  const indexes = await col.indexes();
  const hasOld = indexes.some((i) => i.name === OLD_UNIQUE);
  const hasNew = indexes.some((i) => i.name === NEW_UNIQUE);
  console.log(`\nindexes:`);
  for (const i of indexes) console.log(`  ${i.name}${i.unique ? " (unique)" : ""}`);
  console.log(`\n  old unique present : ${hasOld ? "YES — must drop" : "no"}`);
  console.log(`  new unique present : ${hasNew ? "yes" : "NO — must create"}`);

  const dupes = await col
    .aggregate([
      {
        $group: {
          _id: {
            platform: { $ifNull: ["$platform", "meta"] },
            adAccountId: "$adAccountId",
            date: "$date",
            canonicalUrl: "$canonicalUrl",
          },
          n: { $sum: 1 },
        },
      },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  if (dupes.length > 0) {
    console.error(`\n❌ ABORT: duplicate keys exist — the unique index cannot be built.`);
    for (const d of dupes) console.error(`   ${JSON.stringify(d._id)} ×${d.n}`);
    process.exit(1);
  }
  console.log(`  duplicate keys     : none ✅`);

  if (!live) {
    console.log(`\n[DRY-RUN] Would:`);
    if (unstamped > 0) console.log(`  • set platform="meta" on ${unstamped} document(s)`);
    if (hasOld) console.log(`  • drop index ${OLD_UNIQUE}`);
    if (!hasNew) console.log(`  • create unique index ${NEW_UNIQUE}`);
    if (unstamped === 0 && !hasOld && hasNew) console.log(`  • nothing — already migrated`);
    console.log(`\nRe-run with --live to apply.`);
    process.exit(0);
  }

  if (unstamped > 0) {
    const r = await col.updateMany({ platform: { $exists: false } }, { $set: { platform: "meta" } });
    console.log(`\n✅ stamped platform="meta" on ${r.modifiedCount} document(s)`);
  } else {
    console.log(`\n• nothing to stamp`);
  }

  const stillUnstamped = await col.countDocuments({ platform: { $exists: false } });
  if (stillUnstamped > 0) {
    console.error(`❌ ABORT: ${stillUnstamped} rows still unstamped — not touching indexes.`);
    process.exit(1);
  }

  if (hasOld) {
    await col.dropIndex(OLD_UNIQUE);
    console.log(`✅ dropped ${OLD_UNIQUE}`);
  }
  if (!hasNew) {
    await col.createIndex(
      { platform: 1, adAccountId: 1, date: 1, canonicalUrl: 1 },
      { unique: true, name: NEW_UNIQUE },
    );
    console.log(`✅ created unique ${NEW_UNIQUE}`);
  }
  await col.createIndex({ platform: 1, adAccountId: 1, date: 1 });

  const after = await col.indexes();
  const okNew = after.some((i) => i.name === NEW_UNIQUE && i.unique);
  const okOldGone = !after.some((i) => i.name === OLD_UNIQUE);
  const metaCount = await col.countDocuments({ platform: "meta" });
  console.log(`\n=== VERIFY ===`);
  console.log(`  ${okNew ? "✅" : "❌"} unique ${NEW_UNIQUE} present`);
  console.log(`  ${okOldGone ? "✅" : "❌"} old unique gone`);
  console.log(`  ${metaCount === total ? "✅" : "❌"} platform="meta" count ${metaCount} === pre-migration total ${total}`);

  const ok = okNew && okOldGone && metaCount === total;
  console.log(ok ? `\n✅ migration complete` : `\n❌ unexpected end state — investigate before recomputing any platform`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("migration failed:", e);
  process.exit(1);
});
