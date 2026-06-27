/**
 * Tests for the MyRewards SSO tier resolver (resolveMemberLevel + buildPartnerCatalogContext).
 *
 * Pure: hand-constructed IUser fixtures using real static package ids; no DB/network.
 * Run: npm run test:member-level
 */
import assert from "node:assert/strict";
import type { IUser } from "@/models/User";
import { resolveMemberLevel, buildPartnerCatalogContext } from "../member-level";

const asUser = (o: object): IUser => o as unknown as IUser;
const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const past = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

const activeSub = (packageId: string): IUser => asUser({ subscription: { packageId, isActive: true } });

function testSubscriptionTiers() {
  assert.equal(resolveMemberLevel(activeSub("boss-subscription"))?.percent, 100, "Boss subscription → 100%");
  assert.equal(resolveMemberLevel(activeSub("tradie-subscription"))?.percent, 50, "Tradie subscription → 50%");
  assert.equal(resolveMemberLevel(activeSub("foreman-subscription"))?.percent, 75, "Foreman subscription → 75%");
}

function testN1RawDocHydration() {
  // The N1 fix: a raw IUser (no subscriptionPackageData / enrichedOneTimePackages — as
  // stored in Mongo) must still tier correctly. The enricher hydrates it; without that,
  // a paying subscriber falls through to null (mis-tier).
  const raw = activeSub("boss-subscription");
  const ctx = buildPartnerCatalogContext(raw);
  assert.ok(ctx.subscriptionPackageData, "enricher must hydrate subscriptionPackageData from a raw doc");
  assert.equal(
    (ctx.subscriptionPackageData as { _id?: string })._id,
    "boss-subscription",
    "hydrated package is the active subscription"
  );
  assert.equal(resolveMemberLevel(raw)?.percent, 100, "raw subscriber doc must NOT be mis-tiered (N1)");
}

function testOneTimeLadder() {
  const u = asUser({
    oneTimePackages: [{ packageId: "boss-pack", isActive: true, purchaseDate: past() }],
    partnerDiscountQueue: [
      { packageId: "boss-pack", packageType: "one-time", status: "active", endDate: future(), purchaseDate: past() },
    ],
  });
  assert.equal(resolveMemberLevel(u)?.percent, 70, "active one-time Boss Pack → 70%");
}

function testFailClosed() {
  // No active plan → null, never the getPartnerCatalogAccessPercentForPlanId 100-default.
  assert.equal(
    resolveMemberLevel(asUser({ oneTimePackages: [], partnerDiscountQueue: [] })),
    null,
    "no access → null (not 100%)"
  );
  assert.equal(
    resolveMemberLevel(
      asUser({ subscription: { packageId: "boss-subscription", isActive: false }, partnerDiscountQueue: [] })
    ),
    null,
    "cancelled subscription → null (not 100%)"
  );
}

function testStacking() {
  // Higher one-time beats the lower subscription.
  const tradieSubPlusVip = asUser({
    subscription: { packageId: "tradie-subscription", isActive: true },
    oneTimePackages: [{ packageId: "vip-pack", isActive: true, purchaseDate: past() }],
    partnerDiscountQueue: [
      { packageId: "vip-pack", packageType: "one-time", status: "active", endDate: future(), purchaseDate: past() },
    ],
  });
  assert.equal(
    resolveMemberLevel(tradieSubPlusVip)?.percent,
    100,
    "Tradie sub + active VIP one-time → 100% (higher one-time wins)"
  );

  // Lower one-time loses to the higher subscription.
  const bossSubPlusApprentice = asUser({
    subscription: { packageId: "boss-subscription", isActive: true },
    oneTimePackages: [{ packageId: "apprentice-pack", isActive: true, purchaseDate: past() }],
    partnerDiscountQueue: [
      { packageId: "apprentice-pack", packageType: "one-time", status: "active", endDate: future(), purchaseDate: past() },
    ],
  });
  assert.equal(
    resolveMemberLevel(bossSubPlusApprentice)?.percent,
    100,
    "Boss sub + active Apprentice one-time → 100% (subscription wins)"
  );
}

function testDowngradePreservation() {
  // Current subscription is Tradie (50%), but the member is within the Boss preservation
  // window → must tier as Boss (100%) via getEffectiveBenefits, NOT the raw
  // subscription.packageId (which would wrongly give 50%). Guards the audit's GAP1.
  const u = asUser({
    subscription: {
      packageId: "tradie-subscription",
      isActive: true,
      previousSubscription: {
        packageId: "boss-subscription",
        packageName: "Boss",
        benefits: { entriesPerMonth: 0, discountPercentage: 0 },
        endDate: future(),
        downgradeDate: past(),
      },
    },
  });
  assert.equal(
    resolveMemberLevel(u)?.percent,
    100,
    "downgrade-preserved Boss → 100% (effective benefits, not raw packageId)"
  );
}

function run() {
  testSubscriptionTiers();
  testN1RawDocHydration();
  testOneTimeLadder();
  testFailClosed();
  testStacking();
  testDowngradePreservation();
  console.log("member-level (partner SSO tier resolver) tests passed");
}

run();
