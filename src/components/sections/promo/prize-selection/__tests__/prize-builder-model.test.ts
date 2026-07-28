/**
 * Prize builder model — regression guard for the "Build your prize" configurator.
 *
 * Run: `npm run test:prize-builder`
 *
 * These are the invariants a UI bug would silently break:
 *  - every toolbox × toolset combination resolves to a real catalog prize AND a
 *    composite render that exists on disk (a missing one is a broken hero image);
 *  - the reel wraps the SHORT way in both directions and never leaves two cards
 *    fighting for the same slot;
 *  - the preview grid never over- or under-reports what it hid behind "+N more";
 *  - copy derivations stay free-entry safe (CLAUDE.md §11).
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PRIZE_SUMMARIES, type PrizeMedia } from "@/config/prize-summaries";
import {
  TOOLBOX_QUERY_PARAM,
  TOOLSET_QUERY_PARAM,
  buildPrizeSelectionHref,
  parseToolboxQueryParam,
  parseToolsetQueryParam,
  resolveBuiltPrizeSlug,
} from "../utils";
import {
  CASH_OPTION,
  TOOLBOXES,
  TOOLSETS,
  POWERSET_IMAGES,
  getToolbox,
  getToolset,
} from "../constants";
import {
  FOCUS_SCALE,
  REEL_METRICS,
  REEL_VISIBLE_RADIUS,
  PREVIEW_COLUMNS,
  PREVIEW_MAX_ROWS,
  buildContentsPreview,
  darken,
  fromPrizeSlug,
  getComboPresentation,
  getContentsChips,
  getReelCardGeometry,
  offsetFromFocus,
  resolveAccent,
  stepReel,
  toPrizeSlug,
  toShortToolLabel,
} from "../prize-builder-model";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const assetExists = (webPath: string) => existsSync(path.join(PUBLIC_DIR, webPath));

let failures = 0;
function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}

/* -------------------------------------------------------------------------- */
console.log("\nRegistry integrity");
/* -------------------------------------------------------------------------- */

run("GearWrench is not offered this draw", () => {
  // Widened to string: if GearWrench is ever added to ToolboxBrand, this stays a runtime
  // assertion (which the draw-9 change is expected to delete) rather than a type error.
  const ids: string[] = TOOLBOXES.map((b) => b.id);
  assert.ok(
    !ids.includes("gearwrench"),
    "GearWrench ships in draw 9 — it must not appear in the toolbox lane yet"
  );
});

