"use client";

import React from "react";
import { LogOut, Lock } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/utils/cn";

interface ActionRowProps {
  isPastDue: boolean;
  isProcessing: boolean;
  onDecline: () => void;
  /** Used in non-past-due flow ("Keep me in the draw"). */
  onRedeem: () => void;
  /** Used in past-due flow ("Resolve payment"). */
  onResolvePayment: () => void;
}

const stayButton = cva(
  "rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-b from-red-600 to-red-800 text-white border-[1.5px] border-red-800 relative shadow-[0_8px_18px_rgba(238,0,0,0.28)] hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:shadow-[0_12px_24px_rgba(238,0,0,0.36)] max-xs:px-2.5 max-xs:py-1.5 max-xs:rounded-[9px] max-xs:gap-1.5",
  {
    variants: {
      variant: {
        redeem: "after:content-['+100_BONUS'] after:absolute after:-top-[7px] after:right-2.5 after:bg-gradient-to-br after:from-[#f4cf6b] after:to-premium-gold after:text-neutral-950 after:text-3xs after:font-extrabold after:tracking-[0.1em] after:px-1.5 after:py-0.5 after:rounded-full after:border-[1.5px] after:border-white after:shadow-[0_3px_8px_rgba(212,175,55,0.45)] after:max-xs:text-[7px] after:max-xs:px-[5px] after:max-xs:py-0.5 after:max-xs:-top-[7px] after:max-xs:right-1.5 after:max-xs:tracking-[0.08em] after:max-xs:border",
        resolve: "",
      },
    },
  }
);

const ActionRow: React.FC<ActionRowProps> = ({ isPastDue, isProcessing, onDecline, onRedeem, onResolvePayment }) => {
  return (
    <div className="mt-3 grid grid-cols-[1fr_1.25fr] gap-2 max-xs:mt-2.5 max-xs:gap-1.5">
      {/* Cancel button */}
      <button
        type="button"
        onClick={onDecline}
        disabled={isProcessing}
        className="group/cancel rounded-[10px] px-3 py-[9px] font-sans font-extrabold tracking-[0.01em] flex items-center gap-2 text-left transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed bg-white border-[1.5px] border-neutral-200 text-neutral-600 hover:[&:not(:disabled)]:bg-neutral-50 hover:[&:not(:disabled)]:border-neutral-400 hover:[&:not(:disabled)]:text-red-700 max-xs:px-[9px] max-xs:py-[7px] max-xs:rounded-[9px] max-xs:gap-1.5"
      >
        <span
          data-icn
          className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-neutral-100 text-neutral-600 transition-colors duration-150 group-hover/cancel:bg-red-50 group-hover/cancel:text-red-700 group-disabled/cancel:bg-neutral-100 group-disabled/cancel:text-neutral-600 max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md"
        >
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

      {/* Stay / Resolve button */}
      {isPastDue ? (
        <button
          type="button"
          onClick={onResolvePayment}
          disabled={isProcessing}
          className={cn(stayButton({ variant: "resolve" }))}
        >
          <span data-icn className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
            <Lock size={16} className="max-xs:size-3" />
          </span>
          <span>
            <span className="block text-xs leading-[1.15] max-xs:text-[11px]">Resolve payment</span>
            <span className="block text-2xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[9px]">Keep your spot in the draw</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onRedeem}
          disabled={isProcessing}
          className={cn(stayButton({ variant: "redeem" }))}
        >
          <span data-icn className="w-7 h-7 rounded-[7px] inline-flex items-center justify-center grow-0 shrink-0 basis-7 bg-white/15 text-white max-xs:w-6 max-xs:h-6 max-xs:basis-6 max-xs:rounded-md">
            <Lock size={16} className="max-xs:size-3" />
          </span>
          <span>
            <span className="block text-xs leading-[1.15] max-xs:text-[11px]">{isProcessing ? "Adding bonus entries…" : "Keep me in the draw"}</span>
            <span className="block text-2xs font-medium opacity-75 mt-px tracking-normal max-xs:text-[9px]">Stay + 100 bonus entries</span>
          </span>
        </button>
      )}
    </div>
  );
};

export default ActionRow;
