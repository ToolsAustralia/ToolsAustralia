#!/usr/bin/env npx tsx
/**
 * Migration 2026-08-27 — make `User.mobile` UNIQUE.
 *
 * Creates `mobile_unique` (`{mobile:1}`, unique + sparse) and drops the superseded
 * non-unique `mobile_1`. Pairs with the schema declaration in
 * `src/models/User.ts` and the mirror in `src/utils/database/ensure-indexes.ts`.
 *
 * ## Why a migration and not just a schema edit
 *
 * The live index is named `mobile_1`. Re-declaring `{mobile:1}` with
 * `{unique:true, sparse:true}` produces **the same generated name**, which the
 * server rejects (code 86 / commonly cited as IndexOptionsConflict 85) — and
 * **`autoIndex` swallows that error**, so the index would silently never build
 * and `mobile` would remain non-unique while everyone believed otherwise. Exactly
 * the trap documented at `src/models/User.ts` for the build-prize indexes and
 * fixed the same way by `2026-07-29-partial-build-prize-indexes.ts`: new name in
 * the schema, old name dropped here.
 *
 * This script goes one step further than that precedent and **creates the index
 * explicitly** rather than leaving it to `autoIndex`. A unique index build FAILS
 * if any duplicate remains, and autoIndex would swallow that failure too. Creating
 * it here means a duplicate stops the migration loudly instead of leaving a
 * half-applied state nobody notices.
 *
 * ## Ordering — this is a hazard, unlike the precedent
 *
 * `npm run migrate:normalise-mobiles:prod` MUST have run first. It normalises
 * `04…` → `+61…` and frees duplicate numbers; until it has, this index cannot
 * build. This script re-checks that precondition itself and refuses rather than
 * relying on the operator having done it.
 *
 * Why `sparse` and not `partial`: verified against production 2026-08-27 — 0 docs
 * have `mobile: ""` and 0 have an explicit `mobile: null`; only 3 omit the field
 * entirely. `sparse` excludes missing fields, which is exactly those 3. (Had empty
 * strings existed, sparse would NOT have excluded them and the build would collide
 * on `""` — a partial index would then have been required.)
 *
 * Usage:
 *   npm run migrate:unique-mobile-index:prod:dry   # DRY-RUN — reports, writes nothing
 *   npm run migrate:unique-mobile-index:prod       # LIVE (passes --live)
 *
 * Idempotent: an already-created index and an already-dropped one are both
 * reported no-ops, never throws. Re-running after success exits 0.
 *
 * Uses the RAW DRIVER, never the Mongoose model — importing a model after
 * `connectDB()` triggers `autoIndex`, which would make a "dry run" write.
 *
 * Exit: 0 clean · 2 precondition failed (duplicates remain) · 3 fatal.
 * Env: MONGODB_URI (or PROD_MONGODB_URI with --prod).
 * @module scripts/migrations/2026-08-27-unique-mobile-index
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { connectOpsDb } from "../connect-ops-db";

const LABEL = "migrate:unique-mobile-index";
const NEW_NAME = "mobile_unique";
const OLD_NAME = "mobile_1";

async function main() {
  const mongoose = await connectOpsDb(LABEL);
  const live = process.argv.includes("--live");
  const users = mongoose.connection.db!.collection("users");

  console.log(`\n${live ? "🔴 LIVE" : "🧪 DRY RUN — nothing will be written"}\n`);

  // ── Precondition 1: no duplicate mobiles ────────────────────────────────────
  console.log("Checking preconditions…");
  const dupes = await users
    .aggregate([
      { $match: { mobile: { $exists: true, $nin: [null, ""] } } },
      { $group: { _id: "$mobile", n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $count: "groups" },
    ])
    .toArray();
  const dupeGroups = (dupes[0]?.groups as number) ?? 0;

  // ── Precondition 2: no un-normalised values (they would defeat the lookup) ──
  const drift = await users.countDocuments({
    mobile: { $exists: true, $nin: [null, ""], $not: /^\+61/ },
  });

  // ── Precondition 3: sparse is only correct with no ""/null values ───────────
  const emptyish = await users.countDocuments({ $or: [{ mobile: "" }, { mobile: null }] });

  console.log(`  duplicate mobile groups… ${dupeGroups}`);
  console.log(`  un-normalised values…… ${drift}`);
  console.log(`  ""/null values………………… ${emptyish}`);

  if (dupeGroups > 0 || emptyish > 0) {
    console.error(
      `\n❌ REFUSING: a unique+sparse index cannot build with ${dupeGroups} duplicate group(s) ` +
        `and ${emptyish} empty/null value(s).\n` +
        `   Run \`npm run migrate:normalise-mobiles${process.argv.includes("--prod") ? ":prod" : ""}\` first.`
    );
    await mongoose.connection.close();
    process.exit(2);
  }
  if (drift > 0) {
    console.warn(
      `\n⚠️  ${drift} mobile(s) are not in +61 form. The index will still build, but a login\n` +
        `   lookup on the normalised value will MISS them. Run the normalise migration first.`
    );
  }

  const before = await users.indexes();
  const hasNew = before.some((i) => i.name === NEW_NAME);
  const hasOld = before.some((i) => i.name === OLD_NAME);
  console.log(`\n  ${NEW_NAME} present… ${hasNew ? "yes" : "no"}`);
  console.log(`  ${OLD_NAME} present…… ${hasOld ? "yes" : "no"}`);

  if (!live) {
    console.log("\nWould:");
    if (!hasNew) console.log(`  • create ${NEW_NAME} ({mobile:1}, unique, sparse)`);
    if (hasOld) console.log(`  • drop ${OLD_NAME} (superseded — the unique index answers the same queries)`);
    if (hasNew && !hasOld) console.log("  • nothing — already migrated");
    console.log("\nRe-run with --live to apply.\n");
    await mongoose.connection.close();
    process.exit(0);
  }

  // ── Create FIRST, drop second: never leave the collection with no index on
  //    `mobile` (register + update-profile do duplicate checks against it).
  if (!hasNew) {
    console.log(`\n▶ creating ${NEW_NAME}…`);
    await users.createIndex({ mobile: 1 }, { name: NEW_NAME, unique: true, sparse: true });
    console.log("  ✅ created");
  } else {
    console.log(`\n▶ ${NEW_NAME} already exists — skipping`);
  }

  if (hasOld) {
    console.log(`▶ dropping ${OLD_NAME}…`);
    try {
      await users.dropIndex(OLD_NAME);
      console.log("  ✅ dropped");
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 27) console.log("  ℹ️  already absent (IndexNotFound)");
      else throw err;
    }
  }

  // ── Verify the end state rather than assuming it ────────────────────────────
  const after = await users.indexes();
  const created = after.find((i) => i.name === NEW_NAME);
  const oldGone = !after.some((i) => i.name === OLD_NAME);

  console.log("\n" + "═".repeat(60));
  console.log(`  ${NEW_NAME}: ${created ? `present (unique=${!!created.unique}, sparse=${!!created.sparse})` : "❌ MISSING"}`);
  console.log(`  ${OLD_NAME}: ${oldGone ? "dropped" : "❌ still present"}`);
  console.log("═".repeat(60));

  const ok = !!created?.unique && !!created?.sparse && oldGone;
  console.log(ok ? "\n✅ Done. `mobile` is now unique.\n" : "\n❌ End state is not what was intended — inspect above.\n");

  await mongoose.connection.close();
  process.exit(ok ? 0 : 3);
}

main().catch((err) => {
  console.error(`❌ ${LABEL} failed:`, err);
  process.exit(3);
});
