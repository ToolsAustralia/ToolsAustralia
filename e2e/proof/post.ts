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
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const files: string[] = [];
    for (let i = 0; i < cues.length; i++) {
      const cueDir = path.join(dir, `cue-${i}`);
      fs.mkdirSync(cueDir, { recursive: true });
      const { audioFilePath } = await tts.toFile(cueDir, cues[i].title);
      files.push(audioFilePath);
    }
    tts.close();
    return files;
  } catch (e) {
    console.warn(`[proof] AI voice unavailable (${(e as Error).message}) — emitting subtitled video only.`);
    return null;
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
    if (ff(["-y", "-i", mp4, ...inputs, "-filter_complex", `${delays};${mix}`, "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-shortest", voiced])) {
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
