import assert from "node:assert/strict";
import { priceCart, dollarsToCents, centsToDollars, toDollarSummary } from "@/utils/shop/pricing";

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

/** $ helper — tests read in dollars, the module works in cents. */
const line = (dollars: number, quantity = 1) => ({
  priceCents: dollarsToCents(dollars),
  quantity,
});

test("subtotal is the GST-inclusive sum of the lines", () => {
  const t = priceCart([line(79.95), line(20, 2)], { shopDiscountPercent: 0 });
  assert.equal(t.subtotalCents, 119_95);
});

test("GST is a COMPONENT of the total, not added on top", () => {
  const t = priceCart([line(110)], {
    shopDiscountPercent: 0,
    freeShippingThresholdCents: 0,
    flatShippingRateCents: 0,
  });
  assert.equal(t.totalCents, 110_00);
  assert.equal(t.gstCents, 10_00);
});

test("tier discount applies to the subtotal", () => {
  const t = priceCart([line(100)], {
    shopDiscountPercent: 20,
    freeShippingThresholdCents: 0,
    flatShippingRateCents: 0,
  });
  assert.equal(t.discountCents, 20_00);
  assert.equal(t.totalCents, 80_00);
});

test("a guest (no tier) gets no discount", () => {
  const t = priceCart([line(100)], { freeShippingThresholdCents: 0, flatShippingRateCents: 0 });
  assert.equal(t.discountCents, 0);
});

test("shipping is charged below the threshold and free at or above it", () => {
  const under = priceCart([line(50)], {
    freeShippingThresholdCents: 100_00,
    flatShippingRateCents: 10_00,
  });
  assert.equal(under.shippingCents, 10_00);
  assert.equal(under.totalCents, 60_00);

  const over = priceCart([line(100)], {
    freeShippingThresholdCents: 100_00,
    flatShippingRateCents: 10_00,
  });
  assert.equal(over.shippingCents, 0);
});

test("the free-shipping threshold is tested AFTER the discount", () => {
  // $100 - 20% = $80, under the $100 threshold, so shipping applies. Testing the
  // pre-discount subtotal would ship it free and lose the fee.
  const t = priceCart([line(100)], {
    shopDiscountPercent: 20,
    freeShippingThresholdCents: 100_00,
    flatShippingRateCents: 10_00,
  });
  assert.equal(t.shippingCents, 10_00);
  assert.equal(t.totalCents, 90_00);
});

test("shipping sits inside the GST component (ATO GSTD 2002/3)", () => {
  const t = priceCart([line(100)], {
    freeShippingThresholdCents: 1000_00,
    flatShippingRateCents: 10_00,
  });
  assert.equal(t.totalCents, 110_00);
  assert.equal(t.gstCents, 10_00);
});

test("integer cents — no float drift on the classic 0.1 + 0.2 case", () => {
  const t = priceCart([line(0.1), line(0.2)], {
    freeShippingThresholdCents: 0,
    flatShippingRateCents: 0,
  });
  assert.equal(t.subtotalCents, 30);
  assert.equal(centsToDollars(t.subtotalCents), 0.3);
});

test("an empty cart is all zeroes, not NaN and not charged shipping", () => {
  const t = priceCart([], {});
  assert.equal(t.subtotalCents, 0);
  assert.equal(t.totalCents, 0);
  assert.equal(t.gstCents, 0);
  assert.equal(t.shippingCents, 0);
  assert.equal(t.totalItems, 0);
});

test("totalItems counts quantities, not lines", () => {
  assert.equal(priceCart([line(10, 3), line(5, 2)], {}).totalItems, 5);
});

test("defaults come from SHOP_CONFIG: $10 flat, free at $100", () => {
  assert.equal(priceCart([line(99)], {}).shippingCents, 10_00);
  assert.equal(priceCart([line(100)], {}).shippingCents, 0);
});

test("a discount that lands on a half-cent rounds deterministically", () => {
  // $10.05 at 5% = 50.25 cents -> 50. Never a fraction of a cent.
  const t = priceCart([line(10.05)], {
    shopDiscountPercent: 5,
    freeShippingThresholdCents: 0,
    flatShippingRateCents: 0,
  });
  assert.equal(t.discountCents, 50);
  assert.equal(t.totalCents, 955);
  assert.ok(Number.isInteger(t.totalCents));
});

test("toDollarSummary converts at the boundary and keeps GST inside the total", () => {
  const s = toDollarSummary(
    priceCart([line(110)], { freeShippingThresholdCents: 0, flatShippingRateCents: 0 })
  );
  assert.equal(s.totalAmount, 110);
  assert.equal(s.tax, 10);
  assert.equal(s.subtotal, 110);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
