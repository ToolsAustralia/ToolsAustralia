import assert from "node:assert/strict";
import { planFlow } from "../CancellationFlowService";

/**
 * Unit tests for planFlow (pure — no DB).
 *
 * IMPLEMENTED_OFFERS = { bonus_entries_100, tier_downgrade } (Phase 2).
 * discount_50_2mo is NOT yet implemented, so too_expensive → sequence
 * [discount_50_2mo, bonus_entries_100] filters to [bonus_entries_100].
 */

function testStandard() {
  assert.deepStrictEqual(
    planFlow({ reason: "too_expensive", pastDue: false, consumed: {} }).offersShown,
    ["bonus_entries_100"]
  );
}

function testTier() {
  assert.deepStrictEqual(
    planFlow({ reason: "prefer_cheaper", pastDue: false, consumed: {} }).offersShown,
    ["tier_downgrade", "bonus_entries_100"]
  );
}

function testPastDue() {
  const r = planFlow({ reason: "too_expensive", pastDue: true, consumed: {} });
  assert.deepStrictEqual(r.offersShown, []);
  assert.strictEqual(r.pastDue, true);
}

function testConsumedBonusEntries() {
  const r = planFlow({
    reason: "too_expensive",
    pastDue: false,
    consumed: { bonusEntries100: true },
  });
  assert.deepStrictEqual(r.offersShown, []);
}

function testGiveawayReason() {
  assert.deepStrictEqual(
    planFlow({ reason: "joined_for_giveaway", pastDue: false, consumed: {} }).offersShown,
    ["bonus_entries_100"]
  );
}

function run() {
  testStandard();
  testTier();
  testPastDue();
  testConsumedBonusEntries();
  testGiveawayReason();
  console.log("PASS planFlow");
}

run();
