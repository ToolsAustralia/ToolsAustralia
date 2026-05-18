import assert from "node:assert/strict";
import { eligibleOffers } from "../cancellation-flow-eligibility";

function testPastDueEmpty() {
  assert.deepStrictEqual(eligibleOffers(["discount_50_2mo","bonus_entries_100"], { pastDue:true, consumed:{} }), []);
}
// NOTE (Task 17 / Phase 5 complete): there is no longer ANY unimplemented
// OfferType — all 5 (bonus_entries_100, tier_downgrade, pause_30d,
// discount_50_2mo, unsubscribe_marketing) are in IMPLEMENTED_OFFERS. The old
// `testUnimplementedFiltered` (which used unsubscribe_marketing as the
// still-unimplemented example) is therefore replaced. The IMPLEMENTED_OFFERS
// gate is still exercised logically by the consumed/past-due tests below; the
// new positive coverage is `testAllImplementedSurface` and the unsubscribe
// (not one-time gated) assertions.
function testAllImplementedSurface() {
  // All 5 OfferTypes are implemented → with none consumed and not past-due, a
  // sequence containing every offer surfaces in full, in order.
  assert.deepStrictEqual(
    eligibleOffers(
      ["tier_downgrade","pause_30d","discount_50_2mo","unsubscribe_marketing","bonus_entries_100"],
      { pastDue:false, consumed:{} }
    ),
    ["tier_downgrade","pause_30d","discount_50_2mo","unsubscribe_marketing","bonus_entries_100"]
  );
}
function testUnsubscribeNotGated() {
  // unsubscribe_marketing is implemented and NOT one-time gated → surfaces
  // alongside +100 regardless of consumed flags (no ONE_TIME entry for it).
  assert.deepStrictEqual(
    eligibleOffers(["unsubscribe_marketing","bonus_entries_100"], { pastDue:false, consumed:{} }),
    ["unsubscribe_marketing","bonus_entries_100"]
  );
  // A consumed flag for OTHER offers must not affect unsubscribe_marketing.
  assert.deepStrictEqual(
    eligibleOffers(
      ["unsubscribe_marketing","bonus_entries_100"],
      { pastDue:false, consumed:{ pause30d:true, discount50_2mo:true } }
    ),
    ["unsubscribe_marketing","bonus_entries_100"]
  );
}
function testUnsubscribePastDue() {
  // past-due still skips all retention rungs (spec §3a) — unsubscribe included.
  assert.deepStrictEqual(
    eligibleOffers(["unsubscribe_marketing","bonus_entries_100"], { pastDue:true, consumed:{} }),
    []
  );
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
function run(){ testPastDueEmpty(); testAllImplementedSurface(); testUnsubscribeNotGated(); testUnsubscribePastDue(); testDiscount50Implemented(); testDiscount50Consumed(); testPause30dImplemented(); testPause30dConsumed(); testConsumedBonusEmpty(); testTierDowngradeNotGated(); console.log("PASS eligibleOffers"); }
run();