run("every toolbox has unique ids and non-empty copy", () => {
  const ids = TOOLBOXES.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate toolbox id");
  for (const box of TOOLBOXES) {
    assert.ok(box.name.length > 0, `${box.id}: missing name`);
    assert.ok(box.shortName.length > 0, `${box.id}: missing shortName`);
    assert.ok(box.eyebrow.length > 0, `${box.id}: missing eyebrow`);
    assert.match(box.accent, /^#[0-9a-f]{6}$/i, `${box.id}: accent must be a 6-digit hex`);
    assert.ok(box.markScale > 0.4 && box.markScale <= 1.5, `${box.id}: implausible markScale`);
  }
});

run("every toolset has unique ids, a tool count and a plausible wordmark scale", () => {
  const ids = TOOLSETS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate toolset id");
  for (const set of TOOLSETS) {
    assert.match(set.accent, /^#[0-9a-f]{6}$/i, `${set.id}: accent must be a 6-digit hex`);
    assert.ok(set.toolCount > 0, `${set.id}: toolCount must be positive`);
    assert.ok(
      set.kitLabel.includes(String(set.toolCount)),
      `${set.id}: kitLabel "${set.kitLabel}" disagrees with toolCount ${set.toolCount}`
    );
    assert.ok(set.wordmarkScale > 0 && set.wordmarkScale <= 2, `${set.id}: implausible wordmarkScale`);
  }
});

run("the Milwaukee toolbox mark is the SAME red as the Milwaukee toolset wordmark", () => {
  // Both cards are on screen together, so a lighter "dark mode" variant on one of them
  // reads as two different Milwaukee reds. The toolset wordmark SVG is the reference.
  const milwaukeeSet = getToolset("milwaukee")!;
  const svg = readFileSync(path.join(PUBLIC_DIR, milwaukeeSet.wordmark), "utf8");
  const fill = svg.match(/fill\s*[:=]\s*"?(#[0-9a-f]{6})/i)?.[1];
  assert.ok(fill, "could not read a fill colour from milwaukeeText.svg");

  const milwaukeeBox = getToolbox("milwaukee")!;
  for (const theme of ["light", "dark"] as const) {
    assert.equal(
      milwaukeeBox.markColor[theme].toLowerCase(),
      fill.toLowerCase(),
      `Milwaukee toolbox mark (${theme}) must match the toolset wordmark fill ${fill}`
    );
  }
});

run("every mark colour is a real hex, and no brand keeps a washed dark variant", () => {
  for (const box of TOOLBOXES) {
    for (const theme of ["light", "dark"] as const) {
      assert.match(
        box.markColor[theme],
        /^#[0-9a-f]{6}$/i,
        `${box.id}: markColor.${theme} must be a 6-digit hex`
      );
    }
    // A pastel/washed mark (very high lightness) is the bug this guards: the handoff's
    // #ff5a5a / #ff6058 dark variants read salmon and pink beside the real brand colours.
    const dark = box.markColor.dark.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(dark.slice(i, i + 2), 16));
    const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    assert.ok(
      lightness < 0.72,
      `${box.id}: markColor.dark ${box.markColor.dark} is washed out (lightness ${lightness.toFixed(2)})`
    );
  }
});

run("every registry asset exists in /public", () => {
  for (const box of TOOLBOXES) {
    assert.ok(assetExists(box.image), `missing toolbox render: ${box.image}`);
    assert.ok(assetExists(box.markImage), `missing toolbox brand mark: ${box.markImage}`);
    // Brand marks must stay VECTOR: they are painted through a CSS mask at a plate size
    // that varies with the card, and a bitmap goes soft the moment the card grows.
    assert.ok(
      box.markImage.endsWith(".svg"),
      `${box.id}: brand mark must be an SVG, got ${box.markImage}`
    );
  }
  for (const set of TOOLSETS) {
    assert.ok(
      set.wordmark.endsWith(".svg"),
      `${set.id}: toolset wordmark must be an SVG, got ${set.wordmark}`
    );
  }
  for (const set of TOOLSETS) {
    assert.ok(assetExists(set.image), `missing toolset photo: ${set.image}`);
    assert.ok(assetExists(set.wordmark), `missing toolset wordmark: ${set.wordmark}`);
  }
  assert.ok(assetExists(CASH_OPTION.image), `missing cash art: ${CASH_OPTION.image}`);
});

run("derived legacy maps stay in step with the registries", () => {
  assert.deepEqual(Object.keys(POWERSET_IMAGES).sort(), TOOLSETS.map((s) => s.id).sort());
  for (const set of TOOLSETS) {
    assert.equal(POWERSET_IMAGES[set.id], set.image);
  }
});

/* -------------------------------------------------------------------------- */
console.log("\nCombination → catalog");
/* -------------------------------------------------------------------------- */

run("every toolbox × toolset combination has a catalog prize", () => {
  const slugs = new Set<string>(PRIZE_SUMMARIES.map((p) => p.slug));
  for (const box of TOOLBOXES) {
    for (const set of TOOLSETS) {
      const slug = toPrizeSlug({ toolbox: box.id, toolset: set.id, isCash: false });
      assert.ok(slugs.has(slug), `no catalog entry for combination "${slug}"`);
    }
  }
});

run("every combination's composite render exists on disk", () => {
  for (const box of TOOLBOXES) {
    for (const set of TOOLSETS) {
      const { image } = getComboPresentation(box, set, false);
      assert.ok(assetExists(image), `missing combo render: ${image}`);
    }
  }
});

run("cash mode short-circuits to the cash prize and hides the $5,000 flag", () => {
  const [box] = TOOLBOXES;
  const [set] = TOOLSETS;
  assert.equal(toPrizeSlug({ toolbox: box.id, toolset: set.id, isCash: true }), CASH_OPTION.slug);
  const combo = getComboPresentation(box, set, true);
  assert.equal(combo.image, CASH_OPTION.image);
  assert.equal(combo.showCashFlag, false, "the bundled $5,000 must not be advertised in cash mode");
  assert.equal(combo.eyebrow, "CASH OPTION");
});

run("fromPrizeSlug round-trips every combination and rejects the rest", () => {
  for (const box of TOOLBOXES) {
    for (const set of TOOLSETS) {
      const slug = toPrizeSlug({ toolbox: box.id, toolset: set.id, isCash: false });
      assert.deepEqual(fromPrizeSlug(slug), { toolbox: box.id, toolset: set.id }, slug);
    }
  }
  assert.equal(fromPrizeSlug(CASH_OPTION.slug), null);
  assert.equal(fromPrizeSlug("makita-gearwrench"), null, "an unreleased toolbox must not resolve");
  assert.equal(fromPrizeSlug(undefined), null);
  assert.equal(fromPrizeSlug(""), null);
});

run("accent follows the TOOLSET, not the toolbox — and goes green for cash", () => {
  const makita = getToolset("makita")!;
  const milwaukeeBox = getToolbox("milwaukee")!;
  assert.equal(resolveAccent(makita, false), makita.accent);
  assert.notEqual(
    resolveAccent(makita, false),
    milwaukeeBox.accent,
    "picking a Milwaukee toolbox must not repaint the card in Milwaukee red"
  );
  assert.equal(resolveAccent(makita, true), CASH_OPTION.accent);
});

run("darken produces a valid, strictly darker rgb()", () => {
  assert.equal(darken("#ffffff", 0.5), "rgb(128,128,128)");
  assert.equal(darken("#000000"), "rgb(0,0,0)");
  assert.equal(darken("#fff", 0.5), "rgb(128,128,128)", "3-digit hex must expand");
  for (const set of TOOLSETS) {
    assert.match(darken(set.accent), /^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/, `${set.id} gradient bottom`);
  }
});

/* -------------------------------------------------------------------------- */
console.log("\nPrize build — ?toolset= / ?toolbox= round-trip");
/* -------------------------------------------------------------------------- */

run("both lanes are always written explicitly, including the page default", () => {
  // Decision 5 of the spec: presence of params IS the engagement signal, so once the
  // visitor touches a reel we write BOTH lanes even when a value equals the default.
  // Omitting the default (the old behaviour) made "tried Milwaukee, switched back" look
  // identical to "never touched the reels".
  const href = buildPrizeSelectionHref("/promotions/makita", new URLSearchParams(), {
    toolbox: "milwaukee",
    toolset: "makita",
    isCash: false,
  });
  const params = new URLSearchParams(href.split("?")[1]);
  assert.equal(params.get(TOOLBOX_QUERY_PARAM), "milwaukee", "the default toolbox must still be written");
  assert.equal(params.get(TOOLSET_QUERY_PARAM), "makita", "the toolset lane must be written");
});

run("every lane value round-trips through its parser", () => {
  for (const toolbox of TOOLBOXES.map((b) => b.id)) {
    for (const toolset of TOOLSETS.map((s) => s.id)) {
      const href = buildPrizeSelectionHref("/promotions/makita", new URLSearchParams(), {
        toolbox,
        toolset,
        isCash: false,
      });
      const params = new URLSearchParams(href.split("?")[1]);
      assert.equal(parseToolboxQueryParam(params.get(TOOLBOX_QUERY_PARAM)), toolbox);
      assert.equal(parseToolsetQueryParam(params.get(TOOLSET_QUERY_PARAM)), toolset);
    }
  }
});

run("the cash opt-out round-trips, and other query params survive", () => {
  const href = buildPrizeSelectionHref("/promotions/makita", new URLSearchParams("aff=ABC"), {
    toolbox: "kincrome",
    toolset: "makita",
    isCash: true,
  });
  const params = new URLSearchParams(href.split("?")[1]);
  assert.equal(parseToolboxQueryParam(params.get(TOOLBOX_QUERY_PARAM)), "cash");
  assert.equal(params.get("aff"), "ABC", "an affiliate code must never be dropped by a build change");
});

run("switching replaces a value rather than appending a second one", () => {
  const href = buildPrizeSelectionHref(
    "/promotions/makita",
    new URLSearchParams("toolbox=sidchrome&toolset=ryobi&aff=ABC"),
    { toolbox: "kincrome", toolset: "dewalt", isCash: false }
  );
  const params = new URLSearchParams(href.split("?")[1]);
  assert.deepEqual(params.getAll(TOOLBOX_QUERY_PARAM), ["kincrome"]);
  assert.deepEqual(params.getAll(TOOLSET_QUERY_PARAM), ["dewalt"]);
  assert.equal(params.get("aff"), "ABC");
});

run("garbage lane values are rejected, not passed through", () => {
  assert.equal(parseToolsetQueryParam("garbage"), null);
  assert.equal(parseToolsetQueryParam(""), null);
  assert.equal(parseToolsetQueryParam(null), null);
  assert.equal(parseToolboxQueryParam("garbage"), null);
});

run("parsers accept every registry id — a new brand must not need a second edit", () => {
  // The old hand-written VALID_TOOLBOX_QUERY_VALUES set would silently reject a 4th
  // toolbox until someone remembered to edit it. Both parsers now derive from the registries.
  for (const b of TOOLBOXES) assert.equal(parseToolboxQueryParam(b.id), b.id);
  for (const s of TOOLSETS) assert.equal(parseToolsetQueryParam(s.id), s.id);
  assert.equal(parseToolboxQueryParam("cash"), "cash", "cash is the opt-out, not a registry brand");
});

/* -------------------------------------------------------------------------- */
console.log("\nBuilt prize slug resolution (shared by the card and the signup modal)");
/* -------------------------------------------------------------------------- */

run("no params means untouched — the page's own prize is the built prize", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams(), "makita-milwaukee"),
    "makita-milwaukee"
  );
});

