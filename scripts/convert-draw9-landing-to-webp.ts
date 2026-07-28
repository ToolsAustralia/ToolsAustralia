/**
 * Convert the Draw 9 landing export to WebP and file it into the resolver's brand folders.
 *
 * The art team ships four folders of `<Toolbox>-<Toolset>-<A|B>[ (n)].png`:
 *   Static/D9 BANNERS (WEB)                                  desktop, base
 *   Static/D9 Mobile Banners                                 mobile,  base
 *   Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)   desktop, countdown tiers
 *   Static/DRAW 9 MOBILE BANNERS (DRAWN TONIGHT TOMORROW)    mobile,  countdown tiers
 *
 * DECODING THE SOURCE NAMES — all four facts were established by READING THE ARTWORK
 * (headline, sub-headline, countdown badge) across all 230 files, not by trusting names:
 *
 *   - The TOOLBOX comes FIRST in the source and SECOND in our slugs. `GW-Dew` is the
 *     DeWalt toolset in the GearWrench box -> `dewalt/dewalt-gwTB…`. Reading it the other
 *     way files every asset under the wrong brand.
 *   - `A` = DARK, `B` = LIGHT. Verified numerically over all 230 (dark luminance 46.9-71.0,
 *     light 168.3-201.2 — a clean split with no overlap). This is the opposite of the
 *     intuitive reading, so it is asserted, not assumed.
 *   - In the drawn folders the bare name is USUALLY `drawn-tomorrow` and ` (2)` is
 *     `drawn-tonight` — but NOT always, and ` (3)` is NEVER a third tier. See EXCEPTIONS.
 *
 * EXCEPTIONS is the whole point of this script. Nine desktop files carry a name that
 * disagrees with their artwork; deriving the mapping from filenames alone would have
 * shipped Ryobi banners on HiKOKI pages, a Kincrome banner on a GearWrench page, and a
 * reversed tonight/tomorrow pair. Every entry below records what the file ACTUALLY shows.
 *
 * The clips (`scripts/convert-draw9-landing-videos.ts`) were proven artwork-identical to
 * these stills file-for-file, so that script imports EXCEPTIONS from here rather than
 * keeping a second copy that could drift.
 *
 * Output matches buildLandingUrl() in src/utils/promo/landing-image-resolver.ts:
 *   landing/{brand}/{brand}-{toolbox}[-dark][-mobile][-{urgency}].webp
 *
 * Run:  npx tsx scripts/convert-draw9-landing-to-webp.ts            (dry run)
 *       npx tsx scripts/convert-draw9-landing-to-webp.ts --apply
 *       … --src "C:/path/to/DRAW 9 ASSETS"
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const LANDING_ROOT = path.join(process.cwd(), "public", "images", "background", "promo", "landing");
const DEFAULT_SRC = "C:/Users/Genesis/Downloads/DRAW 9 ASSETS";

const APPLY = process.argv.includes("--apply");
const SRC_ROOT =
  process.argv.find((a, i) => process.argv[i - 1] === "--src") ?? DEFAULT_SRC;

type Viewport = "desktop" | "mobile";
type Urgency = "drawn-tomorrow" | "drawn-tonight" | null;

const TOOLBOX: Record<string, string> = { gw: "gwTB", kin: "kinTB", mil: "milTB", sid: "sidTB" };
const TOOLSET: Record<string, string> = {
  dew: "dewalt",
  hik: "hikoki",
  mak: "makita",
  mil: "milwaukee",
  ryo: "ryobi",
};

interface SourceFolder {
  rel: string;
  viewport: Viewport;
  drawn: boolean;
}

const FOLDERS: SourceFolder[] = [
  { rel: "Static/D9 BANNERS (WEB)", viewport: "desktop", drawn: false },
  { rel: "Static/D9 Mobile Banners", viewport: "mobile", drawn: false },
  { rel: "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)", viewport: "desktop", drawn: true },
  { rel: "Static/DRAW 9 MOBILE BANNERS (DRAWN TONIGHT TOMORROW)", viewport: "mobile", drawn: true },
];

/**
 * Files whose ARTWORK disagrees with their FILENAME, keyed `<folder rel>|<filename>`.
 * `target` is the final path under `landing/`; `null` means "redundant re-export, skip".
 * Every entry was established by opening the file. Do not add one from a guess.
 */
