"use client";

import React from "react";

export type WinnerFilterType = "all" | "major" | "mini";

interface WinnerFilterToggleProps {
  selectedFilter: WinnerFilterType;
  onFilterChange: (filter: WinnerFilterType) => void;
  className?: string;
}

/**
 * Winner Filter Toggle Component
 * Matches the premium styling of DateRangeToggle from admin
 */
export default function WinnerFilterToggle({
  selectedFilter,
  onFilterChange,
  className = "",
}: WinnerFilterToggleProps) {
  const filters: { value: WinnerFilterType; label: string; shortLabel: string }[] = [
    { value: "all", label: "All Winners", shortLabel: "All" },  
    { value: "major", label: "Major Draws", shortLabel: "Major Draw" },
    { value: "mini", label: "Mini Draws", shortLabel: "Mini Draw " },
  ];

  return (
    <div
      className={`bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-[15px] p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30 flex-shrink-0 ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-2">
        {filters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-[11px] text-[10px] sm:text-[12px] font-bold transition-all duration-300 whitespace-nowrap focus:outline-none ${
              selectedFilter === filter.value
                ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <span className="sm:hidden">{filter.shortLabel}</span>
            <span className="hidden sm:inline">{filter.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