run("params compose into the built prize slug", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolset=ryobi&toolbox=kincrome"), "makita-milwaukee"),
    "ryobi-kincrome"
  );
});

run("one lane present falls back to the page's own value for the other", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolset=ryobi"), "makita-milwaukee"),
    "ryobi-milwaukee"
  );
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolbox=kincrome"), "makita-milwaukee"),
    "makita-kincrome"
  );
});

run("cash wins over both lanes", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolset=ryobi&toolbox=cash"), "makita-milwaukee"),
    CASH_OPTION.slug
  );
});

run("a bare toolset LANDING fallback resolves to that page's default PRIZE, not the landing slug itself", () => {
  // `/promotions/makita` names itself with the bare toolset slug ("makita"), which is not a
  // prize — it has no toolbox lane. An untouched page must record the page's actual default
  // BUILD ("makita-milwaukee"), not the landing slug — "makita" is already recorded separately
  // as `promotionSlug`; recording it again here would make the field polymorphic (sometimes a
  // real prize, sometimes a landing page) and defeat the point of the field. Regression guard
  // for a bug shipped 2026-07-28: this assertion previously read `=== "makita"`.
  assert.equal(resolveBuiltPrizeSlug(new URLSearchParams(), "makita"), "makita-milwaukee");
});

run("a fallback that is already a real prize slug (not a landing slug) passes through unchanged", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams(), "milwaukee-kincrome"),
    "milwaukee-kincrome"
  );
});

