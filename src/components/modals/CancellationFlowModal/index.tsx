"use client";

/**
 * CancellationFlowModal — multi-step cancellation retention modal.
 *
 * Desktop: centered dialog. Mobile (< 640px): bottom sheet.
 * ✕ button always closes the modal immediately (no retention interception).
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
import {
  useStartCancellationFlow,
  useOutcomeCancellationFlow,
  useAcceptOffer,
  useStakesActionCancellationFlow,
} from "@/hooks/queries/useCancellationFlow";
import StepSaveSuccess from "./StepSaveSuccess";
import Step1Reason from "./Step1Reason";
import StepStakes from "./StepStakes";
import Step2Offer from "./Step2Offer";
import Step4Confirm from "./Step4Confirm";
import type { CancellationFlowModalProps } from "./types";
import { useUserContext } from "@/contexts/UserContext";

const CancellationFlowModal: React.FC<CancellationFlowModalProps> = ({
  isOpen,
  onClose,
  onCancelled,
  onSaved,
  onResolvePayment,
  onRequestTierDowngrade,
  tierDowngradeAvailable,
  entrySnapshot,
}) => {
  // Mobile + tablet (< lg) → slide-up sheet + near-fullscreen (mobileFullBleed).
  // Desktop (≥ lg) → centered dialog.
  const isNarrowViewport = useMediaQuery("(max-width: 1023px)");

  // Best-effort first name — mirrors Step1Reason exactly. Optional-chain guards
  // against missing data. CancellationFlowModal always renders inside UserProvider
  // (same as Step1Reason, MembershipModal, and Header), so this call is safe.
  const { userData } = useUserContext();
  const raw = userData?.firstName;
  const firstName: string | undefined = raw ? raw.split(/\s+/)[0] : undefined;

  const flowHook = useCancellationFlow();
  const { state, reset } = flowHook;

  const startMutation = useStartCancellationFlow();
  const outcomeMutation = useOutcomeCancellationFlow();
  const acceptOfferMutation = useAcceptOffer();
  const stakesMutation = useStakesActionCancellationFlow();

  // Reset flow state when the modal opens
  useEffect(() => {
    if (isOpen) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleHeaderClose = () => {
    onClose();
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

      case "stakes":
        // Membership Streak stakes screen (spec §7b M3) — between reason and
        // the offer waterfall. "Keep" mirrors Step4Confirm's keep (close, no
        // outcome recorded — "saved" is reserved for accepted offers).
        return (
          <StepStakes
            state={state}
            stakesMutation={stakesMutation}
            onKeep={handleHeaderClose}
            onContinue={flowHook.continueFromStakes}
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
            onDecline={flowHook.decline}
            onAcceptedOffer={flowHook.markSaved}
            onRequestTierDowngrade={onRequestTierDowngrade}
            tierDowngradeAvailable={tierDowngradeAvailable}
            entrySnapshot={entrySnapshot}
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
      size="2xl"
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
            firstName={firstName}
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
