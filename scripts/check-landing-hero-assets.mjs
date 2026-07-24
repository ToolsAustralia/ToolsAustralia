/**
 * Verify all expected promo landing hero WebP assets exist.
 * Run: node scripts/check-landing-hero-assets.mjs   (npm run check:promo-landing-assets)
 *
 * The expected set models what the art team ACTUALLY ships, which the resolver
 * (src/utils/promo/landing-image-resolver.ts) is built around:
 *
 *  - LIGHT ONLY. No `*-dark.webp` has ever shipped for any brand; the resolver's
 *    light↔dark fallback exists precisely to absorb that.
 *  - NO `final-hours` tier. No landing toolbox ships it; the resolver drops the tier
 *    and serves the base hero.
 *  - Three countdown tiers per brand × toolbox: base, drawn-tomorrow, drawn-tonight —
 *    for BOTH viewports, across all five brands (HiKOKI completed the set in the
 *    2026-07 export; it was base-only before).
 *  - Evergreen (all-prizes) ships base desktop + mobile only, no countdown art.
 *
 * Before 2026-07 this script asserted dark variants and final-hours art that do not and
 * never did exist, omitted HiKOKI, and skipped the kinTB drawn tiers that DO exist — so
 * it reported ~94 phantom "missing" files and exited 1 on a perfectly healthy tree,
 * which made it useless as a guard. It now matches the shipped reality; a real failure
 * here means an asset genuinely went missing.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const LANDING_BASE = "/images/background/promo/landing";

const BRANDS = ["dewalt", "makita", "milwaukee", "ryobi", "hikoki"];
const TOOLBOX = ["milTB", "sidTB", "kinTB"];
/** Tiers that ship as real art. `final-hours` is intentionally absent — see header. */
const URGENCIES = [null, "drawn-tomorrow", "drawn-tonight"];
const VIEWPORTS = ["desktop", "mobile"];

function landingPath(rel) {
  return path.join(PUBLIC, rel.replace(/^\//, ""));
}

function brandFile(brand, tb, viewport, urgency) {
  const mobile = viewport === "mobile" ? "-mobile" : "";
  const u = urgency ? `-${urgency}` : "";
  return `${LANDING_BASE}/${brand}/${brand}-${tb}${mobile}${u}.webp`;
}

function evergreenFile(viewport) {
  const mobile = viewport === "mobile" ? "-mobile" : "";
  return `${LANDING_BASE}/all-prizes/all-prizes${mobile}.webp`;
}

/** Hero "stage" background rendered in place of the skeleton while hero data loads. */
function backgroundFile(brand, viewport) {
  const name = brand ? `bg-${brand}-${viewport}` : `bg-${viewport}`;
  return `${LANDING_BASE}/background/${name}.webp`;
}

const expected = new Set();

for (const viewport of VIEWPORTS) {
  expected.add(evergreenFile(viewport));
  expected.add(backgroundFile(null, viewport));
  for (const brand of BRANDS) {
    expected.add(backgroundFile(brand, viewport));
    for (const tb of TOOLBOX) {
      for (const urgency of URGENCIES) {
        expected.add(brandFile(brand, tb, viewport, urgency));
      }
    }
  }
}

const missing = [];
for (const rel of expected) {
  if (!fs.existsSync(landingPath(rel))) missing.push(rel);
}

if (missing.length) {
  console.error(`Missing ${missing.length} landing hero WebP file(s):\n`);
  for (const m of missing.sort()) console.error(`  ${m}`);
  process.exit(1);
}

console.log(`OK: ${expected.size} expected landing hero WebP files present.`);