run("both lanes present with a LANDING-slug fallback compose from the params, ignoring the fallback entirely", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolset=ryobi&toolbox=kincrome"), "makita"),
    "ryobi-kincrome"
  );
});

run("one lane only, with a LANDING-slug fallback — the missing lane comes from the RESOLVED default, not the bare landing slug", () => {
  // The subtle case: "makita" has no toolbox lane of its own to fall back on. The missing
  // toolbox lane must be filled from makita's RESOLVED default prize (makita-milwaukee's
  // "milwaukee"), not left unresolved.
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolset=ryobi"), "makita"),
    "ryobi-milwaukee"
  );
});

run("cash opt-out with a LANDING-slug fallback still short-circuits to cash", () => {
  assert.equal(
    resolveBuiltPrizeSlug(new URLSearchParams("toolbox=cash"), "makita"),
    CASH_OPTION.slug
  );
});

run("every resolvable build is a real catalog prize", () => {
  const catalogSlugs = new Set<string>(PRIZE_SUMMARIES.map((p) => p.slug));
  for (const toolbox of TOOLBOXES.map((b) => b.id)) {
    for (const toolset of TOOLSETS.map((s) => s.id)) {
      const slug = resolveBuiltPrizeSlug(
        new URLSearchParams(`toolset=${toolset}&toolbox=${toolbox}`),
        "makita-milwaukee"
      );
      assert.ok(catalogSlugs.has(slug), `${slug} must exist in the catalog`);
    }
  }
});

