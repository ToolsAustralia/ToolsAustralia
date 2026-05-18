"use client";

/**
 * Step2Offer — renders the lead offer for the current cancellation flow step.
 *
 * Receives the current offer = state.offersShown[state.offerCursor] and dispatches
 * to the correct card via an exhaustive typed switch over OfferType.
 *
 * IMPLEMENTED offers (Phase 2):
 *   bonus_entries_100  → renders Step3BonusEntries inline (same +100 content)
 *   tier_downgrade     → "Switch to a cheaper plan instead?" card
 *
 * UNIMPLEMENTED offers (Tasks 14/16/17 will replace these throws):
 *   pause_30d, discount_50_2mo, unsubscribe_marketing → throw loudly so a
 *   regression that re-surfaces an unimplemented offer fails fast.
 */

import React from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/utils/cn";
import type { OfferType } from "@/models/CancellationFlowEvent";
import type { FlowState } from "./types";
import type { useOutcomeCancellationFlow } from "@/hooks/queries/useCancellationFlow";
import Step3BonusEntries from "./Step3BonusEntries";

interface Step2OfferProps {
  state: FlowState;
  outcomeMutation: ReturnType<typeof useOutcomeCancellationFlow>;
  onSaved: () => void;
  onDecline: () => void;
  /** Called when the user picks tier-downgrade. Parent maps this to its existing downgrade opener. */
  onRequestTierDowngrade?: (eventId: string | null) => void;
  /**
   * True when the user has at least one available downgrade option.
   * When false and the current offer is tier_downgrade, Step3BonusEntries is rendered instead.
   */
  tierDowngradeAvailable: boolean;
}

// ---------------------------------------------------------------------------
// tier_downgrade card
// ---------------------------------------------------------------------------

interface TierDowngradeCardProps {
  state: FlowState;
  onDecline: () => void;
  onRequestTierDowngrade?: (eventId: string | null) => void;
}

