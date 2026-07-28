/**
 * Seed: "Promo landing — default theme (light vs dark)" A/B experiment.
 *
 * Creates ONE Experiment (status="draft" — activate in admin → A/B Testing) and
 * TWO Variants (50/50):
 *   • "Light (control)" — promoTheme.defaultTheme = "light" (today's default)
 *   • "Dark"            — promoTheme.defaultTheme = "dark"
 *
 * Targets the SENTINEL slug `__promo-theme__`, never real prize slugs, so it
 * cannot shadow a slug-targeted promo experiment (findActiveBySlug is a findOne).
 *
 * PRE-ACTIVATION CHECK — do not skip: POST /api/ab-testing/assign for each
 * variant id and assert `variantConfig.promoTheme.defaultTheme` is present.
 * `mergeVariantConfig` is a key whitelist; if promoTheme is not wired there, both
 * arms render light while the dashboard shows a healthy 50/50 test.
 *
 * Idempotent: re-running on an existing draft is safe (skips unless --force).
 * Refuses to touch active/paused/ended experiments.
 *
 * Usage:
 *   npm run seed:promo-theme:dry   # preview, no writes
 *   npm run seed:promo-theme       # create the draft experiment
 *   npm run seed:promo-theme -- --force   # repopulate a draft's variants
 *
 * Env: .env.local must have MONGODB_URI. Requires at least one admin User (createdBy).
 */

import { config } from "dotenv";
import path from "node:path";
import { connectOpsDb } from "./connect-ops-db";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

const EXPERIMENT_NAME = "Promo landing — default theme (light vs dark)";
const PROMO_THEME_SLUG = "__promo-theme__";

const LIGHT_CONFIG = { promoTheme: { defaultTheme: "light" } };
const DARK_CONFIG = { promoTheme: { defaultTheme: "dark" } };

async function main(): Promise<void> {
  await connectOpsDb(`Seed promo default theme — ${DRY_RUN ? "DRY-RUN" : "APPLY"}`);

  const { default: Experiment } = await import("../src/models/ab-testing/Experiment");
  const { default: Variant } = await import("../src/models/ab-testing/Variant");
  const { default: User } = await import("../src/models/User");

  const variants = [
    { name: "Light (control)", trafficPercentage: 50, isControl: true, config: LIGHT_CONFIG },
    { name: "Dark", trafficPercentage: 50, isControl: false, config: DARK_CONFIG },
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
      console.log(`[dry-run]   slugTargets: [${PROMO_THEME_SLUG}]; variants: Light (control, 50%) + Dark (50%)`);
      if (variantCount > 0 && FORCE) console.log(`[dry-run]   would DELETE ${variantCount} existing variant(s) (--force)`);
      process.exit(0);
    }
    if (variantCount > 0 && FORCE) {
      const del = await Variant.deleteMany({ experimentId: existing._id });
      console.log(`🗑️  --force: deleted ${del.deletedCount} existing variant(s)`);
    }
    existing.slugTargets = [PROMO_THEME_SLUG];
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
    console.log(`  slugTargets : [${PROMO_THEME_SLUG}]`);
    console.log(`  createdBy   : ${adminUser._id} (${adminUser.email})`);
    console.log("  variants    : Light (control, 50%) + Dark (50%)");
    process.exit(0);
  }

  const experiment = await Experiment.create({
    name: EXPERIMENT_NAME,
    status: "draft",
    slugTargets: [PROMO_THEME_SLUG],
    createdBy: adminUser._id,
  });
  await Variant.create(variants.map((v) => ({ ...v, experimentId: experiment._id })));

  console.log(`✅ Created Experiment "${EXPERIMENT_NAME}"`);
  console.log(`   id          : ${experiment._id}`);
  console.log(`   status      : draft (activate in admin → A/B Testing)`);
  console.log(`   slugTargets : [${PROMO_THEME_SLUG}]`);
  console.log(`   variants    : Light (control, 50%) · Dark (50%)`);
  console.log(`\n⚠️  Before activating: POST /api/ab-testing/assign for each variant id and assert`);
  console.log(`   variantConfig.promoTheme.defaultTheme is present. mergeVariantConfig is a key`);
  console.log(`   whitelist — if promoTheme is not wired there, both arms render light while the`);
  console.log(`   admin dashboard still shows a healthy, evenly-split experiment (a silent A/A).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ seed-promo-theme-experiment failed:", err);
  process.exit(1);
});
