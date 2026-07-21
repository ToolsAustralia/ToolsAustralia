import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { toSrt, type Cue } from "./srt";
import { ARTIFACTS_DIR, PROOF_DIR } from "../lib/paths";

const RESULTS = path.join(ARTIFACTS_DIR, "test-results");
// en-AU neural voice — verified against node_modules/msedge-tts's Edge Read Aloud voice
// list (Microsoft's standard Australian English neural voice catalogue: Natasha/William).
const VOICE = "en-AU-NatashaNeural";

function ff(args: string[]): boolean {
  const r = spawnSync(ffmpegPath as unknown as string, args, { encoding: "utf8" });
  if (r.status !== 0) console.warn(`[proof] ffmpeg failed: ${r.stderr?.slice(-400)}`);
  return r.status === 0;
}

/** ffmpeg subtitles filter needs escaped Windows paths. */
function subPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/**
 * ffmpeg-static ships no ffprobe binary — duration comes from `ffmpeg -i <file>` stderr
 * instead. ffmpeg always logs the input's `Duration: HH:MM:SS.cc` line there before
 * complaining about the missing output, so this works even with no `-y`/output arg.
 * Returns null if the line can't be parsed (e.g. a corrupt/incomplete recording) — callers
 * must treat that as "duration unknown", not zero.
 */
function probeDurationMs(file: string): number | null {
  const r = spawnSync(ffmpegPath as unknown as string, ["-i", file], { encoding: "utf8" });
  const m = /Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/.exec(r.stderr ?? "");
  if (!m) return null;
  const [, h, mi, s, cs] = m;
  return (Number(h) * 3600 + Number(mi) * 60 + Number(s)) * 1000 + Number(cs) * 10;
}

/**
 * msedge-tts's `toFile(dirPath, input)` API (verified against
 * node_modules/msedge-tts/dist/MsEdgeTTS.js) treats its first argument as an existing
 * OUTPUT DIRECTORY, not a filename — internally it always writes `<dirPath>/audio.<ext>`
 * (see `_rawSSMLRequestToFile`: `joinPath(dirPath, "audio." + extension)`) and the
 * directory must already exist (`fs.createWriteStream` does not mkdir). So each cue gets
 * its own subdirectory here, and the returned `audioFilePath` is used as-is rather than
 * assumed to be `cue-<i>` — this differs from the brief's draft, which passed a bare file
 * basename as `dirPath`.
 */
async function synthVoice(cues: Cue[], dir: string): Promise<string[] | null> {
  let tts: import("msedge-tts").MsEdgeTTS | undefined;
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    tts = new MsEdgeTTS();
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const files: string[] = [];
    for (let i = 0; i < cues.length; i++) {
      const cueDir = path.join(dir, `cue-${i}`);
      fs.mkdirSync(cueDir, { recursive: true });
      const { audioFilePath } = await tts.toFile(cueDir, cues[i].title);
      files.push(audioFilePath);
    }
    return files;
  } catch (e) {
    console.warn(`[proof] AI voice unavailable (${(e as Error).message}) — emitting subtitled video only.`);
    return null;
  } finally {
    // A mid-loop `toFile` throw (e.g. cue 3 of 5 fails) must not leave the WebSocket open:
    // `close()` is what releases the connection's open handle from Node's event loop, and
    // post.ts is launched by run.ts's `spawnAsync` with no timeout — a leaked socket here
    // means `npm run e2e:proof` hangs forever waiting for a process that will never exit
    // on its own. Guarded because closing an already-errored/closed socket must never
    // throw OUT of this finally (that would still leak the loop, just via a different
    // path) — best-effort only.
    try { tts?.close(); } catch { /* best-effort */ }
  }
}

