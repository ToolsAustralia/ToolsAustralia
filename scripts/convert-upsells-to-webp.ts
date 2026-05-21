/**
 * One-shot: convert all PNG files under public/images/upsells to WebP, then delete PNGs.
 * Run: npx tsx scripts/convert-upsells-to-webp.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const UPS_ROOT = path.join(process.cwd(), "public", "images", "upsells");

async function collectPngFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await collectPngFiles(full)));
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".png")) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const pngs = await collectPngFiles(UPS_ROOT);
  if (pngs.length === 0) {
    console.log("No PNG files under", UPS_ROOT);
    return;
  }

  let totalBefore = 0;
  let totalAfter = 0;

  for (const pngPath of pngs.sort()) {
    const webpPath = pngPath.replace(/\.png$/i, ".webp");
    const before = (await fs.stat(pngPath)).size;
    totalBefore += before;

    if (await statSafe(webpPath)) {
      console.log(`skip (webp exists): ${relPublic(pngPath)}`);
      await fs.unlink(pngPath);
      continue;
    }

    await sharp(pngPath).webp({ quality: 82, effort: 5 }).toFile(webpPath);
    const after = (await fs.stat(webpPath)).size;
    totalAfter += after;
    await fs.unlink(pngPath);

    console.log(
      `${relPublic(pngPath)}: ${kb(before)} KB -> ${kb(after)} KB (${pct(before, after)}% reduction)`
    );
  }

  console.log(
    `\nTotal: ${(totalBefore / 1024 / 1024).toFixed(1)} MB (PNG) -> ${(totalAfter / 1024 / 1024).toFixed(1)} MB (WebP)`
  );
}

function kb(n: number): string {
  return (n / 1024).toFixed(1);
}

function pct(before: number, after: number): string {
  if (before === 0) return "0";
  return ((1 - after / before) * 100).toFixed(1);
}

function relPublic(abs: string): string {
  return path.relative(process.cwd(), abs).replace(/\\/g, "/");
}

async function statSafe(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
