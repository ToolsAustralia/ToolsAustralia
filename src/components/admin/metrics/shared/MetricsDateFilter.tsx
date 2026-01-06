"use client";

import React from "react";
import { Calendar } from "lucide-react";
import { WEBSITE_LAUNCH_DATE_AEST } from "@/utils/common/timezone";

export type MetricsDateFilterMode = "month" | "custom" | "all-time";

/**
 * Website launch date: November 27, 2024 at 8pm AEDT/AEST
 * Re-exported for convenience
 */
export const WEBSITE_LAUNCH_DATE = WEBSITE_LAUNCH_DATE_AEST;

interface MetricsDateFilterProps {
  filterMode: MetricsDateFilterMode;
  onFilterModeChange: (mode: MetricsDateFilterMode) => void;
  onCustomClick?: () => void;
  className?: string;
  displayDate?: string;
}

/**
 * Metrics Date Filter Component
 * Includes Month, Custom, and All Time options
 * Matches DateRangeToggle design (dark gradient background, yellow/amber selected state)
 */
export function MetricsDateFilter({
  filterMode,
  onFilterModeChange,
  onCustomClick,
  className = "",
  displayDate,
}: MetricsDateFilterProps) {
  const modes: Array<{ value: MetricsDateFilterMode; label: string; shortLabel: string }> = [
    { value: "month", label: "Month", shortLabel: "Month" },
    { value: "all-time", label: "All Time", shortLabel: "All Time" },
    { value: "custom", label: "Custom", shortLabel: "Custom" },
  ];

  return (
    <div
      className={`bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[15px] p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30 flex-shrink-0 ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-2">
        {modes.map((mode) => (
          <button
            key={mode.value}
            onClick={() => {
              if (mode.value === "custom" && onCustomClick) {
                onCustomClick();
              } else {
                onFilterModeChange(mode.value);
              }
            }}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-[11px] text-[10px] sm:text-[12px] font-bold transition-all duration-300 whitespace-nowrap focus:outline-none ${
              filterMode === mode.value
                ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <span className="sm:hidden">{mode.shortLabel}</span>
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

