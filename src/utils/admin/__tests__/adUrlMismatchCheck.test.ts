import assert from "node:assert/strict";

/**
 * Fences `resolveAdUrlBrands` + `checkAdUrlMismatch` — the ad-URL mismatch check behind the
 * admin Brand Performance ads table. Pins the rule from
 * docs/superpowers/specs/2026-09-01-coupon-audience-and-ad-url-check-design.md, section B,
 * BEFORE any UI depends on it (spec phase 1).
 *
 * Key invariants under test:
 *  - the real production case (STIHL campaign -> /promotions/makita) is a mismatch
 *  - the GearWrench false positive a naive campaign-name check would raise is NOT flagged
 *  - a missing `?toolbox=` is never a finding (spec B4)
 *  - `unknown://` placeholders and ambiguous naming both resolve to "unknown", never "ok"
 *
 * Run: npm run test:ad-url-mismatch
 */

let failures = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
};

async function main() {
  const { resolveAdUrlBrands, checkAdUrlMismatch, AD_URL_CHECK_BRANDS } = await import(
    "@/utils/admin/adUrlMismatchCheck"
  );

  const ORIGIN = "https://toolsaustralia.com.au";
  const sorted = (arr: string[]) => [...arr].sort();

  // ── resolveAdUrlBrands ────────────────────────────────────────────────────────────────

  test("bare toolset slug resolves the one brand", () => {
    assert.deepEqual(resolveAdUrlBrands(`${ORIGIN}/promotions/stihl`), ["stihl"]);
  });

  test("compound slug and equivalent ?toolbox= param resolve the SAME brand set (spec B2)", () => {
    const viaSlug = resolveAdUrlBrands(`${ORIGIN}/promotions/milwaukee-kincrome`);
    const viaParam = resolveAdUrlBrands(`${ORIGIN}/promotions/milwaukee?toolbox=kincrome`);
    assert.deepEqual(sorted(viaSlug), ["kincrome", "milwaukee"]);
    assert.deepEqual(sorted(viaParam), ["kincrome", "milwaukee"]);
    assert.deepEqual(sorted(viaSlug), sorted(viaParam));
  });

  test("?toolset= param also resolves", () => {
    assert.deepEqual(sorted(resolveAdUrlBrands(`${ORIGIN}/promotions/ryobi?toolset=dewalt`)), [
      "dewalt",
      "ryobi",
    ]);
  });

  test("unknown:// placeholder resolves no brand at all", () => {
    assert.deepEqual(resolveAdUrlBrands("unknown://meta-ad/123456"), []);
  });

  test("non-promotions URL resolves no brand", () => {
    assert.deepEqual(resolveAdUrlBrands(`${ORIGIN}/shop`), []);
  });

  test("every brand in the shared list resolves from BOTH slug and param form (T3)", () => {
    for (const brand of AD_URL_CHECK_BRANDS) {
      const viaCompoundSlug = resolveAdUrlBrands(`${ORIGIN}/promotions/ryobi-${brand}`);
      assert.ok(
        viaCompoundSlug.includes(brand),
        `${brand} did not resolve from compound slug ryobi-${brand}`
      );
      const viaToolboxParam = resolveAdUrlBrands(`${ORIGIN}/promotions/ryobi?toolbox=${brand}`);
      assert.ok(
        viaToolboxParam.includes(brand),
        `${brand} did not resolve from ?toolbox=${brand}`
      );
    }
  });

  // ── checkAdUrlMismatch — the real case ────────────────────────────────────────────────

  test("REAL CASE: STIHL campaign pointed at /promotions/makita -> mismatch", () => {
    const result = checkAdUrlMismatch({
      campaignName: "Draw 10 | Sales | STIHL | Sep 2026",
      adName: "STIHL — Video 1",
      urls: [`${ORIGIN}/promotions/makita`],
    });
    assert.equal(result.verdict, "mismatch");
    assert.equal(result.campaignBrand, "stihl");
    assert.deepEqual(result.urlBrands, ["makita"]);
  });

  // ── checkAdUrlMismatch — the false-positive case B3/B4 must NOT flag ─────────────────

  test("GearWrench campaign + ?toolbox=gearwrench -> ok (matches via param)", () => {
    const result = checkAdUrlMismatch({
      campaignName: "Draw 9 | Sales | GearWrench",
      urls: [`${ORIGIN}/promotions/milwaukee?toolbox=gearwrench`],
    });
    assert.equal(result.verdict, "ok");
    assert.equal(result.campaignBrand, "gearwrench");
  });

  test("GearWrench campaign + bare /promotions/milwaukee (no ?toolbox=) -> ok, never mismatch (spec B4)", () => {
    const result = checkAdUrlMismatch({
      campaignName: "Draw 9 | Sales | GearWrench",
      urls: [`${ORIGIN}/promotions/milwaukee`],
    });
    assert.equal(result.verdict, "ok");
    assert.equal(result.campaignBrand, "gearwrench");
    assert.deepEqual(result.urlBrands, ["milwaukee"]);
  });

  test("Kincrome campaign + bare toolset page with a DIFFERENT toolbox compound -> mismatch (toolbox axis IS present and wrong)", () => {
    const result = checkAdUrlMismatch({
      campaignName: "Kincrome Push",
      urls: [`${ORIGIN}/promotions/milwaukee-gearwrench`],
    });
    assert.equal(result.verdict, "mismatch");
    assert.equal(result.campaignBrand, "kincrome");
  });

  // ── checkAdUrlMismatch — multi-URL / carousel (spec B6) ───────────────────────────────

  test("multi-URL: ok if ANY url matches", () => {
    const result = checkAdUrlMismatch({
      campaignName: "STIHL Carousel",
      urls: [`${ORIGIN}/promotions/makita`, `${ORIGIN}/promotions/stihl`],
    });
    assert.equal(result.verdict, "ok");
  });

  test("multi-URL: mismatch if NONE match", () => {
    const result = checkAdUrlMismatch({
      campaignName: "STIHL Carousel",
      urls: [`${ORIGIN}/promotions/makita`, `${ORIGIN}/promotions/dewalt`],
    });
    assert.equal(result.verdict, "mismatch");
  });

  // ── checkAdUrlMismatch — unknown cases ─────────────────────────────────────────────────

  test("unknown:// destination -> unknown, never ok and never mismatch (T4)", () => {
    const result = checkAdUrlMismatch({
      campaignName: "Draw 10 | Sales | STIHL | Sep 2026",
      urls: ["unknown://meta-ad/999"],
    });
    assert.equal(result.verdict, "unknown");
  });

  test("campaign naming 0 brands (and ad name also 0) -> unknown", () => {
    const result = checkAdUrlMismatch({
      campaignName: "Sales | Sep 2026",
      adName: "Video 1",
      urls: [`${ORIGIN}/promotions/makita`],
    });
    assert.equal(result.verdict, "unknown");
    assert.equal(result.campaignBrand, undefined);
  });

  test("campaign naming 2+ brands -> unknown, even with ad name resolvable", () => {
    const result = checkAdUrlMismatch({
      campaignName: "STIHL vs Makita Comparison",
      adName: "STIHL — Video 1",
      urls: [`${ORIGIN}/promotions/makita`],
    });
    assert.equal(result.verdict, "unknown");
    assert.equal(result.campaignBrand, undefined);
  });

  test("campaign naming 0 brands, ad name naming exactly 1 -> ad name is used as fallback", () => {
    const result = checkAdUrlMismatch({
      campaignName: "Sales | Sep 2026",
      adName: "STIHL — Video 1",
      urls: [`${ORIGIN}/promotions/makita`],
    });
    assert.equal(result.verdict, "mismatch");
    assert.equal(result.campaignBrand, "stihl");
  });

  test("no urls at all -> unknown", () => {
    const result = checkAdUrlMismatch({ campaignName: "Draw 10 | Sales | STIHL | Sep 2026", urls: [] });
    assert.equal(result.verdict, "unknown");
  });

  // ── Mutation check: a naive campaign-name-vs-canonical-path check WOULD flag GearWrench ──
  // (spec B5, "rejected: match on campaign name alone" — ~90% false positives). This is a
  // deliberately dumber comparator: no toolbox-axis leniency, single-brand-per-name only,
  // reads canonicalUrl (query stripped) instead of rawUrls. It exists ONLY to prove the real
  // rule above is not equivalent to it.
  function naiveCampaignNameOnlyCheck(campaignName: string, canonicalUrlNoQuery: string): "ok" | "mismatch" {
    const nameMatch = campaignName.match(/gearwrench|milwaukee|stihl|makita|ryobi|dewalt|hikoki|sidchrome|kincrome/i);
    const pageMatch = canonicalUrlNoQuery.match(/\/promotions\/([a-z]+)/i);
    if (!nameMatch || !pageMatch) return "ok";
    return nameMatch[0].toLowerCase() === pageMatch[1].toLowerCase() ? "ok" : "mismatch";
  }

  test("MUTATION CHECK: naive campaign-name-only comparison flags the GearWrench ad; the real rule does not", () => {
    const campaignName = "Draw 9 | Sales | GearWrench";
    const rawUrl = `${ORIGIN}/promotions/milwaukee?toolbox=gearwrench`;
    const canonicalUrlNoQuery = `${ORIGIN}/promotions/milwaukee`; // canonicalizeLandingUrl strips the query (spec B1)

    // The naive/rejected approach (B5): flags this legitimate ad as a mismatch.
    assert.equal(
      naiveCampaignNameOnlyCheck(campaignName, canonicalUrlNoQuery),
      "mismatch",
      "expected the naive comparator to reproduce the ~90% false-positive failure mode"
    );

    // The real rule, reading rawUrls (which carry the query): correctly says ok.
    const real = checkAdUrlMismatch({ campaignName, urls: [rawUrl] });
    assert.equal(real.verdict, "ok", "the real rule must NOT reproduce the naive false positive");
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll ad-url-mismatch-check tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
