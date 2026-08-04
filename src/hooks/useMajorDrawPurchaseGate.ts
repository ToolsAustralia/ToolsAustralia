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
  const { data: currentMajorDraw, isLoading: isMajorDrawLoading, isError, error } = useCurrentMajorDraw();
  const { data: nextDraw } = useNextDraw();
  const { requestModal } = useModalPriorityStore();

  // `gatesClosed` must mean "we KNOW the gates are shut" — never "we don't know yet".
  // `data?.status !== "active"` alone is true in three different states: loaded-and-closed,
  // still-loading, and failed-to-load, and only the first is a real closed gate.
  //
  // INDETERMINATE FAILURES ONLY. `/api/major-draw` answers 404 "No active major draw found"
  // when there genuinely is no open draw — that is the server ANSWERING, and the gates really
  // are shut, so a blanket `!isError` here wrongly let buyers through between draws (caught by
  // e2e-audit-shots/gate-matrix.ts, which walks every closed state). Only a fault that leaves
  // us unable to know — 5xx, a network drop (ApiError status 0), or an unrecognised throw —
  // should fail open.
  //
  // Failing open on those is safe because this gate is a UX affordance, not the boundary: the
  // server independently 403s a closed-gate purchase (`enforceMajorDrawOpenForNewPurchasesOr403`
  // in create-payment-intent). So a wrong guess costs a clumsier error, while failing closed
  // during our own outage costs the sale.
  const errorStatus = (error as { status?: number } | null | undefined)?.status;
  const failedIndeterminately =
    isError && (errorStatus === undefined || errorStatus === 0 || errorStatus >= 500);

  // `!isMajorDrawLoading` is also load-bearing: the deferral in `whenGatesOpenElseGateModal`
  // only protects callers that go through it, but MembershipModal reads this flag directly in
  // an effect that fires the moment it opens, so mid-flight it closed itself and raised the
  // gate modal.
  const gatesClosed =
    !failedIndeterminately && !isMajorDrawLoading && currentMajorDraw?.status !== "active";

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