export const EXCEPTIONS: Record<string, { target: string | null; why: string }> = {
  // ── desktop, base ──────────────────────────────────────────────────────────────────
  "Static/D9 BANNERS (WEB)|GW-Dew-A (2).png": {
    target: "dewalt/dewalt-kinTB-dark.webp",
    why: "Art is 470 PIECE KINCROME + 14pc DeWalt on black — not GearWrench. It is the Kin-Dew-A this folder appeared to be missing.",
  },

  // ── mobile, base ───────────────────────────────────────────────────────────────────
  "Static/D9 Mobile Banners|GW-Dew-B (2).png": { target: null, why: "Redundant re-export, identical to GW-Dew-B.png." },
  "Static/D9 Mobile Banners|Kin-Mak-A (2).png": { target: null, why: "Redundant re-export, identical to Kin-Mak-A.png." },

  // ── desktop, drawn ─────────────────────────────────────────────────────────────────
  "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)|GW-Dew-A (3).png": {
    target: "dewalt/dewalt-kinTB-dark-drawn-tonight.webp",
    why: "Art is Kincrome + DeWalt, dark, DRAWN TONIGHT. Mis-named GW. Completes the dewalt-kincrome dark pair.",
  },
  "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)|Kin-HiK-A (3).png": {
    target: "ryobi/ryobi-kinTB-dark-drawn-tomorrow.webp",
    why: "Art is Kincrome + 19pc RYOBI, dark, DRAWN TOMORROW. Mis-named HiK.",
  },
  "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)|Kin-Ryo-A.png": {
    target: "ryobi/ryobi-kinTB-dark-drawn-tonight.webp",
    why: "Bare name, but the badge reads DRAWN TONIGHT — breaks the base=tomorrow rule.",
  },
  "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)|Mil-HiK-A (2).png": {
    target: "ryobi/ryobi-milTB-dark-drawn-tomorrow.webp",
    why: "Art is Monster Milwaukee + 19pc RYOBI, dark, DRAWN TOMORROW. Mis-named HiK — which is why hikoki-milTB-dark-drawn-tonight had to be re-exported separately.",
  },
  "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)|Mil-Ryo-A.png": {
    target: "ryobi/ryobi-milTB-dark-drawn-tonight.webp",
    why: "Bare name, but the badge reads DRAWN TONIGHT.",
  },
  "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)|Sid-HiK-A (3).png": {
    target: "ryobi/ryobi-sidTB-dark-drawn-tomorrow.webp",
    why: "Art is Sidchrome + 19pc RYOBI, dark, DRAWN TOMORROW. Mis-named HiK.",
  },
  "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)|Sid-Ryo-A.png": {
    target: "ryobi/ryobi-sidTB-dark-drawn-tonight.webp",
    why: "Bare name, but the badge reads DRAWN TONIGHT.",
  },
  "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)|Mil-Mil-B.png": {
    target: "milwaukee/milwaukee-milTB-drawn-tonight.webp",
    why: "This pair is REVERSED — the bare name is TONIGHT here.",
  },
  "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)|Mil-Mil-B (2).png": {
    target: "milwaukee/milwaukee-milTB-drawn-tomorrow.webp",
    why: "This pair is REVERSED — '(2)' is TOMORROW here.",
  },

  // ── mobile, drawn ──────────────────────────────────────────────────────────────────
  "Static/DRAW 9 MOBILE BANNERS (DRAWN TONIGHT TOMORROW)|Kin-Mak-A (3).png": {
    target: null,
    why: "Redundant re-export — same tier as Kin-Mak-A (2).png (both DRAWN TONIGHT).",
  },
};

