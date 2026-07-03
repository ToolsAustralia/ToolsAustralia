"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Loader2, X, AlertTriangle, Repeat } from "lucide-react";
import { cn } from "@/utils/cn";

interface PastDueTierSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The member's current (past-due) tier — e.g. "Tradie". */
  currentTierLabel: string;
  /** The tier they tapped to switch to — e.g. "Foreman". */
  newTierName: string;
  /** Monthly price of the new tier. */
  newTierPrice: number;
  /** Teardown succeeded (past-due sub canceled + invoice voided) → caller opens the subscribe flow. */
  onSwitched: () => void;
}

/**
 * Confirm + run the teardown half of a past-due tier switch. A past-due member can't upgrade/
 * downgrade in place (proration on an existing sub spawns a granting invoice — see
 * docs/PAST_DUE_REANCHOR.md), so switching means: cancel the past-due subscription + void
 * (forgive) the unpaid renewal, then subscribe fresh to the new tier. This modal owns the
 * cancel+void call (`POST /api/stripe/switch-tier-past-due`); on success it calls `onSwitched`,
 * which opens the ordinary subscribe flow (MembershipModal) for the new tier.
 */
export default function PastDueTierSwitchModal({
  isOpen,
  onClose,
  currentTierLabel,
  newTierName,
  newTierPrice,
  onSwitched,
}: PastDueTierSwitchModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state whenever the modal (re)opens.
  useEffect(() => {
    if (isOpen) {
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/switch-tier-past-due", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Couldn't switch your tier. Please try again.");
      }
      onSwitched();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't switch your tier. Please try again.");
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={submitting ? undefined : onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Switch to ${newTierName}`}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
      >
        {/* Amber header — this is a past-due money action. */}
        <div className="relative bg-gradient-to-br from-[#fbbf24] to-[#d97706] px-5 pb-4 pt-5 text-[#241a02]">
          <button
            type="button"
            onClick={submitting ? undefined : onClose}
            disabled={submitting}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/10 transition-colors hover:bg-black/20 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em]">
            <Repeat className="h-3.5 w-3.5" /> Switch tier
          </div>
          <h2 className="mt-1.5 font-['Poppins'] text-xl font-extrabold leading-tight">
            Switch to {newTierName}?
          </h2>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-[13.5px] font-medium leading-[1.55] text-primary-token dark:text-white">
            We&apos;ll close your past-due <b>{currentTierLabel}</b> membership and{" "}
            <b>waive the unpaid renewal</b>, then start <b>{newTierName}</b> fresh at{" "}
            <b>${newTierPrice}/mo</b>. Your entries carry over — you&apos;ll just enter payment for the
            new tier on the next step.
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-[12.5px] font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-[12px] bg-gradient-to-b from-[#fbbf24] to-[#d97706] px-4 py-3.5 text-[14px] font-extrabold text-[#241a02] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 motion-safe:active:translate-y-px",
                submitting && "opacity-70"
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Closing {currentTierLabel}…
                </>
              ) : (
                <>
                  Switch &amp; continue to payment <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full rounded-[12px] border border-token px-4 py-3 text-[13px] font-bold text-muted-token transition-colors hover:text-primary-token disabled:opacity-50 dark:hover:text-white"
            >
              Keep {currentTierLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
