/**
 * Encode the Draw 10 URGENCY landing export — the `-drawn-tomorrow` / `-drawn-tonight` heroes,
 * stills AND clips — into the resolver's brand folders.
 *
 * This is the companion to `convert-draw10-landing-assets.ts`, which installs the BASE (badge-free)
 * heroes. That script's header ends "NO URGENCY TIERS. … Re-run with a tier-bearing drop when that
 * art exists." This is that drop, and it is a separate script because the source grammar gained a
 * second axis the base converter cannot express (see DUPLICATE SUFFIX below).
 *
 * WHY THE TIERS ARE EMPTY TODAY. `check-landing-hero-assets.mjs` records that the draw-9 tier art
 * was WITHDRAWN on 2026-08-28, not lost: all 160 files baked `& $5K CASH` into the headline and
 * draw 10 removed that bonus. Deleting them made `resolveLandingHeroImage` drop the tier and serve
 * the (correct) base hero. This export is the replacement, and its headline copy was verified
 * against the live base before installing — see COPY VERIFICATION below.
 *
 * ── source grammar ──────────────────────────────────────────────────────────────────────────
 *   "<ToolboxLetter><ToolsetCode> - <n>[ (2)].png|mp4"             desktop
 *   "<ToolboxLetter><ToolsetCode> - Square - <n>[ (2)].png|mp4"    mobile
 *
 *   toolbox letter   G GearWrench · K Kincrome · M Milwaukee · S Sidchrome
 *   toolset code     D DeWalt · H HiKOKI · M Milwaukee · Mak Makita · R Ryobi · S STIHL
 *
 * As in the base drop the source puts the TOOLBOX first while the output path is keyed by TOOLSET,
 * so the mapping is asserted below rather than assumed.
 *
 * ── DUPLICATE SUFFIX = THE TIER AXIS ────────────────────────────────────────────────────────
 * Each (toolbox × toolset × viewport) ships FOUR files, not two:
 *
 *     GD - 1.png    GD - 1 (2).png    GD - 2.png    GD - 2 (2).png
 *
 * The trailing digit is the light/dark axis (still MEASURED, never parsed — see below). The
 * ` (2)` is the filesystem's duplicate-name marker: the designer's two tier folders were
 * extracted over each other, so the second copy of every name got renamed by the OS.
 *
 *   plain name  -> drawn-tomorrow
 *   " (2)"      -> drawn-tonight
 *
 * That mapping was VERIFIED BY EYE on eight files spanning every class it has to hold for —
 * desktop light (GD - 1), desktop dark (GD - 2), mobile light (MS - Square - 1), mobile dark
 * (MS - Square - 2), and a desktop clip (GMak - 1) — and then re-checked across the whole drop
 * from the contact sheets this script emits (`--sheets`). It is an observation about ONE export,
 * not a rule: a re-download in the other order flips it. Regenerate the sheets and look at them
 * before trusting a new drop, exactly as the base converter says of its numbering.
 *
 * LIGHT vs DARK IS MEASURED, NEVER PARSED — same reason as the base drop, and the same two files
 * prove it: this export still contains `GS - Square - 28` and `KS - Square - 22` where `1` was
 * meant, in the stills AND the clips. Each group of four is sorted by mean luminance; the two
 * brightest are light, the two darkest dark. For clips the frame is sampled at 2s because they
 * open on a white fade-in that makes frame 0 useless for the comparison.
 *
 * COPY VERIFICATION (why this drop is safe where draw 9 was not). Before installing, every new
 * file's headline region was compared against the live base hero for the same brand × toolbox ×
 * mode: 24/24 mobile combos and 40/48 desktop combos are pixel-identical to what is already
 * serving, and the 8 that differ were read by eye. None carries `& $5K CASH`; all read
 * "OR TAKE HOME $10,000". The tier art also carries the same headline as its own base, so a
 * countdown rollover never changes the offer — only the badge.
 *
 * NOT EVERY TIER FILE IS ITS BASE PLUS A BADGE. Roughly half the drop is a fresh render: on 27 of
 * 48 desktop and 12 of 48 mobile (combo × mode) groups the product arrangement, model pose and
 * layout all changed (13-34% of pixels), while the rest differ only 2-5% (badge added to the same
 * photo). That is cosmetic, not a defect — but it does mean a countdown rollover visibly re-shoots
 * the hero on those pages, and it is why light/dark cannot be inferred by diffing against the base.
 *
 * Output matches the resolvers in src/utils/promo/landing-{image,video}-resolver.ts, which append
 * the tier AFTER dark and mobile:
 *   images/background/promo/landing/{brand}/{brand}-{toolbox}[-dark][-mobile]-{urgency}.webp
 *   videos/landing/{brand}/{brand}-{toolbox}[-dark][-mobile]-{urgency}.{webm,mp4}
 *
 * Each clip ships a WebM (VP9 — the resolver's preferred `<source>`) beside its MP4, matching the
 * existing library; encode settings are copied from `convert-draw10-landing-assets.ts` so the
 * generations stay byte-comparable. MP4 is a stream COPY: the export is already h264 at the right
 * dimensions (2560x1044 desktop, 1080x1164 mobile, 30fps, 5.000s — verified identical to the
 * shipped base clips), so re-encoding would only lose quality.
 *
 * Requires ffmpeg on PATH (clips only).
 * Run:  npx tsx scripts/convert-draw10-urgency-landing-assets.ts                    (dry run)
 *       npx tsx scripts/convert-draw10-urgency-landing-assets.ts --sheets           (dry run + contact sheets)
 *       npx tsx scripts/convert-draw10-urgency-landing-assets.ts --apply
 *       npx tsx scripts/convert-draw10-urgency-landing-assets.ts --apply --only=clips
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
 * where they arrive in practice, but is overridable so this is not one machine's script:
 *   DRAW10_SOURCE_DIR=/path/to/exports npx tsx scripts/convert-draw10-urgency-landing-assets.ts
 *   npx tsx scripts/convert-draw10-urgency-landing-assets.ts --source=/path/to/exports
 *
 * The `(2)` / `(3)` folder suffixes are the same OS duplicate markers as the per-file ones: the
 * base drop extracted first as "" and "(1)", so this one landed beside it. Overridable per folder
 * for a drop that arrives under different names.
 */
