import assert from "node:assert/strict";
import type { OfferType } from "@/models/CancellationFlowEvent";
import { offerPhaseFor, nextOfferState, applySaveSuccess, startPhaseFor } from "../useCancellationFlow";
import type { FlowState, AcceptResult } from "../types";
import type { AcceptOfferResponse } from "@/hooks/queries/useCancellationFlow";

// Drift guard (compile-time only): AcceptResult must stay structurally
// equivalent to the API hook's AcceptOfferResponse. If either side gains/loses
// a field, one of these `true` assignments fails type-check.
type _AcceptResultExtendsResponse = AcceptResult extends AcceptOfferResponse ? true : false;
type _ResponseExtendsAcceptResult = AcceptOfferResponse extends AcceptResult ? true : false;
const _driftA: _AcceptResultExtendsResponse = true;
const _driftB: _ResponseExtendsAcceptResult = true;
void _driftA;
void _driftB;

/**
 * Locks the cancellation-flow step-machine reducer.
 *
 * The bug: the old `decline()` computed `nextStep = cursor >= len ? 4 : 3` and
 * `index.tsx` hardcoded `case 3 → Step3BonusEntries (+100)`. For the `other`
 * reason (3-rung waterfall pause_30d → discount_50_2mo → bonus_entries_100)
 * declining the pause jumped to a hardcoded +100, SKIPPING discount_50_2mo.
 *
 * Fix: a single cursor-driven OFFER phase. While the cursor points inside
 * `offersShown` → step 2 rendering `offersShown[cursor]`; off the end → step 4.
 * No step 3 is ever produced.
 */

// Helper: walk the reducer from the start of a sequence, collecting the
// (step, offerCursor) at each stage: initial applyStart, then one decline per
// rung until step 4.
function walk(offersShown: OfferType[]): { step: FlowState["step"]; offerCursor: number }[] {
  const trace: { step: FlowState["step"]; offerCursor: number }[] = [];
  let phase = offerPhaseFor(offersShown, 0); // mirrors applyStart
  trace.push({ ...phase });
  // Decline until we land on step 4 (guard against runaway loop).
  let guard = 0;
  while (phase.step !== 4 && guard < 20) {
    phase = nextOfferState({ offersShown, offerCursor: phase.offerCursor });
    trace.push({ ...phase });
    guard += 1;
  }
  return trace;
}

// --- The `other` 3-rung waterfall: the bug. -------------------------------
function testOtherThreeRungWaterfall() {
  const seq: OfferType[] = ["pause_30d", "discount_50_2mo", "bonus_entries_100"];
  const trace = walk(seq);

  // initial → step 2 cursor 0 (pause_30d)
  assert.deepStrictEqual(trace[0], { step: 2, offerCursor: 0 });
  assert.equal(seq[trace[0].offerCursor], "pause_30d");

  // decline → step 2 cursor 1 (discount_50_2mo) — NOT skipped, NOT +100
  assert.deepStrictEqual(trace[1], { step: 2, offerCursor: 1 });
  assert.equal(seq[trace[1].offerCursor], "discount_50_2mo");

  // decline → step 2 cursor 2 (bonus_entries_100)
  assert.deepStrictEqual(trace[2], { step: 2, offerCursor: 2 });
  assert.equal(seq[trace[2].offerCursor], "bonus_entries_100");

  // decline from last → step 4 (confirm)
  assert.deepStrictEqual(trace[3], { step: 4, offerCursor: 3 });

  // exactly 4 stages, never any step 3
  assert.equal(trace.length, 4);
  assert.equal(trace.some((t) => t.step === 3), false);
}

// --- 2-element sequence ----------------------------------------------------
function testTwoElementSequence() {
  const seq: OfferType[] = ["tier_downgrade", "bonus_entries_100"];
  const trace = walk(seq);
  assert.deepStrictEqual(trace, [
    { step: 2, offerCursor: 0 }, // tier_downgrade
    { step: 2, offerCursor: 1 }, // bonus_entries_100
    { step: 4, offerCursor: 2 }, // confirm
  ]);
  assert.equal(seq[trace[1].offerCursor], "bonus_entries_100");
}

// --- 1-element sequence ----------------------------------------------------
function testOneElementSequence() {
  const trace = walk(["bonus_entries_100"]);
  assert.deepStrictEqual(trace, [
    { step: 2, offerCursor: 0 }, // bonus_entries_100
    { step: 4, offerCursor: 1 }, // confirm
  ]);
}

