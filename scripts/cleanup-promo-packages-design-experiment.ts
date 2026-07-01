/**
 * Cleanup: delete the "promo packages design (promo vs membership)" A/B experiment and ALL of its
 * collected data, so the experiment can be RE-SEEDED fresh.
 *
 * Why: the first prod run bucketed users against a buggy treatment (stuck multiplier banner + dead
 * hero "Enter Now" for non-members). That data would bias the result, so we wipe it and re-seed
 * once the fix is deployed.
 *
 * Deletes (all scoped to the resolved experiment `_id`):
 *   - Variant, VariantAssignment, ExperimentEvent, ExperimentDailyMetrics, ExperimentHistory
 *   - the Experiment document itself
 * LEAVES UNTOUCHED:
 *   - PaymentEvent docs stamped with the old experimentId/variantId. Those are financial records,
 *     and the re-seed creates a NEW experiment `_id`, so the stale stamps can never pollute the
 *     new experiment's metrics (which join by the new id). We do not mutate payment history.
 *
 * Usage:
 *   npx tsx scripts/cleanup-promo-packages-design-experiment.ts            # DRY RUN — counts only, no writes
 *   npx tsx scripts/cleanup-promo-packages-design-experiment.ts --apply    # execute the deletes
 *   (npm: `cleanup:promo-packages-design` = dry, `cleanup:promo-packages-design:apply` = execute)
 *
 * Options:
 *   --apply   Perform the deletes. Without it the script is a read-only dry run (the safe default,
 *             because this destroys production experiment data).
 *
 * Safety:
 *   - DRY RUN BY DEFAULT (destructive → opt-in to writes via --apply).
 *   - Prints the resolved experiment `_id` so you can confirm PROD (6a44cacc…) vs the dev seed
 *     (6a44ba85…) BEFORE applying.
 *   - Matches by EXACT name; refuses (exit 1) if 0 or >1 experiments match — never guesses.
 *   - Idempotent: re-running after a successful delete is a clean no-op.
 *
 * Env: .env.local must have MONGODB_URI pointing at the target DB (prod for this cleanup).
 */

import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");

const EXPERIMENT_NAME = "promo packages design (promo vs membership)";

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in .env.local");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const { default: Experiment } = await import("../src/models/ab-testing/Experiment");
  const { default: Variant } = await import("../src/models/ab-testing/Variant");
  const { default: VariantAssignment } = await import("../src/models/ab-testing/VariantAssignment");
  const { default: ExperimentEvent } = await import("../src/models/ab-testing/ExperimentEvent");
  const { default: ExperimentDailyMetrics } = await import("../src/models/ab-testing/ExperimentDailyMetrics");
  const { default: ExperimentHistory } = await import("../src/models/ab-testing/ExperimentHistory");

  await connectDB();

  const experiments = await Experiment.find({ name: EXPERIMENT_NAME })
    .select("_id name status slugTargets createdAt")
    .lean()
    .exec();

  if (experiments.length === 0) {
    console.log(`✓ No experiment named "${EXPERIMENT_NAME}" found — nothing to clean (idempotent no-op).`);
    process.exit(0);
  }
  if (experiments.length > 1) {
    console.error(`❌ Found ${experiments.length} experiments named "${EXPERIMENT_NAME}" — refusing to guess. Investigate:`);
    for (const e of experiments) console.error(`   - ${e._id} (status=${e.status}, created=${String(e.createdAt)})`);
    process.exit(1);
  }

  const exp = experiments[0]!;
  const experimentId = exp._id;

  console.log("Target experiment:");
  console.log(`  _id        : ${experimentId}   ← CONFIRM: PROD is 6a44cacc… ; dev seed is 6a44ba85…`);
  console.log(`  status     : ${exp.status}`);
  console.log(`  slugTargets: ${Array.isArray(exp.slugTargets) ? exp.slugTargets.length : 0} slugs`);

  const [variants, assignments, events, dailyMetrics, history] = await Promise.all([
    Variant.countDocuments({ experimentId }),
    VariantAssignment.countDocuments({ experimentId }),
    ExperimentEvent.countDocuments({ experimentId }),
    ExperimentDailyMetrics.countDocuments({ experimentId }),
    ExperimentHistory.countDocuments({ experimentId }),
  ]);

  console.log(`\nWould delete (scoped to experimentId=${experimentId}):`);
  console.log(`  Variant                : ${variants}`);
  console.log(`  VariantAssignment      : ${assignments}`);
  console.log(`  ExperimentEvent        : ${events}`);
  console.log(`  ExperimentDailyMetrics : ${dailyMetrics}`);
  console.log(`  ExperimentHistory      : ${history}`);
  console.log(`  Experiment (the doc)   : 1`);
  console.log(`  PaymentEvent stamps    : LEFT UNTOUCHED (financial records; new _id won't collide)`);

  if (!APPLY) {
    console.log("\n[DRY RUN] No writes performed. Re-run with --apply to delete the above.");
    process.exit(0);
  }

  console.log("\n--apply: deleting…");
  const [rVariant, rAssign, rEvent, rDaily, rHistory] = await Promise.all([
    Variant.deleteMany({ experimentId }),
    VariantAssignment.deleteMany({ experimentId }),
    ExperimentEvent.deleteMany({ experimentId }),
    ExperimentDailyMetrics.deleteMany({ experimentId }),
    ExperimentHistory.deleteMany({ experimentId }),
  ]);
  // Delete the parent doc LAST, so a mid-run failure leaves the Experiment discoverable for a re-run.
  const rExp = await Experiment.deleteOne({ _id: experimentId });

  console.log("✓ Deleted:");
  console.log(`  Variant                : ${rVariant.deletedCount}`);
  console.log(`  VariantAssignment      : ${rAssign.deletedCount}`);
  console.log(`  ExperimentEvent        : ${rEvent.deletedCount}`);
  console.log(`  ExperimentDailyMetrics : ${rDaily.deletedCount}`);
  console.log(`  ExperimentHistory      : ${rHistory.deletedCount}`);
  console.log(`  Experiment             : ${rExp.deletedCount}`);
  console.log("\n✓ Cleanup complete. Re-seed a fresh experiment with: npm run seed:promo-packages-design");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ cleanup-promo-packages-design-experiment failed:", err);
  process.exit(1);
});
