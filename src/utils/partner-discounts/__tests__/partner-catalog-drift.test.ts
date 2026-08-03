/**
 * CSV ↔ generated drift guard (panel F-041). Run: `npm run test:partner-catalog-drift`.
 *
 * `build:partner-catalog` runs in `prebuild`/`predev`, so PRODUCTION always builds from
 * the CSV — but every local gate (type-check, every tsx suite, every reviewer) reads the
 * COMMITTED generated files. A commit that edits the CSV without regenerating therefore
 * passes everything locally while the constants that drive customer-facing counts go
 * stale. This test closes that window: it re-parses the CSV and asserts the committed
 * constants still agree with it.
 *
 * It deliberately re-derives the cumulative counts from the offers map rather than
 * trusting the preview file, so a hand-edit to either generated file also fails.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PARTNER_CATALOG_TOTAL,
  PARTNER_CATALOG_TIER_COUNTS,
} from "@/generated/partnerCatalogPreview";
import { PARTNER_CATALOG_OFFERS } from "@/generated/partnerCatalogOffers";
import {
  PARTNER_CATALOG_BROWSE,
  PARTNER_CATALOG_BROWSE_CATEGORIES,
} from "@/generated/partnerCatalogBrowse";
import {
  resolveCoveringTier,
  buildTierUpgradeCopy,
  buildVendorLockedOfferCopy,
  buildLockedOfferUpgradeHref,
} from "@/utils/partner-discounts/tier-upgrade-copy";
import {
  buildPartnerPortalOfferUrl,
  buildPartnerPortalOfferImageUrl,
} from "@/utils/partner-discounts/portal-offer-url";
import { resolvePortalReturn } from "@/utils/partner-discounts/portal-return";
import {
  PARTNER_CATALOG_LADDER_PCTS,
  getPartnerCatalogUnlockedCount,
} from "@/utils/partner-discounts/partner-catalog-visibility";

const CSV_PATH = path.join(process.cwd(), "src", "data", "partner-catalog", "offers-list-breakdown.csv");
const REGEN = "run `npm run build:partner-catalog` and commit the regenerated files";

/** Minimal RFC-4180 row splitter — the CSV has quoted fields containing commas AND newlines. */
function csvRowCount(text: string): number {
  let rows = 0;
  let inQuotes = false;
  let sawField = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawField = true;
    } else if (c === "\n") {
      if (sawField) rows++;
      sawField = false;
    } else if (c !== "\r") {
      sawField = true;
    }
  }
  if (sawField) rows++;
  return rows;
}

function testCsvRowCountMatchesTotal(): void {
  const raw = fs.readFileSync(CSV_PATH, "utf8").replace(/^﻿/, "");
  const dataRows = csvRowCount(raw) - 1; // minus the header
  assert.equal(
    dataRows,
    PARTNER_CATALOG_TOTAL,
    `CSV has ${dataRows} offers but PARTNER_CATALOG_TOTAL is ${PARTNER_CATALOG_TOTAL} — ${REGEN}`
  );
}

function testOffersMapMatchesTotal(): void {
  assert.equal(
    Object.keys(PARTNER_CATALOG_OFFERS).length,
    PARTNER_CATALOG_TOTAL,
    `the offers map and PARTNER_CATALOG_TOTAL disagree — ${REGEN}`
  );
}

function testEveryTierCumulativeMatchesTheOffersMap(): void {
  const ladder = [...PARTNER_CATALOG_LADDER_PCTS].sort((a, b) => a - b);
  const offers = Object.values(PARTNER_CATALOG_OFFERS);
  let running = 0;
  for (const pct of ladder) {
    running += offers.filter((o) => o.pct === pct).length;
    assert.equal(
      PARTNER_CATALOG_TIER_COUNTS[pct],
      running,
      `tier ${pct}% cumulative is ${PARTNER_CATALOG_TIER_COUNTS[pct]} but the offers map yields ${running} — ${REGEN}`
    );
  }
  assert.equal(running, PARTNER_CATALOG_TOTAL, `the tier counts do not sum to the total — ${REGEN}`);
}