const DOWNLOADS =
  process.argv.find((a) => a.startsWith("--source="))?.slice("--source=".length) ??
  process.env.DRAW10_SOURCE_DIR ??
  path.join(os.homedir(), "Downloads");
const SOURCES = [
  { dir: `${DOWNLOADS}/D10 - LANDING PAGES (DESKTOP VIEW) (2)`, viewport: "desktop" as const, kind: "still" as const },
  { dir: `${DOWNLOADS}/D10 - LANDING PAGES (MOBILE VIEW) (2)`, viewport: "mobile" as const, kind: "still" as const },
  { dir: `${DOWNLOADS}/D10 - LANDING PAGES (DESKTOP VIEW) (3)`, viewport: "desktop" as const, kind: "clip" as const },
  { dir: `${DOWNLOADS}/D10 - LANDING PAGES (MOBILE VIEW) (3)`, viewport: "mobile" as const, kind: "clip" as const },
];

const TOOLBOX: Record<string, string> = { G: "gwTB", K: "kinTB", M: "milTB", S: "sidTB" };
const TOOLSET: Record<string, string> = { D: "dewalt", H: "hikoki", M: "milwaukee", Mak: "makita", R: "ryobi", S: "stihl" };

/** Tier names as `LandingHeroUrgency` spells them — these become the filename suffix verbatim. */
const TOMORROW = "drawn-tomorrow";
const TONIGHT = "drawn-tonight";

const APPLY = process.argv.includes("--apply");
const SHEETS = process.argv.includes("--sheets");
const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const ONLY: "stills" | "clips" | null = onlyArg === "stills" || onlyArg === "clips" ? onlyArg : null;
const SHEET_DIR =
  process.argv.find((a) => a.startsWith("--sheet-dir="))?.slice("--sheet-dir=".length) ??
  path.join(process.cwd(), ".landing-urgency-sheets");

