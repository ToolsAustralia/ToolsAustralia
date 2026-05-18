"use client";

import React, { useState } from "react";
import { Ticket, Trophy, Calendar, ShieldCheck, Award, Lock, LogOut, CreditCard } from "lucide-react";
import { cn } from "@/utils/cn";
import { InfoGrid, UrgencyBanner, TrustBar } from "@/components/modals/upsell-shell";
import type { CancellationFlowModalProps } from "./types";
import type { FlowState } from "./types";
import type { useOutcomeCancellationFlow } from "@/hooks/queries/useCancellationFlow";
import { useToast } from "@/components/ui/Toast";

interface Step4ConfirmProps {
  state: FlowState;
  modalProps: Pick<CancellationFlowModalProps, "onClose" | "onCancelled" | "onResolvePayment">;
  outcomeMutation: ReturnType<typeof useOutcomeCancellationFlow>;
}

const Step4Confirm: React.FC<Step4ConfirmProps> = ({ state, modalProps, outcomeMutation }) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const { showToast } = useToast();

  const handleCancelAnyway = async () => {
    if (isCancelling) return;
    setIsCancelling(true);

    try {
      // POST to the existing cancel-subscription endpoint exactly as SubscriptionManagementModal does
      const response = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cancelAtPeriodEnd: true }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error((result as { error?: string }).error || "Failed to cancel subscription");
      }

      const cancelledImmediately = Boolean((result as { data?: { cancelledImmediately?: boolean } }).data?.cancelledImmediately);
      const isPastDueCancel = Boolean((result as { data?: { isPastDue?: boolean } }).data?.isPastDue);

      if (cancelledImmediately) {
        showToast({
          type: "warning",
          title: "Subscription Cancelled",
          message:
            typeof (result as { message?: string }).message === "string" && ((result as { message?: string }).message ?? "").trim().length > 0
              ? ((result as { message: string }).message)
              : isPastDueCancel
                ? "Your subscription has been canceled. It was already past due, so access tied to an active paid subscription may have ended."
                : "Your subscription has been canceled immediately.",
          duration: 15000,
        });
      } else {
        const resolvedEndDateIso =
          (result as { data?: { currentPeriodEnd?: string; endDate?: string } }).data?.currentPeriodEnd ||
          (result as { data?: { endDate?: string } }).data?.endDate ||
          null;
        const endDate = resolvedEndDateIso
          ? new Date(resolvedEndDateIso).toLocaleDateString()
          : "the end of your billing period";
        const daysRemaining = resolvedEndDateIso
          ? Math.max(0, Math.ceil((new Date(resolvedEndDateIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : "several";

        showToast({
          type: "warning",
          title: "Subscription Cancelled",
          message: `Your subscription will end on ${endDate} (${daysRemaining} days). You'll keep full access until then. We're sad to see you go!`,
          duration: 15000,
        });
      }

      // Record outcome in the cancellation flow event (fire-and-forget — do not block)
      if (state.eventId) {
        outcomeMutation.mutate({ eventId: state.eventId, outcome: "cancelled" });
      }

      modalProps.onCancelled();
    } catch (err) {
      console.error("Failed to cancel subscription:", err);
      showToast({
        type: "error",
        title: "Cancellation Failed",
        message: err instanceof Error ? err.message : "Failed to cancel subscription. Please try again.",
        duration: 10000,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleResolvePayment = () => {
    modalProps.onResolvePayment();
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

  if (state.pastDue) {
    // §3a past-due variant: Primary CTA = "Resolve payment", Secondary = "Cancel anyway"
    return (
      <div className="flex flex-col">
        <div className="px-4 pt-4 pb-2 max-xs:px-3 max-xs:pt-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-snug mb-3">
            Your subscription has a payment issue. Resolve it to keep your membership active and your draw entries safe.
          </p>

          <InfoGrid
            cells={cells}
            title="Settle up & you keep"
            framing="loss"
          />

          <UrgencyBanner
            tone="warning"
            title="Your entries are on hold — settle up to keep them."
            sub="Once cancelled, accumulated entries are permanently lost."
            icon={<CreditCard size={16} className="max-xs:size-3" />}
          />

          <div className="mt-3 grid grid-cols-[1fr_1.25fr] gap-2 max-xs:mt-2.5 max-xs:gap-1.5">
            {/* Cancel anyway (secondary) */}
            <button
              type="button"
              onClick={() => void handleCancelAnyway()}
              disabled={isCancelling}
              className="group/cancel rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed bg-white dark:bg-neutral-900 border-[1.5px] border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:[&:not(:disabled)]:bg-neutral-50 dark:hover:[&:not(:disabled)]:bg-neutral-800 hover:[&:not(:disabled)]:border-neutral-400 dark:hover:[&:not(:disabled)]:border-neutral-600 hover:[&:not(:disabled)]:text-red-700 dark:hover:[&:not(:disabled)]:text-red-300 max-xs:px-[9px] max-xs:py-[7px] max-xs:rounded-[9px] max-xs:gap-1.5"
            >
              <span className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors duration-150 group-hover/cancel:bg-red-50 dark:group-hover/cancel:bg-red-950/40 group-hover/cancel:text-red-700 dark:group-hover/cancel:text-red-300 max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
                <LogOut size={16} className="max-xs:size-3" />
              </span>
              <span className="block text-sm leading-[1.2] max-xs:text-xs">
                No thanks,
                <br />
                cancel anyway
              </span>
            </button>

            {/* Resolve payment (primary) */}
            <button
              type="button"
              onClick={handleResolvePayment}
              disabled={isCancelling}
              className={cn(
                "rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                "bg-gradient-to-b from-red-600 to-red-800 text-white border-[1.5px] border-red-800",
                "shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:shadow-[0_12px_24px_rgba(238,0,0,0.36)]",
                "max-xs:px-2.5 max-xs:py-1.5 max-xs:rounded-[9px] max-xs:gap-1.5"
              )}
            >
              <span className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
                <CreditCard size={16} className="max-xs:size-3" />
              </span>
              <span>
                <span className="block text-sm leading-[1.2] max-xs:text-xs">Resolve payment</span>
                <span className="block text-xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[10px]">Keep your spot in the draw</span>
              </span>
            </button>
          </div>
        </div>

        <TrustBar cells={trustCells} />
      </div>
    );
  }

  // Normal (non-past-due) variant
  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-2 max-xs:px-3 max-xs:pt-3">
        <InfoGrid
          cells={cells}
          title="What you'll lose"
          framing="loss"
        />

        <UrgencyBanner
          tone="gold"
          title="Someone's name gets called next draw."
          sub="Stick around — it could just as easily be yours."
        />

        <div className="mt-3 grid grid-cols-[1fr_1.25fr] gap-2 max-xs:mt-2.5 max-xs:gap-1.5">
          {/* Cancel anyway */}
          <button
            type="button"
            onClick={() => void handleCancelAnyway()}
            disabled={isCancelling}
            className="group/cancel rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed bg-white dark:bg-neutral-900 border-[1.5px] border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:[&:not(:disabled)]:bg-neutral-50 dark:hover:[&:not(:disabled)]:bg-neutral-800 hover:[&:not(:disabled)]:border-neutral-400 dark:hover:[&:not(:disabled)]:border-neutral-600 hover:[&:not(:disabled)]:text-red-700 dark:hover:[&:not(:disabled)]:text-red-300 max-xs:px-[9px] max-xs:py-[7px] max-xs:rounded-[9px] max-xs:gap-1.5"
          >
            <span className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors duration-150 group-hover/cancel:bg-red-50 dark:group-hover/cancel:bg-red-950/40 group-hover/cancel:text-red-700 dark:group-hover/cancel:text-red-300 max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
              <LogOut size={16} className="max-xs:size-3" />
            </span>
            <span>
              <span className="block text-sm leading-[1.2] max-xs:text-xs">
                {isCancelling ? "Cancelling…" : "No thanks, cancel anyway"}
              </span>
            </span>
          </button>

          {/* Keep my membership */}
          <button
            type="button"
            onClick={modalProps.onClose}
            disabled={isCancelling}
            className={cn(
              "rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "bg-gradient-to-b from-red-600 to-red-800 text-white border-[1.5px] border-red-800",
              "shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:shadow-[0_12px_24px_rgba(238,0,0,0.36)]",
              "max-xs:px-2.5 max-xs:py-1.5 max-xs:rounded-[9px] max-xs:gap-1.5"
            )}
          >
            <span className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
              <Lock size={16} className="max-xs:size-3" />
            </span>
            <span>
              <span className="block text-sm leading-[1.2] max-xs:text-xs">Keep my membership</span>
              <span className="block text-xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[10px]">Stay in the draw</span>
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

export default Step4Confirm;
