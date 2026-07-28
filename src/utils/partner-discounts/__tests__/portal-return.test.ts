/**
 * portal-return tests — the rewards-return URL parser + banner view matrix
 * (panel-review F-003). Run: `npm run test:portal-return` (tsx, node:assert/strict).
 *
 * The parser is the only code that touches attacker-controlled URL params on
 * /membership, so every sanitisation branch is pinned here. The view resolver's
 * six states are pinned so copy/CTA regressions surface without a browser.
 */
import assert from "node:assert/strict";
import {
  resolvePortalReturn,
  resolvePortalBannerView,
  PARTNER_CATALOG_LADDER_PCTS,
  type PortalReturnOffer,
} from "../portal-return";

// Small injected map (mirrors real generated entries — Amazon 1064993 verified 100%).
const OFFERS: Readonly<Record<string, PortalReturnOffer>> = {
  "1064993": { name: "Amazon.com.au eGift Card", pct: 100 },
  "1066574": { name: "Witchery eGift Card", pct: 40 },
};

function testOfferIdResolvesFromCatalogue(): void {
  const r = resolvePortalReturn({ offer_id: "1064993", level: "5" }, OFFERS);
  // Catalogue values win; the URL's `level` is ignored entirely on an id hit.
  assert.deepEqual(r, { offerName: "Amazon.com.au eGift Card", requiredPct: 100 });
}

function testPrototypeKeysRejected(): void {
  for (const evil of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const r = resolvePortalReturn({ offer_id: evil }, OFFERS);
    assert.deepEqual(r, { generic: true }, `offer_id=${evil} must not resolve`);
  }
}

function testUnknownIdFallsToGeneric(): void {
  assert.deepEqual(resolvePortalReturn({ offer_id: "999999" }, OFFERS), { generic: true });
  // …but a valid name+level fallback still works when the id is unknown.
  const r = resolvePortalReturn(
    { offer_id: "999999", offer_name: "Test Offer", level: "70" },
    OFFERS
  );
  assert.deepEqual(r, { offerName: "Test Offer", requiredPct: 70 });
}

function testNameSanitisation(): void {
  const r = resolvePortalReturn(
    { offer_name: "<script>alert(1)</script>", level: "50" },
    OFFERS
  );
  // <>& stripped; the residue still renders as harmless text.
  assert.equal(r?.offerName, "scriptalert(1)/script");
  assert.equal(r?.requiredPct, 50);
}

function testNameCapAt60(): void {
  const long = "A".repeat(80);
  const r = resolvePortalReturn({ offer_name: long, level: "25" }, OFFERS);
  assert.equal(r?.offerName?.length, 60);
}

function testInvalidLevelsFallToGeneric(): void {
  for (const level of ["999", "40.5", "abc", "", "0", "-25", "101"]) {
    const r = resolvePortalReturn({ offer_name: "Test Offer", level }, OFFERS);
    assert.deepEqual(r, { generic: true }, `level=${JSON.stringify(level)} must be discarded`);
  }
}

function testArrayParamsUseFirst(): void {
  const r = resolvePortalReturn(
    { offer_id: ["1066574", "1064993"], level: ["40"] },
    OFFERS
  );
  assert.deepEqual(r, { offerName: "Witchery eGift Card", requiredPct: 40 });
}

function testNoParamsIsNotAReturnVisit(): void {
  assert.equal(resolvePortalReturn({}, OFFERS), undefined);
  assert.equal(resolvePortalReturn({ utm_campaign: "spring-sale" }, OFFERS), undefined);
}

function testCampaignAloneIsGeneric(): void {
  assert.deepEqual(resolvePortalReturn({ utm_campaign: "rewards-return" }, OFFERS), {
    generic: true,
  });
}

function testLadderMatchesElevenTiers(): void {
  assert.equal(PARTNER_CATALOG_LADDER_PCTS.size, 11);
  for (const pct of [5, 10, 15, 25, 40, 50, 55, 70, 75, 85, 100]) {
    assert.ok(PARTNER_CATALOG_LADDER_PCTS.has(pct), `${pct} missing from ladder`);
  }
}

// ─── View matrix ──────────────────────────────────────────────────────────────

const REC = { planName: "Boss", planIsSubscription: true, cumulativeCount: 1833 };
const base = {
  portalReturn: { offerName: "Amazon.com.au eGift Card", requiredPct: 100 },
  partnerAccessPct: 50,
  ssoEnabled: true,
  recommended: REC,
  catalogTotal: 1833,
} as const;

