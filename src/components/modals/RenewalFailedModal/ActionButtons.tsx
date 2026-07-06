"use client";

import React from "react";
import Link from "next/link";
import { CreditCard, Loader2, Mail } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/utils/cn";
import styles from "./styles.module.css";
import { type PayFailedInvoiceFailureCode } from "@/hooks/queries/useSubscriptionQueries";

interface ActionButtonsProps {
  isLoading: boolean;
  terminalCollectionFailure: PayFailedInvoiceFailureCode | null;
  /** Whether the inline card-setup form is currently open. */
  showInlineCardSetup: boolean;
  /** Unused for rendering but kept for API parity — orchestrator may pass it. */
  isNoPayableInvoice: boolean;
  /** Unused for rendering but kept for API parity. */
  forceChargeProcessing: boolean;
  onResolve: () => void;
  onPayOverdue: () => void;
  onBack: () => void;
  onClose: () => void;
  /** Pre-encoded mailto string for the Contact Support CTA. */
  supportMailto: string;
  /**
   * Sheet-native mode: hide the "Close" button + the "close this modal" footer
   * copy (the bottom sheet owns its own dismiss). Defaults to false (modal).
   */
  hideDismiss?: boolean;
}

const button = cva(
  cn(
    "w-full inline-flex items-center justify-center px-[14px] py-[11px] rounded-[10px] font-extrabold text-[13px] tracking-[0.01em] leading-[1.2] disabled:opacity-60 disabled:cursor-not-allowed",
    styles.btn
  ),
  {
    variants: {
      variant: {
        // Amber, not red — this is the PAST-DUE resolve flow, so the CTA matches the amber
        // past-due language everywhere else (PanelHead, hero "Manage membership", the ribbon).
        // Red is reserved for draw urgency / "get entries".
        primary: cn(
          "bg-gradient-to-b from-[#f59e0b] to-[#d97706] text-white border-[1.5px] border-[#b45309] shadow-[0_8px_18px_rgba(217,119,6,0.32)]",
          styles.btnPrimary
        ),
        outline:
          "bg-white text-[#b45309] border-[1.5px] border-[#fcd34d] hover:bg-[#fffbeb] hover:border-[#d97706]",
        ghost:
          "bg-transparent text-[#525252] dark:text-neutral-300 border-[1.5px] border-transparent hover:bg-[#fafafa] dark:hover:bg-neutral-800",
      },
    },
    defaultVariants: { variant: "ghost" },
  }
);

const ActionButtons: React.FC<ActionButtonsProps> = ({
  isLoading,
  terminalCollectionFailure,
  showInlineCardSetup,
  onResolve,
  onBack,
  onClose,
  supportMailto,
  hideDismiss = false,
}) => {
  // State 1: Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 sm:py-8">
        <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-amber-600 animate-spin mb-3" />
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Loading payment options…</p>
      </div>
    );
  }

  // State 2: Terminal failure (irrecoverable)
  if (terminalCollectionFailure) {
    return (
      <>
        <div className="space-y-2">
          <a href={supportMailto} className={cn(button({ variant: "primary" }))}>
            <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
            Contact support
          </a>
          <Link href="/my-account" onClick={onClose} className={cn(button({ variant: "outline" }))}>
            Go to account
          </Link>
          {!hideDismiss && (
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className={cn(button({ variant: "ghost" }))}
            >
              Close
            </button>
          )}
        </div>
        <div className="mt-4 text-2xs sm:text-xs text-neutral-500 dark:text-neutral-400 text-center">
          Our team may need to fix your invoice in billing before you can pay. You can still update
          saved cards under your account.
        </div>
      </>
    );
  }

  // State 3: Normal flow
  return (
    <>
      <div className="space-y-2">
        {!showInlineCardSetup && (
          <button
            type="button"
            onClick={onResolve}
            disabled={isLoading}
            className={cn(button({ variant: "primary" }))}
          >
            <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
            Resolve payment issue
          </button>
        )}
        {showInlineCardSetup && (
          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className={cn(button({ variant: "outline" }))}
          >
            Back
          </button>
        )}
        {!hideDismiss && (
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className={cn(button({ variant: "ghost" }))}
          >
            Close
          </button>
        )}
      </div>
      {!hideDismiss && (
        <div className="mt-4 text-2xs sm:text-xs text-neutral-500 dark:text-neutral-400 text-center">
          {showInlineCardSetup
            ? "You can also close this modal and add a card later under account settings."
            : "You can close this modal and resolve the payment issue later from your account settings."}
        </div>
      )}
    </>
  );
};

export default ActionButtons;
