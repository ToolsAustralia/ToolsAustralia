import assert from "node:assert/strict";
import { planFlow } from "../CancellationFlowService";

/**
 * Unit tests for planFlow (pure — no DB).
 *
 * IMPLEMENTED_OFFERS = { bonus_entries_100, tier_downgrade, pause_30d,
 * discount_50_2mo, unsubscribe_marketing }. As of Task 17 ALL OfferTypes are
 * implemented (Phase 5 complete) — no unimplemented offer remains, so every
 * resolved sequence surfaces in full (subject only to past-due / consumed).
 * too_expensive → [discount_50_2mo, bonus_entries_100] surfaces BOTH.
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

function testTooManyMessages() {
  // too_many_messages → [unsubscribe_marketing, bonus_entries_100]. Task 17
  // shipped unsubscribe_marketing so both surface (pre-Task-17 it was filtered
  // to [bonus_entries_100]).
  assert.deepStrictEqual(
    planFlow({ reason: "too_many_messages", pastDue: false, consumed: {} }).offersShown,
    ["unsubscribe_marketing", "bonus_entries_100"]
  );
}

function run() {
  testStandard();
  testTier();
  testPastDue();
  testConsumedBonusEntries();
  testGiveawayReason();
  testTooManyMessages();
  console.log("PASS planFlow");
}

run();
