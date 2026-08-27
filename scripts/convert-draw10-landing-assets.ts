/**
 * Encode the Draw 10 landing export — stills AND clips — into the resolver's brand folders.
 *
 * The draw-10 drop uses a different, much simpler grammar than draw 9, so this does not extend
 * `convert-draw9-landing-*.ts` (those are welded to that drop's `<Toolbox>-<Toolset>-<A|B>`
 * naming and its nine-file EXCEPTIONS list). Draw 10 ships:
 *
 *   "<ToolboxLetter><ToolsetCode> - <n>.png|mp4"              desktop
 *   "<ToolboxLetter><ToolsetCode> - Square - <n>.png|mp4"     mobile
 *
 *   toolbox letter   G GearWrench · K Kincrome · M Milwaukee · S Sidchrome
 *   toolset code     D DeWalt · H HiKOKI · M Milwaukee · Mak Makita · R Ryobi · S STIHL
 *
 * Note the source puts the TOOLBOX first, while the output path is keyed by TOOLSET
 * (`landing/{toolset}/{toolset}-{toolboxSuffix}…`). Getting that backwards silently files every
 * asset under the wrong brand, so the mapping is asserted below rather than assumed.
 *
 * LIGHT vs DARK IS MEASURED, NEVER PARSED. The trailing number is not reliable — this drop
 * contains `GS - Square - 28` and `KS - Square - 22` where `1` was meant, in BOTH the still and
 * the clip set. Trusting the digit installs a dark hero as the light one, which no test catches
 * because both files exist and both are valid images. Each pair is therefore sorted by mean
 * luminance: brighter is light, darker is dark. For clips the frame is sampled at 2s, because
 * these open on a white fade-in that makes frame 0 useless for the comparison.
 *
 * Output matches the resolvers in src/utils/promo/landing-{image,video}-resolver.ts:
 *   images/background/promo/landing/{brand}/{brand}-{toolbox}[-dark][-mobile].webp
 *   videos/landing/{brand}/{brand}-{toolbox}[-dark][-mobile].{webm,mp4}
 *
 * Each clip ships a WebM (VP9 — the resolver's preferred `<source>`) beside its MP4, matching the
 * existing library; encode settings are copied from `convert-draw9-landing-videos.ts` so the two
 * generations are byte-comparable. MP4 is a stream COPY: the export is already h264 at the right
 * dimensions, so re-encoding would only lose quality.
 *
 * NO URGENCY TIERS. Draw 10 ships base light/dark per viewport only. `resolveLandingHeroImage`
 * drops an unshipped tier and serves the base hero, so `-drawn-tonight` / `-drawn-tomorrow`
 * degrade cleanly. Re-run with a tier-bearing drop when that art exists.
 *
 * Requires ffmpeg on PATH (clips only).
 * Run:  npx tsx scripts/convert-draw10-landing-assets.ts                    (dry run)
 *       npx tsx scripts/convert-draw10-landing-assets.ts --apply
 *       npx tsx scripts/convert-draw10-landing-assets.ts --apply --only=clips
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const IMAGE_ROOT = path.join(process.cwd(), "public", "images", "background", "promo", "landing");
const VIDEO_ROOT = path.join(process.cwd(), "public", "videos", "landing");

/**
 * Where the designer's exports land. Defaults to the current user's Downloads folder, which is
 * where they arrive in practice, but is overridable so this is not one machine`s script:
 *   DRAW10_SOURCE_DIR=/path/to/exports npx tsx scripts/convert-draw10-landing-assets.ts
 *   npx tsx scripts/convert-draw10-landing-assets.ts --source=/path/to/exports
 *
 * A missing source dir is reported LOUDLY below rather than silently yielding zero jobs — a
 * silent zero reads as "nothing to convert" when it actually means "wrong machine".
 */
const DOWNLOADS =
  process.argv.find((a) => a.startsWith("--source="))?.slice("--source=".length) ??
  process.env.DRAW10_SOURCE_DIR ??
  path.join(os.homedir(), "Downloads");
const SOURCES = [
  { dir: `${DOWNLOADS}/D10 - LANDING PAGES (DESKTOP VIEW)`, viewport: "desktop" as const, kind: "still" as const },
  { dir: `${DOWNLOADS}/D10 - LANDING PAGES (MOBILE VIEW)`, viewport: "mobile" as const, kind: "still" as const },
  { dir: `${DOWNLOADS}/D10 - LANDING PAGES (DESKTOP VIEW) (1)`, viewport: "desktop" as const, kind: "clip" as const },
  { dir: `${DOWNLOADS}/D10 - LANDING PAGES (MOBILE VIEW) (1)`, viewport: "mobile" as const, kind: "clip" as const },
];

