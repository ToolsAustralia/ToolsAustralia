/**
 * Guards the pure layer behind `/discount`.
 *
 * The page's whole argument is a claim about numbers — "your 50% makes 917 of 1,833
 * redeemable, and here are the two cheapest ways to reach the rest". Every one of those
 * figures comes from this module, and a wrong one is a promise we do not keep rather than a
 * visual bug. The banding and the wall are equally load-bearing: the wall must land on the
 * FIRST unreachable level and nowhere else, or the page draws the member's limit in the
 * wrong place.
 *
 * Run: npm run test:discount-catalogue
 */

import assert from "node:assert/strict";

import {
  ALL_ROWS,
  DIRECT_ROWS,
  VENDOR_ROWS,
  DISCOUNT_LEVELS,
  CATEGORY_CHIPS,
  LEVEL_CHIPS,
  buildBands,
  buildGate,
  filterAndSortRows,
  nextLevelAbove,
  offersAtLevel,
  redeemableCount,
  resolveDiscountRoutes,
  plateLetter,
  PARTNER_CATALOG_TOTAL,
  PARTNER_CATALOG_TIER_COUNTS,
  type DiscountRow,
} from "../discount-catalogue";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log("discount-catalogue\n");

// ── Shape of the two data sets ────────────────────────────────────────────────

check("the vendor snapshot is the full committed catalogue", () => {
  assert.equal(VENDOR_ROWS.length, PARTNER_CATALOG_TOTAL);
  assert.ok(VENDOR_ROWS.every((r) => r.kind === "vendor"));
});

check("the 7 direct partners sit at pct 0 and carry a logo", () => {
  assert.equal(DIRECT_ROWS.length, 7);
  assert.ok(DIRECT_ROWS.every((r) => r.pct === 0));
  assert.ok(DIRECT_ROWS.every((r) => Boolean(r.logo)));
  // pct 0 is a band key, never a vendor level — it must not be on the ladder.
  assert.ok(!DISCOUNT_LEVELS.includes(0));
});

check('a direct partner\'s placeholder "#" link never becomes an href', () => {
  // Two of the seven have no real site yet. Rendering "#" would be a dead link on a page
  // whose entire promise is that the offer is real.
  assert.ok(DIRECT_ROWS.some((r) => r.link === null));
  assert.ok(DIRECT_ROWS.every((r) => r.link !== "#"));
});

check("direct partners lead the combined list", () => {
  assert.equal(ALL_ROWS.length, PARTNER_CATALOG_TOTAL + 7);
  assert.ok(ALL_ROWS.slice(0, 7).every((r) => r.kind === "direct"));
});

check("every vendor row carries one of the 11 ladder levels", () => {
  const ladder = new Set(DISCOUNT_LEVELS);
  assert.ok(VENDOR_ROWS.every((r) => ladder.has(r.pct)));
});

check("category chips cover the catalogue exactly once", () => {
  const withoutAll = CATEGORY_CHIPS.filter((c) => c.value !== null);
  assert.equal(withoutAll.length, 11);
  assert.equal(
    withoutAll.reduce((n, c) => n + c.count, 0),
    PARTNER_CATALOG_TOTAL
  );
  assert.equal(CATEGORY_CHIPS[0].value, null);
  assert.equal(CATEGORY_CHIPS[0].count, PARTNER_CATALOG_TOTAL);
});

// ── Counts ────────────────────────────────────────────────────────────────────

check("tier counts are cumulative and end at the full catalogue", () => {
  let prev = 0;
  for (const level of DISCOUNT_LEVELS) {
    const n = offersAtLevel(level);
    assert.ok(n !== null, `level ${level} has no count`);
    assert.ok(n! >= prev, `level ${level} went backwards`);
    prev = n!;
  }
  assert.equal(prev, PARTNER_CATALOG_TOTAL);
  assert.equal(offersAtLevel(50), PARTNER_CATALOG_TIER_COUNTS[50]);
});

check("an off-ladder percent yields no count rather than a guess", () => {
  assert.equal(offersAtLevel(60), null);
  assert.equal(offersAtLevel(0), null);
});

check("a signed-out viewer can redeem nothing, whatever percent is passed", () => {
  assert.equal(redeemableCount(0, false), 0);
  assert.equal(redeemableCount(100, false), 0);
  assert.equal(redeemableCount(50, true), 917);
});