/**
 * Loose files DJ re-exported after the main drop, which live at the source ROOT rather than
 * in a numbered folder and are named for what they are. Kept separate from EXCEPTIONS
 * because they are not corrections to a mis-named file — they are the missing artwork.
 */
const LOOSE_EXTRAS: { src: string; target: string; why: string }[] = [
  {
    src: "Mil-Hik-A-tonight.png",
    target: "hikoki/hikoki-milTB-dark-drawn-tonight.webp",
    why: "Re-export 2026-07-27: the only Milwaukee-box × HiKOKI-kit dark DRAWN TONIGHT desktop still (its slot in the drawn folder held Ryobi art).",
  },
  {
    src: "Mil-HiK-A-tomorrow.png",
    target: "hikoki/hikoki-milTB-dark-drawn-tomorrow.webp",
    why: "Re-export 2026-07-27: same combo, TOMORROW. Duplicates the in-folder Mil-HiK-A.png; the explicitly-named file wins.",
  },
];

interface Job {
  src: string;
  target: string; // relative to LANDING_ROOT
  note: string;
}

/** Default decode for a source filename — used unless EXCEPTIONS overrides it. */
function decode(name: string, folder: SourceFolder): { target: string; note: string } | null {
  const m = /^([A-Za-z]+)-([A-Za-z]+)-([AB])(?:\s*\((\d+)\))?\.png$/i.exec(name);
  if (!m) return null;

  const toolbox = TOOLBOX[m[1].toLowerCase()];
  const brand = TOOLSET[m[2].toLowerCase()];
  if (!toolbox || !brand) return null;

  const dark = m[3].toUpperCase() === "A";
  const dup = m[4] ? Number(m[4]) : 1;

  let urgency: Urgency = null;
  if (folder.drawn) urgency = dup === 1 ? "drawn-tomorrow" : "drawn-tonight";

  const darkSuffix = dark ? "-dark" : "";
  const mobileSuffix = folder.viewport === "mobile" ? "-mobile" : "";
  const urgencySuffix = urgency ? `-${urgency}` : "";

  return {
    target: `${brand}/${brand}-${toolbox}${darkSuffix}${mobileSuffix}${urgencySuffix}.webp`,
    note: `${brand} × ${toolbox} · ${dark ? "dark" : "light"} · ${folder.viewport}${urgency ? ` · ${urgency}` : ""}`,
  };
}

function kb(n: number): string {
  return (n / 1024).toFixed(1);
}
async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function buildJobs(): Promise<{ jobs: Job[]; skipped: string[]; unmatched: string[] }> {
  const jobs: Job[] = [];
  const skipped: string[] = [];
  const unmatched: string[] = [];
  const claimed = new Map<string, string>();

  const add = (src: string, target: string, note: string) => {
    const prev = claimed.get(target);
    if (prev) {
      throw new Error(`Two sources both map to ${target}:\n  ${prev}\n  ${src}\nResolve before running.`);
    }
    claimed.set(target, src);
    jobs.push({ src, target, note });
  };

  for (const folder of FOLDERS) {
    const dir = path.join(SRC_ROOT, folder.rel);
    if (!(await exists(dir))) {
      throw new Error(`Source folder missing: ${dir}`);
    }
    for (const name of (await fs.readdir(dir)).filter((n) => n.toLowerCase().endsWith(".png")).sort()) {
      const key = `${folder.rel}|${name}`;
      const override = EXCEPTIONS[key];
      if (override) {
        if (override.target === null) {
          skipped.push(`${key} — ${override.why}`);
          continue;
        }
        add(path.join(dir, name), override.target, `OVERRIDE: ${override.why}`);
        continue;
      }
      const decoded = decode(name, folder);
      if (!decoded) {
        unmatched.push(key);
        continue;
      }
      add(path.join(dir, name), decoded.target, decoded.note);
    }
  }

  for (const extra of LOOSE_EXTRAS) {
    const src = path.join(SRC_ROOT, extra.src);
    if (!(await exists(src))) {
      unmatched.push(`(loose) ${extra.src} — declared but not on disk`);
      continue;
    }
    // A loose re-export deliberately supersedes whatever the folder produced.
    const idx = jobs.findIndex((j) => j.target === extra.target);
    if (idx >= 0) {
      skipped.push(`${path.basename(jobs[idx].src)} — superseded by loose re-export ${extra.src}`);
      jobs.splice(idx, 1);
      claimed.delete(extra.target);
    }
    add(src, extra.target, `RE-EXPORT: ${extra.why}`);
  }

  return { jobs, skipped, unmatched };
}

