"use client";

/**
 * CancellationFlowModal — multi-step cancellation retention modal.
 *
 * Desktop: centered dialog. Mobile (< 640px): bottom sheet.
 * ✕ button routes to Step 4 (confirm) via requestExit(), NOT onClose directly.
 *
 * Step routing:
 *   Step 1     → reason capture (Step1Reason)
 *   Step 2     → OFFER phase: renders offersShown[offerCursor] via Step2Offer.
 *                This is cursor-driven — declining advances the cursor and
 *                Step2Offer re-renders the next rung (it handles ALL OfferTypes
 *                including bonus_entries_100). The waterfall length is whatever
 *                resolveOfferSequence produced (e.g. `other` has 3 rungs:
 *                pause_30d → discount_50_2mo → bonus_entries_100).
 *   Step 4     → confirm cancel or "Keep my membership" (Step4Confirm)
 *
 * There is no fixed "step 3" — the old hardcoded +100 step-3 was the bug
 * (it skipped middle rungs of 3+ offer sequences). Step3BonusEntries is still
 * a real component, rendered by Step2Offer for the bonus_entries_100 rung.
 *
 * Past-due path (§3a): server returns offersShown=[] → applyStart routes to
 * step 4 with state.pastDue=true → Step4Confirm renders the "Resolve payment" variant.
 *
 * Save-success path: when state.saveSuccess is true (set by markSaved() after an
 * offer is accepted), StepSaveSuccess is rendered instead of renderStep().
 * Each step owns its own header via FlowFrame (Tasks 5-8); StepIndicator and the
 * in-modal ModalHeader have been removed.
 */

import React, { useEffect } from "react";
import { ModalContainer, ModalContent } from "../ui";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useCancellationFlow } from "./useCancellationFlow";
import { useStartCancellationFlow, useOutcomeCancellationFlow, useAcceptOffer } from "@/hooks/queries/useCancellationFlow";
import StepSaveSuccess from "./StepSaveSuccess";
import Step1Reason from "./Step1Reason";
import Step2Offer from "./Step2Offer";
import Step4Confirm from "./Step4Confirm";
import type { CancellationFlowModalProps } from "./types";

const CancellationFlowModal: React.FC<CancellationFlowModalProps> = ({
  isOpen,
  onClose,
  onCancelled,
  onSaved,
  onResolvePayment,
  onRequestTierDowngrade,
  tierDowngradeAvailable,
}) => {
  // Mobile + tablet (< lg) → slide-up sheet + near-fullscreen (mobileFullBleed).
  // Desktop (≥ lg) → centered dialog.
  const isNarrowViewport = useMediaQuery("(max-width: 1023px)");

  const flowHook = useCancellationFlow();
  const { state, requestExit, reset } = flowHook;

  const startMutation = useStartCancellationFlow();
  const outcomeMutation = useOutcomeCancellationFlow();
  const acceptOfferMutation = useAcceptOffer();

  // Reset flow state when the modal opens
  useEffect(() => {
    if (isOpen) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleHeaderClose = () => {
    // After a save-success, ✕ dismisses the modal entirely (no retention loop).
    if (state.saveSuccess) {
      onClose();
      return;
    }
    // ✕ routes to the Step 4 confirm so the user sees the retention pitch
    // ONCE — but at Step 4 itself (or before a reason is picked) it must
    // actually close, otherwise the modal is a trap (requestExit() at step 4
    // is a no-op loop and backdrop-close is disabled).
    if (state.step === 4) {
      onClose();
      return;
    }
    if (state.step === 1 && state.reason === null) {
      onClose();
      return;
    }
    requestExit();
  };

  const renderStep = () => {
    switch (state.step) {
      case 1:
        return (
          <Step1Reason
            flowHook={flowHook}
            startMutation={startMutation}
            onClose={handleHeaderClose}
          />
        );

      case 2:
      case 3:
        // OFFER phase. Step 3 is never produced by the step-machine anymore,
        // but the FlowState.step type still allows it; route it through the
        // same cursor-driven Step2Offer renderer so the union stays exhaustive.
        return (
          <Step2Offer
            state={state}
            outcomeMutation={outcomeMutation}
            acceptOfferMutation={acceptOfferMutation}
            onSaved={onSaved}
            onDecline={flowHook.decline}
            onAcceptedOffer={flowHook.markSaved}
            onRequestTierDowngrade={onRequestTierDowngrade}
            tierDowngradeAvailable={tierDowngradeAvailable}
            onClose={handleHeaderClose}
          />
        );

      case 4:
        return (
          <Step4Confirm
            state={state}
            modalProps={{ onClose, onCancelled, onResolvePayment }}
            outcomeMutation={outcomeMutation}
            onClose={handleHeaderClose}
          />
        );
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={handleHeaderClose}
      size="md"
      presentation={isNarrowViewport ? "sheet" : "dialog"}
      mobileFullBleed
      closeOnBackdrop={false}
      zIndex={80}
    >
      <ModalContent padding="none">
        {state.saveSuccess && state.acceptedOffer ? (
          <StepSaveSuccess
            offer={state.acceptedOffer}
            result={state.acceptResult}
            onClose={handleHeaderClose}
            onDone={onSaved}
          />
        ) : (
          renderStep()
        )}
      </ModalContent>
    </ModalContainer>
  );
};

export default CancellationFlowModal;
