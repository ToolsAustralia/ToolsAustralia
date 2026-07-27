/**
 * Join several finished proof clips into ONE deliverable, video + narration + subtitles.
 *
 * Why this exists: Playwright fixes a context's video canvas when the context is created and
 * never rescales it, so a single test that calls `setViewportSize` to a phone mid-recording
 * composites the page into a small strip anchored top-left with the rest dead grey
 * (frame-verified, 2026-07-24). The only way to record BOTH a real phone viewport and a full
 * desktop viewport well is one test per Playwright project — which yields one clip each.
 * This joins them back into the single video a reviewer actually wants to watch.
 *
 * Each input is scaled to fit a common 1280x720 canvas and padded, so a portrait phone clip
 * sits pillarboxed and centred instead of stretched. The pad colour matches the proof title
 * card (#0b0b0e) so the letterboxing reads as part of the piece rather than a broken encode.
 * Sibling `.srt` files are concatenated with each clip's start offset applied, so subtitles
 * stay in sync across the seam.
 *
 * Run: npx tsx e2e/proof/join.ts <out-name> <clipA.mp4> <clipB.mp4> [...]
 * The output is written next to the FIRST clip's parent directory.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { toSrt, type Cue } from "./srt";

/** Common output canvas. 720p keeps the desktop leg native and gives the phone leg real height. */
const CANVAS = { width: 1280, height: 720 } as const;
/** Matches the proof title card, so pillarbox bars look deliberate. */
const PAD_COLOR = "#0b0b0e";
const FPS = 30;

function ff(args: string[]): boolean {
  const r = spawnSync(ffmpegPath as unknown as string, args, { encoding: "utf8" });
  if (r.status !== 0) console.error(`[join] ffmpeg failed: ${r.stderr?.slice(-600)}`);
  return r.status === 0;
}

/**
 * ffmpeg-static ships no ffprobe binary, so both of these read `ffmpeg -i <file>` stderr —
 * the same approach post.ts already uses for durations. `ffmpeg -i` with no output exits
 * non-zero by design; the metadata we want is printed before it gives up.
 */
function probe(file: string): string {
  return spawnSync(ffmpegPath as unknown as string, ["-i", file], { encoding: "utf8" }).stderr ?? "";
}

function durationMs(file: string): number | null {
  const m = probe(file).match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return null;
  const [, h, min, s, cs] = m;
  return ((+h * 60 + +min) * 60 + +s) * 1000 + +cs * 10;
}

/** A clip whose voice synthesis failed has no audio stream; concat needs every input to match. */
function hasAudio(file: string): boolean {
  return /Stream #\d+:\d+.*: Audio:/.test(probe(file));
}

/** Parse a shipped .srt back into cues so the joined file can be re-timed and renumbered. */
function parseSrt(text: string): Cue[] {
  const toMs = (t: string): number => {
    const m = t.match(/(\d+):(\d+):(\d+),(\d+)/);
    if (!m) return 0;
    const [, h, min, s, ms] = m;
    return ((+h * 60 + +min) * 60 + +s) * 1000 + +ms;
  };
  return text
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/).filter(Boolean))
    .filter((lines) => lines.length >= 3 && lines[1]?.includes("-->"))
    .map((lines) => {
      const [start, end] = lines[1].split("-->");
      return { title: lines.slice(2).join(" ").trim(), startMs: toMs(start), endMs: toMs(end) };
    });
}

function main(): void {
  const [outName, ...clips] = process.argv.slice(2);
  if (!outName || clips.length < 2) {
    console.error("Usage: tsx e2e/proof/join.ts <out-name> <clipA.mp4> <clipB.mp4> [...]");
    process.exit(2);
  }

  const missing = clips.filter((c) => !fs.existsSync(c));
  if (missing.length) {
    console.error(`[join] missing input(s):\n${missing.map((m) => `  ${m}`).join("\n")}`);
    process.exit(1);
  }

  const outDir = path.dirname(path.dirname(clips[0]));
  const outMp4 = path.join(outDir, `${outName}.mp4`);
  const outSrt = path.join(outDir, `${outName}.srt`);

  console.log(`[join] ${clips.length} clips -> ${path.relative(process.cwd(), outMp4)}`);
  for (const c of clips) {
    const d = durationMs(c);
    console.log(`  ${path.basename(c)}  ${d == null ? "unknown" : (d / 1000).toFixed(1) + "s"}${hasAudio(c) ? "" : "  (no audio)"}`);
  }

  /**
   * Normalise every input to the same canvas, SAR, and frame rate before concat — the
   * concat filter refuses inputs whose dimensions or timebases differ, which is exactly the
   * case here (a portrait phone clip beside a landscape desktop one). Silent audio is
   * substituted for any clip that has none so the audio leg of the concat stays balanced.
   */
  const parts: string[] = [];
  const streams: string[] = [];
  clips.forEach((_, i) => {
    parts.push(
      `[${i}:v]scale=${CANVAS.width}:${CANVAS.height}:force_original_aspect_ratio=decrease,` +
        `pad=${CANVAS.width}:${CANVAS.height}:(ow-iw)/2:(oh-ih)/2:color=${PAD_COLOR},` +
        `setsar=1,fps=${FPS}[v${i}]`
    );
    streams.push(`[v${i}][a${i}]`);
  });
  clips.forEach((c, i) => {
    if (hasAudio(c)) parts.push(`[${i}:a]aresample=48000,asetpts=N/SR/TB[a${i}]`);
    else parts.push(`anullsrc=channel_layout=mono:sample_rate=48000[a${i}]`);
  });
  parts.push(`${streams.join("")}concat=n=${clips.length}:v=1:a=1[v][a]`);

  const args = [
    ...clips.flatMap((c) => ["-i", c]),
    "-filter_complex",
    parts.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    "-y",
    outMp4,
  ];

  if (!ff(args)) {
    console.error("[join] failed to write the joined video");
    process.exit(1);
  }

  // Subtitles: shift each clip's cues by everything that plays before it, then renumber.
  const cues: Cue[] = [];
  let offset = 0;
  for (const clip of clips) {
    const srt = clip.replace(/\.mp4$/i, ".srt");
    if (fs.existsSync(srt)) {
      for (const cue of parseSrt(fs.readFileSync(srt, "utf8"))) {
        cues.push({ title: cue.title, startMs: cue.startMs + offset, endMs: cue.endMs + offset });
      }
    } else {
      console.warn(`[join] no sibling .srt for ${path.basename(clip)} — that section will be uncaptioned`);
    }
    offset += durationMs(clip) ?? 0;
  }
  if (cues.length) fs.writeFileSync(outSrt, toSrt(cues), "utf8");

  const total = durationMs(outMp4);
  console.log(
    `[join] done: ${path.relative(process.cwd(), outMp4)}` +
      `${total == null ? "" : ` (${(total / 1000 / 60).toFixed(1)} min)`}` +
      `${cues.length ? `, ${cues.length} subtitle cues` : ""}`
  );
}

main();
