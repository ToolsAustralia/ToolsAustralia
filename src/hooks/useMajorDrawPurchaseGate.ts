import { useCallback, useEffect, useRef } from "react";
import { useCurrentMajorDraw, useNextDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";

/**
 * Aligns UI with server gates: new entry purchases only when major draw status is "active".
 *
 * **Loading-race correctness (fixed 2026-05-29):** when called during the initial
 * `useCurrentMajorDraw` query load, `currentMajorDraw` is `undefined` and a naïve
 * check (`gatesClosed = data?.status !== "active"`) would incorrectly evaluate as
 * "closed" — triggering the gate-closed modal even when gates are genuinely open.
 * That caused the Phase 8 abandoned-checkout deep-link (`?openMembership=1`) to
 * show the gate-closed modal on /membership and /promotions/<slug> because the
 * hook fires immediately on mount before TanStack Query has resolved.
 *
 * `whenGatesOpenElseGateModal` now **defers** the action when the query is still
 * loading and replays it once data resolves — so callers that fire on mount don't
 * have to know about loading state. The function "does the right thing" regardless
 * of when it's called. Existing callers (synchronous user clicks, where the query
 * has long since resolved) see no behavior change.
 */
export function useMajorDrawPurchaseGate() {
  const { data: currentMajorDraw, isLoading: isMajorDrawLoading } = useCurrentMajorDraw();
  const { data: nextDraw } = useNextDraw();
  const { requestModal } = useModalPriorityStore();

  const gatesClosed = currentMajorDraw?.status !== "active";

  // Held action: set when `whenGatesOpenElseGateModal` is called during the
  // initial query load. Replayed by the effect below once data resolves.
  const pendingActionRef = useRef<(() => void) | null>(null);

  const openGateClosedModal = useCallback(() => {
    requestModal("gate-closed", true, {
      nextActivationDate: nextDraw?.activationDate ?? null,
      nextDrawName: nextDraw?.name,
    });
  }, [nextDraw?.activationDate, nextDraw?.name, requestModal]);

  // When the query finishes resolving, drain any pending action with the now-known
  // gate state. If gates are open, run the action; if closed, surface the modal.
  // Either way, the user gets a coherent UI response to their intent — never a
  // gate-closed flash caused by the loading race.
  useEffect(() => {
    if (isMajorDrawLoading) return;
    const pending = pendingActionRef.current;
    if (!pending) return;
    pendingActionRef.current = null;
    if (gatesClosed) {
      openGateClosedModal();
    } else {
      pending();
    }
  }, [isMajorDrawLoading, gatesClosed, openGateClosedModal]);

  const whenGatesOpenElseGateModal = useCallback(
    (fn: () => void) => {
      if (isMajorDrawLoading) {
        // Defer until the query resolves — see the useEffect above.
        // Last-write-wins: a second call during loading replaces the first
        // (intentional; the second represents a more recent user intent).
        pendingActionRef.current = fn;
        return;
      }
      if (gatesClosed) {
        openGateClosedModal();
        return;
      }
      fn();
    },
    [isMajorDrawLoading, gatesClosed, openGateClosedModal]
  );

  return {
    gatesClosed,
    isMajorDrawLoading,
    openGateClosedModal,
    whenGatesOpenElseGateModal,
  };
}
