/**
 * Ingest the Ryobi × GearWrench landing drop (2026-07-28).
 *
 * This combination was the one gap in the Draw 9 asset drop — `check-landing-hero-assets.mjs`
 * carried it as `KNOWN_GAPS: "ryobi|gwTB"`. This script closes it.
 *
 * ── SOURCE FILENAMES ARE WRONG, AND THAT IS THE POINT OF THIS TABLE ──────────────────
 * Every source file is named `GW-HiK-*` — GearWrench × **HiKOKI**. The artwork is
 * **Ryobi**: the headline reads "A 19 PIECE CUSTOM RYOBI TOOL KIT & STORAGE SYSTEM",
 * and the tools are Ryobi lime/black. This is the same defect class as the original
 * Draw 9 drop, where nine `*-HiK-*` files also contained Ryobi artwork.
 *
 * Every mapping below was verified against the PIXELS, not the filename:
 *   • brand/toolset  — read from the headline copy in each still
 *   • light vs dark  — greyscale mean (A ≈ 75-85 dark, B ≈ 193-203 light)
 *   • badge tier     — badge-region compare against known-tier references
 *                      (true match ≈ 0-8, wrong tier ≈ 37-52)
 *
 * One source file was rejected on first pass and re-exported by the designer:
 * `desktop/without badge/GW-HiK-B.{png,mp4}` originally carried the DRAWN TONIGHT
 * badge (it scored 0.0 — byte-identical — against the tonight still). The replacement
 * scores ~50 against both badged tiers, i.e. it matches neither, which is the
 * signature of a genuinely unbadged frame. Confirmed visually as well.
 *
 * Usage:
 *   npx tsx scripts/convert-ryobi-gearwrench-landing.ts --dry-run   # preview, no writes
 *   npx tsx scripts/convert-ryobi-gearwrench-landing.ts             # apply
 *
 * After applying, regenerate both manifests:
 *   npx tsx scripts/build-landing-image-manifest.ts
 *   npx tsx scripts/build-landing-video-manifest.ts
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "C:/Users/Genesis/Downloads/RYOBI-GEARWRENCH";
const REPO = process.cwd();
const IMG_DIR = path.join(REPO, "public/images/background/promo/landing/ryobi");
const VID_DIR = path.join(REPO, "public/videos/landing/ryobi");
const COMBO_DEST = path.join(REPO, "public/images/majordraws/ryobi-set/ryobi-gearwrench.webp");

const DRY_RUN = process.argv.includes("--dry-run");

/** source (relative to SRC, no extension) → destination stem under the `ryobi` brand folder. */
const STILLS: ReadonlyArray<readonly [string, string]> = [
  ["desktop/without badge/GW-HiK-B", "ryobi-gwTB"],
  ["desktop/without badge/GW-HiK-A", "ryobi-gwTB-dark"],
  ["desktop/static/GW-HiK-B (2)", "ryobi-gwTB-drawn-tonight"],
  ["desktop/static/GW-HiK-B", "ryobi-gwTB-drawn-tomorrow"],
  ["desktop/static/GW-HiK-A (2)", "ryobi-gwTB-dark-drawn-tonight"],
  ["desktop/static/GW-HiK-A", "ryobi-gwTB-dark-drawn-tomorrow"],
  ["mobile/without badge/GW-Hik-B", "ryobi-gwTB-mobile"],
  ["mobile/without badge/GW-Hik-A", "ryobi-gwTB-dark-mobile"],
  ["mobile/static/GW-Hik-B (2)", "ryobi-gwTB-mobile-drawn-tonight"],
  ["mobile/static/GW-Hik-B", "ryobi-gwTB-mobile-drawn-tomorrow"],
  ["mobile/static/GW-Hik-A (2)", "ryobi-gwTB-dark-mobile-drawn-tonight"],
  ["mobile/static/GW-Hik-A", "ryobi-gwTB-dark-mobile-drawn-tomorrow"],
];

/** Evergreen clips come from `without badge/`; the badged tiers come from `animated/`. */
const CLIPS: ReadonlyArray<readonly [string, string]> = [
  ["desktop/without badge/GW-HiK-B", "ryobi-gwTB"],
  ["desktop/without badge/GW-HiK-A", "ryobi-gwTB-dark"],
  ["desktop/animated/GW-HiK-B (2)", "ryobi-gwTB-drawn-tonight"],
  ["desktop/animated/GW-HiK-B", "ryobi-gwTB-drawn-tomorrow"],
  ["desktop/animated/GW-HiK-A (2)", "ryobi-gwTB-dark-drawn-tonight"],
  ["desktop/animated/GW-HiK-A", "ryobi-gwTB-dark-drawn-tomorrow"],
  ["mobile/without badge/GW-Hik-B", "ryobi-gwTB-mobile"],
  ["mobile/without badge/GW-Hik-A", "ryobi-gwTB-dark-mobile"],
  ["mobile/animated/GW-Hik-B (2)", "ryobi-gwTB-mobile-drawn-tonight"],
  ["mobile/animated/GW-Hik-B", "ryobi-gwTB-mobile-drawn-tomorrow"],
  ["mobile/animated/GW-Hik-A (2)", "ryobi-gwTB-dark-mobile-drawn-tonight"],
  ["mobile/animated/GW-Hik-A", "ryobi-gwTB-dark-mobile-drawn-tomorrow"],
];

