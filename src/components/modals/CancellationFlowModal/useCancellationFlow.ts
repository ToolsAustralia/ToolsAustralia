"use client";

import { useState } from "react";
import type { OfferType, CancellationReason } from "@/models/CancellationFlowEvent";
import type { FlowState } from "./types";

const INITIAL_STATE: FlowState = {
  step: 1,
  reason: null,
  reasonText: "",
  eventId: null,
  offersShown: [],
  offerCursor: 0,
  pastDue: false,
};

interface ApplyStartPayload {
  eventId: string;
  offersShown: OfferType[];
  pastDue: boolean;
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
   * Stores the returned eventId/offersShown/pastDue and decides the next step:
   * - offersShown.length === 0 → step 4 (direct confirm, no offers)
   * - else → step 2 (offer reel)
   */
  const applyStart = ({ eventId, offersShown, pastDue }: ApplyStartPayload) => {
    setState((s) => ({
      ...s,
      eventId,
      offersShown,
      pastDue,
      offerCursor: 0,
      step: offersShown.length === 0 ? 4 : 2,
    }));
  };

  /**
   * Advance past the current offer. If we've exhausted all offers → step 4.
   */
  const decline = () => {
    setState((s) => {
      const nextCursor = s.offerCursor + 1;
      const nextStep: FlowState["step"] = nextCursor >= s.offersShown.length ? 4 : 3;
      return { ...s, offerCursor: nextCursor, step: nextStep };
    });
  };

  /**
   * User hits ✕ or "Cancel anyway" from within the flow. Jump to step 4 (confirm).
   */
  const requestExit = () => {
    setState((s) => ({ ...s, step: 4 }));
  };

  const reset = () => {
    setState(INITIAL_STATE);
  };

  return {
    state,
    selectReason,
    setReasonText,
    applyStart,
    decline,
    requestExit,
    reset,
  };
}
