"use client";

import React from "react";
import PromoMultiplierBadge from "@/components/ui/PromoMultiplierBadge";
import type { PromoMultiplier } from "@/types/promo-multiplier";

interface TabSwitcherProps {
  oneTimeSubTab: "one-time" | "membership";
  onSelectOneTime: () => void;
  onSelectMembership: () => void;
  resolvedOneTimeMultiplier: number | null;
  resolvedMembershipMultiplier: number | null;
}

const TabSwitcher: React.FC<TabSwitcherProps> = ({
  oneTimeSubTab,
  onSelectOneTime,
  onSelectMembership,
  resolvedOneTimeMultiplier,
  resolvedMembershipMultiplier,
}) => {
  return (
    <div className="flex justify-center mb-4 sm:mb-6">
      <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[20px] p-[4px] shadow-[0_0_20px_rgba(0,0,0,0.6)] w-full max-w-full sm:max-w-none sm:w-auto">
        <div className="flex flex-row items-center justify-center w-full">
          <button
            onClick={onSelectOneTime}
            className={`flex-1 px-4 py-2.5 rounded-[16px] font-bold text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
              oneTimeSubTab === "one-time"
                ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
            }`}
          >
            One-Time
            {/* Multiplier Badge - Upper right */}
            {resolvedOneTimeMultiplier !== null && resolvedOneTimeMultiplier > 1 && oneTimeSubTab === "one-time" && (
              <PromoMultiplierBadge multiplier={resolvedOneTimeMultiplier as PromoMultiplier} />
            )}
          </button>
          <button
            onClick={onSelectMembership}
            className={`flex-1 px-4 py-2.5 rounded-[16px] font-bold text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap focus:outline-none relative ${
              oneTimeSubTab === "membership"
                ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
            }`}
          >
            Membership Packs
            {/* Multiplier Badge - Upper right */}
            {resolvedMembershipMultiplier != null && resolvedMembershipMultiplier > 1 && oneTimeSubTab === "membership" && (
              <PromoMultiplierBadge multiplier={resolvedMembershipMultiplier as PromoMultiplier} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TabSwitcher;
