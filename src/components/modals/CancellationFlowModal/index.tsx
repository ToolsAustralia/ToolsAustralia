"use client";

/**
 * CancellationFlowModal — multi-step cancellation retention modal.
 *
 * Desktop: centered dialog. Mobile (< 640px): bottom sheet.
 * ✕ button routes to Step 4 (confirm) via requestExit(), NOT onClose directly.
 *
 * Step routing:
 *   Step 1 → reason capture (Step1Reason)
 *   Step 2 → lead offer for the member's reason (Step2Offer)
 *   Step 3 → +100 bonus entries rung (Step3BonusEntries) — always the final offer
 *   Step 4 → confirm cancel or "Keep my membership" (Step4Confirm)
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
import Step2Offer from "./Step2Offer";
import Step3BonusEntries from "./Step3BonusEntries";
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
      case 2:
      case 3:
        return "Before you go…";
      case 4:
        return state.pastDue ? "Payment Required" : "Are you sure?";
    }
  };

  const renderStep = () => {
    switch (state.step) {
      case 1:
        return (
          <Step1Reason
            flowHook={flowHook}
            startMutation={startMutation}
          />
        );

      case 2:
        return (
          <Step2Offer
            state={state}
            outcomeMutation={outcomeMutation}
            onSaved={onSaved}
            onDecline={flowHook.decline}
            onRequestTierDowngrade={onRequestTierDowngrade}
            tierDowngradeAvailable={tierDowngradeAvailable}
          />
        );

      case 3:
        return (
          <Step3BonusEntries
            state={state}
            outcomeMutation={outcomeMutation}
            onSaved={onSaved}
            onDecline={flowHook.decline}
          />
        );

      case 4:
        return (
          <Step4Confirm
            state={state}
            modalProps={{ onClose, onCancelled, onResolvePayment }}
            outcomeMutation={outcomeMutation}
          />
        );
    }
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
