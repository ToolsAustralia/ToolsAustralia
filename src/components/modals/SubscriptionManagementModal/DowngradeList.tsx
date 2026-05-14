"use client";

import React from "react";
import { ArrowDown } from "lucide-react";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { calculateRenewalEntries } from "@/utils/payment/subscription-entries-calculator";
import { cn } from "@/utils/cn";
import type { DowngradeOption, SubMgmtUser } from "./types";

interface DowngradeListProps {
  user: SubMgmtUser;
  downgrades: DowngradeOption[];
  isLoading: boolean;
  benefitsLoading: boolean;
  onSelectDowngrade: (downgrade: DowngradeOption) => void;
}

/**
 * Renders the "Available Downgrades" list. Each row's accumulated-entry copy
 * uses the renewal calculator (downgrades take effect at the next billing
 * cycle, so it's a renewal grant rather than an immediate top-up).
 */
const DowngradeList: React.FC<DowngradeListProps> = ({
  user,
  downgrades,
  isLoading,
  benefitsLoading,
  onSelectDowngrade,
}) => {
  if (!downgrades || downgrades.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
        <ArrowDown className="w-4 h-4 text-orange-600 dark:text-orange-400" />
        Available Downgrades
      </h4>
      {downgrades.map((downgrade) => {
        const subscriptionWithEntries = user.subscription as
          | { lastMonthAccumulatedEntries?: number }
          | undefined;
        const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
        const downgradeCalculation = calculateRenewalEntries(downgrade.entriesPerMonth, lastMonthAccumulated);
        const downgradeEntries = downgradeCalculation.entriesToGrant;
        const colorScheme = getMembershipSectionColorScheme(downgrade.packageId, true);
        const textClass = colorScheme.enterNowButtonTextClass ?? (colorScheme.textGradientStyle ? "" : "text-white");
        const buttonStyle = colorScheme.enterNowButtonStyle ?? colorScheme.badgeStyle;

        return (
          <div
            key={downgrade.packageId}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-white dark:bg-neutral-800 border-2 border-orange-200 dark:border-orange-800 border-l-4 rounded-lg gap-3 sm:gap-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200"
          >
            <div className="flex-1 w-full sm:w-auto">
              <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
                <div
                  className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: colorScheme.accentHex }}
                ></div>
                <h5 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{downgrade.name}</h5>
                <span className="text-base sm:text-lg font-bold" style={{ color: colorScheme.accentHex }}>
                  ${downgrade.price}/mo
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300 mb-1.5 sm:mb-2">
                {downgrade.description}
              </p>
              <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-4 text-2xs sm:text-xs text-gray-500 dark:text-neutral-400">
                <span className="font-medium">{downgradeEntries} free accumulated entries</span>
                <span>{downgrade.partnerDiscountDays} days partner access</span>
              </div>
            </div>
            <div className={cn("w-full sm:w-auto sm:ml-4 rounded-2xl", colorScheme.glow)}>
              <button
                type="button"
                onClick={() => onSelectDowngrade(downgrade)}
                disabled={isLoading || benefitsLoading}
                className={cn(
                  "font-agency font-black uppercase rounded-2xl px-4 py-2.5 flex items-center justify-center text-xs sm:text-sm transition-all duration-300 transform hover:scale-[1.02] hover:brightness-105",
                  textClass,
                  colorScheme.borderGlow,
                  "membership-enter-cta-animation w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                )}
                style={buttonStyle}
              >
                <span className="relative z-10" style={colorScheme.textGradientStyle ?? undefined}>
                  Schedule Downgrade
                </span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DowngradeList;
