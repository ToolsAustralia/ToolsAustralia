/**
 * Migration: de-duplicate VariantAssignment rows so the new sticky-integrity
 * unique indexes can build.
 *
 * The new model declares unique partial indexes on (experimentId, userId) and
 * (experimentId, anonymousId). If pre-existing "split-brain" duplicates exist
 * (same identity assigned twice — possibly to different variants), the unique
 * index build FAILS. This migration collapses each duplicate group to the
 * EARLIEST assignment (the canonical first exposure) and deletes the rest, then
 * builds the unique indexes.
 *
 * ⚠️ Run this BEFORE deploying the VariantAssignment model change, otherwise the
 * prod index build silently fails (logged, non-fatal) and you get no protection.
 *
 * Usage:
 *   npm run migrate:dedupe-variant-assignments:dry   # report only, no writes
 *   npm run migrate:dedupe-variant-assignments       # apply (deletes dups + builds indexes)
 *
 * Env: .env.local must have MONGODB_URI (point it at the target DB).
 */

import { config } from "dotenv";
import path from "node:path";
import { connectOpsDb } from "./connect-ops-db";

config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

interface DupGroup {
  _id: Record<string, unknown>;
  ids: string[];
  assignedAts: Date[];
  variantIds: string[];
}

async function main(): Promise<void> {
  await connectOpsDb(`Dedupe VariantAssignment — ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY (live)"}`);
  const { default: VariantAssignment } = await import("../src/models/ab-testing/VariantAssignment");

  const keyDefs: Array<{ label: string; field: "userId" | "anonymousId" }> = [
    { label: "(experimentId, userId)", field: "userId" },
    { label: "(experimentId, anonymousId)", field: "anonymousId" },
  ];

  let totalGroups = 0;
  let totalDeletable = 0;
  let totalSplitBrain = 0;

  for (const { label, field } of keyDefs) {
    const groups: DupGroup[] = await VariantAssignment.aggregate([
      { $match: { [field]: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { experimentId: "$experimentId", identity: `$${field}` },
          ids: { $push: "$_id" },
          assignedAts: { $push: "$assignedAt" },
          variantIds: { $push: "$variantId" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]).exec();

    console.log(`\n— ${label}: ${groups.length} duplicate group(s)`);
    totalGroups += groups.length;

    let processed = 0;
    const logEvery = Math.max(1, Math.floor(groups.length / 20));

    for (const g of groups) {
      // Keep the earliest assignedAt; delete the rest.
      const rows = g.ids.map((id, i) => ({
        id,
        assignedAt: g.assignedAts[i],
        variantId: g.variantIds[i]?.toString(),
      }));
      rows.sort((a, b) => new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime());
      const keep = rows[0];
      const drop = rows.slice(1);
      const distinctVariants = new Set(rows.map((r) => r.variantId));
      if (distinctVariants.size > 1) totalSplitBrain++;
      totalDeletable += drop.length;

      if (processed % logEvery === 0) {
        console.log(
          `   [${processed + 1}/${groups.length}] keep ${keep.id} (variant ${keep.variantId}), ` +
            `drop ${drop.length}${distinctVariants.size > 1 ? "  ⚠️ SPLIT-BRAIN (multiple variants)" : ""}`
        );
      }

      if (APPLY) {
        await VariantAssignment.deleteMany({ _id: { $in: drop.map((r) => r.id) } }).exec();
      }
      processed++;
    }
  }

  console.log(
    `\n📊 Summary: ${totalGroups} duplicate groups · ${totalDeletable} rows ${
      APPLY ? "deleted" : "would be deleted"
    } · ${totalSplitBrain} split-brain groups (same identity in >1 variant)`
  );

  if (APPLY) {
    console.log("\n🔨 Building unique indexes…");
    await VariantAssignment.collection.createIndex(
      { experimentId: 1, userId: 1 },
      { unique: true, partialFilterExpression: { userId: { $exists: true } }, name: "uniq_experiment_user" }
    );
    await VariantAssignment.collection.createIndex(
      { experimentId: 1, anonymousId: 1 },
      { unique: true, partialFilterExpression: { anonymousId: { $exists: true } }, name: "uniq_experiment_anon" }
    );
    console.log("✅ Unique indexes built.");
  } else {
    console.log("\n[dry-run] Re-run with the live npm script to delete dups + build the unique indexes.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ migrate-dedupe-variant-assignments failed:", err);
  process.exit(1);
});
