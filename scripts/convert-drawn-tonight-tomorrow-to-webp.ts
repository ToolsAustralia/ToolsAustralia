/**
 * Convert the numbered "drawn tonight / drawn tomorrow" landing exports to WebP and
 * rename them into the resolver's brand-folder convention, then remove the PNG sources.
 *
 * The art team ships 24 numbered desktop + 24 numbered mobile PNGs under
 *   public/images/background/promo/landing/drawn-tonight-tomorrow/{desktop,mobile}/<1..24>.png
 * Each number is a (brand × toolbox × state) hero. Verified mapping (see README in PR):
 *   group of 8 by toolbox: milTB (1-8), kinTB (9-16), sidTB (17-24)
 *   within each group, pairs of 2 by brand: milwaukee, dewalt, makita, ryobi
 *   within each pair: odd = drawn-tomorrow, even = drawn-tonight
 *
 * Output matches buildLandingUrl() in landing-image-resolver.ts:
 *   desktop -> landing/{brand}/{brand}-{toolbox}-drawn-{state}.webp
 *   mobile  -> landing/{brand}/{brand}-{toolbox}-mobile-drawn-{state}.webp
 *
 * Also converts the shared hero "stage" background (used in place of the hero skeleton):
 *   landing/background/bg-{desktop,mobile}.png -> .webp
 *
 * Run: npx tsx scripts/convert-drawn-tonight-tomorrow-to-webp.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const LANDING_ROOT = path.join(process.cwd(), "public", "images", "background", "promo", "landing");
const DRAWN_ROOT = path.join(LANDING_ROOT, "drawn-tonight-tomorrow");
const BG_DIR = path.join(LANDING_ROOT, "background");

/** Order matches the verified export numbering (see header). */
const TOOLBOXES = ["milTB", "kinTB", "sidTB"] as const; // groups of 8
const BRANDS = ["milwaukee", "dewalt", "makita", "ryobi"] as const; // pairs of 2 within a group
const STATES = ["drawn-tomorrow", "drawn-tonight"] as const; // odd, even within a pair

interface DrawnTarget {
  brand: (typeof BRANDS)[number];
  toolbox: (typeof TOOLBOXES)[number];
  state: (typeof STATES)[number];
}

/** Map a 1-based export number to its brand / toolbox / state. */
function targetForNumber(n: number): DrawnTarget {
  const idx = n - 1; // 0..23
  const toolbox = TOOLBOXES[Math.floor(idx / 8)];
  const within = idx % 8;
  const brand = BRANDS[Math.floor(within / 2)];
  const state = STATES[within % 2];
  return { brand, toolbox, state };
}

function destFor(target: DrawnTarget, viewport: "desktop" | "mobile"): string {
  const mobileSuffix = viewport === "mobile" ? "-mobile" : "";
  const name = `${target.brand}-${target.toolbox}${mobileSuffix}-${target.state}.webp`;
  return path.join(LANDING_ROOT, target.brand, name);
}

function kb(n: number): string {
  return (n / 1024).toFixed(1);
}
function pct(before: number, after: number): string {
  return before === 0 ? "0" : ((1 - after / before) * 100).toFixed(1);
}
function rel(abs: string): string {
  return path.relative(process.cwd(), abs).replace(/\\/g, "/");
}
async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

interface Job {
  src: string;
  dest: string;
}

async function buildJobs(): Promise<Job[]> {
  const jobs: Job[] = [];
  for (const viewport of ["desktop", "mobile"] as const) {
    for (let n = 1; n <= 24; n++) {
      const src = path.join(DRAWN_ROOT, viewport, `${n}.png`);
      if (await exists(src)) jobs.push({ src, dest: destFor(targetForNumber(n), viewport) });
    }
  }
  // Shared hero-stage background (replaces the skeleton loader).
  for (const base of ["bg-desktop", "bg-mobile"]) {
    const src = path.join(BG_DIR, `${base}.png`);
    if (await exists(src)) jobs.push({ src, dest: path.join(BG_DIR, `${base}.webp`) });
  }
  return jobs;
}

async function main() {
  const jobs = await buildJobs();
  if (jobs.length === 0) {
    console.log("No source PNGs found under", rel(DRAWN_ROOT), "or", rel(BG_DIR), "— nothing to do.");
    return;
  }

  console.log(`Converting ${jobs.length} PNG -> WebP (quality 82, effort 5)\n`);
  const logEvery = Math.max(1, Math.floor(jobs.length / 20));
  let totalBefore = 0;
  let totalAfter = 0;
  const started = Date.now();

  for (let i = 0; i < jobs.length; i++) {
    const { src, dest } = jobs[i];
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const before = (await fs.stat(src)).size;
    await sharp(src).webp({ quality: 82, effort: 5 }).toFile(dest);
    const after = (await fs.stat(dest)).size;
    await fs.unlink(src);

    totalBefore += before;
    totalAfter += after;
    console.log(`${rel(src)} -> ${rel(dest)}  (${kb(before)} KB -> ${kb(after)} KB, ${pct(before, after)}% smaller)`);

    if ((i + 1) % logEvery === 0 || i === jobs.length - 1) {
      const done = i + 1;
      const rate = done / Math.max(0.001, (Date.now() - started) / 1000);
      const eta = ((jobs.length - done) / rate).toFixed(0);
      console.log(`  … ${done}/${jobs.length} (${((done / jobs.length) * 100).toFixed(0)}%) · ${rate.toFixed(1)}/s · ETA ${eta}s`);
    }
  }

  // Remove the now-empty numbered source folders.
  for (const viewport of ["desktop", "mobile"] as const) {
    const dir = path.join(DRAWN_ROOT, viewport);
    if (await exists(dir)) await fs.rm(dir, { recursive: true, force: true });
  }
  if (await exists(DRAWN_ROOT)) await fs.rm(DRAWN_ROOT, { recursive: true, force: true });

  console.log(
    `\nDone. ${jobs.length} files · ${(totalBefore / 1024 / 1024).toFixed(1)} MB (PNG) -> ${(totalAfter / 1024 / 1024).toFixed(1)} MB (WebP).`
  );
  console.log("Next: npm run build:landing-manifest");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
