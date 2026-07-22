/**
 * Prize gallery "Spotlight" model — regression guard for the /promotions showroom.
 *
 * Run: `npm run test:prize-gallery`
 *
 * These are the invariants a UI bug would silently break:
 *  - every combination the rail renders resolves to a REAL catalog prize, a real
 *    `/promotions/<slug>` route and a composite render that exists on disk (a
 *    missing one is a broken thumb AND a 404 from the CTA);
 *  - the opening selection tracks the site's DEFAULT_PRIZE_SLUG rather than a
 *    hard-coded pair, so the showroom and the rest of the site agree;
 *  - cash mode blanks the gear stats and never links at a tool combination;
 *  - the CTA ink stays legible on the pale brand accents (DeWalt, Ryobi, cash);
 *  - copy stays free-entry safe (CLAUDE.md §11).
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

import { DEFAULT_PRIZE_SLUG, PRIZE_SUMMARIES } from "@/config/prize-summaries";
import { accentInk, contrastRatio } from "@/utils/prize-brand-colors";
import {
  CASH_OPTION,
  TOOLBOXES,
  TOOLSETS,
} from "@/components/sections/promo/prize-selection/constants";
import type { PrizeSelection } from "@/components/sections/promo/prize-selection/prize-builder-model";
import {
  CASH_ONLY_AMOUNT,
  COMBINATION_COUNT,
  COMBO_CASH_BONUS,
  DEFAULT_SELECTION,
  getSpotlightView,
  isComboSelected,
  needsMarkOutline,
  resolveSelection,
  toolsetKitLine,
} from "../gallery-spotlight-model";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const assetExists = (webPath: string) => existsSync(path.join(PUBLIC_DIR, webPath));

/** Every combination the rail renders, in rail order. */
const ALL_COMBOS: PrizeSelection[] = TOOLSETS.flatMap((toolset) =>
  TOOLBOXES.map((toolbox) => ({ toolset: toolset.id, toolbox: toolbox.id, isCash: false }))
);

const CASH_SELECTION: PrizeSelection = { ...DEFAULT_SELECTION, isCash: true };

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
console.log("\nRail coverage");
/* -------------------------------------------------------------------------- */

run("the advertised combination count matches what the rail actually renders", () => {
  assert.equal(COMBINATION_COUNT, ALL_COMBOS.length);
  assert.equal(COMBINATION_COUNT, TOOLSETS.length * TOOLBOXES.length);
});

run("every combination has a catalog prize, a render on disk and a working link", () => {
  const slugs = new Set(PRIZE_SUMMARIES.map((prize) => prize.slug));
  for (const selection of ALL_COMBOS) {
    const view = getSpotlightView(selection);
    const slug = `${selection.toolset}-${selection.toolbox}`;
    assert.ok(slugs.has(slug as never), `no catalog entry for ${slug}`);
    assert.equal(view.href, `/promotions/${slug}`);
    assert.ok(assetExists(view.image), `missing combo render for ${slug}: ${view.image}`);
  }
});

run("the cash option links at the cash prize page and its render exists", () => {
  const view = getSpotlightView(CASH_SELECTION);
  assert.equal(view.href, `/promotions/${CASH_OPTION.slug}`);
  assert.ok(assetExists(view.image), `missing cash render: ${view.image}`);
});

run("every toolbox mark and toolset wordmark the rail paints exists on disk", () => {
  for (const toolbox of TOOLBOXES) {
    assert.ok(assetExists(toolbox.markImage), `missing toolbox mark: ${toolbox.markImage}`);
    assert.ok(toolbox.brandName.length > 0, `${toolbox.id} has no brandName`);
  }
  for (const toolset of TOOLSETS) {
    assert.ok(assetExists(toolset.wordmark), `missing toolset wordmark: ${toolset.wordmark}`);
  }
});

/* -------------------------------------------------------------------------- */
console.log("\nDefault selection");
/* -------------------------------------------------------------------------- */

run("opens on the site's DEFAULT_PRIZE_SLUG, not a hard-coded pair", () => {
  assert.equal(DEFAULT_SELECTION.isCash, false);
  assert.equal(
    `${DEFAULT_SELECTION.toolset}-${DEFAULT_SELECTION.toolbox}`,
    DEFAULT_PRIZE_SLUG,
    "the showroom must open on the same combination the rest of the site headlines"
  );
});

run("an unknown selection falls back to real registry records rather than crashing", () => {
  const { toolset, toolbox } = resolveSelection({
    toolset: "nope" as never,
    toolbox: "nope" as never,
    isCash: false,
  });
  assert.equal(toolset.id, TOOLSETS[0].id);
  assert.equal(toolbox.id, TOOLBOXES[0].id);
});

/* -------------------------------------------------------------------------- */
console.log("\nView derivation");
/* -------------------------------------------------------------------------- */

run("a tool combination reads <Toolset> × <Toolbox> and carries the cash bonus", () => {
  const view = getSpotlightView({ toolset: "makita", toolbox: "kincrome", isCash: false });
  assert.equal(view.title, "Makita × Kincrome");
  assert.equal(view.tag, "Live preview");
  assert.equal(view.cashFlag, `+ ${COMBO_CASH_BONUS} cash`);
  assert.equal(view.accent, TOOLSETS.find((s) => s.id === "makita")!.accent);
  assert.equal(view.description, `${toolsetKitLine(TOOLSETS.find((s) => s.id === "makita")!)} · 470 Piece Kincrome Toolbox`);
});

