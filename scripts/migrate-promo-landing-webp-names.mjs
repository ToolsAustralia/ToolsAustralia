/**
 * One-off: rename landing hero WebPs from all-no-promo / *-no-promo to the new convention.
 * Run: node scripts/migrate-promo-landing-webp-names.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LANDING = path.join(ROOT, "public", "images", "background", "promo", "landing");

const URGENCY_SUFFIXES = ["-final-hours", "-drawn-tomorrow", "-drawn-tonight"];

function migrateAllPrizesBase(base) {
  if (!base.startsWith("all-no-promo")) return null;
  let rest = base.slice("all-no-promo".length);
  let u = "";
  for (const cand of URGENCY_SUFFIXES) {
    if (rest.endsWith(cand)) {
      u = cand;
      rest = rest.slice(0, -cand.length);
      break;
    }
  }
  if (rest === "") return `all-prizes${u}`;
  if (rest === "-mobile") return `all-prizes-mobile${u}`;
  if (rest === "-dark") return `all-prizes${u}`;
  if (rest === "-dark-mobile") return `all-prizes-mobile${u}`;
  throw new Error(`Unparsed all-prizes base: ${base}`);
}

function migrateBrandBase(base) {
  if (!base.includes("-no-promo")) return null;
  return base.replace(/-no-promo/g, "");
}

function scoreAllPrizesSource(base) {
  // lower = better (prefer light / non-dark)
  let s = 0;
  if (base.includes("-dark")) s += 10;
  return s;
}

async function collectWebps(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await collectWebps(full)));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".webp")) out.push(full);
  }
  return out;
}

async function main() {
  const files = await collectWebps(LANDING);
  const allPrizesGroups = new Map();
  const brandRenames = [];

  for (const abs of files) {
    const base = path.basename(abs, ".webp");
    const dir = path.dirname(abs);

    if (path.basename(dir) === "all-prizes") {
      const newBase = migrateAllPrizesBase(base);
      if (!newBase) continue;
      const newAbs = path.join(dir, `${newBase}.webp`);
      const key = newAbs.toLowerCase();
      const prev = allPrizesGroups.get(key) || [];
      prev.push({ abs, base, score: scoreAllPrizesSource(base) });
      allPrizesGroups.set(key, prev);
      continue;
    }

    const newBase = migrateBrandBase(base);
    if (!newBase) continue;
    brandRenames.push({ abs, dest: path.join(dir, `${newBase}.webp`) });
  }

  // all-prizes: pick best source per target, delete others
  for (const [, group] of allPrizesGroups) {
    group.sort((a, b) => a.score - b.score);
    const winner = group[0];
    const dest = path.join(path.dirname(winner.abs), `${migrateAllPrizesBase(winner.base)}.webp`);

    if (winner.abs !== dest) {
      try {
        await fs.rename(winner.abs, dest);
      } catch (e) {
        if (e.code === "EXDEV") {
          await fs.copyFile(winner.abs, dest);
          await fs.unlink(winner.abs);
        } else throw e;
      }
    }
    for (let i = 1; i < group.length; i++) {
      await fs.unlink(group[i].abs);
    }
  }

  // brand: rename to dest (handle collisions: should not happen)
  for (const { abs, dest } of brandRenames.sort((a, b) => a.abs.localeCompare(b.abs))) {
    if (abs === dest) continue;
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) continue;
    const destStat = await fs.stat(dest).catch(() => null);
    if (destStat && path.resolve(abs) !== path.resolve(dest)) {
      await fs.unlink(dest);
    }
    await fs.rename(abs, dest);
  }

  console.log("Landing WebP migration done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
