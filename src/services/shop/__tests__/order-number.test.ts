import assert from "node:assert/strict";
import { generateOrderNumber } from "@/services/shop/ShopOrderService";

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

test("order number matches SHOP-YYYYMMDD-XXXXXX", () => {
  assert.match(generateOrderNumber(), /^SHOP-\d{8}-[A-Z0-9]{6}$/);
});

test("carries today's date so it is sortable and readable in support", () => {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  assert.ok(generateOrderNumber().startsWith(`SHOP-${today}-`));
});

test("does not collide across a tight burst", () => {
  // orderNumber is a UNIQUE index, so a collision is a hard insert failure, not
  // a cosmetic clash. 5k in-loop generations is far denser than real traffic.
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(generateOrderNumber());
  assert.equal(seen.size, 5000, `collision: only ${seen.size} unique of 5000`);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
