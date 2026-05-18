"use client";

/**
 * Step2Offer — renders the lead offer for the current cancellation flow step.
 *
 * Receives the current offer = state.offersShown[state.offerCursor] and dispatches
 * to the correct card via an exhaustive typed switch over OfferType.
 *
 * IMPLEMENTED offers (Task 17: ALL OfferTypes now render a real card —
 * no throw cases remain; the `never`-guard default is now genuinely
 * unreachable and kept purely as a compile-time exhaustiveness safety net):
 *   bonus_entries_100     → renders Step3BonusEntries inline (same +100 content)
 *   tier_downgrade        → "Switch to a cheaper plan instead?" card
 *   pause_30d             → "Pause 30 days — keep your entries" card (Task 14)
 *   discount_50_2mo       → "50% off for 2 months" card (Task 16)
 *   unsubscribe_marketing → "Get fewer messages instead" card (Task 17) —
 *     stops MARKETING email + SMS only; transactional / account emails
 *     (receipts, renewals, draw results) are untouched.
 */

import React, { useState } from "react";
import { ArrowRight, Check, PauseCircle, Ticket, Trophy, CalendarClock, ShieldCheck, Award, Lock, LogOut, BadgePercent, BellOff, MessageSquareOff, Inbox } from "lucide-react";
import { cn } from "@/utils/cn";
import { InfoGrid, UrgencyBanner, TrustBar } from "@/components/modals/upsell-shell";
import { ApiError } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import type { OfferType } from "@/models/CancellationFlowEvent";
import type { FlowState } from "./types";
import type { useOutcomeCancellationFlow, useAcceptOffer } from "@/hooks/queries/useCancellationFlow";
import Step3BonusEntries from "./Step3BonusEntries";

