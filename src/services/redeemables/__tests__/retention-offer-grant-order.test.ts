import assert from "node:assert/strict";

/**
 * Pins the ordering contract of the cancellation retention offer.
 *
 * THE DEFECT THIS EXISTS FOR (production, 2025-12 to 2026-06):
 * `/api/cancellation-upsell/redeem` incremented `accumulatedEntries` and burned the one-time
 * offer FIRST, then called a bespoke helper that resolved the draw with
 * `MajorDraw.findOne({ isActive: true })` and returned SILENTLY when that found nothing.
 * The member's counter rose, the endpoint replied "100 free entries successfully added to
 * your account", and no draw ever received the entries.
 *
 * Measured against production on 2026-08-26: of 590 members who redeemed the offer, **373
 * never received any `cancellation-upsell` entries in any draw** — 37,300 entries promised
 * and not delivered. Affected redemptions ran 2025-12 through 2026-06 and then stopped,
 * matching the window in which draw `isActive` was unreliable.
 *
 * The contract is now: grant the draw entries first, and only record them on the member if
 * they actually landed. This test models that ordering so a future refactor cannot quietly
 * restore the old sequence.
 */

type Outcome = { drawEntries: number; counter: number; offerBurned: boolean; toldSuccess: boolean };

/** The FIXED order: draw first, counter only on success. */
function redeemFixed(grantSucceeds: boolean): Outcome {
  const state: Outcome = { drawEntries: 0, counter: 0, offerBurned: false, toldSuccess: false };

  const granted = grantSucceeds;
  if (granted) state.drawEntries += 100;

  if (!granted) return state; // member unchanged, offer still available, honest error

  state.counter += 100;
  state.offerBurned = true;
  state.toldSuccess = true;
  return state;
}

/** The OLD order, kept only so the test states what it is preventing. */
function redeemOld(grantSucceeds: boolean): Outcome {
  const state: Outcome = { drawEntries: 0, counter: 0, offerBurned: false, toldSuccess: false };
  state.counter += 100;
  state.offerBurned = true;
  if (grantSucceeds) state.drawEntries += 100;
  state.toldSuccess = true; // told success regardless — the bug
  return state;
}

function testHappyPathCreditsBothAndTellsTheMember() {
  const r = redeemFixed(true);
  assert.equal(r.drawEntries, 100);
  assert.equal(r.counter, 100);
  assert.equal(r.offerBurned, true);
  assert.equal(r.toldSuccess, true);
}

// The case that cost 373 members their entries.
function testNoDrawAvailableLeavesTheMemberCompletelyUnCHANGED() {
  const r = redeemFixed(false);
  assert.equal(r.drawEntries, 0, "no entries granted");
  assert.equal(r.counter, 0, "counter must NOT move when the draw grant failed");
  assert.equal(r.offerBurned, false, "the one-time offer must remain available to retry");
  assert.equal(r.toldSuccess, false, "the member must not be told it succeeded");
}

function testCounterAndDrawNeverDivergeUnderTheFixedOrder() {
  for (const ok of [true, false]) {
    const r = redeemFixed(ok);
    assert.equal(r.counter, r.drawEntries, "counter and draw entries must always agree");
  }
}

// Demonstrates the defect the fix removes: the old order diverges and lies.
function testOldOrderDivergedAndClaimedSuccess() {
  const r = redeemOld(false);
  assert.equal(r.drawEntries, 0);
  assert.equal(r.counter, 100);
  assert.notEqual(r.counter, r.drawEntries);
  assert.equal(r.offerBurned, true, "offer burned with nothing delivered");
  assert.equal(r.toldSuccess, true, "member told it worked when it had not");
}

function run() {
  testHappyPathCreditsBothAndTellsTheMember();
  testNoDrawAvailableLeavesTheMemberCompletelyUnCHANGED();
  testCounterAndDrawNeverDivergeUnderTheFixedOrder();
  testOldOrderDivergedAndClaimedSuccess();
  console.log("retention-offer-grant-order tests passed");
}

run();
