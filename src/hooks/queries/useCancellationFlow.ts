/**
 * useCancellationFlow — TanStack Query mutation hooks for the cancellation flow API.
 *
 * Three mutations:
 *   - `useStartCancellationFlow`  → POST { action: "start", reason, reasonText? }
 *   - `useOutcomeCancellationFlow` → POST { action: "outcome", eventId, outcome, offerAccepted? }
 *   - `useAcceptOffer`            → POST { action: "accept_offer", eventId, offer } (pause_30d | discount_50_2mo | unsubscribe_marketing)
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
  /** Membership Streak at flow start (server-derived) — drives the stakes screen. */
  streakMonths: number;
}

export interface OutcomeCancellationFlowData {
  eventId: string;
  outcome: "saved" | "cancelled";
  offerAccepted?: OfferType;
}

export interface OutcomeCancellationFlowResponse {
  ok: boolean;
}

export interface AcceptOfferData {
  eventId: string;
  offer: OfferType;
}

export interface AcceptOfferResponse {
  ok: boolean;
  resumesAt?: string; // present for pause_30d
  couponId?: string; // present for discount_50_2mo
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

/**
 * Records the member's exit from the streak-stakes screen (spec §7b M3):
 * "kept" (kept membership) or "continued" (proceeded to the offer waterfall).
 * Fire-and-forget analytics — callers must never block UI on it.
 */
export const useStakesActionCancellationFlow = () => {
  return useMutation({
    mutationFn: async ({ eventId, stakesAction }: { eventId: string; stakesAction: "kept" | "continued" }) => {
      return apiPost<{ ok: boolean }>("/api/subscription/cancellation-flow", {
        action: "stakes",
        eventId,
        stakesAction,
      });
    },
  });
};

/**
 * Accepts a retention offer (`pause_30d`, `discount_50_2mo`, or
 * `unsubscribe_marketing`). POSTs `{ action: "accept_offer", eventId, offer }`;
 * the server applies the offer and records the `saved` outcome, returning
 * `{ ok, resumesAt }` (pause), `{ ok, couponId }` (discount), or `{ ok }`
 * (unsubscribe — no extra data).
 */
export const useAcceptOffer = () => {
  return useMutation({
    mutationFn: async ({ eventId, offer }: AcceptOfferData) => {
      return apiPost<AcceptOfferResponse>("/api/subscription/cancellation-flow", {
        action: "accept_offer",
        eventId,
        offer,
      });
    },
  });
};