check("nextLevelAbove walks the ladder and stops at the top", () => {
  assert.equal(nextLevelAbove(50), 55);
  assert.equal(nextLevelAbove(0), 5);
  assert.equal(nextLevelAbove(85), 100);
  assert.equal(nextLevelAbove(100), null);
});

// ── Filtering and sorting ─────────────────────────────────────────────────────

const baseFilter = {
  query: "",
  category: null as string | null,
  levels: [] as number[],
  openOnly: false,
  sort: "access" as const,
  viewerPct: 50,
  signedIn: true,
};

check("access sort is ascending, so direct partners lead and the ladder climbs", () => {
  const out = filterAndSortRows(ALL_ROWS, baseFilter);
  assert.equal(out[0].pct, 0);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].pct >= out[i - 1].pct);
});

check('"only what I can use" hides everything above the viewer, and only for members', () => {
  const member = filterAndSortRows(ALL_ROWS, { ...baseFilter, openOnly: true });
  assert.ok(member.every((r) => r.pct <= 50));
  assert.equal(member.length, 917 + 7);

  // Signed out the toggle is not offered; if it somehow arrives set, it must not empty the
  // page — a guest at 0% would otherwise see nothing at all.
  const guest = filterAndSortRows(ALL_ROWS, {
    ...baseFilter,
    openOnly: true,
    signedIn: false,
    viewerPct: 0,
  });
  assert.equal(guest.length, ALL_ROWS.length);
});

check("search covers name, category and value line", () => {
  const byName = filterAndSortRows(ALL_ROWS, { ...baseFilter, query: "zjwraps" });
  assert.equal(byName.length, 1);
  assert.equal(byName[0].id, "zjwraps");

  const byCategory = filterAndSortRows(ALL_ROWS, { ...baseFilter, query: "egift" });
  assert.ok(byCategory.length > 0);

  const byHighlight = filterAndSortRows(ALL_ROWS, { ...baseFilter, query: "cashback" });
  assert.ok(byHighlight.length > 100);
});

check("category filter is single-select and exact", () => {
  const out = filterAndSortRows(ALL_ROWS, { ...baseFilter, category: "Automotive" });
  assert.equal(out.length, 62);
  assert.ok(out.every((r) => r.cat === "Automotive"));
});

check("a level chip selects its rung EXACTLY, and returns exactly the count it advertises", () => {
  for (const chip of LEVEL_CHIPS) {
    if (chip.value === null) continue;
    const rows = filterAndSortRows(ALL_ROWS, { ...baseFilter, levels: [chip.value] });
    // The number on the chip is the number you get — no offset to explain. Direct partners
    // (pct 0) are NOT included: they are "included with any membership", not unlocked at a
    // percent, so an exact-rung filter must exclude them.
    assert.equal(rows.length, chip.count, `level ${chip.value}`);
    assert.ok(rows.every((r) => r.pct === chip.value), `level ${chip.value} is exact`);
  }
});

check("the top rung is a real filter, not a no-op alias for 'Any'", () => {
  // This is why the filter is exact rather than cumulative: cumulative `pct <= 100` selects
  // the entire catalogue, making the 100% chip indistinguishable from "Any".
  const at100 = filterAndSortRows(ALL_ROWS, { ...baseFilter, levels: [100] });
  assert.ok(at100.length > 0);
  assert.ok(at100.length < ALL_ROWS.length);
  assert.ok(at100.every((r) => r.pct === 100));
});

check("rungs union, so selecting 5…50 rebuilds the cumulative 'up to 50%' view", () => {
  const upTo50 = DISCOUNT_LEVELS.filter((p) => p <= 50);
  const rows = filterAndSortRows(ALL_ROWS, { ...baseFilter, levels: upTo50 });
  assert.ok(rows.every((r) => r.pct <= 50 && r.pct > 0));
  // Equals the cumulative tier count for 50% — the two views agree where they overlap.
  assert.equal(rows.length, offersAtLevel(50));

  // And every per-rung count sums to the cumulative one, so the chips partition the ladder.
  const summed = upTo50.reduce(
    (n, p) => n + (LEVEL_CHIPS.find((c) => c.value === p)?.count ?? 0),
    0
  );
  assert.equal(summed, offersAtLevel(50));
});