// --- Empty (past-due) sequence --------------------------------------------
function testEmptyPastDueSequence() {
  // applyStart with no offers → step 4 immediately (no decline needed).
  assert.deepStrictEqual(offerPhaseFor([], 0), { step: 4, offerCursor: 0 });
  const trace = walk([]);
  assert.deepStrictEqual(trace, [{ step: 4, offerCursor: 0 }]);
  assert.equal(trace.length, 1);
}

// --- offerPhaseFor unit edges ---------------------------------------------
function testOfferPhaseForEdges() {
  const seq: OfferType[] = ["pause_30d", "discount_50_2mo", "bonus_entries_100"];
  assert.deepStrictEqual(offerPhaseFor(seq, 0), { step: 2, offerCursor: 0 });
  assert.deepStrictEqual(offerPhaseFor(seq, 2), { step: 2, offerCursor: 2 });
  assert.deepStrictEqual(offerPhaseFor(seq, 3), { step: 4, offerCursor: 3 });
  // never returns step 3
  for (let c = 0; c <= seq.length + 1; c += 1) {
    assert.notEqual(offerPhaseFor(seq, c).step, 3);
  }
}

function baseState(): FlowState {
  return {
    step: 2,
    reason: "too_expensive",
    reasonText: "",
    eventId: "evt_1",
    offersShown: ["discount_50_2mo", "bonus_entries_100"],
    offerCursor: 0,
    pastDue: false,
    streakMonths: 0,
    saveSuccess: false,
    acceptedOffer: null,
    acceptResult: null,
  };
}

// --- startPhaseFor: the stakes routing (spec §7b M3) ------------------------
function testStartPhaseForStakesRouting() {
  const seq: OfferType[] = ["pause_30d", "discount_50_2mo"];

  // Streak feature LIVE + not past-due → stakes screen FIRST — always,
  // regardless of streak depth (owner decision) and even with zero offers.
  assert.deepStrictEqual(startPhaseFor(seq, false, true), { step: "stakes", offerCursor: 0 });
  assert.deepStrictEqual(startPhaseFor([], false, true), { step: "stakes", offerCursor: 0 });

  // Past-due keeps its dedicated routing (never sees stakes — dunning, not retention).
  assert.deepStrictEqual(startPhaseFor([], true, true), { step: 4, offerCursor: 0 });

  // Feature DARK → pre-streak flow byte-identical.
  assert.deepStrictEqual(startPhaseFor(seq, false, false), { step: 2, offerCursor: 0 });
  assert.deepStrictEqual(startPhaseFor([], false, false), { step: 4, offerCursor: 0 });

  // Leaving stakes re-resolves through offerPhaseFor: offers → step 2 rung 0;
  // none → step 4 (mirrors continueFromStakes()).
  assert.deepStrictEqual(offerPhaseFor(seq, 0), { step: 2, offerCursor: 0 });
  assert.deepStrictEqual(offerPhaseFor([], 0), { step: 4, offerCursor: 0 });
}

function testApplySaveSuccessDiscount() {
  const next = applySaveSuccess(baseState(), "discount_50_2mo", {
    ok: true,
    couponId: "retention-50off-2mo",
  });
  assert.equal(next.saveSuccess, true);
  assert.equal(next.acceptedOffer, "discount_50_2mo");
  assert.deepStrictEqual(next.acceptResult, { ok: true, couponId: "retention-50off-2mo" });
  assert.equal(next.step, 2);
  assert.equal(next.eventId, "evt_1");
}

function testApplySaveSuccessNoResult() {
  const next = applySaveSuccess(baseState(), "unsubscribe_marketing", null);
  assert.equal(next.saveSuccess, true);
  assert.equal(next.acceptedOffer, "unsubscribe_marketing");
  assert.equal(next.acceptResult, null);
  assert.equal(next.step, 2);
}

function testApplySaveSuccessPure() {
  const s = baseState();
  applySaveSuccess(s, "pause_30d", { ok: true, resumesAt: "2026-06-17T00:00:00.000Z" });
  assert.equal(s.saveSuccess, false);
  assert.equal(s.acceptedOffer, null);
}

function run() {
  testOtherThreeRungWaterfall();
  testTwoElementSequence();
  testOneElementSequence();
  testEmptyPastDueSequence();
  testOfferPhaseForEdges();
  testStartPhaseForStakesRouting();
  testApplySaveSuccessDiscount();
  testApplySaveSuccessNoResult();
  testApplySaveSuccessPure();
  console.log("PASS useCancellationFlow step-machine (incl. 3-element `other` waterfall — discount reached, not skipped; stakes routing)");
}

run();
