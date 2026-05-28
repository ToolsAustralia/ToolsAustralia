/**
 * Seed: "Landing page variation 1 vs variation 2" A/B experiment.
 *
 * Creates ONE Experiment with status="draft" (admin clicks Activate to go live) and
 * TWO Variants (50/50 traffic) whose `hero.imageSrcBySlug` map each of 16 landing
 * slugs to the matching v1 or v2 WebP under
 * /images/background/promo/landing/variation{1,2}-{desktop,mobile}/.
 *
 * Idempotent: if an experiment with the same name already exists, the script reports
 * its id and exits without changes. Re-runs are safe.
 *
 * Usage:
 *   npx tsx scripts/seed-variation1-vs-variation2-experiment.ts            (live)
 *   npx tsx scripts/seed-variation1-vs-variation2-experiment.ts --dry-run  (preview)
 *
 * Env: .env.local must have MONGODB_URI. Requires at least one admin User in the DB
 * (we use it as `createdBy`).
 */

import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");

/** Matches the admin-created draft "landing page variation 1 and variation 2"
 *  exactly so re-runs upsert that draft rather than creating a duplicate. */
const EXPERIMENT_NAME = "landing page variation 1 and variation 2";

/** All 16 slugs the experiment targets: 4 toolset landings + 12 prize-specific. */
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

type Brand = "dewalt" | "makita" | "milwaukee" | "ryobi";
type Toolbox = "milTB" | "kinTB" | "sidTB";

/** Maps the slug to its (brand, toolbox) — mirrors landingToolboxSuffixFromPrizeSlug
 *  + getDefaultPrizeForToolsetSlug behavior: toolset slugs default to milTB. */
function slugToImageKey(slug: string): { brand: Brand; toolbox: Toolbox } {
  // Toolset bare slugs default to milTB (matches getDefaultPrizeForToolsetSlug).
  if (slug === "dewalt") return { brand: "dewalt", toolbox: "milTB" };
  if (slug === "makita") return { brand: "makita", toolbox: "milTB" };
  if (slug === "milwaukee") return { brand: "milwaukee", toolbox: "milTB" };
  if (slug === "ryobi") return { brand: "ryobi", toolbox: "milTB" };

  // Prize-specific: "{brand}-{toolboxBrand}" — toolboxBrand suffix picks the toolbox.
  const [brand, toolboxBrand] = slug.split("-") as [Brand, string];
  if (toolboxBrand === "kincrome") return { brand, toolbox: "kinTB" };
  if (toolboxBrand === "sidchrome") return { brand, toolbox: "sidTB" };
  // "milwaukee" suffix (e.g. dewalt-milwaukee) → milTB
  return { brand, toolbox: "milTB" };
}

/**
 * Full-viewport A/B test: each variant overrides BOTH desktop (2560×1044) and
 * mobile (1080×1164) hero images. The design team's editor delivered proper
 * 2560×1044 desktop sources matching the hero container's ~2.45 aspect (same as
 * the legacy 1808×737 default landing images), so the empty-space-at-bottom
 * issue is resolved.
 *
 * The `cash-prize` slug is added on top of the 16 brand+toolbox slugs because
 * it's the canonical mapping for the evergreen all-prizes hero in
 * LANDING_HERO_MAP. Adding it here means once /draw-results, /login (or any
 * other consumer of the evergreen image) is wrapped in a variant context, those
 * surfaces automatically reflect the bucketed variant's all-prizes artwork.
 *
 * Per-slug entries are still partial-override capable — drop the `desktop` field
 * here to fall back to default for that viewport, useful when iterating on one
 * viewport at a time.
 */
