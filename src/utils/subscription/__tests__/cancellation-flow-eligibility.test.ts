import assert from "node:assert/strict";
import { eligibleOffers } from "../cancellation-flow-eligibility";

function testPastDueEmpty() {
  assert.deepStrictEqual(eligibleOffers(["discount_50_2mo","bonus_entries_100"], { pastDue:true, consumed:{} }), []);
}
function testUnimplementedFiltered() {
  // unsubscribe_marketing still not implemented (Task 17) → filtered, only +100 surfaces
  assert.deepStrictEqual(eligibleOffers(["unsubscribe_marketing","bonus_entries_100"], { pastDue:false, consumed:{} }), ["bonus_entries_100"]);
}
function testDiscount50Implemented() {
  // Task 16: discount_50_2mo is now implemented → surfaces alongside +100
  assert.deepStrictEqual(eligibleOffers(["discount_50_2mo","bonus_entries_100"], { pastDue:false, consumed:{} }), ["discount_50_2mo","bonus_entries_100"]);
}
function testDiscount50Consumed() {
  // discount_50_2mo is one-time gated → consumed.discount50_2mo filters it out, +100 remains
  assert.deepStrictEqual(eligibleOffers(["discount_50_2mo","bonus_entries_100"], { pastDue:false, consumed:{ discount50_2mo:true } }), ["bonus_entries_100"]);
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
function run(){ testPastDueEmpty(); testUnimplementedFiltered(); testDiscount50Implemented(); testDiscount50Consumed(); testPause30dImplemented(); testPause30dConsumed(); testConsumedBonusEmpty(); testTierDowngradeNotGated(); console.log("PASS eligibleOffers"); }
run();
