import assert from "node:assert/strict";
import { isMiniDrawPackageId, miniDrawPackages } from "../miniDrawPackages";
import { membershipPackages } from "../membershipPackages";
import { normalizeMembershipPlanId } from "@/utils/membership/additional-package-mapping";

/**
 * `isMiniDrawPackageId` decides whether a Stripe purchase route REJECTS a package id, so it gets a
 * test rather than a read-through — it sits directly on the money path in both directions.
 *
 * A false negative re-opens the money-in/nothing-out hole: the one-time routes have no draw in
 * scope, so they cannot set `miniDrawId`, and `handleMiniDrawWebhook` bails without granting.
 * A false positive is worse in practice — it 400s a legitimate membership purchase.
 */

function testEveryMiniPackageIsRecognised() {
  // Derived from the array, never hardcoded, so a 14th pack is covered the moment it is added.
  for (const pkg of miniDrawPackages) {
    assert.equal(isMiniDrawPackageId(pkg._id), true, `${pkg._id} must be recognised as a mini pack`);
  }
}

function testTheCatalogueIsNotEmpty() {
  // Guards the test above against vacuity: if `miniDrawPackages` were ever empty or accidentally
  // filtered, every loop here would pass while the guard protected nothing.
  assert.ok(miniDrawPackages.length >= 13, `expected >= 13 mini packages, got ${miniDrawPackages.length}`);
  for (const id of [
    "mini-pack-1",
    "mini-pack-8",
    // The five that caused this: they resolve as mini packages but read like membership ids.
    "additional-tradie-pack-mini",
    "additional-foreman-pack-mini",
    "additional-boss-pack-mini",
    "additional-power-pack-mini",
    "additional-vip-pack-mini",
  ]) {
    assert.equal(isMiniDrawPackageId(id), true, `${id} must be in the mini catalogue`);
  }
}

function testNoLegitimatePackageIsRejected() {
  // THE REGRESSION THAT MATTERS. Every membership/one-time/member-only id must pass the guard, or
  // the fix breaks real revenue. Note `additional-vip-pack` vs `additional-vip-pack-mini`: the
  // names differ by one suffix, which is exactly why the guard matches the CATALOGUE and not a
  // string shape.
  for (const pkg of membershipPackages) {
    assert.equal(
      isMiniDrawPackageId(pkg._id),
      false,
      `${pkg._id} is a real purchasable package and must NOT be rejected`,
    );
    // The existing-user route checks the canonical form too; it must agree.
    assert.equal(
      isMiniDrawPackageId(normalizeMembershipPlanId(pkg._id)),
      false,
      `${pkg._id} must not be rejected after normalisation either`,
    );
  }
}

function testUpsellIdsAreNotRejected() {
  // Mini UPSELLS are owned by /api/upsell/purchase, which resolves miniDrawId from purchase
  // history. They must not be caught by a guard aimed at the one-time purchase routes.
  const upsellIds = miniDrawPackages.flatMap((p) => (p.upsell ? [p.upsell._id] : []));
  assert.ok(upsellIds.length > 0, "expected the catalogue to define upsells");
  for (const id of upsellIds) {
    assert.equal(isMiniDrawPackageId(id), false, `${id} is an upsell id, not a purchasable pack`);
  }
}

function testAbsentIdsAreNotMiniPackages() {
  // `packageId` is optional on some payment routes, so the guard must tolerate nothing at all
  // rather than throwing on the way to a 400.
  assert.equal(isMiniDrawPackageId(undefined), false);
  assert.equal(isMiniDrawPackageId(null), false);
  assert.equal(isMiniDrawPackageId(""), false);
  assert.equal(isMiniDrawPackageId("not-a-real-package"), false);
}

function testNormalisationDoesNotStripTheMiniSuffix() {
  // Locks in WHY the existing-user route can check either form: normalizeMembershipPlanId only
  // strips `-member`. If that ever changes so `-mini` is rewritten away, this fails loudly here
  // instead of silently re-opening the hole in the route.
  assert.equal(normalizeMembershipPlanId("additional-vip-pack-mini"), "additional-vip-pack-mini");
  assert.equal(normalizeMembershipPlanId("additional-vip-pack-member"), "additional-vip-pack");
}

function run() {
  testEveryMiniPackageIsRecognised();
  testTheCatalogueIsNotEmpty();
  testNoLegitimatePackageIsRejected();
  testUpsellIdsAreNotRejected();
  testAbsentIdsAreNotMiniPackages();
  testNormalisationDoesNotStripTheMiniSuffix();
  console.log("mini-draw-package-id tests passed");
}

run();
