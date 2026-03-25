"use client";

import React from "react";
import { Table, BarChart3, Columns } from "lucide-react";

export type ViewMode = "table" | "chart" | "side-by-side";

export interface ViewSwitcherProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

/**
 * View Switcher Component
 * Matches DateRangeToggle design (dark gradient background, yellow/amber selected state)
 */
export function ViewSwitcher({ currentView, onViewChange, className = "" }: ViewSwitcherProps) {
  const views: Array<{ mode: ViewMode; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }> = [
    { mode: "table", label: "Table", shortLabel: "Table", icon: Table },
    { mode: "chart", label: "Chart", shortLabel: "Chart", icon: BarChart3 },
    { mode: "side-by-side", label: "Compare", shortLabel: "Compare", icon: Columns },
  ];

  return (
    <div
      className={`bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-none p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30 flex-shrink-0 ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-2">
        {views.map(({ mode, label, shortLabel, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => onViewChange(mode)}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-none text-[10px] sm:text-[12px] font-bold transition-all duration-300 whitespace-nowrap focus:outline-none flex items-center gap-1 sm:gap-1.5 ${
              currentView === mode
                ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
            aria-label={`Switch to ${label} view`}
            aria-pressed={currentView === mode}
          >
            <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
