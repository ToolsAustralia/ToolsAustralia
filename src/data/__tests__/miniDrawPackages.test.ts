import assert from "node:assert/strict";
import {
  getMiniDrawPackages,
  getMiniDrawPackagesForViewer,
  getMiniDrawPackageById,
} from "@/data/miniDrawPackages";

function main() {
  // 1. Mini Pack 4–8 still resolvable (historical orders) but inactive.
  for (const id of ["mini-pack-4", "mini-pack-5", "mini-pack-6", "mini-pack-7", "mini-pack-8"]) {
    const pkg = getMiniDrawPackageById(id);
    assert.ok(pkg, `${id} must remain resolvable`);
    assert.equal(pkg!.isActive, false, `${id} must be inactive`);
  }

  // 2. New mini-scoped Additional packs are active and member-only.
  const newIds = [
    "additional-tradie-pack-mini",
    "additional-foreman-pack-mini",
    "additional-boss-pack-mini",
    "additional-power-pack-mini",
    "additional-vip-pack-mini",
  ];
  for (const id of newIds) {
    const pkg = getMiniDrawPackageById(id);
    assert.ok(pkg, `${id} must exist`);
    assert.equal(pkg!.isActive, true);
    assert.equal(pkg!.isMemberOnly, true);
    assert.ok(pkg!.displayName, `${id} must have a displayName`);
  }

  // 3. Entry counts preserved from Mini Pack 4–8.
  const entryByNew: Record<string, number> = {
    "additional-tradie-pack-mini": 25,
    "additional-foreman-pack-mini": 50,
    "additional-boss-pack-mini": 125,
    "additional-power-pack-mini": 250,
    "additional-vip-pack-mini": 500,
  };
  for (const [id, expected] of Object.entries(entryByNew)) {
    assert.equal(getMiniDrawPackageById(id)!.entries, expected);
  }

  // 4. Mini upsell entries equal trigger pack entries (no 2× rule).
  for (const id of newIds) {
    const pkg = getMiniDrawPackageById(id)!;
    assert.ok(pkg.upsell, `${id} must have an upsell`);
    assert.equal(pkg.upsell!.entries, pkg.entries, `${id} upsell entries must match trigger`);
    assert.equal(pkg.upsell!.price, pkg.price / 2, `${id} upsell must be 50% off`);
  }

  // 5. Viewer split.
  const guestPacks = getMiniDrawPackagesForViewer(false);
  const memberPacks = getMiniDrawPackagesForViewer(true);
  assert.equal(guestPacks.length, 3, "guest sees Mini Pack 1–3");
  assert.equal(memberPacks.length, 5, "member/entrant sees 5 Additional minis");
  assert.ok(guestPacks.every((p) => !p.isMemberOnly));
  assert.ok(memberPacks.every((p) => p.isMemberOnly));

  // 6. All upsells satisfy "same entries, 50% off" invariant across the file.
  for (const pkg of getMiniDrawPackages()) {
    if (!pkg.upsell) continue;
    assert.equal(pkg.upsell.entries, pkg.entries, `${pkg._id} upsell entries`);
    assert.equal(pkg.upsell.price, pkg.price / 2, `${pkg._id} upsell price`);
  }

  console.log("✅ miniDrawPackages tests passed");
}

main();
