"use client";

import React from "react";
import { Zap } from "lucide-react";
import { usePromoTheme } from "@/stores/usePromoThemeStore";

/** Solid promo primary (e.g. Milwaukee red) — no gradient / glow, matches landing "pure brand" treatment */
const SpecialPackages50OffText: React.FC = () => {
  const theme = usePromoTheme();
  return (
    <span className="font-bold" style={{ color: theme.primary }}>
      50% off{" "}
    </span>
  );
};

interface PromoBannerProps {
  firstName?: string;
}

/**
 * Top promo banner shown when no package is selected:
 * "CONGRATULATIONS {NAME}!" headline, "50% off today" subline, then the
 * "Special Packages Activated" divider with animated lines and zap icon.
 */
const PromoBanner: React.FC<PromoBannerProps> = ({ firstName }) => {
  return (
    <div className="bg-white text-gray-800 dark:bg-neutral-900 dark:text-neutral-100 p-2 sm:p-3 text-center border-b border-gray-200 dark:border-neutral-800">
      <h2 className="text-green-600 dark:text-emerald-400 text-xs sm:text-sm font-bold mb-1">
        CONGRATULATIONS{firstName ? ` ${firstName.toUpperCase()}` : ""}!
      </h2>
      <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300 mb-3">
        you are entitled to{" "}
        <SpecialPackages50OffText />
        today
      </p>

      {/* Divider-style: ----- icon special packages activated ----- */}
      <div className="flex w-full items-center justify-center gap-2 sm:gap-3 text-gray-400 dark:text-neutral-500">
        <span
          className="h-px min-w-[40px] flex-1 origin-right animate-[lineExpand_0.7s_ease-out_forwards] bg-gradient-to-r from-transparent via-gray-300 to-gray-400 dark:from-transparent dark:via-neutral-600 dark:to-neutral-500"
          style={{ animationDelay: "0.1s" }}
        />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 animate-[fadeSlideUp_0.5s_ease-out_forwards] opacity-0" style={{ animationDelay: "0.35s" }}>
          <Zap className="w-3.5 h-3.5 shrink-0 text-amber-500 sm:w-4 sm:h-4 animate-[pulse_2s_ease-in-out_infinite]" style={{ animationDelay: "1s" }} />
          <span className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400 sm:text-xs">
            Special Packages Activated
          </span>
        </div>
        <span
          className="h-px min-w-[40px] flex-1 origin-left animate-[lineExpand_0.7s_ease-out_forwards] bg-gradient-to-r from-gray-400 via-gray-300 to-transparent dark:from-neutral-500 dark:via-neutral-600 dark:to-transparent"
          style={{ animationDelay: "0.1s" }}
        />
      </div>
    </div>
  );
};

export default PromoBanner;
