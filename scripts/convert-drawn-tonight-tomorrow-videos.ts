/**
 * Move the numbered "drawn tonight / drawn tomorrow" landing hero **videos** into the
 * resolver's brand-folder convention: copy each MP4 (audio stripped, faststart) and encode a
 * matching VP9 WebM, then remove the numbered PNG-style source folders.
 *
 * Source (art-team export):
 *   public/videos/landing/drawn-tonight-tomorrow/web-view/WEB WITH BADGES/<1..24>.mp4      (desktop)
 *   public/videos/landing/drawn-tonight-tomorrow/mobile-view/MOBILE WITH BADGES/<1..24>.mp4 (mobile)
 *
 * The numbering matches the still images exactly (verified frame-by-frame):
 *   group of 8 by toolbox: milTB (1-8), kinTB (9-16), sidTB (17-24)
 *   pairs of 2 by brand within a group: milwaukee, dewalt, makita, ryobi
 *   odd = drawn-tomorrow, even = drawn-tonight
 *
 * Output matches getLandingHeroVideoPaths() in landing-video-resolver.ts:
 *   desktop -> videos/landing/{brand}/{brand}-{toolbox}-drawn-{state}.{webm,mp4}
 *   mobile  -> videos/landing/{brand}/{brand}-{toolbox}-mobile-drawn-{state}.{webm,mp4}
 *
 * Requires ffmpeg on PATH. Run: npx tsx scripts/convert-drawn-tonight-tomorrow-videos.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const VIDEO_LANDING_ROOT = path.join(process.cwd(), "public", "videos", "landing");
const DRAWN_ROOT = path.join(VIDEO_LANDING_ROOT, "drawn-tonight-tomorrow");
const WEB_DIR = path.join(DRAWN_ROOT, "web-view", "WEB WITH BADGES");
const MOBILE_DIR = path.join(DRAWN_ROOT, "mobile-view", "MOBILE WITH BADGES");

const TOOLBOXES = ["milTB", "kinTB", "sidTB"] as const; // groups of 8
const BRANDS = ["milwaukee", "dewalt", "makita", "ryobi"] as const; // pairs of 2 within a group
const STATES = ["drawn-tomorrow", "drawn-tonight"] as const; // odd, even within a pair

/** Map a 1-based export number to its brand / toolbox / state (same scheme as the still images). */
function targetForNumber(n: number) {
  const idx = n - 1;
  return {
    toolbox: TOOLBOXES[Math.floor(idx / 8)],
    brand: BRANDS[Math.floor((idx % 8) / 2)],
    state: STATES[(idx % 8) % 2],
  };
}

function destStem(n: number, viewport: "desktop" | "mobile"): string {
  const { brand, toolbox, state } = targetForNumber(n);
  const mobileSuffix = viewport === "mobile" ? "-mobile" : "";
  return path.join(VIDEO_LANDING_ROOT, brand, `${brand}-${toolbox}${mobileSuffix}-${state}`);
}

function mb(n: number): string {
  return (n / 1024 / 1024).toFixed(2);
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

function assertFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg not found on PATH — install it before running this script.");
  }
}

interface Job {
  src: string;
  stem: string; // dest without extension
}

async function buildJobs(): Promise<Job[]> {
  const jobs: Job[] = [];
  for (let n = 1; n <= 24; n++) {
    const web = path.join(WEB_DIR, `${n}.mp4`);
    if (await exists(web)) jobs.push({ src: web, stem: destStem(n, "desktop") });
    const mob = path.join(MOBILE_DIR, `${n}.mp4`);
    if (await exists(mob)) jobs.push({ src: mob, stem: destStem(n, "mobile") });
  }
  return jobs;
}

async function main() {
  assertFfmpeg();
  const jobs = await buildJobs();
  if (jobs.length === 0) {
    console.log("No source MP4s found under", rel(DRAWN_ROOT), "— nothing to do.");
    return;
  }

  console.log(`Converting ${jobs.length} hero clips → MP4 (remux, audio stripped) + VP9 WebM\n`);
  const started = Date.now();
  let totalBefore = 0;
  let totalAfter = 0;

  for (let i = 0; i < jobs.length; i++) {
    const { src, stem } = jobs[i];
    await fs.mkdir(path.dirname(stem), { recursive: true });
    const mp4Out = `${stem}.mp4`;
    const webmOut = `${stem}.webm`;
    const before = (await fs.stat(src)).size;

    // MP4: copy the video stream, drop audio, move moov atom to the front for web streaming.
    execFileSync("ffmpeg", ["-y", "-i", src, "-c:v", "copy", "-an", "-movflags", "+faststart", mp4Out], { stdio: "ignore" });
    // WebM (preferred source): VP9, CRF 34 quality, no audio, multithreaded.
    execFileSync(
      "ffmpeg",
      ["-y", "-i", src, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-an", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", webmOut],
      { stdio: "ignore" }
    );

    const afterMp4 = (await fs.stat(mp4Out)).size;
    const afterWebm = (await fs.stat(webmOut)).size;
    totalBefore += before;
    totalAfter += afterMp4 + afterWebm;
    console.log(`${rel(src)} -> ${rel(webmOut)} (+${rel(mp4Out).split("/").pop()})  mp4 ${mb(afterMp4)}MB · webm ${mb(afterWebm)}MB`);

    const done = i + 1;
    const rate = done / Math.max(0.001, (Date.now() - started) / 1000);
    const eta = ((jobs.length - done) / rate).toFixed(0);
    console.log(`  … ${done}/${jobs.length} (${((done / jobs.length) * 100).toFixed(0)}%) · ${rate.toFixed(2)}/s · ETA ${eta}s`);
  }

  // Remove the numbered source tree.
  if (await exists(DRAWN_ROOT)) await fs.rm(DRAWN_ROOT, { recursive: true, force: true });

  console.log(`\nDone. ${jobs.length} clips · sources ${mb(totalBefore)}MB → outputs ${mb(totalAfter)}MB (webm+mp4).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
