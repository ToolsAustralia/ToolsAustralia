import assert from "node:assert/strict";
import { eligibleOffers } from "../cancellation-flow-eligibility";

function testPastDueEmpty() {
  assert.deepStrictEqual(eligibleOffers(["discount_50_2mo","bonus_entries_100"], { pastDue:true, consumed:{} }), []);
}
function testUnimplementedFilteredPhase2() {
  // discount still not implemented (Task 16) → filtered, only +100 surfaces
  assert.deepStrictEqual(eligibleOffers(["discount_50_2mo","bonus_entries_100"], { pastDue:false, consumed:{} }), ["bonus_entries_100"]);
}
function testPause30dImplemented() {
  // Task 14: pause_30d is now implemented → surfaces alongside +100
  assert.deepStrictEqual(eligibleOffers(["pause_30d","bonus_entries_100"], { pastDue:false, consumed:{} }), ["pause_30d","bonus_entries_100"]);
}
function testPause30dConsumed() {
  // pause_30d is one-time gated → consumed.pause30d filters it out, +100 remains
  assert.deepStrictEqual(eligibleOffers(["pause_30d","bonus_entries_100"], { pastDue:false, consumed:{ pause30d:true } }), ["bonus_entries_100"]);
}
function testConsumedBonusEmpty() {
  assert.deepStrictEqual(eligibleOffers(["bonus_entries_100"], { pastDue:false, consumed:{ bonusEntries100:true } }), []);
}
function testTierDowngradeNotGated() {
  assert.deepStrictEqual(eligibleOffers(["tier_downgrade","bonus_entries_100"], { pastDue:false, consumed:{} }), ["tier_downgrade","bonus_entries_100"]);
}
function run(){ testPastDueEmpty(); testUnimplementedFilteredPhase2(); testPause30dImplemented(); testPause30dConsumed(); testConsumedBonusEmpty(); testTierDowngradeNotGated(); console.log("PASS eligibleOffers"); }
run();
