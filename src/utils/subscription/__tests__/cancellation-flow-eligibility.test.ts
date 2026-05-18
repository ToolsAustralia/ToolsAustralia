import assert from "node:assert/strict";
import { eligibleOffers } from "../cancellation-flow-eligibility";

function testPastDueEmpty() {
  assert.deepStrictEqual(eligibleOffers(["discount_50_2mo","bonus_entries_100"], { pastDue:true, consumed:{} }), []);
}
function testUnimplementedFilteredPhase2() {
  // discount not yet implemented in Phase 2 → filtered, only +100 surfaces
  assert.deepStrictEqual(eligibleOffers(["discount_50_2mo","bonus_entries_100"], { pastDue:false, consumed:{} }), ["bonus_entries_100"]);
}
function testConsumedBonusEmpty() {
  assert.deepStrictEqual(eligibleOffers(["bonus_entries_100"], { pastDue:false, consumed:{ bonusEntries100:true } }), []);
}
function testTierDowngradeNotGated() {
  assert.deepStrictEqual(eligibleOffers(["tier_downgrade","bonus_entries_100"], { pastDue:false, consumed:{} }), ["tier_downgrade","bonus_entries_100"]);
}
function run(){ testPastDueEmpty(); testUnimplementedFilteredPhase2(); testConsumedBonusEmpty(); testTierDowngradeNotGated(); console.log("PASS eligibleOffers"); }
run();
