/**
 * Encode the Draw 9 animated landing export into the resolver's brand folders.
 *
 * The video twin of `convert-draw9-landing-to-webp.ts`. Same four-way source split, same
 * `<Toolbox>-<Toolset>-<A|B>[ (n)].mp4` grammar, same decoding rules — and, critically, the
 * SAME nine mis-named files.
 *
 * WHY IT REUSES THE STILL SCRIPT'S EXCEPTIONS RATHER THAN KEEPING ITS OWN COPY
 * The clip set was proven artwork-identical to the still set file-for-file, not assumed:
 *   1. Every clip's final frame was compared to its identically-named still — 230/230
 *      matched. A control confirmed that test separates a wrong toolbox (20.8), wrong
 *      toolset (15.7) and wrong mode (136.3) from a true match (~4.0).
 *   2. That whole-frame test scored a wrong TIER at only 5.0 — inside match noise, because
 *      the countdown badge is a small part of the frame. So a second pass compared just the
 *      badge region across all 152 drawn clips: 152/152 matched, with the control now
 *      separating cleanly (same tier 5.9, different tier 32.9).
 * Importing EXCEPTIONS means a correction can never be applied to the stills and forgotten
 * for the clips.
 *
 * Output matches getLandingHeroVideoPaths() in src/utils/promo/landing-video-resolver.ts:
 *   videos/landing/{brand}/{brand}-{toolbox}[-dark][-mobile][-{urgency}].{webm,mp4}
 *
 * Each clip ships a WebM (VP9, the preferred `<source>`) beside its MP4, matching the
 * existing library. Encoding ~450 outputs takes a while — progress is per-file.
 *
 * Requires ffmpeg on PATH.
 * Run:  npx tsx scripts/convert-draw9-landing-videos.ts            (dry run)
 *       npx tsx scripts/convert-draw9-landing-videos.ts --apply
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EXCEPTIONS } from "./convert-draw9-landing-to-webp";

const VIDEO_ROOT = path.join(process.cwd(), "public", "videos", "landing");
const DEFAULT_SRC = "C:/Users/Genesis/Downloads/DRAW 9 ASSETS";

const APPLY = process.argv.includes("--apply");
const SRC_ROOT = process.argv.find((a, i) => process.argv[i - 1] === "--src") ?? DEFAULT_SRC;

const TOOLBOX: Record<string, string> = { gw: "gwTB", kin: "kinTB", mil: "milTB", sid: "sidTB" };
const TOOLSET: Record<string, string> = {
  dew: "dewalt",
  hik: "hikoki",
  mak: "makita",
  mil: "milwaukee",
  ryo: "ryobi",
};

/**
 * Animated folder ↔ the Static folder whose EXCEPTIONS apply to it. The art team's folder
 * names differ between the two trees (including a double space in two of them), so the
 * pairing is spelled out rather than derived.
 */
const FOLDERS: { animated: string; staticRel: string; viewport: "desktop" | "mobile"; drawn: boolean }[] = [
  { animated: "Animated/D9 BANNERS (WEB) (2)", staticRel: "Static/D9 BANNERS (WEB)", viewport: "desktop", drawn: false },
  { animated: "Animated/D9 Mobile Banners  (2)", staticRel: "Static/D9 Mobile Banners", viewport: "mobile", drawn: false },
  {
    animated: "Animated/D9 BANNERS with DRAWN TONIGHT AND DRAWN TOMORROW (2)",
    staticRel: "Static/DRAW 9 DESKTOP BANNERS (DRAWN TONIGHT TOMORROW)",
    viewport: "desktop",
    drawn: true,
  },
  {
    animated: "Animated/D9 Mobile Banners with (Drawn TonightTomorrow)  (2)",
    staticRel: "Static/DRAW 9 MOBILE BANNERS (DRAWN TONIGHT TOMORROW)",
    viewport: "mobile",
    drawn: true,
  },
];