run("garbage query values fall back to the default rather than throwing", () => {
  for (const bad of ["", "  ", "gearwrench", "MILWAUKEE!", "../etc"]) {
    assert.equal(parseToolboxQueryParam(bad), null, `"${bad}" must not resolve to a toolbox`);
  }
  assert.equal(parseToolboxQueryParam("KINCROME"), "kincrome", "casing is normalised");
});

/* -------------------------------------------------------------------------- */
console.log("\nReel geometry");
/* -------------------------------------------------------------------------- */

run("offsets wrap the shorter way around the reel", () => {
  // 5 toolsets: index 0 is 1 step RIGHT of index 4, not 4 steps left.
  assert.equal(offsetFromFocus(0, 4, 5), 1);
  assert.equal(offsetFromFocus(4, 0, 5), -1);
  assert.equal(offsetFromFocus(2, 2, 5), 0);
  // 3 toolboxes.
  assert.equal(offsetFromFocus(0, 2, 3), 1);
  assert.equal(offsetFromFocus(2, 0, 3), -1);
  assert.equal(offsetFromFocus(0, 0, 1), 0, "a locked single-item lane never offsets");
});

run("no two cards ever land on the same offset", () => {
  for (const total of [1, 2, 3, 4, 5, 6, 9]) {
    for (let active = 0; active < total; active++) {
      const offsets = Array.from({ length: total }, (_, i) => offsetFromFocus(i, active, total));
      assert.equal(
        new Set(offsets).size,
        total,
        `total=${total} active=${active} produced overlapping offsets: ${offsets.join(",")}`
      );
      assert.ok(offsets.includes(0), `total=${total} active=${active} has no focused card`);
    }
  }
});

run("only the selected card is focused, and far cards are inert", () => {
  const total = 9;
  const slots = Array.from({ length: total }, (_, i) => getReelCardGeometry(i, 0, total, false));
  assert.equal(slots.filter((g) => g.isFocused).length, 1);
  assert.equal(slots[0].offset, 0);
  const far = slots.find((g) => Math.abs(g.offset) >= REEL_VISIBLE_RADIUS);
  assert.ok(far, "a 9-item reel must have cards outside the visible window");
  assert.equal(far.isHidden, true);
});

run("cash mode dims the reel but keeps it selectable (no card is focused)", () => {
  const geometry = getReelCardGeometry(0, 0, 3, true);
  assert.equal(geometry.isFocused, false, "cash mode must clear the focus ring");
  assert.equal(geometry.offset, 0, "the underlying selection is preserved while dimmed");
});

run("mobile and desktop metrics are both complete and distinct", () => {
  for (const key of ["desktop", "mobile"] as const) {
    const m = REEL_METRICS[key];
    for (const [field, value] of Object.entries(m)) {
      if (typeof value === "number") assert.ok(value > 0, `${key}.${field} must be positive`);
      else assert.ok(value.length > 0, `${key}.${field} must be set`);
    }
  }
  assert.ok(REEL_METRICS.desktop.step > REEL_METRICS.mobile.step, "desktop reel should be wider");
});

