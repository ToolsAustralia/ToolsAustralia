import assert from "node:assert/strict";
import { resolveOfferSequence } from "../cancellation-flow-routing";

function run() {
  assert.deepStrictEqual(resolveOfferSequence("too_expensive"), ["discount_50_2mo", "bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("prefer_cheaper"), ["tier_downgrade", "bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("dont_use_benefits"), ["pause_30d", "bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("too_many_messages"), ["unsubscribe_marketing", "bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("joined_for_giveaway"), ["bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("havent_won"), ["bonus_entries_100"]);
  assert.deepStrictEqual(resolveOfferSequence("other"), ["pause_30d", "discount_50_2mo", "bonus_entries_100"]);
  console.log("PASS resolveOfferSequence");
}

run();