interface Step2OfferProps {
  state: FlowState;
  outcomeMutation: ReturnType<typeof useOutcomeCancellationFlow>;
  acceptOfferMutation: ReturnType<typeof useAcceptOffer>;
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
// pause_30d card
// ---------------------------------------------------------------------------

interface PauseOfferCardProps {
  state: FlowState;
  acceptOfferMutation: ReturnType<typeof useAcceptOffer>;
  onSaved: () => void;
  onDecline: () => void;
}

const PauseOfferCard: React.FC<PauseOfferCardProps> = ({
  state,
  acceptOfferMutation,
  onSaved,
  onDecline,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { showToast } = useToast();

  const handleAccept = async () => {
    if (isProcessing) return;
    if (!state.eventId) {
      // No event id should never happen at Step 2 — degrade gracefully.
      onDecline();
      return;
    }
    setIsProcessing(true);
    try {
      await acceptOfferMutation.mutateAsync({
        eventId: state.eventId,
        offer: "pause_30d",
      });
      onSaved();
    } catch (error) {
      // The eligibility filter should have prevented an already-used / past-due
      // / no-subscription member from ever reaching this card. If it slipped
      // through, the server returns 409 (or 404). Don't dead-end: surface a
      // brief message and advance to the next rung via onDecline().
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409 || status === 404) {
        showToast({
          type: "info",
          title: "Pause unavailable",
          message:
            error instanceof Error
              ? error.message
              : "This pause offer isn't available on your account.",
          duration: 6000,
        });
        onDecline();
        return;
      }
      showToast({
        type: "error",
        title: "Couldn't pause your membership",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
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
      desc: "Stay locked in — nothing lost",
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
      icon: <CalendarClock size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          <span className="text-red-600 font-extrabold">30 days</span> off — no charge
        </>
      ),
      desc: "Auto-resumes after the pause",
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
          Not ready to cancel? Take a break instead — we&apos;ll{" "}
          <strong className="text-neutral-900 dark:text-white font-bold">
            pause your membership for 30 days
          </strong>
          . No payments while you&apos;re paused, and every entry you&apos;ve earned stays exactly where it is.
        </p>

        <InfoGrid
          cells={cells}
          title="Pause 30 days — keep your entries"
          framing="gain"
        />

        <UrgencyBanner
          tone="gold"
          title={<>Your entries don&apos;t expire while paused.</>}
          sub="Step away for a month — pick up right where you left off."
          icon={<PauseCircle size={16} className="max-xs:size-3" />}
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
                show me other options
              </span>
            </span>
          </button>

          {/* Accept — pause 30 days */}
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={isProcessing}
            className={cn(
              "relative rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "bg-gradient-to-b from-red-600 to-red-800 text-white border-[1.5px] border-red-800",
              "shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:shadow-[0_12px_24px_rgba(238,0,0,0.36)]",
              "max-xs:px-2.5 max-xs:py-1.5 max-xs:rounded-[9px] max-xs:gap-1.5"
            )}
          >
            <span className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
              <PauseCircle size={16} className="max-xs:size-3" />
            </span>
            <span>
              <span className="block text-xs leading-[1.15] max-xs:text-[11px]">
                {isProcessing ? "Pausing…" : "Pause my membership"}
              </span>
              <span className="block text-2xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[9px]">
                30 days off — keep entries
              </span>
            </span>
          </button>
        </div>
      </div>

      <TrustBar cells={trustCells} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// discount_50_2mo card
// ---------------------------------------------------------------------------

interface DiscountOfferCardProps {
  state: FlowState;
  acceptOfferMutation: ReturnType<typeof useAcceptOffer>;
  onSaved: () => void;
  onDecline: () => void;
}

const DiscountOfferCard: React.FC<DiscountOfferCardProps> = ({
  state,
  acceptOfferMutation,
  onSaved,
  onDecline,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { showToast } = useToast();

  const handleAccept = async () => {
    if (isProcessing) return;
    if (!state.eventId) {
      // No event id should never happen at Step 2 — degrade gracefully.
      onDecline();
      return;
    }
    setIsProcessing(true);
    try {
      await acceptOfferMutation.mutateAsync({
        eventId: state.eventId,
        offer: "discount_50_2mo",
      });
      onSaved();
    } catch (error) {
      // The eligibility filter should have prevented an already-used / past-due
      // / no-subscription member from ever reaching this card. If it slipped
      // through, the server returns 409 (or 404). Don't dead-end: surface a
      // brief message and advance to the next rung via onDecline().
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409 || status === 404) {
        showToast({
          type: "info",
          title: "Discount unavailable",
          message:
            error instanceof Error
              ? error.message
              : "This discount offer isn't available on your account.",
          duration: 6000,
        });
        onDecline();
        return;
      }
      showToast({
        type: "error",
        title: "Couldn't apply your discount",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        duration: 8000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const cells = [
    {
      icon: <BadgePercent size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          <span className="text-red-600 font-extrabold">50% off</span> your membership
        </>
      ),
      desc: "Applied for the next 2 months",
    },
    {
      icon: <Ticket size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          Every <span className="text-red-600 font-extrabold">entry</span> keeps building
        </>
      ),
      desc: "Nothing lost — stay in the draw",
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
          Before you go — keep everything for half the price. We&apos;ll take{" "}
          <strong className="text-neutral-900 dark:text-white font-bold">
            50% off your membership for the next 2 months
          </strong>
          . Same entries, same draws, same perks — just less to pay.
        </p>

        <InfoGrid
          cells={cells}
          title="50% off for 2 months"
          framing="gain"
        />

        <UrgencyBanner
          tone="gold"
          title={<>Half price — applied to your next 2 payments.</>}
          sub="Keep every entry and every draw while you save."
          icon={<BadgePercent size={16} className="max-xs:size-3" />}
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
                show me other options
              </span>
            </span>
          </button>

          {/* Accept — 50% off for 2 months */}
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={isProcessing}
            className={cn(
              "relative rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "bg-gradient-to-b from-red-600 to-red-800 text-white border-[1.5px] border-red-800",
              "shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:shadow-[0_12px_24px_rgba(238,0,0,0.36)]",
              "max-xs:px-2.5 max-xs:py-1.5 max-xs:rounded-[9px] max-xs:gap-1.5"
            )}
          >
            <span className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
              <BadgePercent size={16} className="max-xs:size-3" />
            </span>
            <span>
              <span className="block text-xs leading-[1.15] max-xs:text-[11px]">
                {isProcessing ? "Applying…" : "Get 50% off"}
              </span>
              <span className="block text-2xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[9px]">
                2 months — keep everything
              </span>
            </span>
          </button>
        </div>
      </div>

      <TrustBar cells={trustCells} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// unsubscribe_marketing card
// ---------------------------------------------------------------------------

interface UnsubscribeOfferCardProps {
  state: FlowState;
  acceptOfferMutation: ReturnType<typeof useAcceptOffer>;
  onSaved: () => void;
  onDecline: () => void;
}

const UnsubscribeOfferCard: React.FC<UnsubscribeOfferCardProps> = ({
  state,
  acceptOfferMutation,
  onSaved,
  onDecline,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { showToast } = useToast();

  const handleAccept = async () => {
    if (isProcessing) return;
    if (!state.eventId) {
      // No event id should never happen at Step 2 — degrade gracefully.
      onDecline();
      return;
    }
    setIsProcessing(true);
    try {
      await acceptOfferMutation.mutateAsync({
        eventId: state.eventId,
        offer: "unsubscribe_marketing",
      });
      onSaved();
    } catch (error) {
      // unsubscribe_marketing has no 409 path (not one-time gated, no past-due
      // guard). A 404 (user vanished) or 500 can still occur — don't dead-end:
      // surface a brief message and advance to the next rung via onDecline().
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409 || status === 404) {
        showToast({
          type: "info",
          title: "Couldn't update your preferences",
          message:
            error instanceof Error
              ? error.message
              : "We couldn't update your message preferences just now.",
          duration: 6000,
        });
        onDecline();
        return;
      }
      showToast({
        type: "error",
        title: "Couldn't update your preferences",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        duration: 8000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const cells = [
    {
      icon: <BellOff size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          <span className="text-red-600 font-extrabold">Far fewer</span> marketing messages
        </>
      ),
      desc: "Marketing email + SMS switched off",
    },
    {
      icon: <Inbox size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          Important <span className="text-red-600 font-extrabold">account</span> emails stay
        </>
      ),
      desc: "Receipts, renewals & draw results still arrive",
    },
    {
      icon: <Ticket size={20} strokeWidth={2} className="max-xs:size-4" />,
      title: (
        <>
          Every <span className="text-red-600 font-extrabold">entry</span> keeps building
        </>
      ),
      desc: "Nothing lost — stay in the draw",
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
          Hearing from us too often? Don&apos;t cancel — just get{" "}
          <strong className="text-neutral-900 dark:text-white font-bold">
            fewer messages
          </strong>
          . We&apos;ll switch off marketing emails and marketing SMS. You&apos;ll
          still get important account messages — receipts, renewal notices and
          draw results are not affected.
        </p>

        <InfoGrid
          cells={cells}
          title="Get fewer messages instead"
          framing="gain"
        />

        <UrgencyBanner
          tone="gold"
          title={<>Less noise — none of the loss.</>}
          sub="We only turn off marketing email & SMS. Account emails keep coming."
          icon={<MessageSquareOff size={16} className="max-xs:size-3" />}
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
                show me other options
              </span>
            </span>
          </button>

          {/* Accept — fewer messages */}
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={isProcessing}
            className={cn(
              "relative rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "bg-gradient-to-b from-red-600 to-red-800 text-white border-[1.5px] border-red-800",
              "shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:shadow-[0_12px_24px_rgba(238,0,0,0.36)]",
              "max-xs:px-2.5 max-xs:py-1.5 max-xs:rounded-[9px] max-xs:gap-1.5"
            )}
          >
            <span className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
              <BellOff size={16} className="max-xs:size-3" />
            </span>
            <span>
              <span className="block text-xs leading-[1.15] max-xs:text-[11px]">
                {isProcessing ? "Updating…" : "Send me fewer messages"}
              </span>
              <span className="block text-2xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[9px]">
                Marketing email + SMS off
              </span>
            </span>
          </button>
        </div>
      </div>

      <TrustBar cells={trustCells} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step2Offer — exhaustive switch
// ---------------------------------------------------------------------------

const Step2Offer: React.FC<Step2OfferProps> = ({
  state,
  outcomeMutation,
  acceptOfferMutation,
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
      // Task 14: real pause card. Accept → useAcceptOffer → onSaved; decline →
      // onDecline (next rung). 409/404 (filter slipped) → toast + onDecline.
      return (
        <PauseOfferCard
          state={state}
          acceptOfferMutation={acceptOfferMutation}
          onSaved={onSaved}
          onDecline={onDecline}
        />
      );

    case "discount_50_2mo":
      // Task 16: real discount card. Accept → useAcceptOffer → onSaved; decline →
      // onDecline (next rung). 409/404 (filter slipped) → toast + onDecline.
      return (
        <DiscountOfferCard
          state={state}
          acceptOfferMutation={acceptOfferMutation}
          onSaved={onSaved}
          onDecline={onDecline}
        />
      );

    case "unsubscribe_marketing":
      // Task 17: real unsubscribe card. Accept → useAcceptOffer → onSaved;
      // decline → onDecline (next rung). No 409 path (not one-time gated, no
      // past-due guard); 404/500 (rare) → toast + onDecline.
      return (
        <UnsubscribeOfferCard
          state={state}
          acceptOfferMutation={acceptOfferMutation}
          onSaved={onSaved}
          onDecline={onDecline}
        />
      );

    default: {
      // Exhaustiveness guard — TypeScript will error here if OfferType gains a new member
      // that is not handled above. As of Task 17 ALL OfferTypes render a real
      // card, so this branch is genuinely unreachable — kept intentionally as a
      // compile-time safety net for any future OfferType addition.
      const _exhaustive: never = offer;
      throw new Error(`unhandled offer: ${String(_exhaustive)}`);
    }
  }
};

export default Step2Offer;
