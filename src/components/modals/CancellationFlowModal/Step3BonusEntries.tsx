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
 * {outcome:"saved", offerAccepted:"bonus_entries_100"} → onSaved().
 *
 * Decline → onDecline() (parent routes to Step 4).
 */

import React, { useState } from "react";
import { Ticket, Trophy, Calendar, ShieldCheck, Award, Lock, LogOut, Star } from "lucide-react";
import { cn } from "@/utils/cn";
import { InfoGrid, UrgencyBanner, TrustBar } from "@/components/modals/upsell-shell";
import { useLoading } from "@/contexts/LoadingContext";
import { useEntryRewardToast } from "@/hooks/useEntryRewardToast";
import { useToast } from "@/components/ui/Toast";
import type { FlowState } from "./types";
import type { useOutcomeCancellationFlow } from "@/hooks/queries/useCancellationFlow";

const BONUS_ENTRIES = 100;

interface Step3BonusEntriesProps {
  state: FlowState;
  outcomeMutation: ReturnType<typeof useOutcomeCancellationFlow>;
  onSaved: () => void;
  onDecline: () => void;
}

const Step3BonusEntries: React.FC<Step3BonusEntriesProps> = ({
  state,
  outcomeMutation,
  onSaved,
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

      // Fire outcome mutation (fire-and-forget — do not block onSaved)
      if (state.eventId) {
        outcomeMutation.mutate({
          eventId: state.eventId,
          outcome: "saved",
          offerAccepted: "bonus_entries_100",
        });
      }

      onSaved();
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

  const cells = [
    {
      icon: <Ticket size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          Your <span className="text-red-600 font-extrabold">accumulated</span> entries
        </>
      ),
      desc: "Already locked in the draw",
    },
    {
      icon: <Trophy size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          Your shot at the <span className="text-red-600 font-extrabold">major draw</span>
        </>
      ),
      desc: "Or $10,000 cash",
    },
    {
      icon: <Calendar size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          Your spot in <span className="text-red-600 font-extrabold">the draw</span>
        </>
      ),
      desc: "You'll lose it on cancel",
    },
  ];

  const trustCells: [
    { icon: React.ReactNode; strong: string; secondary: string },
    { icon: React.ReactNode; strong: string; secondary: string },
    { icon: React.ReactNode; strong: string; secondary: string }
  ] = [
    {
      icon: <ShieldCheck size={12} className="max-xs:size-2.5" />,
      strong: "SSL secure",
      secondary: "Entries safe",
    },
    {
      icon: <Award size={12} className="max-xs:size-2.5" />,
      strong: "NTP/16264",
      secondary: "Govt-certified",
    },
    {
      icon: <Lock size={12} className="max-xs:size-2.5" />,
      strong: "Cancel anytime",
      secondary: "No commitment",
    },
  ];

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-2 max-xs:px-3 max-xs:pt-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-snug mb-3">
          Before you go — stay active today and we&apos;ll add{" "}
          <strong className="text-neutral-900 dark:text-white font-bold">+{BONUS_ENTRIES} bonus entries</strong>{" "}
          to your major draw count. No extra cost.
        </p>

        <InfoGrid
          cells={cells}
          title="Cancel now & you walk away from"
          framing="loss"
        />

        <UrgencyBanner
          tone="gold"
          title={<>Someone&apos;s name gets called next draw.</>}
          sub="Stick around — it could just as easily be yours."
          icon={<Star size={16} fill="currentColor" className="max-xs:size-3" />}
        />

        <div className="mt-3 grid grid-cols-[1fr_1.25fr] gap-2 max-xs:mt-2.5 max-xs:gap-1.5">
          {/* Decline */}
          <button
            type="button"
            onClick={onDecline}
            disabled={isProcessing}
            className="group/cancel rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed bg-white dark:bg-neutral-900 border-[1.5px] border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:[&:not(:disabled)]:bg-neutral-50 dark:hover:[&:not(:disabled)]:bg-neutral-800 hover:[&:not(:disabled)]:border-neutral-400 dark:hover:[&:not(:disabled)]:border-neutral-600 hover:[&:not(:disabled)]:text-red-700 dark:hover:[&:not(:disabled)]:text-red-300 max-xs:px-[9px] max-xs:py-[7px] max-xs:rounded-[9px] max-xs:gap-1.5"
          >
            <span className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors duration-150 group-hover/cancel:bg-red-50 dark:group-hover/cancel:bg-red-950/40 group-hover/cancel:text-red-700 dark:group-hover/cancel:text-red-300 max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
              <LogOut size={16} className="max-xs:size-3" />
            </span>
            <span>
              <span className="block text-xs leading-[1.15] max-xs:text-[11px]">
                No thanks,
                <br />
                cancel anyway
              </span>
            </span>
          </button>

          {/* Accept — +100 bonus entries */}
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={isProcessing}
            className={cn(
              "relative rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "bg-gradient-to-b from-red-600 to-red-800 text-white border-[1.5px] border-red-800",
              "shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:shadow-[0_12px_24px_rgba(238,0,0,0.36)]",
              // +100 BONUS badge (mirrors ActionRow stayButton variant="redeem")
              "after:content-['+100_BONUS'] after:absolute after:-top-[7px] after:right-2.5 after:bg-gradient-to-br after:from-[#f4cf6b] after:to-premium-gold after:text-neutral-950 after:text-3xs after:font-extrabold after:tracking-[0.1em] after:px-1.5 after:py-0.5 after:rounded-full after:border-[1.5px] after:border-white after:shadow-[0_3px_8px_rgba(212,175,55,0.45)] after:max-xs:text-[7px] after:max-xs:px-[5px] after:max-xs:py-0.5 after:max-xs:-top-[7px] after:max-xs:right-1.5 after:max-xs:tracking-[0.08em] after:max-xs:border",
              "max-xs:px-2.5 max-xs:py-1.5 max-xs:rounded-[9px] max-xs:gap-1.5"
            )}
          >
            <span className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
              <Lock size={16} className="max-xs:size-3" />
            </span>
            <span>
              <span className="block text-xs leading-[1.15] max-xs:text-[11px]">
                {isProcessing ? "Adding bonus entries…" : "Keep me in the draw"}
              </span>
              <span className="block text-2xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[9px]">
                Stay + {BONUS_ENTRIES} bonus entries
              </span>
            </span>
          </button>
        </div>

        {outcomeMutation.isError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
            {outcomeMutation.error instanceof Error
              ? outcomeMutation.error.message
              : "Failed to record outcome. Please try again."}
          </p>
        )}
      </div>

      <TrustBar cells={trustCells} />
    </div>
  );
};

export default Step3BonusEntries;
