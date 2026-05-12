"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

export type SettingsSection = "profile" | "subscription" | "password" | "payment";

const tabButtonClass = (active: boolean) =>
  `flex-1 rounded-lg border px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-colors ${
    active
      ? "bg-red-600 text-white border-red-600"
      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-500"
  }`;

interface TabSwitcherProps {
  activeTab: SettingsSection;
  onChange: (tab: SettingsSection) => void;
  hasFailed: boolean;
}

const TabSwitcher: React.FC<TabSwitcherProps> = ({ activeTab, onChange, hasFailed }) => {
  return (
    <div className="mb-3 sm:mb-4 flex gap-1 sm:gap-2 flex-wrap">
      <button className={tabButtonClass(activeTab === "profile")} onClick={() => onChange("profile")}>
        <span className="hidden sm:inline">Profile Details</span>
        <span className="sm:hidden">Profile</span>
      </button>
      <button className={tabButtonClass(activeTab === "subscription")} onClick={() => onChange("subscription")}>
        <span className="flex items-center gap-1">
          Subscription
          {hasFailed && (
          <AlertTriangle
            className="w-4 h-4 text-amber-500 animate-pulse"
            strokeWidth={2.5}
            aria-hidden
          />
        )}
        </span>
      </button>
      <button className={tabButtonClass(activeTab === "password")} onClick={() => onChange("password")}>
        Password
      </button>
      <button className={tabButtonClass(activeTab === "payment")} onClick={() => onChange("payment")}>
        <span className="hidden sm:inline">Payment Methods</span>
        <span className="sm:hidden">Payment</span>
      </button>
    </div>
  );
};

export default TabSwitcher;
