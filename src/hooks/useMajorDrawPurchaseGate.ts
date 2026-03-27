import { useCallback } from "react";
import { useCurrentMajorDraw, useNextDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";

/**
 * Aligns UI with server gates: new entry purchases only when major draw status is "active".
 */
export function useMajorDrawPurchaseGate() {
  const { data: currentMajorDraw } = useCurrentMajorDraw();
  const { data: nextDraw } = useNextDraw();
  const { requestModal } = useModalPriorityStore();

  const gatesClosed = currentMajorDraw?.status !== "active";

  const openGateClosedModal = useCallback(() => {
    requestModal("gate-closed", true, {
      nextActivationDate: nextDraw?.activationDate ?? null,
      nextDrawName: nextDraw?.name,
    });
  }, [nextDraw?.activationDate, nextDraw?.name, requestModal]);

  const whenGatesOpenElseGateModal = useCallback(
    (fn: () => void) => {
      if (gatesClosed) {
        openGateClosedModal();
        return;
      }
      fn();
    },
    [gatesClosed, openGateClosedModal]
  );

  return { gatesClosed, openGateClosedModal, whenGatesOpenElseGateModal };
}
