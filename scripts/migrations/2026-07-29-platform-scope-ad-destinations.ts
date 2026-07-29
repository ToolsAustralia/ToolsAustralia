/**
 * Migration 2026-07-29 — platform-scope the ad-destination store.
 *
 * `MetaAdDestination` became `AdDestination` (same collection: `metaaddestinations`) so
 * TikTok and later Snapchat can share it. Two things must happen to the LIVE collection,
 * in this order:
 *
 *   1. Stamp `platform: "meta"` on every existing document. Every row in this collection
 *      today is Meta by definition — nothing else ever wrote to it.
 *   2. Swap the unique index: DROP the bare `adId_1` unique, CREATE `{platform, adId}` unique.
 *
 * ## Why the order matters
 *
 * Building the compound unique index BEFORE stamping would index nulls — and a second
 * unstamped row would collide on `{null, adId}`. Dropping the old index BEFORE stamping is
 * also fine, but stamping first means the collection is never simultaneously unscoped AND
 * unprotected.
 *
 * ## Why the old index MUST be dropped
 *
 * `adId: { unique: true }` makes ad ids globally unique across platforms. Ad ids are only
 * unique WITHIN a platform. Leave it and the first TikTok ad whose id collides with a Meta
 * ad throws E11000: that ad's destination is lost, and its spend silently books to
 * `unknown://` instead of its real landing URL — understating that URL's spend and the
 * matching prize row, with no error surfaced to anyone.
 *
 * Usage:
 *   npx tsx scripts/migrations/2026-07-29-platform-scope-ad-destinations.ts            # dry-run
 *   npx tsx scripts/migrations/2026-07-29-platform-scope-ad-destinations.ts --live
 *
 * Idempotent: re-running after success is a no-op.
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";

const COLLECTION = "metaaddestinations";
const OLD_UNIQUE = "adId_1";
const NEW_UNIQUE = "platform_1_adId_1";

async function main() {
  const live = process.argv.includes("--live");
  console.log(`\n=== platform-scope ad destinations (${live ? "LIVE" : "DRY-RUN"}) ===\n`);

  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("no db handle");
  const col = db.collection(COLLECTION);

  const total = await col.countDocuments();
  const unstamped = await col.countDocuments({ platform: { $exists: false } });
  const stamped = total - unstamped;
  console.log(`collection "${COLLECTION}"`);
  console.log(`  documents          : ${total}`);
  console.log(`  already stamped    : ${stamped}`);
  console.log(`  need platform=meta : ${unstamped}`);

  const indexes = await col.indexes();
  const hasOld = indexes.some((i) => i.name === OLD_UNIQUE);
  const hasNew = indexes.some((i) => i.name === NEW_UNIQUE);
  console.log(`\nindexes:`);
  for (const i of indexes) {
    console.log(`  ${i.name}${i.unique ? " (unique)" : ""} — ${JSON.stringify(i.key)}`);
  }
  console.log(`\n  old bare-adId unique present : ${hasOld ? "YES — must drop" : "no"}`);
  console.log(`  new {platform,adId} unique   : ${hasNew ? "yes" : "NO — must create"}`);

  // Safety probe: would the new unique index be violated by existing data? Only possible
  // if the same adId appears twice, which the old unique index should have prevented —
  // check anyway rather than discovering it mid-build.
  const dupes = await col
    .aggregate([
      { $group: { _id: { platform: { $ifNull: ["$platform", "meta"] }, adId: "$adId" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  if (dupes.length > 0) {
    console.error(`\n❌ ABORT: ${dupes.length}+ duplicate {platform,adId} pairs exist — the unique index cannot be built.`);
    for (const d of dupes) console.error(`   ${JSON.stringify(d._id)} ×${d.n}`);
    process.exit(1);
  }
  console.log(`  duplicate {platform,adId} pairs: none ✅`);

  if (!live) {
    console.log(`\n[DRY-RUN] Would:`);
    if (unstamped > 0) console.log(`  • set platform="meta" on ${unstamped} document(s)`);
    if (hasOld) console.log(`  • drop index ${OLD_UNIQUE}`);
    if (!hasNew) console.log(`  • create unique index ${NEW_UNIQUE}`);
    if (unstamped === 0 && !hasOld && hasNew) console.log(`  • nothing — already migrated`);
    console.log(`\nRe-run with --live to apply.`);
    process.exit(0);
  }

  // 1. Stamp BEFORE touching indexes.
  if (unstamped > 0) {
    const r = await col.updateMany({ platform: { $exists: false } }, { $set: { platform: "meta" } });
    console.log(`\n✅ stamped platform="meta" on ${r.modifiedCount} document(s)`);
  } else {
    console.log(`\n• nothing to stamp`);
  }

  const stillUnstamped = await col.countDocuments({ platform: { $exists: false } });
  if (stillUnstamped > 0) {
    console.error(`❌ ABORT: ${stillUnstamped} documents still unstamped — not touching indexes.`);
    process.exit(1);
  }

  // 2. Drop the cross-platform-unsafe unique index.
  if (hasOld) {
    await col.dropIndex(OLD_UNIQUE);
    console.log(`✅ dropped ${OLD_UNIQUE}`);
  }

  // 3. Create the platform-scoped unique index.
  if (!hasNew) {
    await col.createIndex({ platform: 1, adId: 1 }, { unique: true, name: NEW_UNIQUE });
    console.log(`✅ created unique ${NEW_UNIQUE}`);
  }
  await col.createIndex({ platform: 1, adAccountId: 1, canonicalUrl: 1 });

  // 4. Verify the end state rather than assuming it.
  const after = await col.indexes();
  const okNew = after.some((i) => i.name === NEW_UNIQUE && i.unique);
  const okOldGone = !after.some((i) => i.name === OLD_UNIQUE);
  const metaCount = await col.countDocuments({ platform: "meta" });
  console.log(`\n=== VERIFY ===`);
  console.log(`  ${okNew ? "✅" : "❌"} unique ${NEW_UNIQUE} present`);
  console.log(`  ${okOldGone ? "✅" : "❌"} bare ${OLD_UNIQUE} gone`);
  console.log(`  ${metaCount === total ? "✅" : "❌"} platform="meta" count ${metaCount} === pre-migration total ${total}`);

  const ok = okNew && okOldGone && metaCount === total;
  console.log(ok ? `\n✅ migration complete` : `\n❌ migration finished in an unexpected state — investigate before syncing TikTok`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("migration failed:", e);
  process.exit(1);
});