function testEveryOfferPercentIsOnTheLadder(): void {
  for (const [id, offer] of Object.entries(PARTNER_CATALOG_OFFERS)) {
    assert.ok(
      PARTNER_CATALOG_LADDER_PCTS.has(offer.pct),
      `offer ${id} has an off-ladder percent (${offer.pct}) — ${REGEN}`
    );
  }
}

/**
 * The Rewards card now prints these counts to the member ("917 of 1,833 partner offers"),
 * so the resolver's contract is customer-facing: a ladder percent must yield the tier's
 * real cumulative count, and anything OFF the ladder must yield null so the caller falls
 * back to the bare percent instead of printing an invented figure.
 */
function testUnlockedCountResolvesEveryLadderPercent(): void {
  for (const pct of PARTNER_CATALOG_LADDER_PCTS) {
    const { count, total } = getPartnerCatalogUnlockedCount(pct);
    assert.equal(count, PARTNER_CATALOG_TIER_COUNTS[pct], `unlocked count for ${pct}% disagrees with the tier counts`);
    assert.equal(total, PARTNER_CATALOG_TOTAL, `unlocked total for ${pct}% is not the catalogue total`);
  }
}

function testUnlockedCountIsNullOffTheLadder(): void {
  // 0 is the real one that reaches this in production: a guest or a past-due member with no
  // live pack renders at 0%, which is deliberately NOT a ladder value.
  for (const pct of [0, 1, 33, 60, 99, 101, -5, 50.5, NaN]) {
    const { count, total } = getPartnerCatalogUnlockedCount(pct);
    assert.equal(count, null, `off-ladder percent ${pct} must not resolve to a count`);
    assert.equal(total, PARTNER_CATALOG_TOTAL, "the total is a constant and must survive an off-ladder percent");
  }
}

function testUnlockedCountIgnoresInheritedProperties(): void {
  // The lookup must not answer for `toString`/`constructor` just because Object.prototype has them.
  for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
    const { count } = getPartnerCatalogUnlockedCount(key as unknown as number);
    assert.equal(count, null, `inherited key "${key}" must not resolve to a count`);
  }
}

/**
 * The browse catalogue is a THIRD generated view of the same CSV, and it is the one the
 * member reads directly. If it drifts from the offers map, /my-account/rewards/catalogue
 * tells someone an offer is open when it is not — the exact failure this whole branch
 * exists to fix, reintroduced on our own side.
 */
function testBrowseCatalogueMatchesTheOffersMap(): void {
  assert.equal(
    PARTNER_CATALOG_BROWSE.length,
    PARTNER_CATALOG_TOTAL,
    `browse catalogue has ${PARTNER_CATALOG_BROWSE.length} rows but the total is ${PARTNER_CATALOG_TOTAL} — ${REGEN}`
  );

  // Each browse row must match the map ENTRY UNDER ITS OWN ID — stronger than a multiset
  // check, because the id is what the deep link is built from: a row carrying the right name
  // but a neighbour's id would send the member to the wrong offer page.
  const seen = new Set();
  for (const [name, catIdx, pct, id] of PARTNER_CATALOG_BROWSE) {
    const category = PARTNER_CATALOG_BROWSE_CATEGORIES[catIdx];
    assert.ok(category, `browse row "${name}" has an out-of-range category index ${catIdx} — ${REGEN}`);
    assert.ok(/^[0-9]+$/.test(id), `browse row "${name}" has a non-numeric offer id ${JSON.stringify(id)} — ${REGEN}`);
    assert.ok(!seen.has(id), `browse catalogue repeats offer id ${id} — ${REGEN}`);
    seen.add(id);

    const offer = PARTNER_CATALOG_OFFERS[id];
    assert.ok(offer, `browse row "${name}" has id ${id}, absent from the offers map — ${REGEN}`);
    assert.equal(offer.name, name, `id ${id}: browse name disagrees with the offers map — ${REGEN}`);
    assert.equal(offer.category, category, `id ${id}: browse category disagrees with the offers map — ${REGEN}`);
    assert.equal(offer.pct, pct, `id ${id}: browse pct disagrees with the offers map — ${REGEN}`);
  }
  const missing = Object.keys(PARTNER_CATALOG_OFFERS).filter((id) => !seen.has(id));
  assert.equal(missing.length, 0, `${missing.length} offer(s) missing from the browse catalogue — ${REGEN}`);
}

