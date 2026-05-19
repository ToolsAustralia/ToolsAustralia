import assert from "node:assert/strict";
import { resolveOfferSequence } from "../cancellation-flow-routing";

function run() {
  // Explicit per-reason sequences (user-confirmed mapping).
  // bonus_entries_100 leads for joined_for_giveaway/havent_won; is last for all
  // other reasons. unsubscribe_marketing appears ONLY in too_many_messages lead.
  assert.deepStrictEqual(resolveOfferSequence("too_expensive"), [
    "discount_50_2mo", "pause_30d", "tier_downgrade", "bonus_entries_100",
  ]);
  assert.deepStrictEqual(resolveOfferSequence("prefer_cheaper"), [
    "tier_downgrade", "discount_50_2mo", "pause_30d", "bonus_entries_100",
  ]);
  assert.deepStrictEqual(resolveOfferSequence("dont_use_benefits"), [
    "pause_30d", "discount_50_2mo", "tier_downgrade", "bonus_entries_100",
  ]);
  assert.deepStrictEqual(resolveOfferSequence("too_many_messages"), [
    "unsubscribe_marketing", "pause_30d", "discount_50_2mo", "tier_downgrade", "bonus_entries_100",
  ]);
  assert.deepStrictEqual(resolveOfferSequence("joined_for_giveaway"), [
    "bonus_entries_100", "discount_50_2mo", "tier_downgrade", "pause_30d",
  ]);
  assert.deepStrictEqual(resolveOfferSequence("havent_won"), [
    "bonus_entries_100", "discount_50_2mo", "tier_downgrade", "pause_30d",
  ]);
  assert.deepStrictEqual(resolveOfferSequence("other"), [
    "discount_50_2mo", "tier_downgrade", "pause_30d", "bonus_entries_100",
  ]);

  // unsubscribe_marketing must NOT appear in any other reason's sequence.
  const otherReasons = [
    "too_expensive", "prefer_cheaper", "dont_use_benefits",
    "joined_for_giveaway", "havent_won", "other",
  ] as const;
  for (const r of otherReasons) {
    assert.equal(
      resolveOfferSequence(r).includes("unsubscribe_marketing"),
      false,
      `unsubscribe_marketing must not appear in ${r}`,
    );
  }

  // bonus_entries_100 must not be duplicated in any sequence.
  const allReasons = [
    "too_expensive", "prefer_cheaper", "dont_use_benefits", "too_many_messages",
    "joined_for_giveaway", "havent_won", "other",
  ] as const;
  for (const r of allReasons) {
    const seq = resolveOfferSequence(r);
    const count = seq.filter((o) => o === "bonus_entries_100").length;
    assert.equal(count, 1, `bonus_entries_100 must appear exactly once in ${r}`);
  }

  console.log("PASS resolveOfferSequence");
}

run();
