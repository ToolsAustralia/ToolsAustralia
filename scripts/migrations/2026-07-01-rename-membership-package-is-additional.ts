/**
 * Migration: rename the MembershipPackage flag `isMemberOnly` → `isAdditional`.
 *
 * Context: the flag was mislabelled "member-only". It actually marks packages that
 * require ADDITIONAL-package access (active subscription OR current major-draw entries —
 * see hasAdditionalPackageAccess), which is broader than subscribers. The code + static
 * data were renamed to `isAdditional`; this brings the persisted package-definition docs
 * in the `MembershipPackage` collection into line.
 *
 * Safe: `isMemberOnly` is only a package-DEFINITION attribute (admin-managed). It is NOT
 * stored on any purchase/entry record, so there is no historical-attribution risk.
 *
 * Dry-run by default. Re-run with `--apply` (or `--force`) to execute. Idempotent.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "../../src/lib/mongodb";
import MembershipPackage from "../../src/models/MembershipPackage";

const APPLY = process.argv.includes("--apply") || process.argv.includes("--force");

async function run() {
  await connectDB();
  // Raw collection so the $rename bypasses the (already-renamed) strict schema.
  const coll = MembershipPackage.collection;

  const total = await coll.countDocuments({});
  const legacy = await coll.countDocuments({ isMemberOnly: { $exists: true } });
  const already = await coll.countDocuments({ isAdditional: { $exists: true } });

  console.log(`Collection: ${coll.collectionName}`);
  console.log(`  total docs                      : ${total}`);
  console.log(`  with legacy 'isMemberOnly'       : ${legacy}`);
  console.log(`  already have 'isAdditional'      : ${already}`);

  if (legacy === 0) {
    console.log("\n✓ Nothing to migrate — no 'isMemberOnly' fields present (idempotent no-op).");
    return;
  }

  if (!APPLY) {
    console.log(`\n[DRY RUN] Would $rename isMemberOnly → isAdditional on ${legacy} doc(s).`);
    console.log("Re-run with --apply to execute.");
    return;
  }

  const res = await coll.updateMany(
    { isMemberOnly: { $exists: true } },
    { $rename: { isMemberOnly: "isAdditional" } }
  );
  console.log(`\n✓ Renamed isMemberOnly → isAdditional on ${res.modifiedCount} doc(s).`);

  const leftover = await coll.countDocuments({ isMemberOnly: { $exists: true } });
  console.log(
    leftover === 0
      ? "✓ Verified: no 'isMemberOnly' fields remain."
      : `⚠ ${leftover} doc(s) still carry 'isMemberOnly' — investigate.`
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
