import assert from "node:assert/strict";
import {
  findVariantByOptions,
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


/*
  A PARTIAL selection must not resolve a variant.

  findVariantByOptions used to `find` the first match, so colour-without-size
  returned Black/S and the product page enabled its add button while still asking
  the customer to pick a size — it would have added a size they never chose. The
  fix counts candidates instead of taking the first, which also keeps a
  colour-only product working without a special case.
*/
const RUN = [
  v({ sku: "BLK-S", size: "S", colour: "Black" }),
  v({ sku: "BLK-M", size: "M", colour: "Black" }),
  v({ sku: "NVY-S", size: "S", colour: "Navy" }),
  v({ sku: "NVY-M", size: "M", colour: "Navy" }),
];

test("a colour alone does not resolve a variant when sizes remain", () => {
  assert.equal(
    findVariantByOptions(RUN, "Black", null),
    null,
    "two Black sizes still match, so nothing is chosen yet"
  );
});

test("a size alone does not resolve a variant when colours remain", () => {
  assert.equal(findVariantByOptions(RUN, null, "M"), null);
});

test("colour and size together resolve exactly one", () => {
  assert.equal(findVariantByOptions(RUN, "Black", "M")?.sku, "BLK-M");
  assert.equal(findVariantByOptions(RUN, "Navy", "S")?.sku, "NVY-S");
});

test("a colour-only product still resolves on colour alone", () => {
  // One variant per colour — the selection genuinely narrows to one, so requiring
  // a size here would make the product permanently unaddable.
  const oneSize = [
    v({ sku: "OS-BLK", size: undefined, colour: "Black" }),
    v({ sku: "OS-NVY", size: undefined, colour: "Navy" }),
  ];
  assert.equal(findVariantByOptions(oneSize, "Black", null)?.sku, "OS-BLK");
});

test("neither chosen resolves nothing", () => {
  assert.equal(findVariantByOptions(RUN, null, null), null);
});

test("an unknown combination resolves nothing", () => {
  assert.equal(findVariantByOptions(RUN, "Black", "XXL"), null);
  assert.equal(findVariantByOptions(RUN, "Crimson", "M"), null);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