run("stat tiles report the toolset's tool count, the toolbox brand and the bonus", () => {
  for (const selection of ALL_COMBOS) {
    const { toolset, toolbox } = resolveSelection(selection);
    const [tools, storage, cash] = getSpotlightView(selection).stats;
    assert.equal(tools.value, `${toolset.toolCount} tools`);
    assert.equal(storage.value, toolbox.brandName);
    assert.equal(cash.value, COMBO_CASH_BONUS);
    assert.equal(cash.isCash, true);
  }
});

run("cash mode blanks the gear stats and swaps the headline", () => {
  const view = getSpotlightView(CASH_SELECTION);
  assert.equal(view.title, CASH_OPTION.title);
  assert.equal(view.tag, "Cash option");
  assert.equal(view.cashFlag, `${CASH_ONLY_AMOUNT} cash`);
  assert.equal(view.accent, CASH_OPTION.accent);
  const [tools, storage, cash] = view.stats;
  assert.equal(tools.value, "—");
  assert.equal(storage.value, "—");
  assert.equal(cash.value, CASH_ONLY_AMOUNT);
});

run("the cross-fade key changes for every distinct option", () => {
  const keys = [...ALL_COMBOS, CASH_SELECTION].map((s) => getSpotlightView(s).key);
  assert.equal(new Set(keys).size, keys.length, "two options share a fade key — the preview would not re-animate");
});

run("only the selected thumb reports as selected, and none do in cash mode", () => {
  const selection: PrizeSelection = { toolset: "ryobi", toolbox: "sidchrome", isCash: false };
  const selected = ALL_COMBOS.filter((c) => isComboSelected(selection, c.toolset, c.toolbox));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].toolset, "ryobi");
  assert.equal(selected[0].toolbox, "sidchrome");
  const inCash = ALL_COMBOS.filter((c) =>
    isComboSelected({ ...selection, isCash: true }, c.toolset, c.toolbox)
  );
  assert.equal(inCash.length, 0);
});

/* -------------------------------------------------------------------------- */
console.log("\nContrast");
/* -------------------------------------------------------------------------- */

run("the CTA clears WCAG AA on every brand accent, cash included", () => {
  // The real invariant, not a per-brand allow-list: whatever ink the model picks
  // must actually be readable on that accent. This is what caught white-on-lime.
  for (const selection of [...ALL_COMBOS, CASH_SELECTION]) {
    const view = getSpotlightView(selection);
    const ratio = contrastRatio(view.accent, view.accentInk);
    assert.ok(
      ratio >= 4.5,
      `CTA ink ${view.accentInk} on ${view.accent} is only ${ratio.toFixed(2)}:1 for ${view.key}`
    );
  }
});

run("pale accents take dark ink and saturated ones keep white", () => {
  assert.equal(accentInk("#febd17"), "#0c0d10", "DeWalt yellow needs dark ink");
  assert.equal(accentInk("#8aa300"), "#0c0d10", "Ryobi lime needs dark ink");
  assert.equal(accentInk("#ee0000"), "#ffffff", "Milwaukee red needs white ink");
});

run("only the brands that actually vanish on the light stage get the hairline", () => {
  const outlined = TOOLSETS.filter((t) => needsMarkOutline(t.accent)).map((t) => t.id);
  assert.deepEqual(
    outlined.sort(),
    ["dewalt", "makita", "ryobi"],
    "the outline must track measured contrast, not a hand-maintained brand list"
  );
  for (const toolset of TOOLSETS) {
    assert.equal(needsMarkOutline(toolset.accent), contrastRatio(toolset.accent, "#ffffff") < 3);
  }
});

run("accentInk survives malformed input instead of emitting an invalid colour", () => {
  assert.equal(accentInk(""), "#ffffff");
  assert.equal(accentInk("not-a-colour"), "#ffffff");
  assert.equal(accentInk("#fff"), "#0c0d10", "shorthand white must resolve like #ffffff");
});

run("contrastRatio matches the WCAG reference values", () => {
  assert.ok(Math.abs(contrastRatio("#ffffff", "#000000") - 21) < 0.01);
  assert.equal(contrastRatio("#ee0000", "#ee0000"), 1);
  assert.equal(contrastRatio("nope", "#ffffff"), 1, "unparseable input must not read as high contrast");
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
    "entry pack",
  ];
  const strings: string[] = [COMBO_CASH_BONUS, CASH_ONLY_AMOUNT];
  for (const selection of [...ALL_COMBOS, CASH_SELECTION]) {
    const view = getSpotlightView(selection);
    strings.push(view.title, view.description, view.tag, view.cashFlag, view.imageAlt);
    for (const stat of view.stats) strings.push(stat.label, stat.value);
  }
  for (const toolset of TOOLSETS) strings.push(toolsetKitLine(toolset));

  for (const value of strings) {
    const lower = value.toLowerCase();
    for (const word of banned) {
      assert.ok(!lower.includes(word), `banned term "${word}" in customer copy: "${value}"`);
    }
  }
});

/* -------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} prize-gallery test(s) failed\n`);
  process.exit(1);
}
console.log("\nAll prize-gallery model tests passed\n");
