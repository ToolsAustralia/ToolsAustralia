/**
 * Brand wordmark doctor — keeps `public/images/brands/name/*.svg` croppable and
 * the prize-lane scale values derivable instead of eyeballed.
 *
 * WHY THIS EXISTS
 * The prize builder fits every wordmark with `contain` (`mask-size` on the toolbox
 * lane, `object-fit` on the toolset lane). That makes any transparent padding baked
 * into a mark's `viewBox` shrink THAT BRAND ONLY. Five marks were once exported onto
 * a shared 700x200 sheet carrying 58-72% dead canvas, and the per-brand `markScale` /
 * `wordmarkScale` values in prize-selection/constants.ts had silently become padding
 * compensation — letter heights ranged 1.97x across one reel.
 *
 * Draw 10 cropped every mark to its ink and re-derived both lanes from one formula:
 *
 *     scale = targetCap / (min(plateH, plateW / aspect) x capFrac)
 *
 * where `capFrac` is the share of a mark's height its main letter band occupies —
 * 0.42 for Sidchrome (its wordmark sits inside a spanner outline), 0.98 for Kincrome
 * (nearly pure letterform). Equalising the BOX is what makes Milwaukee "look unfairly
 * small"; equalising the CAP is what the eye actually reads.
 *
 * Re-exporting a mark without re-cropping re-breaks the whole lane, so this script is
 * the check that catches it.
 *
 * USAGE
 *   npm run check:brand-wordmarks          # report only (default, writes nothing)
 *   npm run check:brand-wordmarks -- --fix # crop each viewBox to its ink bounds
 *
 * Exit codes: 0 clean · 1 a mark carries padding over the threshold (run --fix) · 2 error.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "public", "images", "brands", "name");
const FIX = process.argv.includes("--fix");
const RENDER_W = 1600;
const BLEED = 0.004; // keeps antialiased edges off the crop line
const PAD_BUDGET = 6; // % of canvas area that may be empty before we complain

/** Reel geometry the scales are solved against (globals.css `--pbc-reel-card-*`). */
const LANES = {
  toolbox: { plateW: 156, plateH: 30, targetCap: 13, field: "markScale" },
  toolset: { plateW: 156, plateH: 20, targetCap: 12, field: "wordmarkScale" },
};

/** Which lane(s) each mark feeds. Milwaukee is the one file both reels render. */
const LANE_OF = {
  milwaukee: ["toolbox", "toolset"],
  kincrome: ["toolbox"],
  sidchrome: ["toolbox"],
  gearwrench: ["toolbox"],
  dewalt: ["toolset"],
  makita: ["toolset"],
  ryobi: ["toolset"],
  hikoki: ["toolset"],
  stihl: ["toolset"],
};

function parseViewBox(svg) {
  const m = svg.match(/viewBox="([-\d.eE\s]+)"/);
  if (!m) return null;
  const [x, y, w, h] = m[1].trim().split(/\s+/).map(Number);
  return Number.isFinite(x + y + w + h) ? { x, y, w, h } : null;
}

/**
 * Rasterises a mark and reports its ink bounds plus `capFrac`.
 *
 * The cap band is the tallest run of rows carrying >=45% of the peak ink width —
 * for a wordmark that is the x-height/cap band, and it excludes the furniture
 * (Milwaukee's bolt, Sidchrome's spanner outline, a raised registered mark).
 */
async function measure(svg, vb) {
  const H = Math.max(1, Math.round((RENDER_W * vb.h) / vb.w));
  const { data, info } = await sharp(Buffer.from(svg), { density: 600 })
    .resize(RENDER_W, H, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h } = info;
  const rowInk = new Int32Array(h);
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 16) continue;
      rowInk[y]++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;

  const threshold = Math.max(...rowInk) * 0.45;
  let best = 0, run = -1;
  for (let y = 0; y <= h; y++) {
    const on = y < h && rowInk[y] >= threshold;
    if (on && run < 0) run = y;
    if (!on && run >= 0) { best = Math.max(best, y - run); run = -1; }
  }

  const sx = vb.w / w, sy = vb.h / h;
  const inkW = (x1 - x0 + 1) * sx;
  const inkH = (y1 - y0 + 1) * sy;
  return {
    x: vb.x + x0 * sx,
    y: vb.y + y0 * sy,
    w: inkW,
    h: inkH,
    aspect: inkW / inkH,
    capFrac: (best * sy) / inkH,
    padPct: 100 * (1 - (inkW * inkH) / (vb.w * vb.h)),
  };
}