/** Clips DJ re-exported after the main drop; they live outside the numbered folders. */
const LOOSE_EXTRAS: { src: string; target: string; why: string }[] = [
  {
    src: "C:/Users/Genesis/Downloads/D9 BANNERS with DRAWN TONIGHT AND DRAWN TOMORROW (5)/Mil-Hik-A.mp4",
    target: "hikoki/hikoki-milTB-dark-drawn-tonight",
    why: "Re-export 2026-07-27: the only Milwaukee-box × HiKOKI-kit dark DRAWN TONIGHT desktop clip. 5s/30fps/2560x1044, matching the rest of the drop (a 10s variant of the same art was also supplied and is deliberately ignored).",
  },
];

interface Job {
  src: string;
  stem: string; // target without extension, relative to VIDEO_ROOT
  note: string;
}

function decode(
  name: string,
  folder: (typeof FOLDERS)[number]
): { stem: string; note: string } | null {
  const m = /^([A-Za-z]+)-([A-Za-z]+)-([AB])(?:\s*\((\d+)\))?\.mp4$/i.exec(name);
  if (!m) return null;
  const toolbox = TOOLBOX[m[1].toLowerCase()];
  const brand = TOOLSET[m[2].toLowerCase()];
  if (!toolbox || !brand) return null;

  const dark = m[3].toUpperCase() === "A";
  const dup = m[4] ? Number(m[4]) : 1;
  const urgency = folder.drawn ? (dup === 1 ? "drawn-tomorrow" : "drawn-tonight") : null;

  const stem =
    `${brand}/${brand}-${toolbox}` +
    (dark ? "-dark" : "") +
    (folder.viewport === "mobile" ? "-mobile" : "") +
    (urgency ? `-${urgency}` : "");
  return {
    stem,
    note: `${brand} × ${toolbox} · ${dark ? "dark" : "light"} · ${folder.viewport}${urgency ? ` · ${urgency}` : ""}`,
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function assertFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg not found on PATH — install it before running this script.");
  }
}

async function buildJobs(): Promise<{ jobs: Job[]; skipped: string[]; unmatched: string[] }> {
  const jobs: Job[] = [];
  const skipped: string[] = [];
  const unmatched: string[] = [];
  const claimed = new Map<string, string>();

  const add = (src: string, stem: string, note: string) => {
    const prev = claimed.get(stem);
    if (prev) throw new Error(`Two sources both map to ${stem}:\n  ${prev}\n  ${src}`);
    claimed.set(stem, src);
    jobs.push({ src, stem, note });
  };

  for (const folder of FOLDERS) {
    const dir = path.join(SRC_ROOT, folder.animated);
    if (!(await exists(dir))) throw new Error(`Source folder missing: ${dir}`);

    for (const name of (await fs.readdir(dir)).filter((n) => n.toLowerCase().endsWith(".mp4")).sort()) {
      // EXCEPTIONS are keyed on the STILL filename; the clip of the same name is the same art.
      const key = `${folder.staticRel}|${name.replace(/\.mp4$/i, ".png")}`;
      const override = EXCEPTIONS[key];
      if (override) {
        if (override.target === null) {
          skipped.push(`${folder.animated}/${name} — ${override.why}`);
          continue;
        }
        add(path.join(dir, name), override.target.replace(/\.webp$/, ""), `OVERRIDE: ${override.why}`);
        continue;
      }
      const decoded = decode(name, folder);
      if (!decoded) {
        unmatched.push(`${folder.animated}/${name}`);
        continue;
      }
      add(path.join(dir, name), decoded.stem, decoded.note);
    }
  }

  for (const extra of LOOSE_EXTRAS) {
    if (!(await exists(extra.src))) {
      unmatched.push(`(loose) ${extra.src} — declared but not on disk`);
      continue;
    }
    const idx = jobs.findIndex((j) => j.stem === extra.target);
    if (idx >= 0) {
      skipped.push(`${path.basename(jobs[idx].src)} — superseded by re-export ${path.basename(extra.src)}`);
      jobs.splice(idx, 1);
      claimed.delete(extra.target);
    }
    add(extra.src, extra.target, `RE-EXPORT: ${extra.why}`);
  }

  return { jobs, skipped, unmatched };
}

