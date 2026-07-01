/**
 * Seed: "promo packages design (promo vs membership)" A/B experiment.
 *
 * Control  = { packages: { design: "promo" } }      → current MembershipSection
 * Treatment= { packages: { design: "membership" } } → /membership tier + one-time-packs design
 *
 * Targets ALL promotions pages: slugTargets = every prize slug from listPrizes(). Both the
 * dynamic [slug] prize pages and the toolset/brand pages resolve on a prize slug
 * (getDefaultPrizeForToolsetSlug → {brand}-milwaukee), so this covers both with no exclusions.
 *
 * NOTE — seeds status="active" directly (startDate=now). This is a deliberate, authorized
 * deviation from the other seeds (which create "draft" for manual admin activation).
 *
 * Idempotent + safe:
 *   • If the experiment already exists and is NOT draft → skip (never touch a live/edited one).
 *   • Overlap guard: refuses to activate if another ACTIVE experiment already targets any of
 *     these slugs (getActiveExperimentForSlug returns one experiment per slug — an overlap
 *     would make one test silently shadow the other). Override knowingly with --force-overlap.
 *
 * Usage:
 *   npx tsx scripts/seed-promo-packages-design-experiment.ts            (live, straight to active)
 *   npx tsx scripts/seed-promo-packages-design-experiment.ts --dry-run  (preview)
 *   npx tsx scripts/seed-promo-packages-design-experiment.ts --force-overlap   (activate despite overlap)
 *
 * Env: .env.local must have MONGODB_URI. Requires at least one admin User (used as createdBy).
 */

import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE_OVERLAP = process.argv.includes("--force-overlap");

const EXPERIMENT_NAME = "promo packages design (promo vs membership)";

const CONTROL_CONFIG = { packages: { design: "promo" as const } };
const TREATMENT_CONFIG = { packages: { design: "membership" as const } };

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in .env.local");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const { default: Experiment } = await import("../src/models/ab-testing/Experiment");
  const { default: Variant } = await import("../src/models/ab-testing/Variant");
  const { default: User } = await import("../src/models/User");
  const { listPrizes } = await import("../src/config/prizes");

  await connectDB();

  const slugTargets = Array.from(new Set(listPrizes().map((p) => p.slug)));
  console.log(`Target slugs (${slugTargets.length}): ${slugTargets.join(", ")}`);

  // Idempotency: refuse to clobber a non-draft experiment of the same name.
  const existing = await Experiment.findOne({ name: EXPERIMENT_NAME }).exec();
  if (existing && existing.status !== "draft") {
    console.log(`↩️  Experiment "${EXPERIMENT_NAME}" already exists (status=${existing.status}, id=${existing._id}). Skipping.`);
    process.exit(0);
  }

  // Overlap guard: any OTHER active experiment targeting one of our slugs (or wildcard "*").
  const activeOthers = await Experiment.find({
    status: "active",
    ...(existing ? { _id: { $ne: existing._id } } : {}),
  })
    .select("_id name slugTargets")
    .lean()
    .exec();
  const overlaps = activeOthers.filter(
    (e) =>
      Array.isArray(e.slugTargets) &&
      e.slugTargets.some((s: string) => s === "*" || (slugTargets as string[]).includes(s)),
  );
  if (overlaps.length > 0) {
    console.log("⚠️  Overlapping ACTIVE experiment(s) already target these slugs:");
    for (const o of overlaps) console.log(`   - ${o.name} (id=${o._id}) → ${(o.slugTargets as string[]).join(", ")}`);
    if (!FORCE_OVERLAP) {
      console.error("❌ Refusing to activate — one test would shadow the other. Re-run with --force-overlap to proceed knowingly.");
      process.exit(1);
    }
    console.log("… proceeding anyway (--force-overlap).");
  }

  const adminUser = await User.findOne({ role: "admin" }).select("_id email").lean().exec();
  if (!adminUser) {
    console.error("❌ No admin user found — Experiment.createdBy requires a real user. Seed an admin first.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("[dry-run] Would create ACTIVE Experiment:");
    console.log(`  name        : ${EXPERIMENT_NAME}`);
    console.log(`  status      : active (startDate = now)`);
    console.log(`  slugTargets : ${slugTargets.length} prize slugs`);
    console.log(`  createdBy   : ${adminUser._id} (${adminUser.email})`);
    console.log("[dry-run] Variants (50/50):");
    console.log(`  - Control   "promo design"      isControl=true  config=${JSON.stringify(CONTROL_CONFIG)}`);
    console.log(`  - Treatment "membership design" isControl=false config=${JSON.stringify(TREATMENT_CONFIG)}`);
    process.exit(0);
  }

  const experiment =
    existing ??
    (await Experiment.create({
      name: EXPERIMENT_NAME,
      status: "active",
      slugTargets,
      startDate: new Date(),
      createdBy: adminUser._id,
    }));

  if (existing) {
    existing.status = "active";
    existing.slugTargets = slugTargets;
    existing.startDate = existing.startDate ?? new Date();
    await existing.save();
    await Variant.deleteMany({ experimentId: existing._id });
  }

  await Variant.create([
    { experimentId: experiment._id, name: "promo design", trafficPercentage: 50, isControl: true, config: CONTROL_CONFIG },
    { experimentId: experiment._id, name: "membership design", trafficPercentage: 50, isControl: false, config: TREATMENT_CONFIG },
  ]);

  console.log(`✅ Seeded ACTIVE experiment "${EXPERIMENT_NAME}" (id=${experiment._id})`);
  console.log(`   slugTargets : ${slugTargets.length} prize slugs`);
  console.log(`   variants    : promo design (control, 50%), membership design (50%)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ seed-promo-packages-design-experiment failed:", err);
  process.exit(1);
});