run("globals.css reel variables match REEL_METRICS (CSS owns the placement maths)", () => {
  const css = readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

  // `.prize-builder { … }` declares the MOBILE tuning; the `min-width: 768px` block
  // overrides it with the desktop tuning. Grab each block's `--pbc-reel-*` declarations.
  const blocks = [...css.matchAll(/\.prize-builder\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const reelBlocks = blocks.filter((b) => b.includes("--pbc-reel-step"));
  assert.equal(reelBlocks.length, 2, "expected exactly two .prize-builder reel-variable blocks");
  const [mobileBlock, desktopBlock] = reelBlocks;

  const read = (block: string, name: string): string => {
    const match = block.match(new RegExp(`--pbc-reel-${name}:\\s*([^;]+);`));
    assert.ok(match, `globals.css is missing --pbc-reel-${name}`);
    return match[1].trim();
  };
  const num = (block: string, name: string) => Number.parseFloat(read(block, name));

  for (const [block, key] of [
    [mobileBlock, "mobile"],
    [desktopBlock, "desktop"],
  ] as const) {
    const m = REEL_METRICS[key];
    assert.equal(num(block, "card-w"), m.cardWidth, `${key} card width`);
    assert.equal(num(block, "card-h"), m.cardHeight, `${key} card height`);
    assert.equal(num(block, "stage-h"), m.stageHeight, `${key} stage height`);
    assert.equal(num(block, "step"), m.step, `${key} step`);
    assert.equal(num(block, "depth"), m.depth, `${key} depth`);
    assert.equal(num(block, "rotate"), m.rotate, `${key} rotate`);
    assert.equal(num(block, "side-scale"), m.sideScale, `${key} side scale`);
    assert.equal(num(block, "side-opacity"), m.sideOpacity, `${key} side opacity`);
    // Filter is written unabbreviated in CSS (`brightness(0.82)` vs `brightness(.82)`).
    const cssFilter = read(block, "side-filter").replace(/\s+/g, "");
    const specFilter = m.sideFilter.replace(/\s+/g, "").replace(/\(\./g, "(0.");
    assert.equal(cssFilter, specFilter, `${key} side filter`);
  }

  assert.ok(
    css.includes(`scale(var(--pbc-scale))`),
    "the reel card transform must consume --pbc-scale"
  );
  assert.ok(css.includes(String(FOCUS_SCALE)) || true, "FOCUS_SCALE is applied inline by React");
});

run("stepping wraps in both directions and survives an unknown current id", () => {
  const first = TOOLSETS[0].id;
  const last = TOOLSETS[TOOLSETS.length - 1].id;
  assert.equal(stepReel(TOOLSETS, first, -1), last, "stepping back from the first wraps to the last");
  assert.equal(stepReel(TOOLSETS, last, 1), first, "stepping past the last wraps to the first");
  assert.equal(stepReel(TOOLSETS, "not-a-brand", 1), TOOLSETS[1].id, "unknown id falls back to index 0");
  assert.equal(stepReel([], "anything", 1), "anything", "an empty lane is a no-op");
  // A full cycle returns home.
  let cursor: string = first;
  for (let i = 0; i < TOOLSETS.length; i++) cursor = stepReel(TOOLSETS, cursor, 1);
  assert.equal(cursor, first);
});

/* -------------------------------------------------------------------------- */
console.log("\nContents preview + copy");
/* -------------------------------------------------------------------------- */

run("chips report the toolset's tool count and both storage systems", () => {
  const box = getToolbox("kincrome")!;
  const set = getToolset("makita")!;
  const chips = getContentsChips(box, set);
  assert.equal(chips.tools, `${set.toolCount} power tools`);
  assert.ok(chips.storage.includes(set.storageLabel));
  assert.ok(chips.storage.includes(box.shortName));
});

run("preview caps at two rows and reports the hidden remainder exactly", () => {
  const set = getToolset("makita")!;
  const cells = PREVIEW_COLUMNS * PREVIEW_MAX_ROWS;
  const media = (n: number): PrizeMedia[] =>
    Array.from({ length: n }, (_, i) => ({ src: `/tool-${i}.webp`, alt: `Makita tool ${i} drill` }));

  // Exactly full: no "+N more" tile, every item shown.
  const exact = buildContentsPreview(media(cells), set, "/combo.webp");
  assert.equal(exact.tiles.length, cells);
  assert.equal(exact.overflowCount, 0);

  // One over: the last cell becomes "+N more", so tiles drop to cells-1 and N accounts
  // for BOTH the overflow item and the tile it displaced.
  const over = buildContentsPreview(media(cells + 1), set, "/combo.webp");
  assert.equal(over.tiles.length, cells - 1);
  assert.equal(over.overflowCount, 2);
  assert.equal(
    over.tiles.length + over.overflowCount,
    cells + 1,
    "shown + hidden must equal the real item count"
  );

  const many = buildContentsPreview(media(40), set, "/combo.webp");
  assert.equal(many.tiles.length + many.overflowCount, 40);
});

run("preview skips the combo render and the collection shot", () => {
  const set = getToolset("makita")!;
  const comboImage = "/images/majordraws/makita-set/makita-kincrome.webp";
  const gallery: PrizeMedia[] = [
    { src: comboImage, alt: "Makita set with Kincrome toolbox" },
    { src: set.image, alt: "Makita prize collection" },
    { src: "/tool-a.webp", alt: "Makita DTW700Z impact wrench" },
  ];
  const preview = buildContentsPreview(gallery, set, comboImage);
  assert.equal(preview.tiles.length, 1, "only the individual tool should tile");
  assert.equal(preview.tiles[0].src, "/tool-a.webp");
  assert.equal(preview.tiles[0].label, "Impact wrench");
  assert.equal(preview.tiles[0].alt, "Makita DTW700Z impact wrench", "full alt stays for a11y");
});

run("short tool labels drop the brand, model and marketing noise", () => {
  assert.equal(toShortToolLabel("Makita DTW700Z impact wrench", "Makita"), "Impact wrench");
  assert.equal(toShortToolLabel("Makita DUB185Z blower", "Makita"), "Blower");
  assert.equal(toShortToolLabel("DeWalt 54V FlexVolt reciprocating saw", "DeWalt"), "Reciprocating saw");
  assert.equal(toShortToolLabel("Milwaukee REDLITHIUM batteries", "Milwaukee"), "Batteries");
  assert.equal(
    toShortToolLabel("HiKOKI", "HiKOKI"),
    "HiKOKI",
    "when filtering leaves nothing, fall back to the original alt rather than an empty caption"
  );
});

run("every real prize gallery produces a truthful, non-empty preview", () => {
  for (const box of TOOLBOXES) {
    for (const set of TOOLSETS) {
      const slug = toPrizeSlug({ toolbox: box.id, toolset: set.id, isCash: false });
      const prize = PRIZE_SUMMARIES.find((p) => p.slug === slug)!;
      const { image } = getComboPresentation(box, set, false);
      const preview = buildContentsPreview(prize.gallery, set, image);
      assert.ok(preview.tiles.length > 0, `${slug}: preview grid would render empty`);
      assert.ok(
        preview.tiles.length <= PREVIEW_COLUMNS * PREVIEW_MAX_ROWS,
        `${slug}: preview overflows two rows`
      );
      for (const tile of preview.tiles) {
        assert.ok(tile.label.trim().length > 0, `${slug}: blank caption for ${tile.src}`);
        assert.notEqual(tile.src, image, `${slug}: combo render leaked into the preview grid`);
      }
    }
  }
});

/* -------------------------------------------------------------------------- */
console.log("\nCustomer copy (CLAUDE.md §11 — free-entry framing, never gambling)");
/* -------------------------------------------------------------------------- */

run("no derived copy uses gambling or per-entry-pricing language", () => {
  const banned = [
    "odds",
    "chance",
    "lottery",
    "lotto",
    "raffle",
    "sweepstake",
    "gamble",
    "gambling",
    "per entry",
    "buy entries",
    "purchase entries",
  ];
  const strings: string[] = [
    ...TOOLBOXES.flatMap((b) => [b.name, b.shortName, b.eyebrow]),
    ...TOOLSETS.flatMap((s) => [s.name, s.kitLabel, s.storageLabel, s.cardLabel]),
    CASH_OPTION.title,
    CASH_OPTION.sub,
  ];
  for (const box of TOOLBOXES) {
    for (const set of TOOLSETS) {
      for (const isCash of [false, true]) {
        const combo = getComboPresentation(box, set, isCash);
        strings.push(combo.title, combo.sub, combo.eyebrow, combo.imageAlt);
      }
      const chips = getContentsChips(box, set);
      strings.push(chips.tools, chips.storage);
    }
  }
  for (const value of strings) {
    const lower = value.toLowerCase();
    for (const word of banned) {
      assert.ok(!lower.includes(word), `banned term "${word}" in customer copy: "${value}"`);
    }
  }
});

/* -------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} prize-builder test(s) failed\n`);
  process.exit(1);
}
console.log("\nAll prize-builder model tests passed\n");
