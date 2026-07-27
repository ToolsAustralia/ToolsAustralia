/**
 * Verify all expected promo landing hero WebP assets exist.
 * Run: node scripts/check-landing-hero-assets.mjs   (npm run check:promo-landing-assets)
 *
 * The expected set models what the art team ACTUALLY ships, which the resolver
 * (src/utils/promo/landing-image-resolver.ts) is built around:
 *
 *  - BOTH MODES, since the Draw 9 export (2026-07-27). Every brand × toolbox now ships a
 *    light and a `*-dark` variant. Before Draw 9 no dark file had ever existed and the
 *    resolver's light↔dark fallback silently absorbed that; it is now real art.
 *  - FOUR toolboxes. GearWrench (`gwTB`) joined milTB / sidTB / kinTB in Draw 9.
 *  - NO `final-hours` tier. No landing toolbox ships it; the resolver drops the tier
 *    and serves the base hero.
 *  - Three countdown tiers per brand × toolbox: base, drawn-tomorrow, drawn-tonight —
 *    for BOTH viewports, across all five brands.
 *  - Evergreen (all-prizes) ships base desktop + mobile only, no countdown art.
 *
 * KNOWN_GAPS is the honest part: `ryobi × gwTB` art does not exist in the Draw 9 drop in
 * any mode, viewport or tier, so asserting it would make this guard fail permanently on a
 * healthy tree — which is exactly what made this script useless before 2026-07 (it then
 * asserted dark variants and final-hours art that did not exist, and reported ~94 phantom
 * misses). Remove the entry the day that art lands, and the guard starts enforcing it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const LANDING_BASE = "/images/background/promo/landing";

const BRANDS = ["dewalt", "makita", "milwaukee", "ryobi", "hikoki"];
const TOOLBOX = ["milTB", "sidTB", "kinTB", "gwTB"];
/** Tiers that ship as real art. `final-hours` is intentionally absent — see header. */
const URGENCIES = [null, "drawn-tomorrow", "drawn-tonight"];
const VIEWPORTS = ["desktop", "mobile"];
const MODES = ["light", "dark"];

/**
 * `brand|toolbox` pairs with no art in ANY mode/viewport/tier. Asserting these would fail
 * the guard forever on a healthy tree. Delete an entry the moment its art ships.
 */
const KNOWN_GAPS = new Set([
  "ryobi|gwTB", // GearWrench × Ryobi was not produced for Draw 9 — 24 files outstanding.
]);

function landingPath(rel) {
  return path.join(PUBLIC, rel.replace(/^\//, ""));
}

function brandFile(brand, tb, viewport, urgency, mode) {
  const dark = mode === "dark" ? "-dark" : "";
  const mobile = viewport === "mobile" ? "-mobile" : "";
  const u = urgency ? `-${urgency}` : "";
  return `${LANDING_BASE}/${brand}/${brand}-${tb}${dark}${mobile}${u}.webp`;
}

function evergreenFile(viewport) {
  const mobile = viewport === "mobile" ? "-mobile" : "";
  return `${LANDING_BASE}/all-prizes/all-prizes${mobile}.webp`;
}

/**
 * Hero "stage" background rendered in place of the skeleton while hero data loads.
 *
 * Keyed on THEME since draw 9 — four files, `bg-{viewport}[-dark].webp`. This replaced ten
 * per-brand files (`bg-{brand}-{viewport}.webp`) that all showed the same backdrop and could
 * not express the one thing that varies; dark mode used to get the light backdrop.
 */
function backgroundFile(viewport, mode) {
  const dark = mode === "dark" ? "-dark" : "";
  return `${LANDING_BASE}/background/bg-${viewport}${dark}.webp`;
}

const expected = new Set();

for (const viewport of VIEWPORTS) {
  expected.add(evergreenFile(viewport));
  for (const mode of MODES) expected.add(backgroundFile(viewport, mode));
  for (const brand of BRANDS) {
    for (const tb of TOOLBOX) {
      if (KNOWN_GAPS.has(`${brand}|${tb}`)) continue;
      for (const urgency of URGENCIES) {
        for (const mode of MODES) {
          expected.add(brandFile(brand, tb, viewport, urgency, mode));
        }
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
