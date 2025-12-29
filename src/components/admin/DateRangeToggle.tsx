"use client";

import React from "react";

export type DateRange = "today" | "yesterday" | "all-time" | "custom";

interface DateRangeToggleProps {
  selectedRange: DateRange;
  onRangeChange: (range: DateRange) => void;
  onCustomClick?: () => void;
  className?: string;
}

/**
 * Date Range Toggle Component
 * Inspired by MembershipPackagesChart toggle design
 * Provides Today, Yesterday, All Time, and Custom date range options
 */
export default function DateRangeToggle({
  selectedRange,
  onRangeChange,
  onCustomClick,
  className = "",
}: DateRangeToggleProps) {
  const ranges: { value: DateRange; label: string; shortLabel: string }[] = [
    { value: "today", label: "Today", shortLabel: "Today" },
    { value: "yesterday", label: "Yesterday", shortLabel: "Yesterday" },
    { value: "all-time", label: "All Time", shortLabel: "All Time" },
    { value: "custom", label: "Custom Range", shortLabel: "Custom" },
  ];

  return (
    <div
      className={`bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[15px] p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30 flex-shrink-0 ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-2">
        {ranges.map((range) => (
          <button
            key={range.value}
            onClick={() => {
              if (range.value === "custom" && onCustomClick) {
                onCustomClick();
              } else {
                onRangeChange(range.value);
              }
            }}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-[11px] text-[10px] sm:text-[12px] font-bold transition-all duration-300 whitespace-nowrap focus:outline-none ${
              selectedRange === range.value
                ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <span className="sm:hidden">{range.shortLabel}</span>
            <span className="hidden sm:inline">{range.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
