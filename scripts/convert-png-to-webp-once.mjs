/**
 * One-off batch: PNG -> WebP via sharp (quality 85).
 * Usage: node scripts/convert-png-to-webp-once.mjs <dir-or-file> [...]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function convertFile(fullPath) {
  if (!/\.png$/i.test(fullPath)) return;
  const outPath = fullPath.replace(/\.png$/i, ".webp");
  await sharp(fullPath).webp({ quality: 85 }).toFile(outPath);
  const statIn = fs.statSync(fullPath).size;
  const statOut = fs.statSync(outPath).size;
  console.log(`${path.relative(root, outPath)} (${(statIn / 1024).toFixed(1)} KB -> ${(statOut / 1024).toFixed(1)} KB)`);
}

async function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkDir(full);
    else if (/\.png$/i.test(e.name)) await convertFile(full);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/convert-png-to-webp-once.mjs <path> [...]");
  process.exit(1);
}

for (const arg of args) {
  const abs = path.isAbsolute(arg) ? arg : path.join(root, arg);
  if (!fs.existsSync(abs)) {
    console.error("Missing:", abs);
    continue;
  }
  const st = fs.statSync(abs);
  if (st.isDirectory()) await walkDir(abs);
  else await convertFile(abs);
}