check("per-rung chip counts partition the whole vendor catalogue", () => {
  const total = LEVEL_CHIPS.filter((c) => c.value !== null).reduce((n, c) => n + c.count, 0);
  assert.equal(total, PARTNER_CATALOG_TOTAL);
});

check("no levels selected is not a filter at all", () => {
  assert.equal(filterAndSortRows(ALL_ROWS, { ...baseFilter, levels: [] }).length, ALL_ROWS.length);
});

check("level selection composes with 'only what I can use' rather than overriding it", () => {
  // A 50% member selecting the 100% rung is asking to see something they cannot redeem; with
  // the "only what I can use" guard on, it must still be filtered back out.
  const capped = filterAndSortRows(ALL_ROWS, { ...baseFilter, levels: [100], openOnly: true });
  assert.equal(capped.length, 0);

  // A rung at or below their access is unaffected by the guard.
  const within = filterAndSortRows(ALL_ROWS, { ...baseFilter, levels: [15], openOnly: true });
  assert.equal(within.length, LEVEL_CHIPS.find((c) => c.value === 15)?.count);
});

check("LEVEL_CHIPS covers the whole ladder once, ascending, behind an 'Any' lead", () => {
  assert.equal(LEVEL_CHIPS[0].value, null);
  const rungs = LEVEL_CHIPS.slice(1).map((c) => c.value);
  assert.deepEqual(rungs, [...DISCOUNT_LEVELS]);
  assert.equal(new Set(rungs).size, rungs.length);
});

// ── Bands and the wall ────────────────────────────────────────────────────────

/** A tiny hand-made set, so band assertions do not depend on catalogue churn. */
const sample: DiscountRow[] = [
  { ...DIRECT_ROWS[0] },
  {
    id: "1",
    name: "Low",
    cat: "Automotive",
    pct: 25,
    highlight: "10% Discount",
    kind: "vendor",
    haystack: "low",
    logo: null,
    imageSrc: null,
    link: null,
  },
  {
    id: "2",
    name: "At",
    cat: "Automotive",
    pct: 50,
    highlight: "10% Discount",
    kind: "vendor",
    haystack: "at",
    logo: null,
    imageSrc: null,
    link: null,
  },
  {
    id: "3",
    name: "Above",
    cat: "Automotive",
    pct: 70,
    highlight: "10% Discount",
    kind: "vendor",
    haystack: "above",
    logo: null,
    imageSrc: null,
    link: null,
  },
  {
    id: "4",
    name: "Top",
    cat: "Automotive",
    pct: 100,
    highlight: "10% Discount",
    kind: "vendor",
    haystack: "top",
    logo: null,
    imageSrc: null,
    link: null,
  },
];

check("the wall lands on the FIRST unreachable band and appears exactly once", () => {
  const bands = buildBands(sample, { viewerPct: 50, signedIn: true, banded: true });
  const walls = bands.filter((b) => b.wall);
  assert.equal(walls.length, 1);
  assert.equal(walls[0].level, 70);

  // Everything at or below the viewer is reachable; everything above is not.
  assert.deepEqual(
    bands.map((b) => [b.level, b.reachable]),
    [
      [0, true],
      [25, true],
      [50, true],
      [70, false],
      [100, false],
    ]
  );
});

check("a signed-out viewer hits the wall at the very first band", () => {
  const bands = buildBands(sample, { viewerPct: 0, signedIn: false, banded: true });
  assert.equal(bands.filter((b) => b.wall).length, 1);
  assert.equal(bands[0].wall, true);
  assert.ok(bands.every((b) => !b.reachable));
  assert.match(bands[0].wallText, /membership/i);
});

check("a 100% member never sees a wall", () => {
  const bands = buildBands(sample, { viewerPct: 100, signedIn: true, banded: true });
  assert.equal(bands.filter((b) => b.wall).length, 0);
  assert.ok(bands.every((b) => b.reachable));
});

check("unbanded (A–Z / Category sort) yields one flat group with no wall", () => {
  const bands = buildBands(sample, { viewerPct: 50, signedIn: true, banded: false });
  assert.equal(bands.length, 1);
  assert.equal(bands[0].wall, false);
  assert.equal(bands[0].name, "");
  assert.equal(bands[0].rows.length, sample.length);
});

