import assert from "node:assert/strict";
import { planFlow } from "../CancellationFlowService";

/**
 * Unit tests for planFlow (pure — no DB).
 *
 * IMPLEMENTED_OFFERS = { bonus_entries_100, tier_downgrade, pause_30d,
 * discount_50_2mo, unsubscribe_marketing }. All OfferTypes are implemented
 * (Phase 5 complete) — no unimplemented offer remains, so every resolved
 * sequence surfaces in full (subject only to past-due / consumed flags).
 *
 * Routing changed to explicit per-reason sequences (no universal-final-rung
 * rule). New sequences:
 *   too_expensive      → [discount_50_2mo, pause_30d, tier_downgrade, bonus_entries_100]
 *   prefer_cheaper     → [tier_downgrade, discount_50_2mo, pause_30d, bonus_entries_100]
 *   dont_use_benefits  → [pause_30d, discount_50_2mo, tier_downgrade, bonus_entries_100]
 *   too_many_messages  → [unsubscribe_marketing, pause_30d, discount_50_2mo, tier_downgrade, bonus_entries_100]
 *   joined_for_giveaway→ [bonus_entries_100, discount_50_2mo, tier_downgrade, pause_30d]
 *   havent_won         → [bonus_entries_100, discount_50_2mo, tier_downgrade, pause_30d]
 *   other              → [discount_50_2mo, tier_downgrade, pause_30d, bonus_entries_100]
 */

function testStandard() {
  // too_expensive → [discount_50_2mo, pause_30d, tier_downgrade, bonus_entries_100].
  // All implemented, none consumed, not past-due → full sequence surfaces.
  assert.deepStrictEqual(
    planFlow({ reason: "too_expensive", pastDue: false, consumed: {} }).offersShown,
    ["discount_50_2mo", "pause_30d", "tier_downgrade", "bonus_entries_100"]
  );
}

function testTier() {
  // prefer_cheaper → [tier_downgrade, discount_50_2mo, pause_30d, bonus_entries_100].
  assert.deepStrictEqual(
    planFlow({ reason: "prefer_cheaper", pastDue: false, consumed: {} }).offersShown,
    ["tier_downgrade", "discount_50_2mo", "pause_30d", "bonus_entries_100"]
  );
}

function testPastDue() {
  // Past-due short-circuits to [] regardless of reason (spec §3a).
  const r = planFlow({ reason: "too_expensive", pastDue: true, consumed: {} });
  assert.deepStrictEqual(r.offersShown, []);
  assert.strictEqual(r.pastDue, true);
}

function testConsumedBonusEntries() {
  // too_expensive → [discount_50_2mo, pause_30d, tier_downgrade, bonus_entries_100].
  // bonusEntries100 consumed → bonus_entries_100 filtered out;
  // discount_50_2mo, pause_30d, tier_downgrade all remain (none consumed, all implemented).
  const r = planFlow({
    reason: "too_expensive",
    pastDue: false,
    consumed: { bonusEntries100: true },
  });
  assert.deepStrictEqual(r.offersShown, ["discount_50_2mo", "pause_30d", "tier_downgrade"]);
}

function testGiveawayReason() {
  // joined_for_giveaway → [bonus_entries_100, discount_50_2mo, tier_downgrade, pause_30d].
  // All implemented, none consumed — full sequence surfaces (bonus_entries_100 now leads).
  assert.deepStrictEqual(
    planFlow({ reason: "joined_for_giveaway", pastDue: false, consumed: {} }).offersShown,
    ["bonus_entries_100", "discount_50_2mo", "tier_downgrade", "pause_30d"]
  );
}

function testTooManyMessages() {
  // too_many_messages → [unsubscribe_marketing, pause_30d, discount_50_2mo, tier_downgrade, bonus_entries_100].
  // All implemented, none consumed — full 5-rung sequence surfaces.
  assert.deepStrictEqual(
    planFlow({ reason: "too_many_messages", pastDue: false, consumed: {} }).offersShown,
    ["unsubscribe_marketing", "pause_30d", "discount_50_2mo", "tier_downgrade", "bonus_entries_100"]
  );
}

function testConsumedPauseAndDiscount() {
  // too_expensive → [discount_50_2mo, pause_30d, tier_downgrade, bonus_entries_100].
  // Both discount and pause consumed → only tier_downgrade and bonus_entries_100 remain.
  const r = planFlow({
    reason: "too_expensive",
    pastDue: false,
    consumed: { discount50_2mo: true, pause30d: true },
  });
  assert.deepStrictEqual(r.offersShown, ["tier_downgrade", "bonus_entries_100"]);
}

function testHaventWon() {
  // havent_won → [bonus_entries_100, discount_50_2mo, tier_downgrade, pause_30d].
  assert.deepStrictEqual(
    planFlow({ reason: "havent_won", pastDue: false, consumed: {} }).offersShown,
    ["bonus_entries_100", "discount_50_2mo", "tier_downgrade", "pause_30d"]
  );
}

function testOther() {
  // other → [discount_50_2mo, tier_downgrade, pause_30d, bonus_entries_100].
  assert.deepStrictEqual(
    planFlow({ reason: "other", pastDue: false, consumed: {} }).offersShown,
    ["discount_50_2mo", "tier_downgrade", "pause_30d", "bonus_entries_100"]
  );
}

function run() {
  testStandard();
  testTier();
  testPastDue();
  testConsumedBonusEntries();
  testGiveawayReason();
  testTooManyMessages();
  testConsumedPauseAndDiscount();
  testHaventWon();
  testOther();
  console.log("PASS planFlow");
}

run();
