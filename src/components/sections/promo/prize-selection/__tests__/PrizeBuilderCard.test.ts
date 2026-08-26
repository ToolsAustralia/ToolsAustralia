/**
 * Render smoke test for the "Build your prize" card.
 *
 * Run: `npm run test:prize-builder-card`
 *
 * `prize-builder-model.test.ts` guards the maths; this guards the MARKUP — the class of
 * bug that only shows up in a browser:
 *  - a card that throws for one particular brand combination,
 *  - a reel that renders two focused cards, or none,
 *  - the CSS custom properties the coverflow depends on going missing,
 *  - invalid nesting (a <button> inside a <button>, block content inside a <button>)
 *    which React hydration and screen readers both punish,
 *  - an <img> with no alt, or the cash-mode surfaces leaking the $5,000 bundle copy.
 *
 * Every toolbox × toolset combination is rendered, so adding a brand exercises it here
 * automatically.
 */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TOOLBOXES, TOOLSETS, type ToolboxBrand, type ToolsetType } from "../constants";
import { PrizeBuilderCard, type PrizeBuilderCardProps } from "../PrizeBuilderCard";
import { getPrizeSummaryBySlug } from "@/config/prize-summaries";
import { toPrizeSlug } from "../prize-builder-model";

let testsRun = 0;
let testsFailed = 0;
function test(name: string, fn: () => void): void {
  testsRun++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    testsFailed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}

const noop = () => {};

function render(overrides: Partial<PrizeBuilderCardProps> = {}): string {
  const toolbox: ToolboxBrand = overrides.toolbox ?? TOOLBOXES[0].id;
  const toolset: ToolsetType = overrides.toolset ?? TOOLSETS[0].id;
  const slug = toPrizeSlug({ toolbox, toolset, isCash: false });
  const gallery = getPrizeSummaryBySlug(slug)?.gallery ?? [];

  const props: PrizeBuilderCardProps = {
    toolbox,
    toolset,
    isCash: false,
    onSelectToolbox: noop,
    onSelectToolset: noop,
    onSelectCash: noop,
    onEnterNow: noop,
    onOpenDetails: noop,
    gallery,
    drawLabel: "27 JUL · 8PM AEST",
    ...overrides,
  };

  return renderToStaticMarkup(React.createElement(PrizeBuilderCard, props));
}

/** Crude but sufficient tag-balance walk to find `<button>` nested inside `<button>`. */
function maxButtonNesting(html: string): number {
  let depth = 0;
  let max = 0;
  const re = /<(\/?)button\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match[1] === "/") depth--;
    else {
      depth++;
      if (depth > max) max = depth;
    }
  }
  return max;
}

/** Extract the inner HTML of every top-level `<button …>…</button>` region. */
function buttonBodies(html: string): string[] {
  const bodies: string[] = [];
  const re = /<button\b[^>]*>([\s\S]*?)<\/button>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) bodies.push(match[1]);
  return bodies;
}

const attrValues = (html: string, pattern: RegExp): string[] =>
  [...html.matchAll(pattern)].map((m) => m[1]);

/* -------------------------------------------------------------------------- */
console.log("\nPrizeBuilderCard — structure");
/* -------------------------------------------------------------------------- */

test("renders every toolbox × toolset combination without throwing", () => {
  for (const box of TOOLBOXES) {
    for (const set of TOOLSETS) {
      const html = render({ toolbox: box.id, toolset: set.id });
      assert.ok(html.includes("Build your prize"), `${set.id}-${box.id}: header missing`);
      assert.ok(html.includes("prize-builder"), `${set.id}-${box.id}: token scope missing`);
    }
  }
});

test("both reels render one card per registry entry", () => {
  const html = render();
  const cards = html.match(/pbc-reel-card/g) ?? [];
  assert.equal(
    cards.length,
    TOOLBOXES.length + TOOLSETS.length,
    "reel card count must equal the two registries combined"
  );
});

test("exactly one card per reel is focused", () => {
  const html = render();
  const focused = attrValues(html, /data-focused="(\w+)"/g).filter((v) => v === "true");
  assert.equal(focused.length, 2, "one focused toolbox card and one focused toolset card");
});