async function main() {
  console.log(`Source : ${SRC_ROOT}`);
  console.log(`Target : ${path.relative(process.cwd(), LANDING_ROOT).replace(/\\/g, "/")}`);
  console.log(`Mode   : ${APPLY ? "APPLY (writes files)" : "DRY RUN (no writes — pass --apply)"}\n`);

  const { jobs, skipped, unmatched } = await buildJobs();

  if (unmatched.length) {
    console.error(`${unmatched.length} source file(s) could not be decoded:`);
    for (const u of unmatched) console.error(`  ${u}`);
    console.error("");
  }
  if (skipped.length) {
    console.log(`Skipping ${skipped.length} file(s):`);
    for (const s of skipped) console.log(`  - ${s}`);
    console.log("");
  }

  console.log(`${jobs.length} file(s) to convert (PNG -> WebP, quality 82, effort 5)\n`);

  if (!APPLY) {
    for (const j of jobs) console.log(`  ${path.basename(j.src).padEnd(24)} -> ${j.target}`);
    console.log(`\nDry run complete. ${jobs.length} would be written. Re-run with --apply.`);
    return;
  }

  const auditLines: string[] = [];
  const logEvery = Math.max(1, Math.floor(jobs.length / 20));
  let before = 0;
  let after = 0;
  const started = Date.now();

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const dest = path.join(LANDING_ROOT, j.target);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const bIn = (await fs.stat(j.src)).size;
    await sharp(j.src).webp({ quality: 82, effort: 5 }).toFile(dest);
    const bOut = (await fs.stat(dest)).size;
    before += bIn;
    after += bOut;
    auditLines.push(`"${j.src.replace(/"/g, '""')}","${j.target}",${bIn},${bOut},"${j.note.replace(/"/g, '""')}"`);

    if ((i + 1) % logEvery === 0 || i === jobs.length - 1) {
      const done = i + 1;
      const rate = done / Math.max(0.001, (Date.now() - started) / 1000);
      console.log(
        `  … ${done}/${jobs.length} (${((done / jobs.length) * 100).toFixed(0)}%) · ${rate.toFixed(1)}/s · ETA ${((jobs.length - done) / rate).toFixed(0)}s`
      );
    }
  }

  const auditPath = path.join(process.cwd(), "draw9-landing-ingest-audit.csv");
  await fs.appendFile(
    auditPath,
    (await exists(auditPath) ? "" : "source,target,bytes_in,bytes_out,note\n") + auditLines.join("\n") + "\n",
    "utf8"
  );

  console.log(
    `\nDone. ${jobs.length} files · ${(before / 1024 / 1024).toFixed(1)} MB PNG -> ${(after / 1024 / 1024).toFixed(1)} MB WebP (${kb(after / jobs.length)} KB avg).`
  );
  console.log(`Audit: ${path.basename(auditPath)}`);
  console.log("Next: npm run build:landing-manifest");
}

/**
 * Only run when invoked directly. `convert-draw9-landing-videos.ts` imports EXCEPTIONS from
 * this module so a correction can never be applied to the stills and forgotten for the
 * clips — without this guard that import would also execute the whole still conversion.
 */
const invokedDirectly =
  process.argv[1] != null &&
  path.resolve(process.argv[1]).replace(/\.(ts|js)$/, "") === fileURLToPath(import.meta.url).replace(/\.(ts|js)$/, "");

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