type Viewport = "desktop" | "mobile";
type Kind = "still" | "clip";

interface Job {
  src: string;
  name: string;
  kind: Kind;
  viewport: Viewport;
  toolset: string;
  toolbox: string;
  /** true when the OS appended a duplicate marker — the tier axis. */
  dup: boolean;
  luma: number;
}

type PlacedJob = Job & { mode: "light" | "dark"; urgency: string; out: string };

/** `GMak - Square - 1 (2)` -> toolbox gwTB, toolset makita, dup true. Null for anything unparseable. */
function decode(stem: string): { toolbox: string; toolset: string; dup: boolean } | null {
  const m = stem.match(/^([GKMS])(Mak|D|H|M|R|S)\s*-\s*(?:Square\s*-\s*)?(\d+)(?:\s*\((\d+)\))?$/);
  if (!m) return null;
  return { toolbox: TOOLBOX[m[1]], toolset: TOOLSET[m[2]], dup: m[4] != null };
}

async function meanLuma(file: string, kind: Kind): Promise<number> {
  if (kind === "still") {
    const s = await sharp(file).resize(240, null, { fit: "inside" }).greyscale().stats();
    return s.channels[0].mean;
  }
  /**
   * Clips fade in from white — frame 0 tells you nothing, so sample at 2s. The frame is PIPED,
   * never written to a temp file: reusing one temp path per call made `sharp` serve a CACHED
   * decode of the previous clip in the base converter, silently flipping a light clip to dark.
   */
  const png = execFileSync(
    "ffmpeg",
    ["-v", "error", "-ss", "2", "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  const s = await sharp(png).resize(240, null, { fit: "inside" }).greyscale().stats();
  return s.channels[0].mean;
}

/** A still, or a clip's 2s frame, as a PNG buffer — the contact sheets treat both the same. */
function frameBuffer(job: Job): Buffer | string {
  if (job.kind === "still") return job.src;
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-ss", "2", "-i", job.src, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
    { maxBuffer: 64 * 1024 * 1024 }
  );
}

function requireFfmpeg(): void {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg not found on PATH — install it before running this script.");
  }
}

function rel(abs: string): string {
  return path.relative(process.cwd(), abs).replace(/\\/g, "/");
}

/**
 * Contact sheet for human sign-off on the tier assignment.
 *
 * The badge sits low in the frame but its horizontal position moves — right of centre on desktop,
 * either side on mobile — so the crop is a generous band rather than a tight box, and the pair is
 * laid out side by side (left = the file this script called drawn-tomorrow, right = drawn-tonight)
 * so a swap reads as an obvious mismatch instead of something you have to hunt for.
 *
 * This exists because the tier CANNOT be measured the way light/dark can: both files in a pair are
 * equally bright, and half of them are separate renders, so there is no reference to diff against.
 * A person reading the word is the check.
 */