check("band headers name the level, not a membership tier", () => {
  const bands = buildBands(sample, { viewerPct: 50, signedIn: true, banded: true });
  assert.equal(bands[0].name, "Included with any membership");
  assert.equal(bands[0].total, "7 direct partners");
  assert.equal(bands[2].name, "Yours at 50%");
  assert.equal(bands[3].name, "Needs 70% to redeem");
  assert.match(bands[3].total, /1,284 of 1,833 redeemable at 70%/);
});

// ── The gate ──────────────────────────────────────────────────────────────────

const vendorAt70 = sample[3];
const vendorAt25 = sample[1];

check("a locked vendor offer offers both routes and notches the bar", () => {
  const gate = buildGate(vendorAt70, 50, true);
  assert.equal(gate.locked, true);
  assert.equal(gate.title, "Needs 70% to redeem");
  assert.equal(gate.body, "You have 50%.");
  assert.equal(gate.showRoutes, true);
  assert.equal(gate.notchPct, 70);
  assert.equal(gate.tallyValue, "50% · 917 offers");
  assert.equal(gate.tallyValue2, "1,284 offers");
  assert.equal(gate.ctaLabel, null);
});

check("a redeemable vendor offer sends the member to the portal", () => {
  const gate = buildGate(vendorAt25, 50, true);
  assert.equal(gate.locked, false);
  assert.equal(gate.title, "Redeemable on your 50% access");
  assert.equal(gate.ctaLabel, "Redeem in portal");
  assert.equal(gate.showRoutes, false);
  assert.equal(gate.notchPct, null);
  assert.match(gate.footNote, /rewards partner/i);
});

check("a signed-out visitor is asked to log in, never shown routes", () => {
  const gate = buildGate(vendorAt70, 0, false);
  assert.equal(gate.locked, true);
  assert.equal(gate.title, "Log in to redeem");
  assert.equal(gate.showLoginCta, true);
  assert.equal(gate.showRoutes, false);
  assert.equal(gate.ctaLabel, null);
});

check("a direct partner has no vendor access bar and no unlock routes", () => {
  const open = buildGate(DIRECT_ROWS[0], 50, true);
  assert.equal(open.showBar, false);
  assert.equal(open.showRoutes, false);
  assert.equal(open.locked, false);
  assert.match(open.body, /mention Tools Australia/i);

  const guest = buildGate(DIRECT_ROWS[0], 0, false);
  assert.equal(guest.locked, true);
  assert.equal(guest.showLoginCta, true);
  assert.equal(guest.showBar, false);
});

check("a direct partner with no site listed offers no dead CTA", () => {
  const noLink = DIRECT_ROWS.find((r) => r.link === null);
  assert.ok(noLink);
  const gate = buildGate(noLink!, 50, true);
  assert.equal(gate.ctaLabel, null);
  assert.match(gate.footNote, /No site listed yet/i);
});

// ── The two routes ────────────────────────────────────────────────────────────

check("every ladder level resolves BOTH a membership and a one-time route", () => {
  for (const level of DISCOUNT_LEVELS) {
    const routes = resolveDiscountRoutes(level, 0);
    const kinds = routes.map((r) => r.kind);
    assert.ok(kinds.includes("membership"), `level ${level} has no membership route`);
    assert.ok(kinds.includes("pack"), `level ${level} has no pack route`);
    // A route that does not actually reach the level would be a false promise.
    assert.ok(routes.every((r) => r.pct >= level), `level ${level} resolved a short route`);
  }
});

check("the membership route is the cheaper of the two at every level", () => {
  // The design leans on this: the membership always carries "Cheapest way in" against the
  // pack's "No subscription". If pricing ever changes so a pack undercuts a membership, the
  // labels become a lie and this test is where that surfaces.
  for (const level of DISCOUNT_LEVELS) {
    const routes = resolveDiscountRoutes(level, 0);
    const sub = routes.find((r) => r.kind === "membership")!;
    const pack = routes.find((r) => r.kind === "pack")!;
    assert.ok(
      sub.price < pack.price,
      `at ${level}% the ${sub.name} ($${sub.price}) is not cheaper than the ${pack.name} ($${pack.price})`
    );
  }
});

