import assert from "node:assert/strict";
import { priceCart, dollarsToCents, centsToDollars, toDollarSummary } from "@/utils/shop/pricing";
import { FLAT_SHIPPING_RATE_LABEL, SHOP_CONFIG } from "@/config/shop";

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
    flatShippingRateCents: 0,
  });
  assert.equal(t.totalCents, 110_00);
  assert.equal(t.gstCents, 10_00);
});

test("tier discount applies to the subtotal", () => {
  const t = priceCart([line(100)], {
    shopDiscountPercent: 20,
    flatShippingRateCents: 0,
  });
  assert.equal(t.discountCents, 20_00);
  assert.equal(t.totalCents, 80_00);
});

test("a guest (no tier) gets no discount", () => {
  const t = priceCart([line(100)], { flatShippingRateCents: 0 });
  assert.equal(t.discountCents, 0);
});

test("delivery is charged on EVERY order, whatever the cart is worth", () => {
  // The rule that replaced the $100 free-shipping threshold on 2026-08-25. A
  // waived fee was a real cost — the courier bills us on every parcel — carried
  // by a sale that had already been discounted.
  const small = priceCart([line(50)], { flatShippingRateCents: 10_00 });
  assert.equal(small.shippingCents, 10_00);
  assert.equal(small.totalCents, 60_00);

  // The old threshold would have shipped this one free.
  const large = priceCart([line(500)], { flatShippingRateCents: 10_00 });
  assert.equal(large.shippingCents, 10_00, "a big order still pays delivery");
  assert.equal(large.totalCents, 510_00);
});

test("a member discount never changes the delivery charge", () => {
  // Under the old threshold this was the sharp edge: the test ran against what
  // the customer PAID, so a deeper discount pulled an order back under the line
  // and silently altered the shipping outcome. Delivery is now independent of
  // the discount, so a price rise can no longer be undone by a tier crossing it.
  const guest = priceCart([line(100)], { shopDiscountPercent: 0, flatShippingRateCents: 10_00 });
  const boss = priceCart([line(100)], { shopDiscountPercent: 25, flatShippingRateCents: 10_00 });
  assert.equal(guest.shippingCents, 10_00);
  assert.equal(boss.shippingCents, 10_00, "same delivery either side of a discount");
  assert.equal(boss.totalCents, 85_00, "$100 less 25%, plus $10");
});

test("shipping sits inside the GST component (ATO GSTD 2002/3)", () => {
  const t = priceCart([line(100)], { flatShippingRateCents: 10_00 });
  assert.equal(t.totalCents, 110_00);
  assert.equal(t.gstCents, 10_00);
});

test("integer cents — no float drift on the classic 0.1 + 0.2 case", () => {
  const t = priceCart([line(0.1), line(0.2)], {
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

test("the delivery label is a dollar figure, not a bare number", () => {
  // This shipped, briefly. A docblock rewrite ate the "$" out of dollarLabel and
  // the product page read "10 on every order, anywhere in Australia". tsc cannot
  // see it — the type is `string` either way — and every consumer interpolates
  // the label straight into prose, so nothing else would have caught it. Found by
  // looking at the rendered page, which is the only reason it is not live.
  assert.match(FLAT_SHIPPING_RATE_LABEL, /^\$\d/, "label must lead with a dollar sign");
  assert.equal(FLAT_SHIPPING_RATE_LABEL, "$10");
  assert.equal(
    dollarsToCents(Number(FLAT_SHIPPING_RATE_LABEL.slice(1))),
    SHOP_CONFIG.flatShippingRateCents,
    "the label must state the rate actually charged"
  );
});

test("defaults come from SHOP_CONFIG: $10 flat on every order", () => {
  // Both sides of the old $100 line, which is the point: it no longer exists, so
  // the figure is the same either side of it.
  assert.equal(priceCart([line(99)], {}).shippingCents, 10_00);
  assert.equal(priceCart([line(100)], {}).shippingCents, 10_00);
  assert.equal(priceCart([line(250)], {}).shippingCents, 10_00);
});

test("a discount that lands on a half-cent rounds deterministically", () => {
  // $10.05 at 5% = 50.25 cents -> 50. Never a fraction of a cent.
  const t = priceCart([line(10.05)], {
    shopDiscountPercent: 5,
    flatShippingRateCents: 0,
  });
  assert.equal(t.discountCents, 50);
  assert.equal(t.totalCents, 955);
  assert.ok(Number.isInteger(t.totalCents));
});

test("toDollarSummary converts at the boundary and keeps GST inside the total", () => {
  const s = toDollarSummary(
    priceCart([line(110)], { flatShippingRateCents: 0 })
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
