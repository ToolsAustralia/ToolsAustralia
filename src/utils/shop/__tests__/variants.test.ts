import assert from "node:assert/strict";
import {
  findVariantBySku,
  variantLabel,
  isVariantPurchasable,
  activeVariants,
  type ProductVariantLike,
  type VariantHostLike,
} from "@/utils/shop/variants";

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

const v = (over: Partial<ProductVariantLike> = {}): ProductVariantLike => ({
  sku: "TA-HOOD-BLK-L",
  size: "L",
  colour: "Black",
  gtin: "00123456789012",
  isActive: true,
  ...over,
});

const host = (over: Partial<VariantHostLike> = {}): VariantHostLike => ({
  isActive: true,
  trackInventory: false,
  stock: 0,
  variants: [v()],
  ...over,
});

test("findVariantBySku returns the matching variant", () => {
  const a = v({ sku: "A" });
  const b = v({ sku: "B" });
  assert.equal(findVariantBySku([a, b], "B"), b);
});

test("findVariantBySku returns null for an unknown sku", () => {
  assert.equal(findVariantBySku([v()], "NOPE"), null);
});

test("findVariantBySku is exact, not case-insensitive", () => {
  assert.equal(findVariantBySku([v({ sku: "A" })], "a"), null);
});

test("variantLabel joins colour and size", () => {
  assert.equal(variantLabel(v({ colour: "Black", size: "L" })), "Black · L");
});

test("variantLabel omits missing parts without a stray separator", () => {
  assert.equal(variantLabel(v({ colour: "Black", size: undefined })), "Black");
  assert.equal(variantLabel(v({ colour: undefined, size: "L" })), "L");
});

test("variantLabel falls back to the sku when nothing else is set", () => {
  assert.equal(variantLabel(v({ colour: undefined, size: undefined, sku: "X1" })), "X1");
});

test("activeVariants drops inactive variants", () => {
  const on = v({ sku: "ON" });
  const off = v({ sku: "OFF", isActive: false });
  assert.deepEqual(activeVariants(host({ variants: [on, off] })), [on]);
});

test("print-to-order variant is purchasable at zero stock", () => {
  assert.equal(isVariantPurchasable(host({ trackInventory: false, stock: 0 }), v()), true);
});

test("stock-tracked variant is NOT purchasable at zero stock", () => {
  assert.equal(isVariantPurchasable(host({ trackInventory: true, stock: 0 }), v()), false);
});

test("stock-tracked variant is purchasable with stock", () => {
  assert.equal(isVariantPurchasable(host({ trackInventory: true, stock: 3 }), v()), true);
});

test("inactive variant is never purchasable", () => {
  assert.equal(isVariantPurchasable(host(), v({ isActive: false })), false);
});

test("inactive product makes every variant unpurchasable", () => {
  assert.equal(isVariantPurchasable(host({ isActive: false }), v()), false);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