const TOOLBOX: Record<string, string> = { G: "gwTB", K: "kinTB", M: "milTB", S: "sidTB" };
const TOOLSET: Record<string, string> = { D: "dewalt", H: "hikoki", M: "milwaukee", Mak: "makita", R: "ryobi", S: "stihl" };

const APPLY = process.argv.includes("--apply");
const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const ONLY: "stills" | "clips" | null = onlyArg === "stills" || onlyArg === "clips" ? onlyArg : null;

interface Job {
  src: string;
  name: string;
  kind: "still" | "clip";
  viewport: "desktop" | "mobile";
  toolset: string;
  toolbox: string;
  luma: number;
}

/** `GMak - Square - 1` -> toolbox gwTB, toolset makita. Returns null for anything unparseable. */
function decode(stem: string): { toolbox: string; toolset: string } | null {
  const m = stem.match(/^([GKMS])(Mak|D|H|M|R|S)\s*-\s*(?:Square\s*-\s*)?\d+$/);
  if (!m) return null;
  return { toolbox: TOOLBOX[m[1]], toolset: TOOLSET[m[2]] };
}

async function meanLuma(file: string, kind: "still" | "clip"): Promise<number> {
  if (kind === "still") {
    const s = await sharp(file).resize(240, null, { fit: "inside" }).greyscale().stats();
    return s.channels[0].mean;
  }
  /**
   * Clips fade in from white — frame 0 tells you nothing, so sample at 2s.
   *
   * The frame is PIPED, never written to a temp file. An earlier version reused one temp path
   * per call and `sharp` served a CACHED decode of the previous clip: two different files came
   * back with byte-identical luminance (196.0 for both), which silently flipped a light clip to
   * dark. Piping removes the filename entirely, so there is nothing to cache against.
   */
  const png = execFileSync(
    "ffmpeg",
    ["-v", "error", "-ss", "2", "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  const s = await sharp(png).resize(240, null, { fit: "inside" }).greyscale().stats();
  return s.channels[0].mean;
}

function requireFfmpeg(): void {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg not found on PATH — install it before running this script.");
  }
}

async function main(): Promise<void> {
  const wantStills = ONLY !== "clips";
  const wantClips = ONLY !== "stills";
  if (wantClips) requireFfmpeg();

  console.log(`Draw 10 landing assets — ${APPLY ? "APPLY" : "DRY RUN"}${ONLY ? ` (only ${ONLY})` : ""}\n`);

  // ── collect + pair ────────────────────────────────────────────────────────
  const groups = new Map<string, Job[]>();
  const unmatched: string[] = [];
  let dirsFound = 0;

  for (const s of SOURCES) {
    if (s.kind === "still" && !wantStills) continue;
    if (s.kind === "clip" && !wantClips) continue;
    if (!fs.existsSync(s.dir)) {
      console.error(`  ! source folder missing, skipped: ${s.dir}`);
      continue;
    }
    dirsFound++;
    const ext = s.kind === "still" ? /\.png$/i : /\.mp4$/i;
    for (const name of fs.readdirSync(s.dir).filter((f) => ext.test(f))) {
      const d = decode(name.replace(ext, ""));
      if (!d) {
        unmatched.push(`${path.basename(s.dir)}/${name}`);
        continue;
      }
      const file = path.join(s.dir, name);
      const key = `${s.kind}|${d.toolset}|${d.toolbox}|${s.viewport}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        src: file,
        name,
        kind: s.kind,
        viewport: s.viewport,
        toolset: d.toolset,
        toolbox: d.toolbox,
        luma: await meanLuma(file, s.kind),
      });
    }
  }

  // Not one source folder existed. That is a wrong-machine / wrong-path error, not an empty
  // job list, and exiting 0 here would read as "nothing to convert" — so say so and stop.
  if (dirsFound === 0) {
    console.error(`  FATAL: no source folder existed under ${DOWNLOADS}.`);
    console.error("  Point the script at the exports with --source=<dir> or DRAW10_SOURCE_DIR=<dir>.");
    process.exit(3);
  }

  if (unmatched.length) {
    console.error(`${unmatched.length} source file(s) could not be decoded — NOT installed:`);
    for (const u of unmatched) console.error(`  ${u}`);
    console.error("");
  }

  // ── resolve light/dark per pair ───────────────────────────────────────────
  const jobs: (Job & { mode: "light" | "dark"; out: string })[] = [];
  const badPairs: string[] = [];

  for (const [key, files] of [...groups].sort()) {
    if (files.length !== 2) {
      badPairs.push(`${key}: expected 2 files, got ${files.length} (${files.map((f) => f.name).join(", ")})`);
      continue;
    }
    const [bright, dim] = [...files].sort((a, b) => b.luma - a.luma);
    for (const [mode, f] of [["light", bright], ["dark", dim]] as const) {
      const root = f.kind === "still" ? IMAGE_ROOT : VIDEO_ROOT;
      const stem = `${f.toolset}-${f.toolbox}${mode === "dark" ? "-dark" : ""}${f.viewport === "mobile" ? "-mobile" : ""}`;
      jobs.push({ ...f, mode, out: path.join(root, f.toolset, stem) });
    }
  }

  if (badPairs.length) {
    console.error(`${badPairs.length} incomplete pair(s) — NOT installed:`);
    for (const b of badPairs) console.error(`  ${b}`);
    console.error("");
  }

  const stills = jobs.filter((j) => j.kind === "still");
  const clips = jobs.filter((j) => j.kind === "clip");
  console.log(`  ${jobs.length} outputs: ${stills.length} stills, ${clips.length} clips (each clip -> mp4 + webm)`);
  console.log(`  ${groups.size} pairs across ${new Set(jobs.map((j) => j.toolset)).size} brands\n`);

  const renumbered = jobs.filter((j) => !/- (Square - )?[12]$/.test(j.name.replace(/\.(png|mp4)$/i, "")));
  if (renumbered.length) {
    console.log(`  ${renumbered.length} mis-numbered source file(s), resolved by LUMINANCE:`);
    for (const j of renumbered) {
      console.log(`    ${j.name.padEnd(24)} luma ${j.luma.toFixed(0).padStart(3)} -> ${j.mode.padEnd(5)} ${path.basename(j.out)}`);
    }
    console.log("");
  }

  if (!APPLY) {
    for (const j of jobs.slice(0, 8)) {
      console.log(`  ${j.name.padEnd(24)} -> ${path.relative(process.cwd(), j.out)}.${j.kind === "still" ? "webp" : "{mp4,webm}"}`);
    }
    if (jobs.length > 8) console.log(`  … and ${jobs.length - 8} more`);
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    process.exit(unmatched.length || badPairs.length ? 1 : 0);
  }

  // ── write ─────────────────────────────────────────────────────────────────
  const started = Date.now();
  let done = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  // ~20 progress lines regardless of set size, so even a short run visibly moves.
  const every = Math.max(1, Math.floor(jobs.length / 20));

  for (const j of jobs) {
    fs.mkdirSync(path.dirname(j.out), { recursive: true });
    bytesIn += fs.statSync(j.src).size;

    if (j.kind === "still") {
      await sharp(j.src).webp({ quality: 82, effort: 6 }).toFile(`${j.out}.webp`);
      bytesOut += fs.statSync(`${j.out}.webp`).size;
    } else {
      // Stream copy: the export is already h264 at the target dimensions.
      execFileSync("ffmpeg", ["-y", "-i", j.src, "-c:v", "copy", "-an", "-movflags", "+faststart", `${j.out}.mp4`], { stdio: "ignore" });
      execFileSync(
        "ffmpeg",
        ["-y", "-i", j.src, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-an", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", `${j.out}.webm`],
        { stdio: "ignore" }
      );
      bytesOut += fs.statSync(`${j.out}.mp4`).size + fs.statSync(`${j.out}.webm`).size;
    }

    done++;
    if (done % every === 0 || done === jobs.length) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = done / Math.max(elapsed, 0.001);
      const eta = (jobs.length - done) / Math.max(rate, 0.001);
      console.log(
        `  ${String(done).padStart(3)}/${jobs.length} (${((100 * done) / jobs.length).toFixed(0)}%) · ${rate.toFixed(1)}/s · ETA ${eta.toFixed(0)}s`
      );
    }
  }

  console.log(
    `\nDone. ${jobs.length} outputs · ${(bytesIn / 1048576).toFixed(1)} MB in -> ${(bytesOut / 1048576).toFixed(1)} MB out.`
  );
  console.log("Next: npm run build:landing-manifest && npm run build:landing-video-manifest");
  process.exit(unmatched.length || badPairs.length ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ draw-10 landing conversion failed:", err?.message ?? err);
  process.exit(2);
});
