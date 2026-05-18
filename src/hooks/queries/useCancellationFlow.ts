/**
 * useCancellationFlow — TanStack Query mutation hooks for the cancellation flow API.
 *
 * Two mutations:
 *   - `useStartCancellationFlow`  → POST { action: "start", reason, reasonText? }
 *   - `useOutcomeCancellationFlow` → POST { action: "outcome", eventId, outcome, offerAccepted? }
 *
 * No queryClient/invalidateQueries — the parent modal calls fetchSubscriptionBenefits
 * imperatively after a completed flow. These hooks only POST and surface status.
 */

import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/queries";
import type { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StartCancellationFlowData {
  reason: CancellationReason;
  reasonText?: string;
}

export interface StartCancellationFlowResponse {
  eventId: string;
  offersShown: OfferType[];
  pastDue: boolean;
}

export interface OutcomeCancellationFlowData {
  eventId: string;
  outcome: "saved" | "cancelled";
  offerAccepted?: OfferType;
}

export interface OutcomeCancellationFlowResponse {
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Starts a cancellation flow event on the server.
 * Returns the resolved `eventId`, `offersShown`, and `pastDue` flag.
 */
export const useStartCancellationFlow = () => {
  return useMutation({
    mutationFn: async ({ reason, reasonText }: StartCancellationFlowData) => {
      return apiPost<StartCancellationFlowResponse>("/api/subscription/cancellation-flow", {
        action: "start",
        reason,
        ...(reasonText ? { reasonText } : {}),
      });
    },
  });
};

/**
 * Records the terminal outcome of a cancellation flow event.
 * Idempotent — safe to call multiple times on the same eventId.
 */
export const useOutcomeCancellationFlow = () => {
  return useMutation({
    mutationFn: async ({ eventId, outcome, offerAccepted }: OutcomeCancellationFlowData) => {
      return apiPost<OutcomeCancellationFlowResponse>("/api/subscription/cancellation-flow", {
        action: "outcome",
        eventId,
        outcome,
        ...(offerAccepted ? { offerAccepted } : {}),
      });
    },
  });
};
