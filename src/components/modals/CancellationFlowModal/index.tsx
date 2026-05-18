"use client";

/**
 * CancellationFlowModal — multi-step cancellation retention modal.
 *
 * Desktop: centered dialog. Mobile (< 640px): bottom sheet.
 * ✕ button routes to Step 4 (confirm) via requestExit(), NOT onClose directly.
 *
 * PHASE-1 SCOPE: Steps 1 + 4 are live. Steps 2/3 (offer reel) are placeholders
 * — if state.step would be 2 or 3, Step 4 is rendered instead so the modal
 * ships immediately in a shippable state.
 *
 * Past-due path (§3a): server returns offersShown=[] → applyStart routes to
 * step 4 with state.pastDue=true → Step4Confirm renders the "Resolve payment" variant.
 */

import React, { useEffect } from "react";
import { ModalContainer, ModalHeader, ModalContent } from "../ui";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useCancellationFlow } from "./useCancellationFlow";
import { useStartCancellationFlow, useOutcomeCancellationFlow } from "@/hooks/queries/useCancellationFlow";
import StepIndicator from "./StepIndicator";
import Step1Reason from "./Step1Reason";
import Step4Confirm from "./Step4Confirm";
import type { CancellationFlowModalProps } from "./types";

const CancellationFlowModal: React.FC<CancellationFlowModalProps> = ({
  isOpen,
  onClose,
  onCancelled,
  // onSaved is part of the public API — used by Phase-2 offer steps when an
  // offer is accepted. Not used by Phase-1 (Steps 2/3 not built yet).
  onSaved: _onSaved,
  onResolvePayment,
}) => {
  const isNarrowViewport = useMediaQuery("(max-width: 639px)");

  const flowHook = useCancellationFlow();
  const { state, requestExit, reset } = flowHook;

  const startMutation = useStartCancellationFlow();
  const outcomeMutation = useOutcomeCancellationFlow();

  // Reset flow state when the modal opens
  useEffect(() => {
    if (isOpen) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleHeaderClose = () => {
    // ✕ always routes to Step 4 (confirm), not a hard close
    if (state.step === 1) {
      // Nothing started yet — user hit ✕ before selecting a reason.
      // Jump to step 4 only if a reason has been selected; otherwise just close.
      if (state.reason !== null) {
        requestExit();
      } else {
        onClose();
      }
    } else {
      requestExit();
    }
  };

  const getStepTitle = (): string => {
    switch (state.step) {
      case 1:
        return "Why are you cancelling?";
      case 4:
        return state.pastDue ? "Payment Required" : "Are you sure?";
      default:
        // Steps 2/3 not yet built — show confirm title
        return state.pastDue ? "Payment Required" : "Are you sure?";
    }
  };

  const renderStep = () => {
    if (state.step === 1) {
      return (
        <Step1Reason
          flowHook={flowHook}
          startMutation={startMutation}
        />
      );
    }

    // PHASE-2: Step2Offer/Step3BonusEntries render here (steps 2 and 3)
    // For now, fall through to Step 4 for any step >= 2

    return (
      <Step4Confirm
        state={state}
        modalProps={{ onClose, onCancelled, onResolvePayment }}
        outcomeMutation={outcomeMutation}
      />
    );
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={handleHeaderClose}
      size="sm"
      presentation={isNarrowViewport ? "sheet" : "dialog"}
      closeOnBackdrop={false}
      zIndex={80}
    >
      <ModalHeader
        title={getStepTitle()}
        onClose={handleHeaderClose}
        showLogo={false}
        compact
      />

      <StepIndicator state={state} />

      <ModalContent padding="md">
        {renderStep()}
      </ModalContent>
    </ModalContainer>
  );
};

export default CancellationFlowModal;
