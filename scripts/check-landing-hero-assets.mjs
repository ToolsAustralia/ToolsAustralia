/**
 * Verify all expected promo landing hero WebP assets exist.
 * Run: node scripts/check-landing-hero-assets.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const LANDING_BASE = "/images/background/promo/landing";

const BRANDS = ["dewalt", "makita", "milwaukee", "ryobi"];
const TOOLBOX = ["milTB", "sidTB"];
const URGENCIES = [null, "final-hours", "drawn-tomorrow", "drawn-tonight"];

function landingPath(rel) {
  return path.join(PUBLIC, rel.replace(/^\//, ""));
}

function brandFile(brand, tb, mode, viewport, urgency) {
  const dark = mode === "dark" ? "-dark" : "";
  const mobile = viewport === "mobile" ? "-mobile" : "";
  const u = urgency ? `-${urgency}` : "";
  const name = `${brand}-${tb}-no-promo${dark}${mobile}${u}.webp`;
  return `${LANDING_BASE}/${brand}/${name}`;
}

function evergreenFile(mode, viewport, urgency) {
  const dark = mode === "dark" ? "-dark" : "";
  const mobile = viewport === "mobile" ? "-mobile" : "";
  const u = urgency ? `-${urgency}` : "";
  return `${LANDING_BASE}/all-prizes/all-no-promo${dark}${mobile}${u}.webp`;
}

const variants = [
  ["light", "desktop"],
  ["light", "mobile"],
  ["dark", "desktop"],
  ["dark", "mobile"],
];

const expected = [];

for (const urgency of URGENCIES) {
  for (const [mode, viewport] of variants) {
    expected.push(evergreenFile(mode, viewport, urgency));
  }
}

for (const brand of BRANDS) {
  for (const tb of TOOLBOX) {
    for (const urgency of URGENCIES) {
      for (const [mode, viewport] of variants) {
        expected.push(brandFile(brand, tb, mode, viewport, urgency));
      }
    }
  }
}

const missing = [];
for (const rel of expected) {
  const abs = landingPath(rel);
  if (!fs.existsSync(abs)) missing.push(rel);
}

if (missing.length) {
  console.error(`Missing ${missing.length} landing hero WebP file(s):\n`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}

console.log(`OK: ${expected.length} expected landing hero WebP files present.`);
