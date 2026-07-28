/**
 * Tests for resolveUnlockPackagesForLevel (rewards-return banner recommendation).
 *
 * Pure: reads the real static membershipPackages catalog; no DB/network.
 * Expectations derived from the static data (subscriptions Tradie $20/50%,
 * Foreman $40/75%, Boss $80/100%; public one-time Apprentice $25/25% …
 * VIP $1000/100%).
 * Run: npx tsx src/utils/partner-discounts/__tests__/unlock-packages.test.ts
 */
import assert from "node:assert/strict";
import { resolveUnlockPackagesForLevel } from "../unlock-packages";

function testRequired100() {
  const r = resolveUnlockPackagesForLevel(100);
  assert.equal(r.subscription?.packageId, "boss-subscription", "100 → Boss subscription");
  assert.equal(r.subscription?.price, 80, "Boss subscription is $80");
  assert.equal(r.subscription?.pct, 100, "Boss subscription grants 100%");
  assert.equal(r.oneTime?.packageId, "vip-pack", "100 → VIP Pack");
  assert.equal(r.oneTime?.price, 1000, "VIP Pack is $1000");
  assert.equal(r.oneTime?.pct, 100, "VIP Pack grants 100%");
}

function testRequired70() {
  // Foreman (75%, $40) covers 70 cheaper than Boss (100%, $80) — the trap here is
  // the subscription percents: a bare "tradie"/"foreman" fed to the plan-id resolver
  // would return the one-time ladder (40/55) and wrongly promote Boss.
  const r = resolveUnlockPackagesForLevel(70);
  assert.equal(r.subscription?.packageId, "foreman-subscription", "70 → Foreman subscription ($40, 75%)");
  assert.equal(r.subscription?.pct, 75, "Foreman subscription grants 75%");
  assert.equal(r.oneTime?.packageId, "boss-pack", "70 → Boss Pack ($250, 70%)");
  assert.equal(r.oneTime?.pct, 70, "Boss Pack grants 70%");
}

function testRequired50() {
  const r = resolveUnlockPackagesForLevel(50);
  assert.equal(r.subscription?.packageId, "tradie-subscription", "50 → Tradie subscription ($20, 50%)");
  assert.equal(r.subscription?.pct, 50, "Tradie SUBSCRIPTION grants 50% (not the one-time 40%)");
  assert.equal(r.oneTime?.packageId, "foreman-pack", "50 → Foreman Pack ($100, 55%; Tradie Pack's 40% falls short)");
  assert.equal(r.oneTime?.pct, 55, "Foreman Pack grants 55%");
}

function testRequired25() {
  const r = resolveUnlockPackagesForLevel(25);
  assert.equal(r.subscription?.packageId, "tradie-subscription", "25 → Tradie subscription (cheapest sub)");
  assert.equal(r.oneTime?.packageId, "apprentice-pack", "25 → Apprentice Pack ($25, 25%)");
  assert.equal(r.oneTime?.price, 25, "Apprentice Pack is $25");
}

/**
 * The four ladder tiers the original suite left to invariant-only coverage
 * (panel F-020). Each pins the EXACT cheapest package per family, so a
 * cheapest-selection or tier-resolution regression at these boundaries fails
 * loudly instead of passing the "non-null and >= required" invariant.
 * 75 and 85 are the equality boundaries (Foreman sub == 75, Power Pack == 85).
 */
function testRequired40() {
  const r = resolveUnlockPackagesForLevel(40);
  assert.equal(r.subscription?.packageId, "tradie-subscription", "40 → Tradie subscription ($20, 50%)");
  assert.equal(r.oneTime?.packageId, "tradie-pack", "40 → Tradie Pack ($50, 40% — exact boundary)");
  assert.equal(r.oneTime?.pct, 40, "Tradie PACK grants 40% (not the subscription's 50%)");
}

