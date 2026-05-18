"use client";

import React from "react";
import { ArrowUp } from "lucide-react";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { calculateUpgradeEntries } from "@/utils/payment/subscription-entries-calculator";
import { getPartnerAccessDurationLabel } from "@/utils/partner-discounts/partner-access-duration";
import { cn } from "@/utils/cn";
import type { SubMgmtUser, UpgradeOption } from "./types";

interface UpgradeListProps {
  user: SubMgmtUser;
  upgrades: UpgradeOption[];
  membershipPromoMultiplier: number;
  isLoading: boolean;
  benefitsLoading: boolean;
  onSelectUpgrade: (upgrade: UpgradeOption) => void;
}

/**
 * Renders the "Available Upgrades" list with per-row entry projections and
 * themed CTA buttons. Selecting a row delegates to the orchestrator which
 * opens the themed UpgradeConfirmModal -> StripePaymentModal flow.
 */
const UpgradeList: React.FC<UpgradeListProps> = ({
  user,
  upgrades,
  membershipPromoMultiplier,
  isLoading,
  benefitsLoading,
  onSelectUpgrade,
}) => {
  if (!upgrades || upgrades.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
        <ArrowUp className="w-4 h-4 text-green-600" />
        Available Upgrades
      </h4>
      {upgrades.map((upgrade) => {
        const subscriptionWithEntries = user.subscription as
          | { lastMonthAccumulatedEntries?: number }
          | undefined;
        const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
        const upgradeCalculation = calculateUpgradeEntries(
          upgrade.entriesPerMonth,
          lastMonthAccumulated,
          membershipPromoMultiplier
        );
        const totalEntriesAfterUpgrade = upgradeCalculation.newLastMonthAccumulatedEntries;
        const upgradeColorScheme = getMembershipSectionColorScheme(upgrade.packageId, true);
        const upgradeTextClass =
          upgradeColorScheme.enterNowButtonTextClass ??
          (upgradeColorScheme.textGradientStyle ? "" : "text-white");
        const upgradeButtonStyle = (upgradeColorScheme.enterNowButtonStyle ??
          upgradeColorScheme.badgeStyle) as React.CSSProperties;

        return (
          <div
            key={upgrade.packageId}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-white dark:bg-neutral-800 border-2 border-green-200 dark:border-green-800 border-l-4 rounded-lg gap-3 sm:gap-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200"
          >
            <div className="flex-1 w-full sm:w-auto">
              <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full flex-shrink-0 shadow-sm"></div>
                <h5 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{upgrade.name}</h5>
                <span className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400">
                  ${upgrade.price}/mo
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300 mb-1.5 sm:mb-2">
                {upgrade.description}
              </p>
              <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-4 text-2xs sm:text-xs text-gray-500 dark:text-neutral-400">
                <span className="font-medium">{totalEntriesAfterUpgrade} free accumulated entries</span>
                <span>{getPartnerAccessDurationLabel({ isSubscription: true })!.long}</span>
              </div>
            </div>
            <div className={cn("w-full sm:w-auto sm:ml-4 rounded-2xl", upgradeColorScheme.glow)}>
              <button
                type="button"
                onClick={() => onSelectUpgrade(upgrade)}
                disabled={isLoading || benefitsLoading}
                className={cn(
                  "font-agency font-black uppercase rounded-2xl px-4 py-2.5 flex items-center justify-center text-xs sm:text-sm transition-all duration-300 transform hover:scale-[1.02] hover:brightness-105",
                  upgradeTextClass,
                  upgradeColorScheme.borderGlow,
                  "membership-enter-cta-animation w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                )}
                style={upgradeButtonStyle}
              >
                <span className="relative z-10" style={upgradeColorScheme.textGradientStyle ?? undefined}>
                  Upgrade Now
                </span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default UpgradeList;
