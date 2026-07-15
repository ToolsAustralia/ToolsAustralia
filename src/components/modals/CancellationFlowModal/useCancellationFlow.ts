"use client";

import { useState } from "react";
import type { OfferType, CancellationReason } from "@/models/CancellationFlowEvent";
import { isDashboardFeatureOn } from "@/config/dashboardFeatures";
import type { FlowState, AcceptResult } from "./types";

const INITIAL_STATE: FlowState = {
  step: 1,
  reason: null,
  reasonText: "",
  eventId: null,
  offersShown: [],
  offerCursor: 0,
  pastDue: false,
  streakMonths: 0,
  saveSuccess: false,
  acceptedOffer: null,
  acceptResult: null,
};

interface ApplyStartPayload {
  eventId: string;
  offersShown: OfferType[];
  pastDue: boolean;
  streakMonths?: number;
}

/** The cursor-driven phase slice of FlowState the step-machine controls. */
export type OfferPhase = Pick<FlowState, "step" | "offerCursor">;

/**
 * Pure: resolve the phase entered after a successful `start` (spec §7b M3).
 *
 * - Past-due members keep their dedicated routing (offersShown=[] → step 4
 *   "Resolve payment" variant) — the stakes screen is a retention surface,
 *   not a dunning surface.
 * - While the Membership Streak feature is live (`stakesEnabled`), every other
 *   member sees the STAKES screen first — ALWAYS, regardless of streak depth
 *   (owner decision: content adapts, visibility doesn't).
 * - Feature dark → the pre-streak flow, unchanged.
 */
export function startPhaseFor(
  offersShown: OfferType[],
  pastDue: boolean,
  stakesEnabled: boolean
): OfferPhase {
  if (!pastDue && stakesEnabled) {
    return { step: "stakes", offerCursor: 0 };
  }
  return offerPhaseFor(offersShown, 0);
}

/**
 * Pure: resolve the phase for a given offers list + cursor.
 *
 * The flow has no fixed "step 3" anymore — the OFFER phase is cursor-driven:
 * while `cursor` points inside `offersShown` we are in step 2 rendering
 * `offersShown[cursor]` (Step2Offer handles ALL OfferTypes incl.
 * `bonus_entries_100`); once `cursor` runs off the end (or there were no
 * offers at all) we are at step 4 (confirm). Step 3 is intentionally never
 * produced.
 */
export function offerPhaseFor(offersShown: OfferType[], cursor: number): OfferPhase {
  if (cursor >= offersShown.length) {
    return { step: 4, offerCursor: cursor };
  }
  return { step: 2, offerCursor: cursor };
}

/**
 * Pure decline transition: advance the cursor by one and re-resolve the phase.
 * - non-last offer  → { step: 2, offerCursor: cursor + 1 } (next rung)
 * - last offer      → { step: 4, offerCursor: length }     (confirm)
 *
 * This is the reducer the step-machine bug lived in; it is exported so it can
 * be unit-tested without React.
 */
export function nextOfferState(state: Pick<FlowState, "offersShown" | "offerCursor">): OfferPhase {
  return offerPhaseFor(state.offersShown, state.offerCursor + 1);
}

/**
 * Pure: produce the terminal save-success slice. The renderer checks
 * `saveSuccess` FIRST (orthogonal to `step` — the step union is NOT widened).
 */
export function applySaveSuccess(
  state: FlowState,
  offer: OfferType,
  result: AcceptResult | null
): FlowState {
  return { ...state, saveSuccess: true, acceptedOffer: offer, acceptResult: result };
}

export function useCancellationFlow() {
  const [state, setState] = useState<FlowState>(INITIAL_STATE);

  const selectReason = (reason: CancellationReason) => {
    setState((s) => ({ ...s, reason }));
  };

  const setReasonText = (text: string) => {
    setState((s) => ({ ...s, reasonText: text }));
  };

  /**
   * Called after the `start` mutation succeeds.
   * Stores the returned eventId/offersShown/pastDue/streakMonths and decides
   * the next step via the pure {@link startPhaseFor} helper:
   * - past-due → old routing (offersShown=[] → step 4 "Resolve payment")
   * - streak feature live → "stakes" (the Membership Streak stakes screen)
   * - feature dark → offer phase / confirm exactly as before
   */
  const applyStart = ({ eventId, offersShown, pastDue, streakMonths }: ApplyStartPayload) => {
    setState((s) => ({
      ...s,
      eventId,
      offersShown,
      pastDue,
      streakMonths: streakMonths ?? 0,
      ...startPhaseFor(offersShown, pastDue, isDashboardFeatureOn("loyaltyStreak")),
    }));
  };

  /**
   * Leave the stakes screen toward the offer waterfall ("Continue cancelling").
   * Pure re-resolution via {@link offerPhaseFor}: offers exist → step 2 rung 0;
   * no offers → step 4 (confirm).
   */
  const continueFromStakes = () => {
    setState((s) => ({ ...s, ...offerPhaseFor(s.offersShown, 0) }));
  };

  /**
   * Advance past the current offer (decline). Pure transition delegated to
   * {@link nextOfferState}: from a non-last offer → stay step 2 with the cursor
   * advanced (Step2Offer re-renders the next rung); from the LAST offer →
   * step 4 (confirm).
   */
  const decline = () => {
    setState((s) => ({ ...s, ...nextOfferState(s) }));
  };

  /**
   * User hits ✕ or "Cancel anyway" from within the flow. Jump to step 4 (confirm).
   */
  const requestExit = () => {
    setState((s) => ({ ...s, step: 4 }));
  };

  const markSaved = (offer: OfferType, result: AcceptResult | null) => {
    setState((s) => applySaveSuccess(s, offer, result));
  };

  const reset = () => {
    setState(INITIAL_STATE);
  };

  return {
    state,
    selectReason,
    setReasonText,
    applyStart,
    continueFromStakes,
    decline,
    requestExit,
    markSaved,
    reset,
  };
}