async function main() {
  assertFfmpeg();
  console.log(`Source : ${SRC_ROOT}`);
  console.log(`Target : ${path.relative(process.cwd(), VIDEO_ROOT).replace(/\\/g, "/")}`);
  console.log(`Mode   : ${APPLY ? "APPLY (encodes files)" : "DRY RUN (no writes — pass --apply)"}\n`);

  const { jobs, skipped, unmatched } = await buildJobs();

  if (unmatched.length) {
    console.error(`${unmatched.length} source file(s) could not be decoded:`);
    for (const u of unmatched) console.error(`  ${u}`);
    console.error("");
  }
  if (skipped.length) {
    console.log(`Skipping ${skipped.length}:`);
    for (const s of skipped) console.log(`  - ${s}`);
    console.log("");
  }

  console.log(`${jobs.length} clip(s) -> ${jobs.length * 2} outputs (MP4 remux + VP9 WebM)\n`);

  if (!APPLY) {
    for (const j of jobs) console.log(`  ${path.basename(j.src).padEnd(24)} -> ${j.stem}.{webm,mp4}`);
    console.log(`\nDry run complete. Re-run with --apply.`);
    return;
  }

  const started = Date.now();
  let before = 0;
  let after = 0;
  const audit: string[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const stem = path.join(VIDEO_ROOT, j.stem);
    await fs.mkdir(path.dirname(stem), { recursive: true });
    const mp4Out = `${stem}.mp4`;
    const webmOut = `${stem}.webm`;
    const bIn = (await fs.stat(j.src)).size;

    // MP4: copy the video stream, drop audio, move the moov atom up front for streaming.
    execFileSync("ffmpeg", ["-y", "-i", j.src, "-c:v", "copy", "-an", "-movflags", "+faststart", mp4Out], {
      stdio: "ignore",
    });
    // WebM: VP9 CRF 34 — the preferred source; ~40-60% smaller than the MP4.
    execFileSync(
      "ffmpeg",
      ["-y", "-i", j.src, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-an", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", webmOut],
      { stdio: "ignore" }
    );

    const aMp4 = (await fs.stat(mp4Out)).size;
    const aWebm = (await fs.stat(webmOut)).size;
    before += bIn;
    after += aMp4 + aWebm;
    audit.push(`"${j.src.replace(/"/g, '""')}","${j.stem}",${bIn},${aMp4},${aWebm},"${j.note.replace(/"/g, '""')}"`);

    const done = i + 1;
    const rate = done / Math.max(0.001, (Date.now() - started) / 1000);
    console.log(
      `  ${String(done).padStart(3)}/${jobs.length} (${((done / jobs.length) * 100).toFixed(0)}%) ${j.stem}  ·  ${rate.toFixed(2)}/s · ETA ${(((jobs.length - done) / rate) / 60).toFixed(1)}min`
    );
  }

  const auditPath = path.join(process.cwd(), "draw9-landing-video-audit.csv");
  await fs.appendFile(
    auditPath,
    ((await exists(auditPath)) ? "" : "source,stem,bytes_in,bytes_mp4,bytes_webm,note\n") + audit.join("\n") + "\n",
    "utf8"
  );

  console.log(
    `\nDone. ${jobs.length} clips · ${(before / 1024 / 1024).toFixed(1)} MB in -> ${(after / 1024 / 1024).toFixed(1)} MB out (mp4+webm).`
  );
  console.log(`Audit: ${path.basename(auditPath)}`);
  console.log("Next: npm run build:landing-video-manifest");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
