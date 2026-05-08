"use client";

import React from "react";

export type ComparisonMode = "month" | "major-draw";

interface ComparisonModeToggleProps {
  mode: ComparisonMode;
  onModeChange: (mode: ComparisonMode) => void;
  className?: string;
}

/**
 * Toggle component for switching between month and major draw comparison modes
 * Matches DateRangeToggle design (dark gradient background, yellow/amber selected state)
 */
export function ComparisonModeToggle({
  mode,
  onModeChange,
  className = "",
}: ComparisonModeToggleProps) {
  const modes: Array<{ value: ComparisonMode; label: string; shortLabel: string }> = [
    { value: "month", label: "Monthly", shortLabel: "Monthly" },
    { value: "major-draw", label: "Draws", shortLabel: "Draws" },
  ];

  return (
    <div
      className={`bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-none p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30 flex-shrink-0 ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-2">
        {modes.map((m) => (
          <button
            key={m.value}
            onClick={() => onModeChange(m.value)}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-none text-2xs sm:text-[12px] font-bold transition-all duration-300 whitespace-nowrap focus:outline-none ${
              mode === m.value
                ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <span className="sm:hidden">{m.shortLabel}</span>
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

