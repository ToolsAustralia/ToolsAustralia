/**
 * Convert the numbered "drawn tonight / drawn tomorrow" landing exports to WebP and
 * rename them into the resolver's brand-folder convention, then remove the PNG sources.
 *
 * The art team ships numbered desktop + mobile PNGs under
 *   public/images/background/promo/landing/drawn-tonight-tomorrow/{desktop,mobile}/<1..N>.png
 * Each number is a (brand × toolbox × state) hero.
 *
 * ── 2026-07 export (30 per viewport, the current scheme) ─────────────────────────────
 * Verified by scanning every file — perceptual match against the already-named shipped
 * assets, plus a per-image read of the badge plate and the sub-headline:
 *   groups of 10 by toolbox: milTB (1-10), sidTB (11-20), kinTB (21-30)
 *   pairs of 2 by brand within a group: milwaukee, dewalt, makita, ryobi, hikoki
 *   within each pair: odd = drawn-tomorrow, even = drawn-tonight
 *
 * NOTE — this differs from the 2026-06 export (24 per viewport), which grouped by toolbox
 * in EIGHTS in the order milTB / kinTB / sidTB across only 4 brands. Do not assume the
 * ordering carries over between drops: re-verify each new batch before running this, or
 * every asset silently lands under the wrong brand.
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

/** Order matches the verified 2026-07 export numbering (see header). */
const TOOLBOXES = ["milTB", "sidTB", "kinTB"] as const; // groups of 10
const BRANDS = ["milwaukee", "dewalt", "makita", "ryobi", "hikoki"] as const; // pairs of 2 within a group
const STATES = ["drawn-tomorrow", "drawn-tonight"] as const; // odd, even within a pair

const EXPORTS_PER_VIEWPORT = TOOLBOXES.length * BRANDS.length * STATES.length; // 30

/**
 * Defective source files to skip, keyed `${viewport}/${n}`.
 *
 * 2026-07 batch: the MOBILE kinTB exports 21-28 carry HiKOKI's sub-headline
 * ("A 15 PIECE HIKOKI POWER TOOL KIT & STORAGE SYSTEM COMBO & $5K CASH.") over
 * Milwaukee / DeWalt / Makita / Ryobi artwork — the copy contradicts both its own imagery
 * and its desktop twin, which names the correct brand. 29/30 (the real HiKOKI pair) are
 * fine, and every desktop export is fine.
 *
 * Skipping leaves the previously shipped, copy-correct mobile kinTB art in place rather
 * than regressing customer-facing prize copy. Clear this set once the art team re-exports
 * mobile 21-28.
 */
const SKIP_SOURCES = new Set<string>([
  "mobile/21",
  "mobile/22",
  "mobile/23",
  "mobile/24",
  "mobile/25",
  "mobile/26",
  "mobile/27",
  "mobile/28",
]);

interface DrawnTarget {
  brand: (typeof BRANDS)[number];
  toolbox: (typeof TOOLBOXES)[number];
  state: (typeof STATES)[number];
}

/** Map a 1-based export number to its brand / toolbox / state. */
function targetForNumber(n: number): DrawnTarget {
  const idx = n - 1; // 0..29
  const perToolbox = BRANDS.length * STATES.length; // 10
  const toolbox = TOOLBOXES[Math.floor(idx / perToolbox)];
  const within = idx % perToolbox;
  const brand = BRANDS[Math.floor(within / STATES.length)];
  const state = STATES[within % STATES.length];
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

async function buildJobs(): Promise<{ jobs: Job[]; skipped: string[] }> {
  const jobs: Job[] = [];
  const skipped: string[] = [];
  for (const viewport of ["desktop", "mobile"] as const) {
    for (let n = 1; n <= EXPORTS_PER_VIEWPORT; n++) {
      const src = path.join(DRAWN_ROOT, viewport, `${n}.png`);
      if (!(await exists(src))) continue;
      if (SKIP_SOURCES.has(`${viewport}/${n}`)) {
        const t = targetForNumber(n);
        skipped.push(`${viewport}/${n}.png (${t.brand}-${t.toolbox}-${t.state})`);
        continue;
      }
      jobs.push({ src, dest: destFor(targetForNumber(n), viewport) });
    }
  }
  // Hero-stage backgrounds (skeleton-loader stand-ins): the shared bg-{desktop,mobile}
  // PLUS per-brand bg-{brand}-{desktop,mobile} (used as the brand-aware loader). Convert
  // every bg-*.png in the dir so new brands drop in without touching this script.
  if (await exists(BG_DIR)) {
    for (const name of await fs.readdir(BG_DIR)) {
      if (/^bg-.*\.png$/i.test(name)) {
        const src = path.join(BG_DIR, name);
        jobs.push({ src, dest: path.join(BG_DIR, name.replace(/\.png$/i, ".webp")) });
      }
    }
  }
  return { jobs, skipped };
}

async function main() {
  const { jobs, skipped } = await buildJobs();
  if (jobs.length === 0 && skipped.length === 0) {
    console.log("No source PNGs found under", rel(DRAWN_ROOT), "or", rel(BG_DIR), "— nothing to do.");
    return;
  }

  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length} defective source file(s) — see SKIP_SOURCES:`);
    for (const s of skipped) console.log(`  - ${s}`);
    console.log("");
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

  // Remove the now-empty numbered source folders. Skipped (defective) sources stay on
  // disk so a re-export can drop straight in beside them.
  if (skipped.length === 0) {
    for (const viewport of ["desktop", "mobile"] as const) {
      const dir = path.join(DRAWN_ROOT, viewport);
      if (await exists(dir)) await fs.rm(dir, { recursive: true, force: true });
    }
    if (await exists(DRAWN_ROOT)) await fs.rm(DRAWN_ROOT, { recursive: true, force: true });
  } else {
    console.log(`\nLeft ${skipped.length} skipped source file(s) under ${rel(DRAWN_ROOT)} for re-export.`);
  }

  console.log(
    `\nDone. ${jobs.length} files · ${(totalBefore / 1024 / 1024).toFixed(1)} MB (PNG) -> ${(totalAfter / 1024 / 1024).toFixed(1)} MB (WebP).`
  );
  console.log("Next: npm run build:landing-manifest");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