/** Sibling `*-gearwrench.webp` composites are 1600x1200 with alpha; this drop is 1080x1080. */
const COMBO_CANVAS = { width: 1600, height: 1200 } as const;

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  const total = STILLS.length + CLIPS.length + 1;
  console.log(`Ryobi × GearWrench ingest — ${DRY_RUN ? "DRY-RUN" : "APPLY"}`);
  console.log(`  ${STILLS.length} stills · ${CLIPS.length} clips (mp4+webm) · 1 combo render = ${total} items\n`);

  for (const [rel] of [...STILLS, ...CLIPS]) {
    const ext = STILLS.some(([s]) => s === rel) ? ".png" : ".mp4";
    const p = path.join(SRC, rel + ext);
    if (!fs.existsSync(p)) throw new Error(`missing source: ${p}`);
  }
  if (!fs.existsSync(path.join(SRC, "Gearwrench TB with other combo Raw images (1).png"))) {
    throw new Error("missing combo render");
  }
  console.log("✓ all sources present\n");

  if (!DRY_RUN) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.mkdirSync(VID_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(COMBO_DEST), { recursive: true });
  }

  let done = 0;
  console.log("── stills ──");
  for (const [rel, stem] of STILLS) {
    const from = path.join(SRC, `${rel}.png`);
    const dest = path.join(IMG_DIR, `${stem}.webp`);
    done++;
    if (DRY_RUN) {
      console.log(`  [${done}/${total}] ${rel}.png -> ${stem}.webp`);
      continue;
    }
    await sharp(from).webp({ quality: 82, effort: 5 }).toFile(dest);
    console.log(`  [${done}/${total}] ${stem}.webp  ${mb(fs.statSync(dest).size)}`);
  }

  console.log("\n── clips (mp4 remux + vp9 webm) ──");
  for (const [rel, stem] of CLIPS) {
    const from = path.join(SRC, `${rel}.mp4`);
    const mp4 = path.join(VID_DIR, `${stem}.mp4`);
    const webm = path.join(VID_DIR, `${stem}.webm`);
    done++;
    if (DRY_RUN) {
      console.log(`  [${done}/${total}] ${rel}.mp4 -> ${stem}.{mp4,webm}`);
      continue;
    }
    // Remux only — the source is already H.264; re-encoding would lose quality for nothing.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", from, "-c:v", "copy", "-an", "-movflags", "+faststart", mp4]);
    execFileSync("ffmpeg", [
      "-v", "error", "-y", "-i", from,
      "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-an",
      "-row-mt", "1", "-deadline", "good", "-cpu-used", "4",
      webm,
    ]);
    console.log(`  [${done}/${total}] ${stem}  mp4 ${mb(fs.statSync(mp4).size)} · webm ${mb(fs.statSync(webm).size)}`);
  }

  console.log("\n── combo render ──");
  done++;
  const comboSrc = path.join(SRC, "Gearwrench TB with other combo Raw images (1).png");
  if (DRY_RUN) {
    console.log(`  [${done}/${total}] combo -> ${path.relative(REPO, COMBO_DEST)} (contain-pad 1080x1080 -> 1600x1200)`);
  } else {
    // `contain` onto the sibling canvas with a transparent background, so the prize
    // builder's grid keeps a consistent box across every combination.
    await sharp(comboSrc)
      .resize({ ...COMBO_CANVAS, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 82, effort: 5 })
      .toFile(COMBO_DEST);
    console.log(`  [${done}/${total}] ${path.relative(REPO, COMBO_DEST)}  ${mb(fs.statSync(COMBO_DEST).size)}`);
  }

  console.log(`\n${DRY_RUN ? "[dry-run] nothing written." : "Done."} ${done}/${total} items.`);
  if (!DRY_RUN) {
    console.log("\nNext: regenerate the manifests, then drop the gap markers:");
    console.log("  npx tsx scripts/build-landing-image-manifest.ts");
    console.log("  npx tsx scripts/build-landing-video-manifest.ts");
    console.log("  remove 'ryobi|gwTB' from KNOWN_GAPS in scripts/check-landing-hero-assets.mjs");
    console.log("  remove 'ryobi-gearwrench' from COMBOS_AWAITING_COMBO_ART in prize-builder-model.ts");
  }
}

main().catch((err) => {
  console.error("❌ convert-ryobi-gearwrench-landing failed:", err);
  process.exit(1);
});