const TierDowngradeCard: React.FC<TierDowngradeCardProps> = ({
  state,
  onDecline,
  onRequestTierDowngrade,
}) => {
  const handleAccept = () => {
    // Do NOT record outcome here — the outcome is only recorded if the downgrade
    // is actually confirmed in DowngradeConfirmModal. Pass the eventId to the parent
    // so it can POST {outcome:"saved",offerAccepted:"tier_downgrade"} on real success.
    // The parent will also close this modal without calling onSaved.
    onRequestTierDowngrade?.(state.eventId);
  };

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-2 max-xs:px-3 max-xs:pt-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-snug mb-3">
          Feeling the price? Switch to a cheaper plan and keep every entry — no
          need to cancel.
        </p>

        {/* Tier-downgrade offer card — dark themed matching DowngradeCard in CancellationUpsellModal */}
        <div
          className={cn(
            "relative rounded-[14px] px-3.5 py-3 pt-3.5 text-white max-xs:px-2.5 max-xs:py-2.5 max-xs:rounded-xl",
            "bg-gradient-to-b from-[#161618] to-neutral-950",
            "before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none",
            "before:bg-[radial-gradient(circle_at_0%_50%,rgba(255,210,0,0.22),transparent_60%)]"
          )}
        >
          <div className="relative z-[2] flex items-center gap-2.5 min-h-[36px] max-xs:gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-sm tracking-[0.02em] leading-tight mb-0.5 max-xs:text-xs">
                Switch to a{" "}
                <span className="font-extrabold text-[#ffe066]">cheaper plan</span>
              </div>
              <div className="text-[11px] text-white/65 leading-[1.35] max-xs:text-2xs">
                Pay less, drop a tier — keep every entry.
              </div>
            </div>
            <button
              type="button"
              onClick={handleAccept}
              className={cn(
                "grow-0 shrink-0 font-sans font-extrabold text-[11px] tracking-[0.08em] px-3 py-[9px] rounded-[9px] uppercase inline-flex items-center gap-1.5 whitespace-nowrap transition-all duration-150",
                "hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:brightness-110",
                "bg-gradient-to-br from-[#ffe066] to-[#ffd200] text-neutral-950 shadow-[0_6px_14px_rgba(255,210,0,0.45)]",
                "max-xs:text-2xs max-xs:px-2.5 max-xs:py-[7px] max-xs:tracking-[0.06em] max-xs:gap-0"
              )}
            >
              <span>Switch plan</span>
              <span className="inline-flex items-center max-xs:hidden" aria-hidden>
                <ArrowRight size={12} strokeWidth={2.5} />
              </span>
            </button>
          </div>

          {/* Checks row */}
          <div className="relative z-[2] mt-2.5 pt-2.5 border-t border-dashed border-white/10 grid grid-cols-3 gap-1.5 text-2xs text-white/85 max-xs:mt-2 max-xs:pt-2 max-xs:gap-1 max-xs:text-[9px]">
            <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 justify-self-start">
              <Check size={11} strokeWidth={3.5} className="flex-shrink-0 basis-[11px] text-[#ffe066]" />
              Entries stay
            </span>
            <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 justify-self-center">
              <Check size={11} strokeWidth={3.5} className="flex-shrink-0 basis-[11px] text-[#ffe066]" />
              Pay less
            </span>
            <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 justify-self-end">
              <Check size={11} strokeWidth={3.5} className="flex-shrink-0 basis-[11px] text-[#ffe066]" />
              Cancel anytime
            </span>
          </div>
        </div>

        <div className="mt-2.5 max-xs:mt-2">
          <button
            type="button"
            onClick={onDecline}
            className="w-full text-xs font-semibold text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors py-1.5 max-xs:text-[11px]"
          >
            No thanks, show me other options
          </button>
        </div>

      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step2Offer — exhaustive switch
// ---------------------------------------------------------------------------

const Step2Offer: React.FC<Step2OfferProps> = ({
  state,
  outcomeMutation,
  onSaved,
  onDecline,
  onRequestTierDowngrade,
  tierDowngradeAvailable,
}) => {
  const offer: OfferType = state.offersShown[state.offerCursor];

  switch (offer) {
    case "bonus_entries_100":
      // When bonus_entries_100 is the LEAD offer (e.g. joined_for_giveaway / havent_won),
      // render the same content as Step3BonusEntries — it is Step3BonusEntries.
      return (
        <Step3BonusEntries
          state={state}
          outcomeMutation={outcomeMutation}
          onSaved={onSaved}
          onDecline={onDecline}
        />
      );

    case "tier_downgrade":
      // Bug 2: if no downgrade options exist, skip straight to the +100 rung.
      // For prefer_cheaper the sequence is [tier_downgrade, bonus_entries_100]; if
      // tier is unavailable the user should get the +100 offer immediately rather
      // than a dead card that silently does nothing.
      if (!tierDowngradeAvailable) {
        return (
          <Step3BonusEntries
            state={state}
            outcomeMutation={outcomeMutation}
            onSaved={onSaved}
            onDecline={onDecline}
          />
        );
      }
      return (
        <TierDowngradeCard
          state={state}
          onDecline={onDecline}
          onRequestTierDowngrade={onRequestTierDowngrade}
        />
      );

    case "pause_30d":
      // Task 14 replaces this throw with the pause card.
      throw new Error(`offer not yet wired: ${offer}`);

    case "discount_50_2mo":
      // Task 16 replaces this throw with the discount card.
      throw new Error(`offer not yet wired: ${offer}`);

    case "unsubscribe_marketing":
      // Task 17 replaces this throw with the unsubscribe card.
      throw new Error(`offer not yet wired: ${offer}`);

    default: {
      // Exhaustiveness guard — TypeScript will error here if OfferType gains a new member
      // that is not handled above.
      const _exhaustive: never = offer;
      throw new Error(`unhandled offer: ${String(_exhaustive)}`);
    }
  }
};

export default Step2Offer;
