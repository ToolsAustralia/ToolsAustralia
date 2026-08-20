import assert from "node:assert/strict";
import { convertToLocalPlan } from "@/utils/membership/membership-adapters";
import type { MembershipPlan } from "@/hooks/useMemberships";
import { getPackageById, getSubscriptionPackages } from "@/data/membershipPackages";
import {
  getPartnerCatalogAccessPercentForMembershipPackageId,
  getPartnerCatalogUnlockedCount,
} from "@/utils/partner-discounts/partner-catalog-visibility";

/**
 * `LocalMembershipPlan.id` is NOT a package lookup key, and resolving catalog data
 * from it silently shows one tier's numbers under another tier's name.
 *
 * The id is derived from the package NAME ("Tradie" → "tradie"), which
 * `getPackageById` cannot match and which the id-substring tier rules read as the
 * ONE-TIME Tradie pack rather than the Tradie subscription. Neither failure is
 * loud: no throw, no type error — just a wrong figure rendered with total
 * confidence. `metadata.packageId` carries the catalog `_id` so consumers have a
 * key that works.
 *
 * These assertions exist because the package-inclusions comparison table renders
 * partner-offer counts straight off this lookup.
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

/** Built the way `useMemberships` builds one: `id` from the name, `_id` from the catalog. */
const asApiPlan = (packageId: string): MembershipPlan => {
  const pkg = getPackageById(packageId);
  assert.ok(pkg, `fixture: no catalog package ${packageId}`);
  return {
    _id: pkg._id,
    id: pkg.name.toLowerCase().replace(/\s+/g, "-"),
    name: pkg.name,
    price: pkg.price,
    period: pkg.type === "subscription" ? "mo" : "one-time",
    features: pkg.features,
    buttonText: "Select",
    buttonStyle: "primary",
    entriesPerMonth: pkg.entriesPerMonth,
    totalEntries: pkg.totalEntries,
    shopDiscountPercent: pkg.shopDiscountPercent,
    isAdditional: pkg.isAdditional,
  };
};

test("the adapter carries the catalog _id in metadata.packageId", () => {
  for (const pkg of getSubscriptionPackages()) {
    const local = convertToLocalPlan(asApiPlan(pkg._id));
    assert.equal(
      local.metadata?.packageId,
      pkg._id,
      `${pkg.name}: expected metadata.packageId ${pkg._id}, got ${String(local.metadata?.packageId)}`
    );
  }
});

test("the display id is NOT a usable package key — this is why packageId exists", () => {
  const local = convertToLocalPlan(asApiPlan("tradie-subscription"));
  // The premise of the whole file. If this ever stops being true the adapter has
  // changed and the packageId indirection can be revisited.
  assert.equal(local.id, "tradie");
  assert.equal(getPackageById(local.id), undefined, "getPackageById matches on _id exactly");
});

test("resolving the tier from the display id yields the WRONG tier", () => {
  const local = convertToLocalPlan(asApiPlan("tradie-subscription"));
  const viaDisplayId = getPartnerCatalogAccessPercentForMembershipPackageId(local.id);
  const viaPackageId = getPartnerCatalogAccessPercentForMembershipPackageId(
    String(local.metadata?.packageId)
  );

  // 40 is the ONE-TIME Tradie pack; 50 is the Tradie SUBSCRIPTION. A bare
  // "tradie" misses the `includes("subscription")` branch and lands on the
  // one-time ladder.
  assert.equal(viaDisplayId, 40, "display-id lookup should hit the one-time ladder");
  assert.equal(viaPackageId, 50, "packageId lookup should hit the subscription ladder");
  assert.notEqual(
    viaDisplayId,
    viaPackageId,
    "if these ever agree, this test has stopped guarding anything"
  );
});

test("every subscription tier resolves to its documented partner access", () => {
  const expected: Record<string, number> = {
    "tradie-subscription": 50,
    "foreman-subscription": 75,
    "boss-subscription": 100,
  };
  for (const [packageId, percent] of Object.entries(expected)) {
    const local = convertToLocalPlan(asApiPlan(packageId));
    assert.equal(
      getPartnerCatalogAccessPercentForMembershipPackageId(String(local.metadata?.packageId)),
      percent,
      `${packageId} should open ${percent}% of the partner catalogue`
    );
  }
});

test("each tier's percent maps to a real offer count, not a made-up one", () => {
  // The comparison table renders these figures verbatim, so an off-ladder percent
  // must surface as `null` (caller falls back to the bare percent) rather than a
  // plausible-looking number.
  const counts = [50, 75, 100].map((p) => getPartnerCatalogUnlockedCount(p));
  for (const { count, total } of counts) {
    assert.ok(typeof count === "number" && count > 0, "on-ladder percent must have a count");
    assert.ok(count <= total, "a tier cannot open more offers than the catalogue holds");
  }
  assert.ok(
    counts[0].count! < counts[1].count! && counts[1].count! < counts[2].count!,
    "higher tiers must open strictly more offers"
  );
  assert.equal(counts[2].count, counts[2].total, "the top tier opens the whole catalogue");

  // Control: a percent that is NOT on the ladder returns null rather than guessing.
  assert.equal(getPartnerCatalogUnlockedCount(51).count, null);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