check("route labels and payoff read correctly for a 50% member reaching 70%", () => {
  const routes = resolveDiscountRoutes(70, redeemableCount(50, true));
  const sub = routes.find((r) => r.kind === "membership")!;
  const pack = routes.find((r) => r.kind === "pack")!;

  assert.equal(sub.name, "Foreman");
  assert.equal(sub.pct, 75);
  assert.equal(sub.ctaLabel, "Get Foreman");
  assert.equal(sub.tagLabel, "Cheapest way in");
  assert.equal(sub.periodLabel, "per month · cancel anytime");
  // 1,375 at 75% − 917 already held.
  assert.equal(sub.gainLabel, "+458 redeemable");

  assert.equal(pack.name, "Boss Pack");
  assert.equal(pack.pct, 70);
  // The package name already ends in "Pack" — "Get the Boss Pack pack" was a real bug.
  assert.equal(pack.ctaLabel, "Get the Boss Pack");
  assert.equal(pack.tagLabel, "No subscription");
  assert.equal(pack.periodLabel, "One Time");
  assert.ok(pack.days > 0, "a one-time pack must state its day window");
  // Both tiles name what is being accessed — see the caption note in resolveDiscountRoutes.
  assert.equal(pack.accessCaption, `${pack.days}-day discount access`);
});

check("a subscription route never advertises a day window", () => {
  const sub = resolveDiscountRoutes(50, 0).find((r) => r.kind === "membership")!;
  assert.equal(sub.days, 0);
  assert.equal(sub.accessCaption, "partner discount access");
});

check("an off-ladder level resolves no routes rather than guessing a tier", () => {
  assert.deepEqual(resolveDiscountRoutes(60, 0), []);
  assert.deepEqual(resolveDiscountRoutes(0, 0), []);
});

check("every route carries a free-entries figure", () => {
  for (const level of DISCOUNT_LEVELS) {
    for (const route of resolveDiscountRoutes(level, 0)) {
      assert.ok(route.entries > 0, `${route.name} at ${level}% reports no entries`);
    }
  }
});

// ── Copy rules (CLAUDE.md rule 11 — legal) ────────────────────────────────────

check("no gate or band copy uses gambling vocabulary", () => {
  const banned =
    /\b(odds|lotter(y|ies)|lotto|raffles?|sweepstakes?|gambl(e|ing)|bets?|betting|wager)\b/i;
  const strings: string[] = [];

  for (const signedIn of [true, false]) {
    for (const pct of [0, 25, 50, 100]) {
      for (const row of [vendorAt25, vendorAt70, DIRECT_ROWS[0]]) {
        const gate = buildGate(row, pct, signedIn);
        strings.push(
          gate.title,
          gate.body,
          gate.tallyLabel,
          gate.tallyValue,
          gate.tallyLabel2,
          gate.tallyValue2,
          gate.footNote,
          gate.ctaLabel ?? ""
        );
      }
      for (const band of buildBands(sample, { viewerPct: pct, signedIn, banded: true })) {
        strings.push(band.name, band.total, band.wallText, band.wallTextShort);
      }
    }
  }
  for (const level of DISCOUNT_LEVELS) {
    for (const route of resolveDiscountRoutes(level, 0)) {
      strings.push(route.kindLabel, route.tagLabel, route.gainLabel, route.ctaLabel, route.accessCaption, route.periodLabel);
    }
  }

  const hits = strings.filter((s) => banned.test(s));
  assert.deepEqual(hits, [], `banned vocabulary in customer copy: ${hits.join(" | ")}`);
});

check("entries are never priced per unit", () => {
  // Rule 11: the purchasable unit is the pack or the membership; entries come free with it.
  const perEntry = /(\$\s?[\d.,]+\s*(per|\/)\s*entry|entry\s*pack|buy .*entries)/i;
  for (const level of DISCOUNT_LEVELS) {
    for (const route of resolveDiscountRoutes(level, 0)) {
      assert.ok(!perEntry.test(route.ctaLabel), route.ctaLabel);
      assert.ok(!perEntry.test(route.gainLabel), route.gainLabel);
    }
  }
});

// ── Small helpers ─────────────────────────────────────────────────────────────

check("the letter plate skips punctuation and uppercases", () => {
  assert.equal(plateLetter("zjwraps"), "Z");
  assert.equal(plateLetter("  1837 BAROSSA"), "1");
  assert.equal(plateLetter("'t Vat"), "T");
  assert.equal(plateLetter("—"), "?");
});

console.log(`\n${passed} checks passed\n`);
