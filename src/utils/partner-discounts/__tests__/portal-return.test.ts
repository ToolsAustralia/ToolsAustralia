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
  // Real vendor-name shape: double-space location suffixes (329 such names in the catalogue).
  "1067890": { name: "World Heritage Cruises  Strahan  TAS", pct: 70 },
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
  // F-008: with an unknown id, a CATALOGUE-MATCHED name still resolves —
  // catalogue values win, the URL `level` is ignored entirely.
  const r = resolvePortalReturn(
    { offer_id: "999999", offer_name: "witchery egift card", level: "70" },
    OFFERS
  );
  assert.deepEqual(r, { offerName: "Witchery eGift Card", requiredPct: 40 });
}

function testNameAllowlistRejectsArbitraryText(): void {
  // F-008: names not in the catalogue NEVER render — spoofing/banned-vocabulary
  // injection via crafted links is dead. Level validity is irrelevant.
  for (const name of ["<script>alert(1)</script>", "Free $500 Cash Bonus", "lottery jackpot"]) {
    const r = resolvePortalReturn({ offer_name: name, level: "50" }, OFFERS);
    assert.deepEqual(r, { generic: true }, `offer_name=${JSON.stringify(name)} must not render`);
  }
}

function testAmbiguousNamesAreDropped(): void {
  // F-029: the real catalogue has 6 names that exist at two DIFFERENT percents.
  // A last-write-wins index would answer with an arbitrary one — potentially telling a
  // member they're covered for an offer they aren't. Ambiguous names must not resolve.
  const AMBIGUOUS: Readonly<Record<string, PortalReturnOffer>> = {
    "1047559": { name: "Get Wines Direct", pct: 100 },
    "1047907": { name: "Get Wines Direct", pct: 50 },
    "1000001": { name: "Unique Brand", pct: 25 },
  };
  assert.deepEqual(
    resolvePortalReturn({ offer_name: "Get Wines Direct" }, AMBIGUOUS),
    { generic: true },
    "a name that maps to two different percents must degrade to the generic banner"
  );
  // Unambiguous neighbours in the same map still resolve…
  assert.deepEqual(resolvePortalReturn({ offer_name: "Unique Brand" }, AMBIGUOUS), {
    offerName: "Unique Brand",
    requiredPct: 25,
  });
  // …and offer_id is unaffected — it is exact, so both ids still resolve correctly.
  assert.equal(resolvePortalReturn({ offer_id: "1047559" }, AMBIGUOUS)?.requiredPct, 100);
  assert.equal(resolvePortalReturn({ offer_id: "1047907" }, AMBIGUOUS)?.requiredPct, 50);

  // A duplicate name with the SAME percent is not ambiguous — it still resolves.
  const SAME_PCT: Readonly<Record<string, PortalReturnOffer>> = {
    "2000001": { name: "Twin Offer", pct: 70 },
    "2000002": { name: "Twin Offer", pct: 70 },
  };
  assert.equal(resolvePortalReturn({ offer_name: "Twin Offer" }, SAME_PCT)?.requiredPct, 70);
}

function testNameAllowlistNormalises(): void {
  // Case-insensitive + whitespace-collapsing (vendor names carry double spaces);
  // the CATALOGUE's canonical name + pct come back, never the URL's spelling.
  const r = resolvePortalReturn({ offer_name: "  WITCHERY   eGift   CARD " }, OFFERS);
  assert.deepEqual(r, { offerName: "Witchery eGift Card", requiredPct: 40 });
  // URL level (even a valid ladder value) is ignored on a name match.
  const r2 = resolvePortalReturn({ offer_name: "Witchery eGift Card", level: "100" }, OFFERS);
  assert.equal(r2?.requiredPct, 40);
}

function testVendorRunOnNamesDisplayWithCommas(): void {
  // F-013: double-space location suffixes render comma-joined, via BOTH resolution paths.
  const byId = resolvePortalReturn({ offer_id: "1067890" }, OFFERS);
  assert.equal(byId?.offerName, "World Heritage Cruises, Strahan, TAS");
  const byName = resolvePortalReturn(
    { offer_name: "world heritage cruises strahan tas" },
    OFFERS
  );
  assert.deepEqual(byName, { offerName: "World Heritage Cruises, Strahan, TAS", requiredPct: 70 });
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
  // No live access → the plain payment prompt still wins over the offer states.
  const v = resolvePortalBannerView({ ...base, acct: "pastdue", partnerAccessPct: 0 });
  assert.equal(v.headline, "Your membership payment needs attention.");
  assert.equal(v.cta?.kind, "payment");
  assert.equal(v.showLoginHint, false);
}