const round = (n) => +n.toFixed(2);

async function main() {
  if (!fs.existsSync(DIR)) {
    console.error(`✗ ${DIR} does not exist`);
    process.exit(2);
  }

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".svg")).sort();
  console.log(`Brand wordmark doctor — ${files.length} marks in public/images/brands/name/`);
  console.log(FIX ? "MODE: --fix (viewBoxes will be cropped)\n" : "MODE: report only (pass --fix to crop)\n");

  const rows = [];
  let overBudget = 0;

  for (const file of files) {
    const full = path.join(DIR, file);
    const svg = fs.readFileSync(full, "utf8");
    const vb = parseViewBox(svg);
    if (!vb) { console.log(`  ? ${file.padEnd(26)} no viewBox — skipped`); continue; }

    const ink = await measure(svg, vb);
    if (!ink) { console.log(`  ? ${file.padEnd(26)} renders empty — skipped`); continue; }

    const brand = file.replace(/Text(-light)?\.svg$/, "").replace(/\.svg$/, "");
    let padPct = ink.padPct;

    if (FIX && padPct > PAD_BUDGET) {
      const bx = ink.w * BLEED, by = ink.h * BLEED;
      const nx = ink.x - bx, ny = ink.y - by;
      const nw = ink.w + bx * 2, nh = ink.h + by * 2;
      // Only the canvas moves — no path geometry is touched, so the art is bit-identical.
      let next = svg.replace(/viewBox="[-\d.eE\s]+"/, `viewBox="${round(nx)} ${round(ny)} ${round(nw)} ${round(nh)}"`);
      // A declared width/height overrides the viewBox as the intrinsic size, so it
      // has to move too or `contain` keeps reserving the old canvas.
      next = next.replace(/\swidth="[\d.]+"/, ` width="${round(nw)}"`);
      next = next.replace(/\sheight="[\d.]+"/, ` height="${round(nh)}"`);
      fs.writeFileSync(full, next);
      padPct = 0;
    }

    if (padPct > PAD_BUDGET) overBudget++;
    rows.push({ file, brand, aspect: ink.aspect, capFrac: ink.capFrac, padPct });
  }

  console.log("  mark".padEnd(28), "aspect".padEnd(9), "cap/ink".padEnd(10), "dead canvas");
  for (const r of rows) {
    const flag = r.padPct > PAD_BUDGET ? "  <-- crop me" : "";
    console.log(
      `  ${r.file}`.padEnd(28),
      r.aspect.toFixed(2).padEnd(9),
      r.capFrac.toFixed(3).padEnd(10),
      `${r.padPct.toFixed(0)}%${flag}`
    );
  }

  console.log("\n  Derived scales for prize-selection/constants.ts");
  console.log("  (paste these; do not hand-tune — see docs/promo/frontend.md)\n");
  for (const [laneName, lane] of Object.entries(LANES)) {
    console.log(`  ${lane.field}  —  ${laneName} lane, plate ${lane.plateW}x${lane.plateH}, target cap ${lane.targetCap}px`);
    for (const r of rows) {
      if (file_light(r.file)) continue;
      if (!(LANE_OF[r.brand] || []).includes(laneName)) continue;
      const bound = Math.min(lane.plateH, lane.plateW / r.aspect);
      const scale = lane.targetCap / (bound * r.capFrac);
      const note = bound < lane.plateH ? "  (width-bound — check the 124px mobile card)" : "";
      console.log(`    ${r.brand.padEnd(12)} ${scale.toFixed(2)}${note}`);
    }
    console.log("");
  }

  if (overBudget > 0) {
    console.error(`✗ ${overBudget} mark(s) carry more than ${PAD_BUDGET}% dead canvas. Run: npm run check:brand-wordmarks -- --fix`);
    process.exit(1);
  }
  console.log(`✓ all ${rows.length} marks are cropped to their ink`);
}

/** `-light` twins are duo-mode partners of an already-listed mark; don't double-print. */
function file_light(f) {
  return /-light\.svg$/.test(f);
}

main().catch((err) => {
  console.error("✗ brand wordmark doctor failed:", err?.message ?? err);
  process.exit(2);
});
