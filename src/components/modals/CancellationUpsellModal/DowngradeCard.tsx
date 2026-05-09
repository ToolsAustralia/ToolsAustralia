"use client";

import React from "react";
import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/utils/cn";
import { type PackageIconData } from "@/utils/images/package-icons";

export type Tier = "tradie" | "foreman" | "boss";

interface DowngradeCardProps {
  tier: Tier;
  packageName: string;
  /** Optional savings copy, e.g. "Save $19/mo". Renders as middle check when present. */
  saveLabel?: string;
  hasMembershipEntries: boolean;
  accumulatedEntries: number;
  isProcessing: boolean;
  /** Tier icon (e.g. tool-belt graphic). */
  icon: PackageIconData | null;
  onSwitchPlan: () => void;
}

const card = cva(
  "relative rounded-[14px] px-3.5 py-3 pt-3.5 text-white before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none max-xs:px-2.5 max-xs:py-2.5 max-xs:rounded-xl bg-gradient-to-b from-[#161618] to-neutral-950",
  {
    variants: {
      tier: {
        tradie: "before:bg-[radial-gradient(circle_at_0%_50%,rgba(0,194,237,0.22),transparent_60%)]",
        foreman: "before:bg-[radial-gradient(circle_at_0%_50%,rgba(255,210,0,0.22),transparent_60%)]",
        boss: "before:bg-[radial-gradient(circle_at_0%_50%,rgba(238,0,0,0.24),transparent_60%)]",
      },
    },
  }
);

const badge = cva(
  "absolute -top-2.5 -left-2 z-[3] w-[46px] h-[46px] rounded-xl border-2 border-white/95 inline-flex items-center justify-center p-[5px] -rotate-[4deg] max-xs:-top-2 max-xs:-left-1.5 max-xs:w-[38px] max-xs:h-[38px] max-xs:rounded-[10px] max-xs:p-[3px]",
  {
    variants: {
      tier: {
        tradie: "bg-gradient-to-br from-[#00c2ed] to-[#5ca9ec] shadow-[0_8px_22px_rgba(0,194,237,0.45),0_0_0_1px_rgba(0,194,237,0.5)]",
        foreman: "bg-gradient-to-br from-[#ffe066] to-[#ffd200] shadow-[0_8px_22px_rgba(255,210,0,0.5),0_0_0_1px_rgba(255,210,0,0.5)]",
        boss: "bg-gradient-to-br from-[#ff4444] to-red-600 shadow-[0_8px_22px_rgba(238,0,0,0.5),0_0_0_1px_rgba(238,0,0,0.5)]",
      },
    },
  }
);

const accent = cva("font-extrabold", {
  variants: {
    tier: {
      tradie: "text-[#5ce0ff]",
      foreman: "text-[#ffe066]",
      boss: "text-[#ff6b6b]",
    },
  },
});

const cta = cva(
  "grow-0 shrink-0 font-sans font-extrabold text-[11px] tracking-[0.08em] px-3 py-[9px] rounded-[9px] uppercase inline-flex items-center gap-1.5 whitespace-nowrap transition-all duration-150 hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed max-xs:text-2xs max-xs:px-2.5 max-xs:py-[7px] max-xs:tracking-[0.06em] max-xs:gap-0",
  {
    variants: {
      tier: {
        tradie: "bg-gradient-to-br from-[#5ca9ec] to-[#00c2ed] text-white shadow-[0_6px_14px_rgba(0,194,237,0.45)]",
        foreman: "bg-gradient-to-br from-[#ffe066] to-[#ffd200] text-neutral-950 shadow-[0_6px_14px_rgba(255,210,0,0.45)]",
        boss: "bg-gradient-to-br from-[#ff3333] to-red-600 text-white shadow-[0_6px_14px_rgba(238,0,0,0.45)]",
      },
    },
  }
);

const checkColor = cva("flex-shrink-0 basis-[11px]", {
  variants: {
    tier: {
      tradie: "text-[#5ce0ff]",
      foreman: "text-[#ffe066]",
      boss: "text-[#ff6b6b]",
    },
  },
});

const DowngradeCard: React.FC<DowngradeCardProps> = ({ tier, packageName, saveLabel, hasMembershipEntries, accumulatedEntries, isProcessing, icon, onSwitchPlan }) => {
  return (
    <>
      {/* Divider with centered text */}
      <div className="text-center text-[9px] font-extrabold tracking-[0.22em] uppercase text-neutral-600 dark:text-neutral-400 my-3 mb-2 relative max-xs:my-2 max-xs:mb-1.5 max-xs:text-[8px] before:content-[''] before:absolute before:left-0 before:right-0 before:top-1/2 before:h-px before:bg-neutral-200 dark:before:bg-neutral-700 before:z-[1]">
        <span className="bg-white dark:bg-neutral-950 px-3 relative z-[2]">Not feeling the price?</span>
      </div>

      <div className={cn(card({ tier }))}>
        {/* Corner badge */}
        <div className={cn(badge({ tier }))} aria-hidden>
          {icon ? (
            <Image src={icon} alt="" width={48} height={48} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : null}
        </div>

        {/* Row: text + CTA */}
        <div className="relative z-[2] flex items-center gap-2.5 pl-11 min-h-[36px] max-xs:pl-9 max-xs:gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-sm tracking-[0.02em] leading-tight mb-0.5 max-xs:text-xs">
              Switch to <span className={cn(accent({ tier }))}>{packageName}</span>
            </div>
            <div className="text-[11px] text-white/65 leading-[1.35] max-xs:text-2xs">Pay less, drop a tier — keep every entry.</div>
          </div>
          <button
            type="button"
            onClick={onSwitchPlan}
            disabled={isProcessing}
            className={cn(cta({ tier }))}
          >
            <span>Switch plan</span>
            <span className="inline-flex items-center max-xs:hidden" aria-hidden><ArrowRight size={12} strokeWidth={2.5} /></span>
          </button>
        </div>

        {/* Checks row — 3 ticks distributed start/center/end */}
        <div className="relative z-[2] mt-2.5 pt-2.5 border-t border-dashed border-white/10 grid grid-cols-3 gap-1.5 text-2xs text-white/85 max-xs:mt-2 max-xs:pt-2 max-xs:gap-1 max-xs:text-[9px]">
          <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 justify-self-start">
            <Check size={11} strokeWidth={3.5} className={cn(checkColor({ tier }))} />
            {hasMembershipEntries ? `${accumulatedEntries.toLocaleString()} entries stay` : "Entries stay"}
          </span>
          {saveLabel ? (
            <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 justify-self-center">
              <Check size={11} strokeWidth={3.5} className={cn(checkColor({ tier }))} />
              {saveLabel}
            </span>
          ) : (
            // Empty placeholder to keep grid alignment
            <span />
          )}
          <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 justify-self-end">
            <Check size={11} strokeWidth={3.5} className={cn(checkColor({ tier }))} />
            Cancel anytime
          </span>
        </div>
      </div>
    </>
  );
};

export default DowngradeCard;