function testRequired55() {
  const r = resolveUnlockPackagesForLevel(55);
  // Tradie sub (50%) falls short → the cheapest covering sub is Foreman.
  assert.equal(r.subscription?.packageId, "foreman-subscription", "55 → Foreman subscription ($40, 75%)");
  assert.equal(r.oneTime?.packageId, "foreman-pack", "55 → Foreman Pack ($100, 55% — exact boundary)");
  assert.equal(r.oneTime?.pct, 55, "Foreman Pack grants 55%");
}

function testRequired75() {
  const r = resolveUnlockPackagesForLevel(75);
  assert.equal(r.subscription?.packageId, "foreman-subscription", "75 → Foreman subscription (exact 75% equality)");
  assert.equal(r.subscription?.pct, 75, "equality must qualify, not fall through to Boss");
  assert.equal(r.oneTime?.packageId, "power-pack", "75 → Power Pack ($500, 85%; Boss Pack's 70% falls short)");
}

function testRequired85() {
  const r = resolveUnlockPackagesForLevel(85);
  assert.equal(r.subscription?.packageId, "boss-subscription", "85 → Boss subscription ($80, 100%)");
  assert.equal(r.oneTime?.packageId, "power-pack", "85 → Power Pack ($500, 85% — exact boundary)");
  assert.equal(r.oneTime?.pct, 85, "Power Pack grants 85%");
}

function testMiniTierPercents() {
  // ALL THREE mini tiers (panel F-040): the docstring always said 5/10/15 but the body
  // only exercised 5, leaving 10 and 15 — 367 catalogue offers — on the generic
  // "non-null and covers" invariant, which would pass for any covering package at any
  // price. No mini pack lives in the static catalog, so the cheapest covering options
  // are the entry-level public ones. Pinned exactly, per tier.
  for (const pct of [5, 10, 15]) {
    const r = resolveUnlockPackagesForLevel(pct);
    assert.equal(r.subscription?.packageId, "tradie-subscription", `${pct} → Tradie subscription`);
    assert.equal(r.subscription?.price, 20, `${pct} → cheapest sub is $20`);
    assert.equal(r.oneTime?.packageId, "apprentice-pack", `${pct} → Apprentice Pack`);
    assert.equal(r.oneTime?.price, 25, `${pct} → cheapest public pack is $25`);
  }
}

function testInvalidInputs() {
  for (const bad of [33, 0, NaN, -25, 101]) {
    const r = resolveUnlockPackagesForLevel(bad);
    assert.equal(r.subscription, null, `invalid ${bad} → subscription null`);
    assert.equal(r.oneTime, null, `invalid ${bad} → oneTime null`);
  }
}

function testNeverReturnsMemberOnlyOrMiniPacks() {
  // Member-only additional-* packs (e.g. Additional Boss Pack, $125/70%) undercut the
  // public ladder — they must never be recommended to a viewer who may not qualify.
  for (const pct of [5, 10, 15, 25, 40, 50, 55, 70, 75, 85, 100]) {
    const r = resolveUnlockPackagesForLevel(pct);
    for (const option of [r.subscription, r.oneTime]) {
      if (!option) continue;
      assert.ok(
        !option.packageId.startsWith("additional-"),
        `required ${pct}: must not recommend member-only pack (got ${option.packageId})`
      );
      assert.ok(
        !option.packageId.includes("mini"),
        `required ${pct}: must not recommend a mini pack (got ${option.packageId})`
      );
      assert.ok(option.pct >= pct, `required ${pct}: recommended pct ${option.pct} must cover it`);
    }
    assert.ok(r.subscription, `required ${pct}: a subscription always covers a ladder percent`);
    assert.ok(r.oneTime, `required ${pct}: a public one-time pack always covers a ladder percent`);
  }
}

function run() {
  testRequired100();
  testRequired85();
  testRequired75();
  testRequired70();
  testRequired55();
  testRequired50();
  testRequired40();
  testRequired25();
  testMiniTierPercents();
  testInvalidInputs();
  testNeverReturnsMemberOnlyOrMiniPacks();
  console.log("unlock-packages (rewards-return banner recommendation) tests passed");
}

run();
