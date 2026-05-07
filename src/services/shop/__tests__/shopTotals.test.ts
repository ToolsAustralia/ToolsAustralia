// src/services/shop/__tests__/shopTotals.test.ts
import { computeShopTotals } from "../shopTotals.service";

const items = [
  { productId: "a", priceCents: 4000, quantity: 1 }, // $40.00
  { productId: "b", priceCents: 2000, quantity: 1 }, // $20.00
];

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const t1 = computeShopTotals({ items, freeShippingThresholdCents: 10000, flatShippingRateCents: 1000 });
assert(t1.subtotalCents === 6000, "subtotal sum");
assert(t1.shippingCents === 1000, "shipping = flat under threshold");
assert(t1.totalCents === 7000, "total = subtotal + shipping");
assert(t1.gstCents === Math.round(7000 / 11), "gst = total/11");

const t2 = computeShopTotals({
  items: [{ productId: "x", priceCents: 12000, quantity: 1 }],
  freeShippingThresholdCents: 10000,
  flatShippingRateCents: 1000,
});
assert(t2.shippingCents === 0, "shipping = 0 over threshold");
assert(t2.totalCents === 12000, "total = subtotal only");

const t3 = computeShopTotals({
  items: [{ productId: "y", priceCents: 1000, quantity: 3 }],
  freeShippingThresholdCents: 10000,
  flatShippingRateCents: 1000,
});
assert(t3.subtotalCents === 3000, "subtotal multiplies by quantity");

const t4 = computeShopTotals({
  items: [],
  freeShippingThresholdCents: 10000,
  flatShippingRateCents: 1000,
});
assert(t4.subtotalCents === 0 && t4.shippingCents === 0 && t4.totalCents === 0, "empty cart");

console.log("shopTotals: ALL PASS");
