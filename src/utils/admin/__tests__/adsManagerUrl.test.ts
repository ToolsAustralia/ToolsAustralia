import assert from "node:assert/strict";

/**
 * Fences `buildAdsManagerAdUrl` — the admin "Ads Manager" deep link on ad rows.
 *
 * The shape under test is the OWNER'S OWN working URL, copied out of a live Ads Manager session
 * on 2026-09-01 and parameterised. The previous shape was assumed, never opened, and landed on a
 * filtered ad list instead of the ad's edit screen. There is no way to open Meta from CI, so
 * this test is the only thing standing between a future edit and a silently-wrong link again:
 * it pins every part of the owner's format, including the encoding choices that look like typos
 * (literal `[`/`]`, `%22` quotes, `%1E` separators) but are exactly what worked.
 *
 * Run: npm run test:ads-manager-url
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
  const { buildAdsManagerAdUrl } = await import("../adsManagerUrl");

  const ACCOUNT = "act_1115200520594316";
  const BUSINESS = "2045140922943342";
  const AD_ID = "120248603000500567";

  test("reproduces the owner's working URL character for character", () => {
    assert.equal(
      buildAdsManagerAdUrl(ACCOUNT, AD_ID, BUSINESS),
      "https://adsmanager.facebook.com/adsmanager/manage/ads/edit/standalone" +
        "?act=1115200520594316" +
        "&business_id=2045140922943342" +
        "&filter_set=SEARCH_BY_ADGROUP_IDS-STRING_SET%1EANY%1E[%22120248603000500567%22]" +
        "&selected_ad_ids=120248603000500567" +
        "&nav_source=no_referrer" +
        "&current_step=0"
    );
  });

  test("targets the ad EDIT screen, not the filtered ad list", () => {
    const url = buildAdsManagerAdUrl(ACCOUNT, AD_ID, BUSINESS);
    assert.ok(
      url.includes("/adsmanager/manage/ads/edit/standalone?"),
      "must use the edit/standalone path — the bare /manage/ads path lands on a list"
    );
  });

  test("strips the act_ prefix — Ads Manager wants the bare account id", () => {
    assert.ok(buildAdsManagerAdUrl(ACCOUNT, AD_ID, BUSINESS).includes("act=1115200520594316"));
    assert.ok(!buildAdsManagerAdUrl(ACCOUNT, AD_ID, BUSINESS).includes("act=act_"));
    // Already-bare ids must survive untouched.
    assert.ok(
      buildAdsManagerAdUrl("1115200520594316", AD_ID, BUSINESS).includes("act=1115200520594316")
    );
  });

  test("carries the ad id in BOTH filter_set and selected_ad_ids", () => {
    const url = buildAdsManagerAdUrl(ACCOUNT, AD_ID, BUSINESS);
    assert.ok(url.includes(`[%22${AD_ID}%22]`), "filter_set must name the ad id");
    assert.ok(url.includes(`selected_ad_ids=${AD_ID}`), "selected_ad_ids must name the ad id");
  });

  test("keeps Meta's own encoding of filter_set — %1E separators, %22 quotes, LITERAL brackets", () => {
    const url = buildAdsManagerAdUrl(ACCOUNT, AD_ID, BUSINESS);
    assert.ok(url.includes("STRING_SET%1EANY%1E["), "record separators stay %1E");
    // A naive encodeURIComponent over the whole value would produce these instead. The owner's
    // URL has literal brackets; we have no way to test a variation, so we must not "tidy" it.
    assert.ok(!url.includes("%5B"), "brackets must stay literal, not %5B");
    assert.ok(!url.includes("%5D"), "brackets must stay literal, not %5D");
    assert.ok(!url.includes("%251E"), "the separator must not be double-encoded");
  });

  test("without a business id the link is still usable — the param is omitted, not blank", () => {
    const url = buildAdsManagerAdUrl(ACCOUNT, AD_ID, undefined);
    assert.ok(!url.includes("business_id"), "an unset business id must not emit an empty param");
    assert.ok(url.includes("/adsmanager/manage/ads/edit/standalone?act=1115200520594316"));
    assert.ok(url.includes(`selected_ad_ids=${AD_ID}`));
    assert.ok(url.includes(`[%22${AD_ID}%22]`));
    // Sanity: still a single well-formed URL with no dangling separators.
    assert.ok(!url.includes("&&") && !url.endsWith("&"));
    assert.doesNotThrow(() => new URL(url));
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll ads-manager-url tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
