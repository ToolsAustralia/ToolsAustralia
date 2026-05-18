import assert from "node:assert/strict";
import { getAdditionalPackDiscount } from "../additional-pack-discount";

function run() {
  const pairs: Array<[string, number, number]> = [
    ["additional-tradie-pack", 50, 25],
    ["additional-foreman-pack", 100, 50],
    ["additional-boss-pack", 250, 125],
    ["additional-power-pack", 500, 250],
    ["additional-vip-pack", 1000, 500],
  ];
  for (const [id, regular, discounted] of pairs) {
    const d = getAdditionalPackDiscount(id);
    assert.ok(d, `expected discount for ${id}`);
    assert.equal(d!.regularPrice, regular, `regularPrice ${id}`);
    assert.equal(d!.discountedPrice, discounted, `discountedPrice ${id}`);
    assert.equal(d!.percentOff, 50, `percentOff ${id}`);
  }
  assert.ok(getAdditionalPackDiscount("additional-tradie-pack-member"));
  assert.equal(getAdditionalPackDiscount("additional-apprentice-pack"), null);
  assert.equal(getAdditionalPackDiscount("tradie-pack"), null);
  assert.equal(getAdditionalPackDiscount("boss-subscription"), null);
  assert.equal(getAdditionalPackDiscount("nonsense"), null);
  console.log("additional-pack-discount: all assertions passed");
}

run();
