"use client";

/**
 * Step3BonusEntries — "+100 bonus entries — stay active today" retention rung.
 *
 * Reused by Step2Offer when `bonus_entries_100` is the lead offer (reason:
 * joined_for_giveaway, havent_won, too_expensive, dont_use_benefits,
 * too_many_messages, other — after non-implemented lead offers are filtered).
 *
 * Accept → POST /api/cancellation-upsell/redeem (identical call to
 * CancellationUpsellModal/index.tsx:handleRedeem) → outcome mutation
 * {outcome:"saved", offerAccepted:"bonus_entries_100"} (fire-and-forget)
 * → onAcceptedOffer("bonus_entries_100", null) (Save Success screen).
 *
 * Decline → onDecline() (parent routes to Step 4).
 */

import React, { useState } from "react";
import { Gift } from "lucide-react";
import { useLoading } from "@/contexts/LoadingContext";
import { useEntryRewardToast } from "@/hooks/useEntryRewardToast";
import { useToast } from "@/components/ui/Toast";
import type { OfferType } from "@/models/CancellationFlowEvent";
import type { FlowState } from "./types";
import type { useOutcomeCancellationFlow } from "@/hooks/queries/useCancellationFlow";
import {
  FlowFrame,
  IconChip,
  Headline,
  SubCopy,
  ValueCard,
  UrgencyStrip,
  PrimaryCta,
  TextDecline,
} from "./primitives";

const BONUS_ENTRIES = 100;

interface Step3BonusEntriesProps {
  state: FlowState;
  outcomeMutation: ReturnType<typeof useOutcomeCancellationFlow>;
  onClose: () => void;
  onAcceptedOffer: (offer: OfferType, result: null) => void;
  onDecline: () => void;
}

const Step3BonusEntries: React.FC<Step3BonusEntriesProps> = ({
  state,
  outcomeMutation,
  onClose,
  onAcceptedOffer,
  onDecline,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { showLoading, hideLoading } = useLoading();
  const showEntryReward = useEntryRewardToast();
  const { showToast } = useToast();

  const handleAccept = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    showLoading("Processing Reward", "", [
      "Verifying eligibility",
      "Granting free entries",
      "Adding entries to major draw",
      "Updating your dashboard",
    ]);

    try {
      // Identical call to CancellationUpsellModal/index.tsx:handleRedeem
      const response = await fetch("/api/cancellation-upsell/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error((result as { error?: string }).error || "Failed to redeem free entries");
      }

      hideLoading();

      showEntryReward({
        entries: BONUS_ENTRIES,
        drawType: "major",
        source: "cancellation-upsell-redeem",
      });

      // Fire outcome mutation (fire-and-forget — do not block onAcceptedOffer)
      if (state.eventId) {
        outcomeMutation.mutate({
          eventId: state.eventId,
          outcome: "saved",
          offerAccepted: "bonus_entries_100",
        });
      }

      onAcceptedOffer("bonus_entries_100", null);
    } catch (error) {
      hideLoading();
      showToast({
        type: "error",
        title: "Couldn't redeem entries",
        message:
          error instanceof Error
            ? error.message
            : "Failed to redeem free entries. Please try again.",
        duration: 8000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <FlowFrame onClose={onClose}>
      <IconChip>
        <Gift size={22} strokeWidth={2} />
      </IconChip>
      <Headline>One more reason<br />to stay.</Headline>
      <SubCopy>
        Stay active today and we&apos;ll drop{" "}
        <strong className="text-neutral-900 dark:text-white">+{BONUS_ENTRIES} bonus entries</strong>{" "}
        into your major draw count. No extra cost.
      </SubCopy>
      <ValueCard className="flex items-center gap-3">
        <div className="text-[34px] font-black tracking-[-0.03em] text-red-600 dark:text-red-400">+{BONUS_ENTRIES}</div>
        <div className="text-xs leading-snug text-neutral-600 dark:text-neutral-400">
          bonus entries added instantly to the next major draw
        </div>
      </ValueCard>
      <UrgencyStrip>Someone&apos;s name gets called next draw — it could just as easily be yours.</UrgencyStrip>
      <PrimaryCta className="mt-[17px]" onClick={() => void handleAccept()} disabled={isProcessing}>
        {isProcessing ? "Adding bonus entries…" : "Keep me in the draw"}
      </PrimaryCta>
      <TextDecline onClick={onDecline} disabled={isProcessing}>
        No thanks, cancel anyway
      </TextDecline>
      {outcomeMutation.isError && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {outcomeMutation.error instanceof Error ? outcomeMutation.error.message : "Failed to record outcome. Please try again."}
        </p>
      )}
    </FlowFrame>
  );
};

export default Step3BonusEntries;
