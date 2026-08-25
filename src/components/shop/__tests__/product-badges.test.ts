import { strict as assert } from "node:assert";
import { resolveCommerceBadges, resolveEntryBadges } from "@/components/shop/ProductBadges";

/**
 * The badge system's rules, asserted without a DOM.
 *
 * The cap and the ranking are the parts that fail silently: a third badge does
 * not throw, it just quietly makes a 165px card unreadable, and a mis-ranked
 * list still renders perfectly. Neither shows up in a type error or a render
 * test, so they are asserted here directly.
 */

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

const labels = (b: { label: string }[]) => b.map((x) => x.label);

test("never renders more than two commerce badges plus an overflow chip", () => {
  const all = resolveCommerceBadges({
    stock: 2,
    trackInventory: true,
    discountPercent: 25,
    isFeatured: true,
    isNew: true,
    hot: true,
    bundle: true,
    backInStock: true,
  });
  assert.equal(all.length, 3, "two badges and one overflow chip, never more");
  assert.equal(all[2].kind, "overflow");
  // Seven qualified, two shown, so the chip must say +5 — an off-by-one here
  // under-reports what is hidden and nothing else would catch it.
  assert.equal(all[2].label, "+5");
});

test("rank is scarcity → price → hype → merchandising", () => {
  const all = resolveCommerceBadges({
    stock: 3,
    trackInventory: true,
    discountPercent: 10,
    isFeatured: true,
    hot: true,
  });
  assert.deepEqual(labels(all).slice(0, 2), ["3 LEFT", "10% OFF"], "scarcity outranks price");

  const noStock = resolveCommerceBadges({ discountPercent: 10, hot: true, isFeatured: true });
  assert.deepEqual(labels(noStock).slice(0, 2), ["10% OFF", "HOT"], "price outranks hype");

  const merch = resolveCommerceBadges({ isNew: true, isFeatured: true });
  assert.deepEqual(labels(merch), ["NEW", "FEATURED"], "new outranks featured");
});

test("no overflow chip at exactly two", () => {
  const two = resolveCommerceBadges({ discountPercent: 10, isFeatured: true });
  assert.equal(two.length, 2);
  assert.ok(!two.some((b) => b.kind === "overflow"), "two badges need no chip");
});

test("a print-to-order item is never branded scarce", () => {
  // The whole merch catalogue sits at stock 0 with trackInventory false. An
  // unconditional check would put "0 LEFT" on every garment in the shop.
  const merch = resolveCommerceBadges({ stock: 0, trackInventory: false, discountPercent: 10 });
  assert.deepEqual(labels(merch), ["10% OFF"]);

  const tracked = resolveCommerceBadges({ stock: 0, trackInventory: true });
  assert.deepEqual(labels(tracked), [], "a tracked item at zero is sold out, not scarce");

  const lastOne = resolveCommerceBadges({ stock: 1, trackInventory: true });
  assert.deepEqual(labels(lastOne), ["1 LEFT"]);
});

test("scarcity is five or fewer, and six is not scarce", () => {
  assert.deepEqual(labels(resolveCommerceBadges({ stock: 5, trackInventory: true })), ["5 LEFT"]);
  assert.deepEqual(labels(resolveCommerceBadges({ stock: 6, trackInventory: true })), []);
});

test("a zero discount renders nothing, not a 0% chip", () => {
  assert.deepEqual(labels(resolveCommerceBadges({ discountPercent: 0 })), []);
  assert.deepEqual(labels(resolveCommerceBadges({})), []);
});

test("entries live on their own axis and only above zero", () => {
  // Merch ships at includedEntries: 0 — "0 ENTRIES" states a promise the
  // business is not making, and rule 11 forbids pricing an entry at all.
  assert.deepEqual(labels(resolveEntryBadges({ includedEntries: 0 })), []);
  assert.deepEqual(labels(resolveEntryBadges({ includedEntries: 50 })), ["50 ENTRIES"]);

  assert.deepEqual(labels(resolveEntryBadges({ entryMultiplier: 1 })), [], "1× is not a multiplier");
  assert.deepEqual(labels(resolveEntryBadges({ entryMultiplier: 10 })), ["10×"]);
  assert.deepEqual(labels(resolveEntryBadges({ includedEntries: 50, entryMultiplier: 10 })), [
    "50 ENTRIES",
    "10×",
  ]);
});

test("entries never enter the commerce list", () => {
  // The separation IS the rule 11 safeguard: an entries chip ranked beside a
  // discount chip invites reading one against the other as a rate.
  const commerce = resolveCommerceBadges({ includedEntries: 50, entryMultiplier: 10, discountPercent: 10 });
  assert.deepEqual(labels(commerce), ["10% OFF"]);
  assert.ok(
    !commerce.some((b) => /ENTR|×/i.test(b.label)),
    "no entries badge may appear in the commerce corner"
  );
});

test("an unflagged product carries no badges at all", () => {
  assert.deepEqual(resolveCommerceBadges({ stock: 40, trackInventory: true }), []);
  assert.deepEqual(resolveEntryBadges({}), []);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
