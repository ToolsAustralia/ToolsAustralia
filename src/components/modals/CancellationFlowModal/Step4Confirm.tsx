"use client";

import React, { useState } from "react";
import { Ticket, Trophy, CreditCard } from "lucide-react";
import { FlowFrame, IconChip, Headline, SubCopy, ValueCard, FeatureRow, UrgencyStrip, PrimaryCta, TextDecline } from "./primitives";
import type { CancellationFlowModalProps } from "./types";
import type { FlowState } from "./types";
import type { useOutcomeCancellationFlow } from "@/hooks/queries/useCancellationFlow";
import { useToast } from "@/components/ui/Toast";

interface Step4ConfirmProps {
  state: FlowState;
  modalProps: Pick<CancellationFlowModalProps, "onClose" | "onCancelled" | "onResolvePayment">;
  outcomeMutation: ReturnType<typeof useOutcomeCancellationFlow>;
  onClose: () => void;
}

const Step4Confirm: React.FC<Step4ConfirmProps> = ({ state, modalProps, outcomeMutation, onClose }) => {
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

  if (state.pastDue) {
    return (
      <FlowFrame onClose={onClose}>
        <IconChip tone="gold"><CreditCard size={22} strokeWidth={2} /></IconChip>
        <Headline>Payment needs<br />attention</Headline>
        <SubCopy>Your subscription has a payment issue. Resolve it to keep your membership active and your entries safe.</SubCopy>
        <ValueCard className="border-amber-200 from-amber-50 to-amber-100/40 dark:border-amber-900/50 dark:from-amber-950/30">
          <FeatureRow>Entries are on hold — settle up to keep them</FeatureRow>
          <FeatureRow>Cancelling now permanently forfeits accumulated entries</FeatureRow>
        </ValueCard>
        <PrimaryCta className="mt-[17px]" onClick={handleResolvePayment} disabled={isCancelling}>Resolve payment</PrimaryCta>
        <TextDecline onClick={() => void handleCancelAnyway()} disabled={isCancelling}>
          {isCancelling ? "Cancelling…" : "No thanks, cancel anyway"}
        </TextDecline>
      </FlowFrame>
    );
  }

  return (
    <FlowFrame onClose={onClose} trust={false}>
      <Headline>Sure you want<br />to cancel?</Headline>
      <SubCopy>No more offers — just so you know what cancelling means:</SubCopy>
      <div className="mt-4 flex flex-col gap-2.5">
        <div className="flex items-center gap-3 rounded-[13px] border border-neutral-200 bg-neutral-50 px-3.5 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"><Ticket size={13} /></span>
          <div><div className="text-[12.5px] font-bold text-neutral-900 dark:text-white">Accumulated entries</div><div className="text-[11px] text-neutral-400">Permanently lost on cancel</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-[13px] border border-neutral-200 bg-neutral-50 px-3.5 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"><Trophy size={13} /></span>
          <div><div className="text-[12.5px] font-bold text-neutral-900 dark:text-white">Your major draw spot</div><div className="text-[11px] text-neutral-400">Or $10,000 cash — gone</div></div>
        </div>
      </div>
      <UrgencyStrip>Someone&apos;s name gets called next draw. It could just as easily be yours.</UrgencyStrip>
      <PrimaryCta className="mt-3.5" onClick={modalProps.onClose} disabled={isCancelling}>Keep my membership</PrimaryCta>
      <TextDecline onClick={() => void handleCancelAnyway()} disabled={isCancelling}>
        {isCancelling ? "Cancelling…" : "No thanks, cancel anyway"}
      </TextDecline>
      {outcomeMutation.isError && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {outcomeMutation.error instanceof Error ? outcomeMutation.error.message : "Failed to record outcome. Please try again."}
        </p>
      )}
    </FlowFrame>
  );
};

export default Step4Confirm;
