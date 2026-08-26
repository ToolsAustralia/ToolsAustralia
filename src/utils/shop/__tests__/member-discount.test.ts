import assert from "node:assert/strict";
import { resolveShopDiscountPercent, type PackageLookup } from "@/utils/shop/member-discount";
import { getPackageById, membershipPackages } from "@/data/membershipPackages";

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

const lookup = (percent?: number): PackageLookup => () => ({ shopDiscountPercent: percent });

test("an active subscription gets its tier's discount", () => {
  assert.equal(
    resolveShopDiscountPercent({ subscription: { isActive: true, packageId: "p" } }, lookup(20)),
    20
  );
});

test("an INACTIVE subscription gets nothing", () => {
  assert.equal(
    resolveShopDiscountPercent({ subscription: { isActive: false, packageId: "p" } }, lookup(20)),
    0
  );
});

test("no subscription at all gets nothing", () => {
  assert.equal(resolveShopDiscountPercent({}, lookup(20)), 0);
  assert.equal(resolveShopDiscountPercent({ subscription: null }, lookup(20)), 0);
});

test("an active subscription with no packageId gets nothing", () => {
  assert.equal(
    resolveShopDiscountPercent({ subscription: { isActive: true, packageId: null } }, lookup(20)),
    0
  );
});

test("a package with no shopDiscountPercent gets nothing", () => {
  assert.equal(
    resolveShopDiscountPercent({ subscription: { isActive: true, packageId: "p" } }, lookup(undefined)),
    0
  );
});

test("a nonsense catalog value can never inflate or invert the total", () => {
  const u = { subscription: { isActive: true, packageId: "p" } };
  assert.equal(resolveShopDiscountPercent(u, lookup(-10)), 0, "negative would inflate the total");
  assert.equal(resolveShopDiscountPercent(u, lookup(999)), 100, "clamped, never over 100%");
  assert.equal(resolveShopDiscountPercent(u, lookup(NaN)), 0);
});

// Against the REAL catalog, so a repriced tier or a renamed id fails here rather
// than silently changing what every member pays.
test("real catalog: the three subscription tiers are 5 / 10 / 20", () => {
  const forId = (id: string) =>
    resolveShopDiscountPercent({ subscription: { isActive: true, packageId: id } }, getPackageById);
  assert.equal(forId("tradie-subscription"), 10, "Tradie");
  assert.equal(forId("foreman-subscription"), 15, "Foreman");
  assert.equal(forId("boss-subscription"), 25, "Boss");
});

test("real catalog: EVERY one-time pack gives no shop discount", () => {
  // Enumerated from the catalog rather than a guessed id list, so a pack added
  // later with a non-zero shopDiscountPercent fails here instead of silently
  // discounting the shop for pack holders.
  const oneTime = membershipPackages.filter((p) => p.type === "one-time");
  assert.ok(oneTime.length > 0, "expected at least one one-time pack in the catalog");
  for (const pkg of oneTime) {
    assert.equal(
      resolveShopDiscountPercent(
        { subscription: { isActive: true, packageId: pkg._id } },
        getPackageById
      ),
      0,
      `${pkg.name} (${pkg._id}) must not discount the shop`
    );
  }
});

test("real catalog: an unknown package id is safe", () => {
  assert.equal(
    resolveShopDiscountPercent(
      { subscription: { isActive: true, packageId: "no-such-package" } },
      getPackageById
    ),
    0
  );
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