test("every reel card carries the coverflow custom properties", () => {
  const html = render();
  const cardCount = (html.match(/pbc-reel-card/g) ?? []).length;
  assert.equal(attrValues(html, /--pbc-off:\s*([-\d]+)/g).length, cardCount);
  assert.equal(attrValues(html, /--pbc-off-abs:\s*([-\d]+)/g).length, cardCount);
  assert.equal(attrValues(html, /--pbc-scale:\s*([^;"]+)/g).length, cardCount);
});

test("reel offsets are unique within each lane and include a zero", () => {
  const html = render({ toolbox: TOOLBOXES[1].id, toolset: TOOLSETS[2].id });
  const offsets = attrValues(html, /--pbc-off:\s*([-\d]+)/g).map(Number);
  const boxLane = offsets.slice(0, TOOLBOXES.length);
  const setLane = offsets.slice(TOOLBOXES.length);
  for (const [lane, name] of [
    [boxLane, "toolbox"],
    [setLane, "toolset"],
  ] as const) {
    assert.equal(new Set(lane).size, lane.length, `${name} lane has overlapping offsets`);
    assert.ok(lane.includes(0), `${name} lane has no focused card`);
  }
});

test("the accent variable follows the selected toolset", () => {
  for (const set of TOOLSETS) {
    const html = render({ toolset: set.id });
    const accent = (html.match(/--pbc-accent:\s*([^;"]+)/) ?? [])[1];
    assert.equal(accent, set.accent, `${set.id}: card accent`);
  }
});

test("the New badge renders only for brands flagged new", () => {
  const html = render();
  const badges = html.match(/>New</g) ?? [];
  const expected = [...TOOLBOXES, ...TOOLSETS].filter((o) => o.isNew).length;
  assert.equal(badges.length, expected, "one New badge per flagged brand, no more");
});

/* -------------------------------------------------------------------------- */
console.log("\nPrizeBuilderCard — cash mode");
/* -------------------------------------------------------------------------- */

test("cash mode dims both reels and drops the contents strip", () => {
  const html = render({ isCash: true });
  assert.ok(html.includes('data-dimmed="true"'), "reels must be dimmed");
  assert.equal((html.match(/data-dimmed="true"/g) ?? []).length, 2, "both reels dim");
  assert.ok(!html.includes("in this prize"), "the contents strip has no meaning in cash mode");
  assert.ok(!html.includes("CASH INCLUDED"), "no bundled-cash flag exists since draw 10");
  assert.ok(html.includes("$10,000 tax-free cash"), "the cash headline must show");
});

test("cash mode repaints the card green and clears every focus ring", () => {
  const html = render({ isCash: true });
  assert.equal((html.match(/--pbc-accent:\s*([^;"]+)/) ?? [])[1], "#18a94d");
  const focused = attrValues(html, /data-focused="(\w+)"/g).filter((v) => v === "true");
  assert.equal(focused.length, 0, "no card is focused while the winner has taken the cash");
});

// Draw 10 removed the $5,000 cash bonus from every tool combination. This test used to assert
// the OPPOSITE — that the hero and chips advertised it — which is why it is inverted rather
// than deleted: the inverted form is a standing guard that the claim never comes back by
// accident. The $10,000 cash-only option is a separate selection and is untouched.
test("bundle mode makes NO cash claim — the $5,000 bonus is gone", () => {
  const html = render();
  assert.ok(!html.includes("CASH INCLUDED"), "the hero must not flag a bundled cash bonus");
  assert.ok(!html.includes("$5,000"), "no $5,000 claim may appear anywhere in the card");
  assert.ok(!/\$5[,.]?000|\$5K/i.test(html), "no $5K claim in any spelling");
  assert.ok(html.includes("THIS IS WHAT YOU WIN"), "the combination hero still renders");
});

/* -------------------------------------------------------------------------- */
console.log("\nPrizeBuilderCard — toolset landing pages");
/* -------------------------------------------------------------------------- */

test("neither lane is ever collapsed — a toolset landing page still offers all brands", () => {
  // `/promotions/milwaukee` OPENS on Milwaukee but must still let the visitor turn the
  // reel: that reel is what replaced the old "explore other toolsets" strip below the card.
  const html = render({ toolset: "milwaukee" });
  assert.equal(
    (html.match(/pbc-reel-card/g) ?? []).length,
    TOOLBOXES.length + TOOLSETS.length,
    "both lanes render their full registry"
  );
  assert.ok(html.includes("Next power toolset"), "the toolset lane keeps its arrows");
  assert.ok(html.includes("Next toolbox"), "the toolbox lane keeps its arrows");
});

test("the count pill states the real number of options, never a vague '+ more'", () => {
  const html = render();
  assert.ok(html.includes(`${TOOLBOXES.length} options`));
  assert.ok(html.includes(`${TOOLSETS.length} options`));
  assert.ok(!html.includes("+ more"), "'N + more' would imply options the lane does not have");
});

/* -------------------------------------------------------------------------- */
console.log("\nPrizeBuilderCard — markup validity and accessibility");
/* -------------------------------------------------------------------------- */

test("no button is nested inside another button", () => {
  for (const isCash of [false, true]) {
    const html = render({ isCash });
    assert.equal(maxButtonNesting(html), 1, `isCash=${isCash}: nested <button> found`);
  }
});

test("buttons contain only phrasing content (no div/p/ul/li/headings)", () => {
  const html = render();
  for (const body of buttonBodies(html)) {
    for (const tag of ["div", "p", "ul", "ol", "li", "h1", "h2", "h3", "h4", "section"]) {
      assert.ok(
        !new RegExp(`<${tag}\\b`).test(body),
        `<${tag}> inside a <button> — invalid content model, breaks hydration/AT`
      );
    }
  }
});

test("every image has an alt attribute", () => {
  const html = render();
  const imgs = html.match(/<img\b[^>]*>/g) ?? [];
  assert.ok(imgs.length > 0, "the card should render product art");
  for (const img of imgs) {
    assert.ok(/\salt="/.test(img), `<img> without alt: ${img.slice(0, 120)}`);
  }
});

test("off-stage cards are both hidden and untabbable", () => {
  // `REEL_VISIBLE_RADIUS` is 3 and `isHidden` is `|offset| >= 3`, so a reel shows FIVE cards
  // (offsets -2..+2). A lane with more than five entries therefore always has at least one
  // card parked off stage — it rotates into view as the reel steps. That is the reel working
  // as designed, not a defect.
  //
  // This assertion used to be "nothing is off stage with today's registries", which held only
  // while the longest lane had five entries. STIHL made the toolset lane six (draw 10) and it
  // went red. Assert the INVARIANT the test is named for instead: whatever is off stage must
  // be inert. That survives the next brand.
  const html = render();
  const cards = html.match(/<button\b[^>]*data-offstage="[^"]*"[^>]*>/g) ?? [];
  assert.equal(cards.length, TOOLBOXES.length + TOOLSETS.length, "one card per registry entry");

  const longestLane = Math.max(TOOLBOXES.length, TOOLSETS.length);
  const offstageCount = cards.filter((c) => /data-offstage="true"/.test(c)).length;
  if (longestLane <= 5) {
    assert.equal(offstageCount, 0, "no lane exceeds the five-card window, so nothing should be off stage");
  }

  for (const card of cards) {
    if (!/data-offstage="true"/.test(card)) continue;
    assert.ok(/aria-hidden="true"/.test(card), `off-stage card must be aria-hidden: ${card.slice(0, 120)}`);
    assert.ok(/tabindex="-1"/i.test(card), `off-stage card must be untabbable: ${card.slice(0, 120)}`);
  }
});

test("each lane is a radiogroup with exactly one checked radio", () => {
  const html = render();
  assert.equal((html.match(/role="radiogroup"/g) ?? []).length, 2, "one radiogroup per lane");
  assert.equal(
    (html.match(/role="radio"/g) ?? []).length,
    TOOLBOXES.length + TOOLSETS.length,
    "every reel card is a radio"
  );
  assert.equal(
    (html.match(/aria-checked="true"/g) ?? []).length,
    2,
    "exactly one checked option per lane"
  );
});

test("roving tabindex: only the two selected cards are in the tab order", () => {
  const html = render();
  // Only reel cards carry an explicit tabindex, so counting across the card is safe.
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 2, "one tab stop per lane");
  assert.equal(
    (html.match(/tabindex="-1"/g) ?? []).length,
    TOOLBOXES.length + TOOLSETS.length - 2,
    "every unselected card is skipped by Tab; the arrows move between them"
  );
});

test("reel controls and toggles expose their labels", () => {
  const html = render();
  assert.ok(html.includes('aria-label="Next toolbox"'));
  assert.ok(html.includes('aria-label="Previous power toolset"'));
  assert.ok(html.includes('aria-label="Choose how you take the prize"'));
  assert.ok(html.includes('aria-pressed="true"'), "the bundle/cash toggle stays a pressed pair");
});

/* -------------------------------------------------------------------------- */
console.log("\nPrizeBuilderCard — CTA and secure checkout");
/* -------------------------------------------------------------------------- */

test("the CTA block renders the entry button, both toggles and every payment mark", () => {
  const html = render();
  assert.ok(html.includes("Enter now"), "primary CTA");
  assert.ok(html.includes("Toolbox bundle"));
  assert.ok(html.includes("Take $10,000 cash"));
  assert.ok(html.includes("INSTANT AND SECURE CHECKOUT WITH"));
  for (const mark of ["Visa", "Google Pay", "Mastercard", "Stripe", "Apple Pay"]) {
    assert.ok(html.includes(`aria-label="${mark}"`), `payment mark missing: ${mark}`);
  }
});

test("the draw stamp renders when known and disappears when it is not", () => {
  assert.ok(render().includes("DRAWN 27 JUL"));
  assert.ok(!render({ drawLabel: null }).includes("DRAWN"), "no stamp when the draw date is unknown");
});

/* -------------------------------------------------------------------------- */
console.log("\nPrizeBuilderCard — customer copy (CLAUDE.md §11)");
/* -------------------------------------------------------------------------- */

test("rendered copy carries no gambling or per-entry-pricing language", () => {
  const banned = ["odds", "chance", "lottery", "lotto", "raffle", "sweepstake", "gamble", "per entry"];
  for (const isCash of [false, true]) {
    const text = render({ isCash })
      .replace(/<[^>]+>/g, " ")
      .toLowerCase();
    for (const word of banned) {
      assert.ok(!text.includes(word), `banned term "${word}" rendered (isCash=${isCash})`);
    }
  }
});

/* -------------------------------------------------------------------------- */

console.log(`\n${testsRun - testsFailed}/${testsRun} prize-builder card tests passed\n`);
if (testsFailed > 0) process.exit(1);
