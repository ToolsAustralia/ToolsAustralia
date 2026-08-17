import assert from "node:assert/strict";
import { priceCart } from "@/utils/shop/pricing";

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

const line = (price: number, quantity = 1) => ({ price, quantity });

test("subtotal is the GST-inclusive sum of the lines", () => {
  const t = priceCart([line(79.95), line(20, 2)], { shopDiscountPercent: 0 });
  assert.equal(t.subtotal, 119.95);
});

test("GST is a COMPONENT of the total, not added on top", () => {
  // $110 inclusive => $10 GST, and the total stays $110.
  const t = priceCart([line(110)], { shopDiscountPercent: 0, freeShippingThreshold: 0, flatShipping: 0 });
  assert.equal(t.total, 110);
  assert.equal(t.gstComponent, 10);
});

test("tier discount applies to the subtotal", () => {
  const t = priceCart([line(100)], { shopDiscountPercent: 20, freeShippingThreshold: 0, flatShipping: 0 });
  assert.equal(t.discount, 20);
  assert.equal(t.total, 80);
});

test("a guest (no tier) gets no discount", () => {
  const t = priceCart([line(100)], { freeShippingThreshold: 0, flatShipping: 0 });
  assert.equal(t.discount, 0);
});

test("shipping is charged below the threshold and free at or above it", () => {
  const under = priceCart([line(50)], { shopDiscountPercent: 0, freeShippingThreshold: 100, flatShipping: 10 });
  assert.equal(under.shipping, 10);
  assert.equal(under.total, 60);
  const over = priceCart([line(100)], { shopDiscountPercent: 0, freeShippingThreshold: 100, flatShipping: 10 });
  assert.equal(over.shipping, 0);
});

test("the free-shipping threshold is tested AFTER the discount", () => {
  // $100 subtotal - 20% = $80, under the $100 threshold, so shipping applies.
  // Testing the pre-discount subtotal would ship it free and lose the fee.
  const t = priceCart([line(100)], { shopDiscountPercent: 20, freeShippingThreshold: 100, flatShipping: 10 });
  assert.equal(t.shipping, 10);
  assert.equal(t.total, 90);
});

test("shipping sits inside the GST component (ATO GSTD 2002/3)", () => {
  const t = priceCart([line(100)], { shopDiscountPercent: 0, freeShippingThreshold: 1000, flatShipping: 10 });
  assert.equal(t.total, 110);
  assert.equal(t.gstComponent, 10);
});

test("money is rounded to cents, never left as float noise", () => {
  const t = priceCart([line(0.1), line(0.2)], { shopDiscountPercent: 0, freeShippingThreshold: 0, flatShipping: 0 });
  assert.equal(t.subtotal, 0.3);
});

test("an empty cart is all zeroes, not NaN", () => {
  const t = priceCart([], {});
  assert.equal(t.subtotal, 0);
  assert.equal(t.total, 0);
  assert.equal(t.gstComponent, 0);
  assert.equal(t.totalItems, 0);
});

test("totalItems counts quantities, not lines", () => {
  assert.equal(priceCart([line(10, 3), line(5, 2)], {}).totalItems, 5);
});

test("defaults match the shop's existing rule: $10 flat, free at $100", () => {
  assert.equal(priceCart([line(99)], {}).shipping, 10);
  assert.equal(priceCart([line(100)], {}).shipping, 0);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