/**
 * The deep link is only safe if the id round-trips into the vendor's stable offer path —
 * a member following a wrong link lands on someone else's offer.
 */
function testPortalOfferUrlBuildsFromTheVendorId(): void {
  const previous = process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL;
  try {
    process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL = "https://portal.example.com/";
    assert.equal(
      buildPartnerPortalOfferUrl("1065496"),
      "https://portal.example.com/products/view_smart/1065496",
      "a trailing slash on the configured origin must not double up"
    );
    // Anything that is not a bare vendor id must never become a URL.
    for (const bad of ["", "abc", "12a", "../../etc", "1065496?x=1", "1065496/../9"]) {
      assert.equal(buildPartnerPortalOfferUrl(bad), null, `must not build a URL from ${JSON.stringify(bad)}`);
    }
    // Unset env = no link at all, so the page degrades to plain rows rather than a broken href.
    delete process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL;
    assert.equal(buildPartnerPortalOfferUrl("1065496"), null, "no configured portal origin must yield no link");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL;
    else process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL = previous;
  }
}

/**
 * Artwork coverage sanity.
 *
 * A wrong media PATH fails silently — every row just renders a letter tile and the page still
 * "works". That is exactly what happened: probing `big_image/` instead of `product_image/`
 * produced "64 of 1,833 (3%)" and it read as a fact about the catalogue rather than a bug in
 * the probe. This floor turns that class of mistake into a failing test.
 */
function testArtworkCoverageIsPlausible(): void {
  const withArt = PARTNER_CATALOG_BROWSE.filter(([, , , , , ref]) => ref !== "");
  const pct = (withArt.length / PARTNER_CATALOG_BROWSE.length) * 100;
  assert.ok(
    pct > 80,
    `only ${pct.toFixed(1)}% of offers carry artwork — suspect a media PATH before believing ` +
      `this number (a wrong folder degrades silently to letter tiles). Re-run ` +
      `\`npm run probe:partner-catalog-images\` AND \`npm run harvest:partner-instore-artwork\`.`
  );
  // Both wire forms — a bare extension (keyed by offer id) or an explicit "<m|p>:<id>.<ext>"
  // reference (keyed by the vendor's merchant/media id). See PartnerCatalogBrowseRow.imageExt.
  for (const [name, , , , , ref] of withArt) {
    assert.ok(
      /^(png|jpg|jpeg|webp|gif)$/.test(ref) || /^[mp]:\d+\.(png|jpg|jpeg|webp|gif)$/.test(ref),
      `"${name}" has an implausible artwork reference ${JSON.stringify(ref)} — ${REGEN}`
    );
  }
}

/**
 * The image-URL builder must honour BOTH artwork forms, and must never let the offer id leak
 * into an explicit reference — that conflation is the original bug in miniature.
 */
