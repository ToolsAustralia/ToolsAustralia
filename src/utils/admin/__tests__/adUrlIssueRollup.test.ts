import assert from "node:assert/strict";

/**
 * Fences `computeAdUrlInfo` + `rollupAdUrlIssues` — the campaign/ad-set roll-up of the
 * validated `checkAdUrlMismatch` verdict that lets `CampaignTreeTable` badge a campaign or ad
 * set row, not just an ad row, so the owner can find WHICH one to open instead of expanding
 * every row by hand. See docs/admin/frontend.md, "Campaign/ad-set roll-up badges".
 *
 * Pure aggregation only — `checkAdUrlMismatch` itself (`adUrlMismatchCheck.ts`,
 * `npm run test:ad-url-mismatch`) is untouched and not re-tested here; these tests exist to pin
 * the ROLL-UP, not the rule.
 *
 * Key invariants under test:
 *  - a campaign containing one wrong-brand ad rolls up to a non-zero `mismatchAdCount`
 *  - a campaign whose ads are all clean rolls up to all-zero counts (no badge)
 *  - an ad with no URL data at all (`packagesFocus` unset — the KPI modal's per-bucket trees
 *    never populate it) contributes to NO count and is excluded from `checkedAdCount` — it must
 *    never manufacture a false badge
 *  - a typo'd `?toolbox=`/`?toolset=` value rolls up independently of a brand mismatch, and the
 *    two can coexist on one ad without either masking the other
 *  - an ad-set roll-up and its parent campaign's roll-up both come from the SAME per-ad
 *    verdicts, computed once
 *
 * Run: npm run test:ad-url-issue-rollup
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
  const { computeAdUrlInfo, rollupAdUrlIssues } = await import("@/utils/admin/adUrlIssueRollup");

  const ORIGIN = "https://toolsaustralia.com.au";
  const STIHL_CAMPAIGN = "Draw 10 | Sales | STIHL | Sep 2026";

  type TestAd = Parameters<typeof computeAdUrlInfo>[1];

  const wrongBrandAd: TestAd = {
    adName: undefined,
    packagesFocus: "membership",
    rawUrls: [`${ORIGIN}/promotions/makita`],
    canonicalUrl: `${ORIGIN}/promotions/makita`,
  };
  const cleanAd: TestAd = {
    adName: undefined,
    packagesFocus: "membership",
    rawUrls: [`${ORIGIN}/promotions/stihl`],
    canonicalUrl: `${ORIGIN}/promotions/stihl`,
  };
  const typoAd: TestAd = {
    adName: undefined,
    packagesFocus: "membership",
    rawUrls: [`${ORIGIN}/promotions/stihl?toolbox=milwakee`],
    canonicalUrl: `${ORIGIN}/promotions/stihl`,
  };
  const noUrlInfoAd: TestAd = {
    adName: undefined,
    packagesFocus: undefined,
    rawUrls: undefined,
    canonicalUrl: undefined,
  };

  test("a campaign with one wrong-brand ad rolls up to a non-zero mismatchAdCount", () => {
    const verdicts = [wrongBrandAd, cleanAd].map((ad) => computeAdUrlInfo(STIHL_CAMPAIGN, ad).mismatch);
    const rollup = rollupAdUrlIssues(verdicts);
    assert.equal(rollup.mismatchAdCount, 1);
    assert.equal(rollup.checkedAdCount, 2);
    assert.equal(rollup.unrecognisedParamAdCount, 0);
  });

  test("an all-clean campaign rolls up to zero on every count (AdUrlIssueBadge renders nothing)", () => {
    const verdicts = [cleanAd, cleanAd].map((ad) => computeAdUrlInfo(STIHL_CAMPAIGN, ad).mismatch);
    const rollup = rollupAdUrlIssues(verdicts);
    assert.deepEqual(rollup, { mismatchAdCount: 0, unrecognisedParamAdCount: 0, checkedAdCount: 2 });
  });

  test("an ad with no URL data at all contributes to no count and is excluded from checkedAdCount", () => {
    const verdicts = [wrongBrandAd, noUrlInfoAd].map((ad) => computeAdUrlInfo(STIHL_CAMPAIGN, ad).mismatch);
    const rollup = rollupAdUrlIssues(verdicts);
    // Only the wrong-brand ad was checkable; the unverifiable ad neither cleans it nor
    // manufactures a second finding.
    assert.equal(rollup.checkedAdCount, 1);
    assert.equal(rollup.mismatchAdCount, 1);
  });

  test("a typo'd toolbox value rolls up independently of a brand mismatch", () => {
    const verdicts = [typoAd, cleanAd].map((ad) => computeAdUrlInfo(STIHL_CAMPAIGN, ad).mismatch);
    const rollup = rollupAdUrlIssues(verdicts);
    assert.equal(rollup.unrecognisedParamAdCount, 1);
    assert.equal(rollup.mismatchAdCount, 0);
    assert.equal(rollup.checkedAdCount, 2);
  });

  test("a mismatch and a typo on the SAME ad both surface — neither masks the other", () => {
    const wrongBrandAndTypo: TestAd = {
      adName: undefined,
      packagesFocus: "membership",
      rawUrls: [`${ORIGIN}/promotions/makita?toolbox=milwakee`],
      canonicalUrl: `${ORIGIN}/promotions/makita`,
    };
    const verdicts = [wrongBrandAndTypo].map((ad) => computeAdUrlInfo(STIHL_CAMPAIGN, ad).mismatch);
    const rollup = rollupAdUrlIssues(verdicts);
    assert.equal(rollup.mismatchAdCount, 1);
    assert.equal(rollup.unrecognisedParamAdCount, 1);
    assert.equal(rollup.checkedAdCount, 1);
  });

  test("an ad-set roll-up and its parent campaign roll-up aggregate the SAME per-ad verdicts", () => {
    // Two ad sets under one campaign: ad set A carries the wrong-brand ad, ad set B is clean.
    const adSetAVerdicts = [wrongBrandAd].map((ad) => computeAdUrlInfo(STIHL_CAMPAIGN, ad).mismatch);
    const adSetBVerdicts = [cleanAd, cleanAd].map((ad) => computeAdUrlInfo(STIHL_CAMPAIGN, ad).mismatch);
    const adSetARollup = rollupAdUrlIssues(adSetAVerdicts);
    const adSetBRollup = rollupAdUrlIssues(adSetBVerdicts);
    const campaignRollup = rollupAdUrlIssues([...adSetAVerdicts, ...adSetBVerdicts]);

    assert.equal(adSetARollup.mismatchAdCount, 1, "ad set A should badge");
    assert.equal(adSetBRollup.mismatchAdCount, 0, "ad set B should not badge");
    // The campaign roll-up is the union across BOTH ad sets — it must still catch ad set A's
    // finding even though ad set B alone would show nothing (this is the whole point: a reader
    // scanning collapsed campaign rows must not miss the one bad ad set inside a clean-looking
    // campaign).
    assert.equal(campaignRollup.mismatchAdCount, 1);
    assert.equal(campaignRollup.checkedAdCount, 3);
  });

  test("computeAdUrlInfo falls back to canonicalUrl when rawUrls is absent, same as the ad row", () => {
    const info = computeAdUrlInfo(STIHL_CAMPAIGN, {
      adName: undefined,
      packagesFocus: "membership",
      rawUrls: undefined,
      canonicalUrl: `${ORIGIN}/promotions/makita`,
    });
    assert.deepEqual(info.rawUrls, [`${ORIGIN}/promotions/makita`]);
    assert.equal(info.mismatch?.verdict, "mismatch");
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll ad-url-issue-rollup tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
