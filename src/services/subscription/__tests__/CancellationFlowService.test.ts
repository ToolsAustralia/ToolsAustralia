import assert from "node:assert/strict";
import { planFlow } from "../CancellationFlowService";

/**
 * Unit tests for planFlow (pure — no DB).
 *
 * IMPLEMENTED_OFFERS = { bonus_entries_100, tier_downgrade, pause_30d,
 * discount_50_2mo }. Task 16 shipped discount_50_2mo, so
 * too_expensive → [discount_50_2mo, bonus_entries_100] now surfaces BOTH
 * (no longer filtered to [bonus_entries_100]). Only unsubscribe_marketing
 * remains unimplemented (Task 17).
 */

function testStandard() {
  // too_expensive sequence is [discount_50_2mo, bonus_entries_100]; discount is
  // now implemented (Task 16) so both surface (was [bonus_entries_100]).
  assert.deepStrictEqual(
    planFlow({ reason: "too_expensive", pastDue: false, consumed: {} }).offersShown,
    ["discount_50_2mo", "bonus_entries_100"]
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
  // too_expensive → [discount_50_2mo, bonus_entries_100]. bonusEntries100
  // consumed filters the +100 rung, but discount_50_2mo is NOT consumed and is
  // now implemented (Task 16), so it still surfaces (was [] pre-Task-16).
  const r = planFlow({
    reason: "too_expensive",
    pastDue: false,
    consumed: { bonusEntries100: true },
  });
  assert.deepStrictEqual(r.offersShown, ["discount_50_2mo"]);
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