function testPortalOfferImageUrlHandlesBothArtworkForms(): void {
  const previous = process.env.NEXT_PUBLIC_PARTNER_MEDIA_URL;
  try {
    process.env.NEXT_PUBLIC_PARTNER_MEDIA_URL = "https://media.example.com/webroot/files/";

    // FORM 1 — bare extension ⇒ keyed by the OFFER id.
    assert.equal(
      buildPartnerPortalOfferImageUrl("21190", "jpg"),
      "https://media.example.com/webroot/files/product_image/21190.jpg",
      "a bare extension must resolve against the offer id, with no doubled slash"
    );

    // FORM 2 — explicit reference ⇒ keyed by the vendor's merchant/media id. The offer id
    // passed alongside must be ignored entirely.
    assert.equal(
      buildPartnerPortalOfferImageUrl("1068399", "m:1032063.jpeg"),
      "https://media.example.com/webroot/files/merchant_logo/1032063.jpeg",
      "an m: reference must use merchant_logo and the MERCHANT id, never the offer id"
    );
    assert.equal(
      buildPartnerPortalOfferImageUrl("1068399", "p:133414.jpeg"),
      "https://media.example.com/webroot/files/product_image/133414.jpeg",
      "a p: reference must use product_image and the MEDIA id, never the offer id"
    );

    // Nothing malformed may become a URL — these all reach our own image optimiser.
    for (const bad of ["", "exe", "m:abc.png", "m:123.exe", "x:123.png", "m:123", "../x.png", "m:1/2.png"]) {
      assert.equal(
        buildPartnerPortalOfferImageUrl("1068399", bad),
        null,
        `must not build an image URL from ${JSON.stringify(bad)}`
      );
    }
    // A bare extension with a non-numeric offer id has nothing to key on.
    assert.equal(buildPartnerPortalOfferImageUrl("not-an-id", "png"), null, "bare ext needs a numeric offer id");

    process.env.NEXT_PUBLIC_PARTNER_MEDIA_URL = "";
    assert.equal(buildPartnerPortalOfferImageUrl("21190", "jpg"), null, "unset media origin must yield no image");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_PARTNER_MEDIA_URL;
    else process.env.NEXT_PUBLIC_PARTNER_MEDIA_URL = previous;
  }
}

/**
 * PER-CATEGORY artwork floor.
 *
 * The aggregate floor above was already passing at 52% while ONE ENTIRE CATEGORY sat at 0%:
 * all 877 "In-Store Offer" rows rendered a letter tile because their artwork is keyed by an
 * internal merchant id that the offer-id probe structurally cannot reach. An average hid it.
 *
 * So assert the shape, not just the total: no category of any size may collapse to near-zero
 * while the catalogue as a whole looks healthy. This is the check that would have caught the
 * original hole on day one.
 */
function testNoCategoryIsStarvedOfArtwork(): void {
  const byCategory = new Map<number, { total: number; withArt: number }>();
  for (const [, catIndex, , , , ref] of PARTNER_CATALOG_BROWSE) {
    const entry = byCategory.get(catIndex) ?? { total: 0, withArt: 0 };
    entry.total += 1;
    if (ref !== "") entry.withArt += 1;
    byCategory.set(catIndex, entry);
  }
  for (const [catIndex, { total, withArt }] of byCategory) {
    // Small categories can legitimately be all-or-nothing; 25+ rows at ~0% is a broken path.
    if (total < 25) continue;
    const pct = (withArt / total) * 100;
    assert.ok(
      pct > 50,
      `category "${PARTNER_CATALOG_BROWSE_CATEGORIES[catIndex]}" has artwork for only ` +
        `${withArt}/${total} (${pct.toFixed(1)}%) while the catalogue overall looks fine. ` +
        `One starved category means a media path that does not apply to it — do NOT "fix" ` +
        `this by lowering the floor. Open one of its offers in the portal with a live session ` +
        `and read the <img> src.`
    );
  }
}

/**
 * The locked-card upgrade link is the catalogue's conversion path, and it only works because
 * `/membership` recognises the params. `resolvePortalReturn` keys on `offer_id` (and treats
 * `utm_campaign=rewards-return` as the marker), so a rename on either side silently degrades
 * every locked card to a generic pitch — the offer the member actually wanted goes unnamed.
 */
function testLockedOfferUpgradeHrefFeedsTheReturnResolver(): void {
  const href = buildLockedOfferUpgradeHref("1065496");
  const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));

  assert.ok(href.startsWith("/membership?"), `must point at the membership page: ${href}`);
  assert.equal(params.get("offer_id"), "1065496", "offer_id is what names the offer on arrival");
  assert.equal(params.get("utm_campaign"), "rewards-return", "the resolver and reporting key on this campaign");
  assert.equal(params.get("utm_source"), "rewards_catalogue", "our catalogue must be distinguishable from the vendor's bounce-back");

  // The resolver must actually accept what we build — the real contract, not a shape guess.
  const resolved = resolvePortalReturn(Object.fromEntries(params.entries()), PARTNER_CATALOG_OFFERS);
  assert.ok(resolved, "the membership page must recognise this link as a rewards-return");
  assert.equal(resolved?.offerName, "JB HiFi Business", "it must resolve the offer by id, from OUR catalogue");
  assert.equal(resolved?.requiredPct, 100, "and carry the percent that opens it");
}