async function writeSheets(jobs: PlacedJob[]): Promise<void> {
  const CELL_W = 320;
  const PAIRS_PER_ROW = 4;

  const groups = new Map<string, PlacedJob[]>();
  for (const j of jobs) {
    const key = `${j.kind}|${j.viewport}|${j.toolset}|${j.toolbox}|${j.mode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(j);
  }

  const bySheet = new Map<string, { label: string; pair: PlacedJob[] }[]>();
  for (const [key, pair] of [...groups].sort()) {
    const [kind, viewport, toolset, toolbox, mode] = key.split("|");
    const sheet = `${kind}-${viewport}`;
    if (!bySheet.has(sheet)) bySheet.set(sheet, []);
    bySheet.get(sheet)!.push({ label: `${toolset} ${toolbox} ${mode}`, pair });
  }

  fs.mkdirSync(SHEET_DIR, { recursive: true });

  for (const [sheet, entries] of [...bySheet].sort()) {
    const viewport = sheet.endsWith("mobile") ? "mobile" : "desktop";
    const cells: { buf: Buffer; label: string }[] = [];

    for (const { label, pair } of entries) {
      const tomorrow = pair.find((p) => p.urgency === TOMORROW)!;
      const tonight = pair.find((p) => p.urgency === TONIGHT)!;
      for (const [tier, job] of [["tomorrow", tomorrow], ["tonight", tonight]] as const) {
        const input = frameBuffer(job);
        const meta = await sharp(input).metadata();
        const w = meta.width!;
        const h = meta.height!;
        // Desktop: right-of-centre band. Mobile: full width, lower half. Both clear the copy block.
        const region =
          viewport === "desktop"
            ? { left: Math.round(w * 0.56), top: Math.round(h * 0.46), width: Math.round(w * 0.44), height: Math.round(h * 0.54) }
            : { left: 0, top: Math.round(h * 0.44), width: w, height: Math.round(h * 0.5) };
        const buf = await sharp(input).extract(region).resize(CELL_W, null, { fit: "inside" }).png().toBuffer();
        cells.push({ buf, label: `${label} · ${tier}` });
      }
    }

    const cellH = (await sharp(cells[0].buf).metadata()).height!;
    const LABEL_H = 16;
    const rowH = cellH + LABEL_H;
    const cols = PAIRS_PER_ROW * 2;
    const rows = Math.ceil(cells.length / cols);
    const composite: sharp.OverlayOptions[] = [];

    cells.forEach((c, i) => {
      const cx = (i % cols) * CELL_W;
      const cy = Math.floor(i / cols) * rowH;
      composite.push({ input: c.buf, left: cx, top: cy + LABEL_H });
      const text = c.label.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      composite.push({
        input: Buffer.from(
          `<svg width="${CELL_W}" height="${LABEL_H}"><rect width="${CELL_W}" height="${LABEL_H}" fill="#111"/>` +
            `<text x="4" y="12" font-family="monospace" font-size="11" fill="#fff">${text}</text></svg>`
        ),
        left: cx,
        top: cy,
      });
    });

    const out = path.join(SHEET_DIR, `${sheet}.png`);
    await sharp({
      create: { width: cols * CELL_W, height: rows * rowH, channels: 3, background: { r: 20, g: 20, b: 20 } },
    })
      .composite(composite)
      .png()
      .toFile(out);
    console.log(`  sheet: ${rel(out)}  (${cells.length} cells, ${cols * CELL_W}x${rows * rowH})`);
  }
}

async function main(): Promise<void> {
  const wantStills = ONLY !== "clips";
  const wantClips = ONLY !== "stills";
  if (wantClips || SHEETS) requireFfmpeg();

  console.log(`Draw 10 URGENCY landing assets — ${APPLY ? "APPLY" : "DRY RUN"}${ONLY ? ` (only ${ONLY})` : ""}\n`);

  // ── collect ───────────────────────────────────────────────────────────────
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
        dup: d.dup,
        luma: await meanLuma(file, s.kind),
      });
    }
  }

  // Not one source folder existed. That is a wrong-machine / wrong-path error, not an empty job
  // list, and exiting 0 here would read as "nothing to convert" — so say so and stop.
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

  // ── resolve mode (measured) then tier (duplicate marker) ──────────────────
  const jobs: PlacedJob[] = [];
  const badGroups: string[] = [];

  for (const [key, files] of [...groups].sort()) {
    if (files.length !== 4) {
      badGroups.push(`${key}: expected 4 files (2 modes x 2 tiers), got ${files.length} (${files.map((f) => f.name).join(", ")})`);
      continue;
    }
    const sorted = [...files].sort((a, b) => b.luma - a.luma);
    const pairs = [
      { mode: "light" as const, files: sorted.slice(0, 2) },
      { mode: "dark" as const, files: sorted.slice(2) },
    ];

    /**
     * A light/dark split that is not clearly bimodal means the group is not what we think it is —
     * four files of one mode, say, or a mispaired combo. Installing that silently would put a dark
     * hero in the light slot, which no later check catches because both files are valid images.
     */
    const gap = sorted[1].luma - sorted[2].luma;
    const spread = Math.max(sorted[0].luma - sorted[1].luma, sorted[2].luma - sorted[3].luma);
    if (gap <= spread) {
      badGroups.push(
        `${key}: light/dark split is not bimodal (lumas ${sorted.map((f) => f.luma.toFixed(1)).join(", ")}) — ` +
          `gap ${gap.toFixed(1)} vs within-mode spread ${spread.toFixed(1)}`
      );
      continue;
    }

    let ok = true;
    for (const { mode, files: pair } of pairs) {
      const plain = pair.filter((f) => !f.dup);
      const dupes = pair.filter((f) => f.dup);
      if (plain.length !== 1 || dupes.length !== 1) {
        badGroups.push(
          `${key} ${mode}: need exactly one plain + one "(2)" file for the tier split, got ` +
            `${plain.length} plain / ${dupes.length} dup (${pair.map((f) => f.name).join(", ")})`
        );
        ok = false;
      }
    }
    if (!ok) continue;

    for (const { mode, files: pair } of pairs) {
      for (const f of pair) {
        const urgency = f.dup ? TONIGHT : TOMORROW;
        const root = f.kind === "still" ? IMAGE_ROOT : VIDEO_ROOT;
        const stem = `${f.toolset}-${f.toolbox}${mode === "dark" ? "-dark" : ""}${f.viewport === "mobile" ? "-mobile" : ""}-${urgency}`;
        jobs.push({ ...f, mode, urgency, out: path.join(root, f.toolset, stem) });
      }
    }
  }

  if (badGroups.length) {
    console.error(`${badGroups.length} unusable group(s) — NOT installed:`);
    for (const b of badGroups) console.error(`  ${b}`);
    console.error("");
  }

  const stills = jobs.filter((j) => j.kind === "still");
  const clips = jobs.filter((j) => j.kind === "clip");
  console.log(`  ${jobs.length} outputs: ${stills.length} stills, ${clips.length} clips (each clip -> mp4 + webm)`);
  console.log(
    `  ${groups.size} groups across ${new Set(jobs.map((j) => j.toolset)).size} brands · ` +
      `${jobs.filter((j) => j.urgency === TOMORROW).length} drawn-tomorrow / ${jobs.filter((j) => j.urgency === TONIGHT).length} drawn-tonight\n`
  );

  // The digit is advisory only — report where it disagreed with the measurement, as the base
  // converter does, so a mis-numbered export is visible rather than silently corrected.
  const renumbered = jobs.filter((j) => {
    const stem = j.name.replace(/\.(png|mp4)$/i, "");
    const digit = stem.match(/(\d+)(?:\s*\(\d+\))?$/)?.[1];
    return digit !== (j.mode === "light" ? "1" : "2");
  });
  if (renumbered.length) {
    console.log(`  ${renumbered.length} mis-numbered source file(s), resolved by LUMINANCE:`);
    for (const j of renumbered) {
      console.log(`    ${j.name.padEnd(26)} luma ${j.luma.toFixed(0).padStart(3)} -> ${j.mode.padEnd(5)} ${path.basename(j.out)}`);
    }
    console.log("");
  }

  if (SHEETS) {
    console.log(`  writing tier verification contact sheets to ${rel(SHEET_DIR)}/ …`);
    await writeSheets(jobs);
    console.log("  READ THE SHEETS: left cell of each pair must say DRAWN TOMORROW, right DRAWN TONIGHT.\n");
  }

  if (!APPLY) {
    for (const j of jobs.slice(0, 8)) {
      console.log(`  ${j.name.padEnd(26)} -> ${rel(j.out)}.${j.kind === "still" ? "webp" : "{mp4,webm}"}`);
    }
    if (jobs.length > 8) console.log(`  … and ${jobs.length - 8} more`);
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    process.exit(unmatched.length || badGroups.length ? 1 : 0);
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

  console.log(`\nDone. ${jobs.length} outputs · ${(bytesIn / 1048576).toFixed(1)} MB in -> ${(bytesOut / 1048576).toFixed(1)} MB out.`);
  console.log("Next: npm run build:landing-manifest && npm run build:landing-video-manifest && npm run check:promo-landing-assets");
  process.exit(unmatched.length || badGroups.length ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ draw-10 urgency landing conversion failed:", err?.message ?? err);
  process.exit(2);
});