function testViewPastdueWithLivePack(): void {
  // F-031: a past-due member KEEPS a paid one-time pack. Never tell them their
  // discounts are gone when the pack is live.
  const uncovered = resolvePortalBannerView({
    ...base,
    acct: "pastdue",
    partnerAccessPct: 40, // live pack, but the offer needs 100
  });
  assert.equal(uncovered.headline, "Your pack access is still running.");
  assert.equal(uncovered.cta?.kind, "payment");

  // …and when the pack DOES cover the offer, they should be sent to redeem it.
  const covered = resolvePortalBannerView({
    ...base,
    acct: "pastdue",
    partnerAccessPct: 70,
    portalReturn: { offerName: "Witchery eGift Card", requiredPct: 40 },
  });
  assert.equal(covered.headline, "You're set — your 70% access covers Witchery eGift Card.");
  assert.equal(covered.cta?.kind, "sso");
}

function testLoginHintOnlyForSignedOut(): void {
  // F-028: acct "none" is ALSO every authenticated user with no active benefits —
  // offering them /login bounces them to /my-account, out of the funnel.
  const signedOut = resolvePortalBannerView({ ...base, acct: "none", isAuthenticated: false });
  assert.equal(signedOut.showLoginHint, true, "a genuinely signed-out visitor gets the hint");

  const signedInNoBenefits = resolvePortalBannerView({ ...base, acct: "none", isAuthenticated: true });
  assert.equal(signedInNoBenefits.showLoginHint, false, "an authenticated user must NOT be told to log in");
  // Copy itself is unchanged — only the hint is suppressed.
  assert.equal(signedInNoBenefits.headline, signedOut.headline);

  // Same on the generic arm.
  const genericAuthed = resolvePortalBannerView({
    ...base,
    acct: "none",
    isAuthenticated: true,
    portalReturn: { generic: true },
  });
  assert.equal(genericAuthed.showLoginHint, false);
}

function testViewCoveredAtExactEquality(): void {
  // F-036-adjacent boundary pin: 183 catalogue offers sit at exactly 50%, and 50% is
  // the entry subscription tier — the highest-traffic member/offer pairing. Pins `>=`.
  const equal = resolvePortalBannerView({
    ...base,
    acct: "active",
    partnerAccessPct: 50,
    portalReturn: { offerName: "Witchery eGift Card", requiredPct: 50 },
  });
  assert.equal(equal.headline, "You're set — your 50% access covers Witchery eGift Card.");
  assert.equal(equal.cta?.kind, "sso", "equality must count as covered, never fall through to an upsell");

  const under = resolvePortalBannerView({
    ...base,
    acct: "active",
    partnerAccessPct: 50,
    portalReturn: { offerName: "Witchery eGift Card", requiredPct: 55 },
  });
  assert.equal(under.headline, "You're at 50% — Witchery eGift Card needs 55%.");
  assert.equal(under.cta?.kind, "unlock");
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
  assert.equal(v.cta, null); // flag off → sub only
  // F-006: with no button, the sub must name the one path that works.
  assert.equal(
    v.sub,
    "Head back to the partner portal tab you came from — this offer is ready to redeem."
  );
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

function testViewPausedBranch(): void {
  // F-009: paused members are never upsold — resume guidance + manage CTA,
  // regardless of whether an offer was resolved.
  const withDate = resolvePortalBannerView({
    ...base,
    acct: "paused",
    partnerAccessPct: 0,
    pausedUntilLabel: "12 August",
  });
  assert.equal(withDate.headline, "Your membership is paused.");
  // F-048: the offer they came for is named when known, so resuming has a visible point.
  assert.equal(
    withDate.sub,
    "It resumes 12 August — resume now to get your discounts back, then check Amazon.com.au eGift Card again."
  );
  assert.equal(withDate.cta?.kind, "manage");

  const noDate = resolvePortalBannerView({
    ...base,
    acct: "paused",
    partnerAccessPct: 0,
    portalReturn: { generic: true },
  });
  // No resume date AND no resolved offer → the plain form, with nothing invented.
  assert.equal(noDate.sub, "Resume your membership to get your discounts back.");
  assert.equal(noDate.cta?.kind, "manage");
}

const tests = [
  testOfferIdResolvesFromCatalogue,
  testPrototypeKeysRejected,
  testUnknownIdFallsToGeneric,
  testNameAllowlistRejectsArbitraryText,
  testAmbiguousNamesAreDropped,
  testNameAllowlistNormalises,
  testVendorRunOnNamesDisplayWithCommas,
  testArrayParamsUseFirst,
  testNoParamsIsNotAReturnVisit,
  testCampaignAloneIsGeneric,
  testLadderMatchesElevenTiers,
  testViewPastdueWinsOverOffer,
  testViewPastdueWithLivePack,
  testLoginHintOnlyForSignedOut,
  testViewCoveredAtExactEquality,
  testViewGuestWithOffer,
  testViewAuthedShortOfOffer,
  testViewAuthedCovered,
  testViewCoveredFlagOffHasNoCta,
  testViewGenericGuestAndMember,
  testViewNoRecommendationFallsToScroll,
  testViewPausedBranch,
];

for (const t of tests) t();
console.log("portal-return (rewards-return parser + banner view matrix) tests passed");