function testViewPastdueWinsOverOffer(): void {
  const v = resolvePortalBannerView({ ...base, acct: "pastdue" });
  assert.equal(v.headline, "Your membership payment needs attention.");
  assert.equal(v.cta?.kind, "payment");
  assert.equal(v.showLoginHint, false);
}

function testViewGuestWithOffer(): void {
  const v = resolvePortalBannerView({ ...base, acct: "none" });
  assert.equal(v.headline, "Amazon.com.au eGift Card unlocks at 100% access.");
  assert.equal(v.cta?.kind, "unlock");
  assert.equal(v.showLoginHint, true, "guest states must show the login hint (F-004)");
  if (v.cta?.kind === "unlock") assert.equal(v.cta.showCatalogueMeta, false);
}

function testViewAuthedShortOfOffer(): void {
  const v = resolvePortalBannerView({ ...base, acct: "active" });
  assert.equal(v.headline, "You're at 50% — Amazon.com.au eGift Card needs 100%.");
  assert.equal(v.cta?.kind, "unlock");
  if (v.cta?.kind === "unlock") {
    assert.equal(v.cta.showCatalogueMeta, true);
    assert.equal(v.cta.planIsSubscription, true, "drives F-005 manage-subscription routing");
  }
  assert.equal(v.showLoginHint, false);
}

function testViewAuthedCovered(): void {
  const v = resolvePortalBannerView({
    ...base,
    acct: "active",
    portalReturn: { offerName: "Witchery eGift Card", requiredPct: 40 },
  });
  assert.equal(v.headline, "You're set — your 50% access covers Witchery eGift Card.");
  assert.equal(v.cta?.kind, "sso");
}

function testViewCoveredFlagOffHasNoCta(): void {
  const v = resolvePortalBannerView({
    ...base,
    acct: "active",
    ssoEnabled: false,
    portalReturn: { offerName: "Witchery eGift Card", requiredPct: 40 },
  });
  assert.equal(v.cta, null); // flag off → sub only (F-006 will refine the sub copy)
}

function testViewGenericGuestAndMember(): void {
  const guest = resolvePortalBannerView({ ...base, acct: "none", portalReturn: { generic: true } });
  assert.equal(guest.headline, "Unlock the partner catalogue");
  assert.equal(guest.showLoginHint, true);
  const member = resolvePortalBannerView({ ...base, acct: "active", portalReturn: { generic: true } });
  assert.equal(member.headline, "Back from the partner portal?");
  assert.ok(member.sub.includes("You're at 50% of the partner catalogue"));
  assert.equal(member.showLoginHint, false);
}

function testViewNoRecommendationFallsToScroll(): void {
  const v = resolvePortalBannerView({ ...base, acct: "none", recommended: null });
  assert.deepEqual(v.cta, { kind: "scroll", label: "See all packages" });
}

function testViewPausedCurrentBehaviourPinned(): void {
  // PINNED CURRENT BEHAVIOUR: paused members fall through to the generic member
  // branch with pct 0 (no dedicated branch yet). Panel-review F-009 will add a
  // paused branch — update this pin when it lands.
  const v = resolvePortalBannerView({
    ...base,
    acct: "paused",
    partnerAccessPct: 0,
    portalReturn: { generic: true },
  });
  assert.equal(v.headline, "Back from the partner portal?");
}

const tests = [
  testOfferIdResolvesFromCatalogue,
  testPrototypeKeysRejected,
  testUnknownIdFallsToGeneric,
  testNameSanitisation,
  testNameCapAt60,
  testInvalidLevelsFallToGeneric,
  testArrayParamsUseFirst,
  testNoParamsIsNotAReturnVisit,
  testCampaignAloneIsGeneric,
  testLadderMatchesElevenTiers,
  testViewPastdueWinsOverOffer,
  testViewGuestWithOffer,
  testViewAuthedShortOfOffer,
  testViewAuthedCovered,
  testViewCoveredFlagOffHasNoCta,
  testViewGenericGuestAndMember,
  testViewNoRecommendationFallsToScroll,
  testViewPausedCurrentBehaviourPinned,
];

for (const t of tests) t();
console.log("portal-return (rewards-return parser + banner view matrix) tests passed");
