/**
 * Seed: "Promo landing hero — static image vs video" A/B experiment.
 *
 * Creates ONE Experiment (status="draft" — activate in admin → A/B Testing) and
 * TWO Variants (50/50):
 *   • "Video" (control)        — no override → the brand hero VIDEO plays where
 *                                 assets exist and reduced-motion/Save-Data allow.
 *   • "Static image" (treatment) — `hero.disableVideo = true` → the video is
 *                                 suppressed and the theme-aware STILL renders.
 *
 * The two arms therefore show the SAME creative; the only difference is motion —
 * a clean test of "does the moving hero convert better than the still?".
 *
 * Measurement: the new user-level model (ExperimentMetricsService + Bayesian
 * engine) scores conversion + first-purchase revenue per variant within the
 * 14-day window — see docs/ab-testing/backend.md.
 *
 * Idempotent: re-running on an existing draft is safe (skips unless --force).
 * Refuses to touch active/paused/ended experiments.
 *
 * Usage:
 *   npm run seed:static-vs-video-hero:dry   # preview, no writes
 *   npm run seed:static-vs-video-hero       # create the draft experiment
 *   npm run seed:static-vs-video-hero -- --force   # repopulate a draft's variants
 *
 * Env: .env.local must have MONGODB_URI. Requires at least one admin User (createdBy).
 */

import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

const EXPERIMENT_NAME = "Promo hero — static image vs video";

/** Every brand slug has a hero clip (see getLandingHeroVideoPaths); cash/evergreen do not. */
const SLUG_TARGETS = [
  "dewalt",
  "makita",
  "milwaukee",
  "ryobi",
  "dewalt-sidchrome",
  "dewalt-kincrome",
  "dewalt-milwaukee",
  "makita-sidchrome",
  "makita-kincrome",
  "makita-milwaukee",
  "milwaukee-sidchrome",
  "milwaukee-kincrome",
  "milwaukee-milwaukee",
  "ryobi-sidchrome",
  "ryobi-kincrome",
  "ryobi-milwaukee",
] as const;

const VIDEO_CONFIG = { hero: { disableVideo: false } }; // control: video plays
const STATIC_CONFIG = { hero: { disableVideo: true } }; // treatment: still only

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in .env.local");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const { default: Experiment } = await import("../src/models/ab-testing/Experiment");
  const { default: Variant } = await import("../src/models/ab-testing/Variant");
  const { default: User } = await import("../src/models/User");
  await connectDB();

  const variants = [
    { name: "Video", trafficPercentage: 50, isControl: true, config: VIDEO_CONFIG },
    { name: "Static image", trafficPercentage: 50, isControl: false, config: STATIC_CONFIG },
  ];

  const existing = await Experiment.findOne({ name: EXPERIMENT_NAME }).exec();

  if (existing) {
    if (existing.status !== "draft") {
      console.log(`↩️  "${EXPERIMENT_NAME}" exists in status="${existing.status}" — locked. Skipping.`);
      process.exit(0);
    }
    const variantCount = await Variant.countDocuments({ experimentId: existing._id });
    if (variantCount > 0 && !FORCE) {
      console.log(
        `↩️  "${EXPERIMENT_NAME}" already has ${variantCount} variant(s). Skipping (re-run with --force to recreate).`
      );
      process.exit(0);
    }
    if (DRY_RUN) {
      console.log(`[dry-run] Would populate draft "${EXPERIMENT_NAME}" (id=${existing._id}):`);
      console.log(`[dry-run]   slugTargets: ${SLUG_TARGETS.length}; variants: Video (control, 50%) + Static image (50%)`);
      if (variantCount > 0 && FORCE) console.log(`[dry-run]   would DELETE ${variantCount} existing variant(s) (--force)`);
      process.exit(0);
    }
    if (variantCount > 0 && FORCE) {
      const del = await Variant.deleteMany({ experimentId: existing._id });
      console.log(`🗑️  --force: deleted ${del.deletedCount} existing variant(s)`);
    }
    existing.slugTargets = [...SLUG_TARGETS];
    await existing.save();
    await Variant.create(variants.map((v) => ({ ...v, experimentId: existing._id })));
    console.log(`✅ Populated draft "${EXPERIMENT_NAME}" (id=${existing._id}) with 2 variants.`);
    process.exit(0);
  }

  const adminUser = await User.findOne({ role: "admin" }).select("_id email").lean().exec();
  if (!adminUser) {
    console.error("❌ No admin user found (Experiment requires createdBy). Seed an admin first.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("[dry-run] Would create Experiment:");
    console.log(`  name        : ${EXPERIMENT_NAME}`);
    console.log(`  status      : draft`);
    console.log(`  slugTargets : ${SLUG_TARGETS.length} (${SLUG_TARGETS.join(", ")})`);
    console.log(`  createdBy   : ${adminUser._id} (${adminUser.email})`);
    console.log("  variants    : Video (control, 50%, disableVideo=false) + Static image (50%, disableVideo=true)");
    process.exit(0);
  }

  const experiment = await Experiment.create({
    name: EXPERIMENT_NAME,
    status: "draft",
    slugTargets: [...SLUG_TARGETS],
    createdBy: adminUser._id,
  });
  await Variant.create(variants.map((v) => ({ ...v, experimentId: experiment._id })));

  console.log(`✅ Created Experiment "${EXPERIMENT_NAME}"`);
  console.log(`   id          : ${experiment._id}`);
  console.log(`   status      : draft (activate in admin → A/B Testing)`);
  console.log(`   slugTargets : ${SLUG_TARGETS.length} slugs`);
  console.log(`   variants    : Video (control, 50%) · Static image (50%)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ seed-static-vs-video-hero-experiment failed:", err);
  process.exit(1);
});