function buildImageSrcBySlug(variation: 1 | 2): Record<string, { desktop?: string; mobile?: string }> {
  const base = "/images/background/promo/landing";
  const desktopDir = `${base}/variation${variation}-desktop`;
  const mobileDir = `${base}/variation${variation}-mobile`;
  const out: Record<string, { desktop?: string; mobile?: string }> = {};
  for (const slug of SLUG_TARGETS) {
    const { brand, toolbox } = slugToImageKey(slug);
    out[slug] = {
      desktop: `${desktopDir}/${brand}-${toolbox}.webp`,
      mobile: `${mobileDir}/${brand}-${toolbox}-mobile.webp`,
    };
  }
  // Evergreen all-prizes mapping (consumed by DrawResultsHero, /login, and
  // PromoHero on /promotions/cash-prize via LANDING_HERO_MAP["cash-prize"]).
  out["cash-prize"] = {
    desktop: `${desktopDir}/all-prizes.webp`,
    mobile: `${mobileDir}/all-prizes-mobile.webp`,
  };
  return out;
}

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

  const variantAConfig = {
    hero: { imageSrcBySlug: buildImageSrcBySlug(1) },
  };
  const variantBConfig = {
    hero: { imageSrcBySlug: buildImageSrcBySlug(2) },
  };

  const existing = await Experiment.findOne({ name: EXPERIMENT_NAME }).exec();

  if (existing) {
    if (existing.status !== "draft") {
      console.log(
        `↩️  Experiment "${EXPERIMENT_NAME}" exists in status="${existing.status}" — locked. Skipping.`
      );
      process.exit(0);
    }
    const variantCount = await Variant.countDocuments({ experimentId: existing._id });
    if (variantCount > 0) {
      console.log(
        `↩️  Experiment "${EXPERIMENT_NAME}" already has ${variantCount} variant(s). ` +
          `Skipping to avoid clobbering admin-edited config. ` +
          `Delete the variants manually if you want to re-seed.`
      );
      process.exit(0);
    }
    if (DRY_RUN) {
      console.log(`[dry-run] Found empty draft "${EXPERIMENT_NAME}" (id=${existing._id}).`);
      console.log(`[dry-run] Would update slugTargets to ${SLUG_TARGETS.length} slugs and add 2 variants.`);
      console.log("[dry-run] Sample row from Variant A: dewalt-milwaukee →", variantAConfig.hero.imageSrcBySlug["dewalt-milwaukee"]);
      process.exit(0);
    }
    existing.slugTargets = [...SLUG_TARGETS];
    await existing.save();
    await Variant.create([
      { experimentId: existing._id, name: "Variation 1", trafficPercentage: 50, isControl: true, config: variantAConfig },
      { experimentId: existing._id, name: "Variation 2", trafficPercentage: 50, isControl: false, config: variantBConfig },
    ]);
    console.log(`✅ Populated existing draft "${EXPERIMENT_NAME}" (id=${existing._id}) with 2 variants.`);
    console.log(`   slugTargets : ${SLUG_TARGETS.length} slugs`);
    console.log(`   variants    : Variation 1 (control, 50%), Variation 2 (50%)`);
    process.exit(0);
  }

  // Fresh create path: no existing experiment with that name.
  const adminUser = await User.findOne({ role: "admin" }).select("_id email").lean().exec();
  if (!adminUser) {
    console.error(
      "❌ No admin user found. The Experiment requires `createdBy` to be a real user. " +
        "Create an admin first (npm run seed:admin) or set the seed in MongoDB."
    );
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("[dry-run] Would create Experiment:");
    console.log(`  name        : ${EXPERIMENT_NAME}`);
    console.log(`  status      : draft`);
    console.log(`  slugTargets : ${SLUG_TARGETS.length} slugs (${SLUG_TARGETS.join(", ")})`);
    console.log(`  createdBy   : ${adminUser._id} (${adminUser.email})`);
    console.log("[dry-run] Would create 2 Variants (50/50):");
    console.log(`  - Variant A "Variation 1" (control, isControl=true), ${Object.keys(variantAConfig.hero.imageSrcBySlug).length} per-slug rows`);
    console.log(`  - Variant B "Variation 2", ${Object.keys(variantBConfig.hero.imageSrcBySlug).length} per-slug rows`);
    console.log("[dry-run] Sample row from Variant A:");
    console.log("   ", "dewalt-milwaukee →", variantAConfig.hero.imageSrcBySlug["dewalt-milwaukee"]);
    process.exit(0);
  }

  const experiment = await Experiment.create({
    name: EXPERIMENT_NAME,
    status: "draft",
    slugTargets: [...SLUG_TARGETS],
    createdBy: adminUser._id,
  });

  await Variant.create([
    { experimentId: experiment._id, name: "Variation 1", trafficPercentage: 50, isControl: true, config: variantAConfig },
    { experimentId: experiment._id, name: "Variation 2", trafficPercentage: 50, isControl: false, config: variantBConfig },
  ]);

  console.log(`✅ Created Experiment "${EXPERIMENT_NAME}"`);
  console.log(`   id          : ${experiment._id}`);
  console.log(`   status      : draft (activate in admin → A/B Testing)`);
  console.log(`   slugTargets : ${SLUG_TARGETS.length} slugs`);
  console.log(`   variants    : Variation 1 (control, 50%), Variation 2 (50%)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ seed-variation1-vs-variation2-experiment failed:", err);
  process.exit(1);
});
