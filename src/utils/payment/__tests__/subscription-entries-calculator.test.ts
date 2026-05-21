import assert from "node:assert/strict";
import {
  calculateUpgradeEntries,
  calculateSubscriptionEntries,
} from "../subscription-entries-calculator";

// --------------------------------------------------------------------------
// Mode A — no prior membership grant in active draw (the common case)
// --------------------------------------------------------------------------

function testModeAPrimaryScenario() {
  // Apr Tradie renewal accumulated 1115; May upgrade to Boss (base 100) with 5x promo
  const result = calculateUpgradeEntries(100, 1115, 5, false);
  assert.strictEqual(result.entriesToGrant, 1615, "Mode A primary grant");
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 1615, "Mode A primary accum");
  assert.strictEqual(result.calculationType, "upgrade");
}

function testModeANoPromo() {
  // Mode A with promoMultiplier = 1 → stack still applies, no multiplier bonus
  const result = calculateUpgradeEntries(100, 1115, 1, false);
  assert.strictEqual(result.entriesToGrant, 1215);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 1215);
}

function testModeAFreshUpgrade() {
  // lastAccum = 0 (e.g., user fresh-subscribed and immediately upgraded with no prior history)
  const result = calculateUpgradeEntries(100, 0, 5, false);
  assert.strictEqual(result.entriesToGrant, 500);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 500);
}

// --------------------------------------------------------------------------
// Mode B — membership grant already in the active draw
// --------------------------------------------------------------------------

function testModeBRenewalThenUpgrade() {
  // May Tradie renewal granted 1130 → lastAccum = 1130. User then upgrades
  // to Boss (5x promo) in the same draw period.
  const result = calculateUpgradeEntries(100, 1130, 5, true);
  assert.strictEqual(result.entriesToGrant, 500, "Mode B grant is differential only");
  assert.strictEqual(
    result.newLastMonthAccumulatedEntries,
    1630,
    "Mode B accum = lastAccum + grant"
  );
}

function testModeBInitialThenUpgrade() {
  // Same-cycle initial-then-upgrade: initial Tradie granted 150 → lastAccum = 150.
  // User upgrades to Boss (5x) before the draw closes.
  const result = calculateUpgradeEntries(100, 150, 5, true);
  assert.strictEqual(result.entriesToGrant, 500);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 650);
}

// --------------------------------------------------------------------------
// Defensive input handling
// --------------------------------------------------------------------------

function testNegativeBaseEntriesCoercedToZero() {
  const result = calculateUpgradeEntries(-50, 100, 5, false);
  // newBase clamped to 0 → promoEntries = 0; Mode A: 100 + 0 = 100
  assert.strictEqual(result.entriesToGrant, 100);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 100);
}

function testNegativeLastMonthCoercedToZero() {
  const result = calculateUpgradeEntries(100, -200, 5, false);
  assert.strictEqual(result.entriesToGrant, 500);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 500);
}

function testPromoBelowOneCoercedToOne() {
  const result = calculateUpgradeEntries(100, 1115, 0.5, false);
  assert.strictEqual(result.entriesToGrant, 1215);
}

// --------------------------------------------------------------------------
// Dispatcher integration
// --------------------------------------------------------------------------

function testDispatcherRoutesUpgradeWithFlagFalse() {
  const result = calculateSubscriptionEntries({
    billingReason: "subscription_cycle",
    baseEntries: 100,
    lastMonthAccumulatedEntries: 1115,
    isResubscribe: false,
    promoMultiplier: 5,
    isUpgrade: true,
    hasMembershipGrantInCurrentDrawPeriod: false,
  });
  assert.strictEqual(result.entriesToGrant, 1615);
  assert.strictEqual(result.calculationType, "upgrade");
}

function testDispatcherRoutesUpgradeWithFlagTrue() {
  const result = calculateSubscriptionEntries({
    billingReason: "subscription_cycle",
    baseEntries: 100,
    lastMonthAccumulatedEntries: 1130,
    isResubscribe: false,
    promoMultiplier: 5,
    isUpgrade: true,
    hasMembershipGrantInCurrentDrawPeriod: true,
  });
  assert.strictEqual(result.entriesToGrant, 500);
  assert.strictEqual(result.newLastMonthAccumulatedEntries, 1630);
}

function testDispatcherDefaultsFlagToFalse() {
  // Flag omitted → defaults to false → Mode A
  const result = calculateSubscriptionEntries({
    billingReason: "subscription_cycle",
    baseEntries: 100,
    lastMonthAccumulatedEntries: 1115,
    isResubscribe: false,
    promoMultiplier: 5,
    isUpgrade: true,
  });
  assert.strictEqual(result.entriesToGrant, 1615);
}

// --------------------------------------------------------------------------
// Driver
// --------------------------------------------------------------------------

const tests: Array<[string, () => void]> = [
  ["Mode A primary scenario", testModeAPrimaryScenario],
  ["Mode A no promo", testModeANoPromo],
  ["Mode A fresh upgrade (lastAccum=0)", testModeAFreshUpgrade],
  ["Mode B renewal-then-upgrade", testModeBRenewalThenUpgrade],
  ["Mode B initial-then-upgrade", testModeBInitialThenUpgrade],
  ["Negative baseEntries clamped", testNegativeBaseEntriesCoercedToZero],
  ["Negative lastMonth clamped", testNegativeLastMonthCoercedToZero],
  ["Promo < 1 clamped", testPromoBelowOneCoercedToOne],
  ["Dispatcher routes flag=false", testDispatcherRoutesUpgradeWithFlagFalse],
  ["Dispatcher routes flag=true", testDispatcherRoutesUpgradeWithFlagTrue],
  ["Dispatcher defaults flag to false", testDispatcherDefaultsFlagToFalse],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(err);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} tests passed`);