/** Every tier count must be reproducible by filtering the browse rows the way the page does. */
function testBrowseCatalogueReproducesTierCounts(): void {
  for (const pct of PARTNER_CATALOG_LADDER_PCTS) {
    const open = PARTNER_CATALOG_BROWSE.filter(([, , p]) => p <= pct).length;
    assert.equal(
      open,
      PARTNER_CATALOG_TIER_COUNTS[pct],
      `browsing at ${pct}% yields ${open} open offers but the tier count says ${PARTNER_CATALOG_TIER_COUNTS[pct]} — ${REGEN}`
    );
  }
}

/**
 * The upgrade sentence is customer-facing on BOTH our catalogue and, via the copy
 * contract, inside the vendor's portal — so it carries CLAUDE.md rule 11 exposure.
 */
function testUpgradeCopyNamesTheCheapestCoveringTierAndStaysLegal(): void {
  const BANNED = /\b(odds|chances?|lottery|lotto|raffle|sweepstake|gambl|bet)\b/i;

  assert.equal(resolveCoveringTier(75, 50)?.name, "Foreman", "75% should be covered by Foreman");
  assert.equal(resolveCoveringTier(100, 50)?.name, "Boss", "100% should be covered by Boss");
  assert.equal(resolveCoveringTier(85, 75)?.name, "Boss", "85% is above Foreman, so Boss covers it");
  assert.equal(resolveCoveringTier(50, 50), null, "an already-covered offer needs no upgrade");
  assert.equal(resolveCoveringTier(40, 50), null, "access above the requirement needs no upgrade");

  // A Tradie looking at a 75% offer: Foreman adds 1,375 - 917 = 458.
  const copy = buildTierUpgradeCopy(75, 50);
  assert.ok(copy.line.includes("Foreman"), `upgrade line must name the tier: ${copy.line}`);
  assert.ok(copy.line.includes("458"), `upgrade line must state the delta it adds: ${copy.line}`);

  const vendor = buildVendorLockedOfferCopy({ requiredPct: 100, currentPct: 50 });
  assert.ok(vendor.body.includes("917") && vendor.body.includes("1,833"), `vendor body must state the real counts: ${vendor.body}`);
  assert.ok(vendor.cta.includes("Boss"), `vendor CTA must name the covering tier: ${vendor.cta}`);
  assert.ok(vendor.href.includes("utm_campaign=rewards-return"), "vendor link must keep the funnel measurable");

  for (const s of [copy.line, copy.cta, vendor.headline, vendor.body, vendor.cta]) {
    assert.ok(!BANNED.test(s), `banned gambling vocabulary in customer copy: "${s}"`);
    assert.ok(!/\bentr(y|ies)\b/i.test(s), `upgrade copy must not mention entries at all (rule 11): "${s}"`);
    assert.ok(!/catalog\b/.test(s), `use Australian "catalogue": "${s}"`);
  }
}

for (const t of [
  testCsvRowCountMatchesTotal,
  testOffersMapMatchesTotal,
  testEveryTierCumulativeMatchesTheOffersMap,
  testEveryOfferPercentIsOnTheLadder,
  testUnlockedCountResolvesEveryLadderPercent,
  testUnlockedCountIsNullOffTheLadder,
  testUnlockedCountIgnoresInheritedProperties,
  testBrowseCatalogueMatchesTheOffersMap,
  testBrowseCatalogueReproducesTierCounts,
  testPortalOfferUrlBuildsFromTheVendorId,
  testArtworkCoverageIsPlausible,
  testNoCategoryIsStarvedOfArtwork,
  testPortalOfferImageUrlHandlesBothArtworkForms,
  testLockedOfferUpgradeHrefFeedsTheReturnResolver,
  testUpgradeCopyNamesTheCheapestCoveringTierAndStaysLegal,
]) {
  t();
}
console.log("partner-catalog-drift (CSV ↔ committed generated files ↔ member-facing counts) tests passed");