async function processOne(dir: string, dateBranchDir: string): Promise<void> {
  const webm = path.join(dir, "video.webm");
  const narration = path.join(dir, "narration.json");
  if (!fs.existsSync(webm) || !fs.existsSync(narration)) return;

  const meta = JSON.parse(fs.readFileSync(narration, "utf8")) as { testTitle: string; cues: { title: string; startMs: number }[]; endMs: number };
  const cues: Cue[] = meta.cues.map((c, i) => ({
    title: c.title,
    startMs: c.startMs,
    endMs: (meta.cues[i + 1]?.startMs ?? meta.endMs) - 200,
  }));

  // The last cue's endMs is derived from `meta.endMs`, timestamped at the demo fixture's
  // flush() — which runs after the test body returns (fixture teardown), and so can run
  // past the actual recorded video length (measured overrun: srt ending 22.965s vs a
  // 20.16s mp4). Clamp it to the real video duration so the .srt never asserts a cue past
  // the mp4's last frame. `durationMs == null` (unparseable ffmpeg output) leaves the cue
  // as-is rather than guessing.
  const durationMs = probeDurationMs(webm);
  if (durationMs != null && cues.length) {
    const last = cues[cues.length - 1];
    last.endMs = Math.max(last.startMs + 200, Math.min(last.endMs, durationMs - 100));
  }

  const slug = meta.testTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
  const outDir = path.join(dateBranchDir, slug);
  fs.mkdirSync(outDir, { recursive: true });

  const srtFile = path.join(outDir, `${slug}.srt`);
  fs.writeFileSync(srtFile, toSrt(cues));

  const mp4 = path.join(outDir, `${slug}.mp4`);
  if (!ff(["-y", "-i", webm, "-vf", `subtitles='${subPath(srtFile)}'`, "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4])) return;

  // Voice synthesis writes into a scratch dir under outDir; cleaned up after muxing
  // regardless of success so a run never leaves per-cue audio.mp3/metadata.json litter
  // behind in the shipped proof bundle.
  const voiceScratch = path.join(outDir, ".voice-tmp");
  const clips = await synthVoice(cues, voiceScratch);
  if (clips && clips.length) {
    const inputs = clips.flatMap((c) => ["-i", c]);
    const delays = clips.map((_, i) => `[${i + 1}:a]adelay=${cues[i].startMs}|${cues[i].startMs}[a${i}]`).join(";");
    const mix = clips.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${clips.length}:normalize=0[aout]`;
    const voiced = path.join(outDir, `${slug}.voiced.mp4`);
    // No `-shortest`: the synthesized voice-over mix (adelay'd clips, one per cue) almost
    // always finishes well before the recorded video does — the video keeps rolling through
    // test teardown after the last spoken line. `-shortest` truncates the OUTPUT to the
    // shorter of the two mapped streams, which silently chopped the video (and the burned-in
    // final caption's own display window — measured: caption ends at 23.449s, `-shortest`
    // cut the shipped mp4 to 20.06s, discarding the last ~3.4s of video mid-caption) down to
    // the voice track's length. Omitting it lets the video's own (longer, correct) length win;
    // the mixed audio just plays out and then goes silent for the remaining frames.
    if (ff(["-y", "-i", mp4, ...inputs, "-filter_complex", `${delays};${mix}`, "-map", "0:v", "-map", "[aout]", "-c:v", "copy", voiced])) {
      fs.renameSync(voiced, mp4);
    }
  }
  fs.rmSync(voiceScratch, { recursive: true, force: true });

  for (const png of fs.readdirSync(dir).filter((f) => f.startsWith("step-") && f.endsWith(".png"))) {
    fs.copyFileSync(path.join(dir, png), path.join(outDir, png));
  }
  console.log(`[proof] ${slug} → ${path.relative(process.cwd(), outDir)}`);
}

async function main(): Promise<void> {
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim().replace(/[^a-z0-9-]+/gi, "-");
  const date = new Date().toISOString().slice(0, 10);
  const dateBranchDir = path.join(PROOF_DIR, `${date}-${branch}`);
  fs.mkdirSync(dateBranchDir, { recursive: true });

  const dirs = fs.existsSync(RESULTS)
    ? fs.readdirSync(RESULTS).map((d) => path.join(RESULTS, d)).filter((d) => fs.statSync(d).isDirectory())
    : [];
  for (const d of dirs) await processOne(d, dateBranchDir);

  const report = path.join(ARTIFACTS_DIR, "report");
  if (fs.existsSync(report)) {
    fs.cpSync(report, path.join(dateBranchDir, "report"), { recursive: true });
  }
  console.log(`[proof] bundle ready: ${dateBranchDir} (zip and send — open report/index.html)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
