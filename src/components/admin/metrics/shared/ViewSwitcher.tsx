"use client";

import React from "react";
import { Table, BarChart3, Columns } from "lucide-react";

export type ViewMode = "table" | "chart" | "side-by-side";

export interface ViewSwitcherProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export function ViewSwitcher({ currentView, onViewChange, className = "" }: ViewSwitcherProps) {
  const views: Array<{ mode: ViewMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { mode: "table", label: "Table", icon: Table },
    { mode: "chart", label: "Chart", icon: BarChart3 },
    { mode: "side-by-side", label: "Compare", icon: Columns },
  ];

  return (
    <div className={`flex items-center gap-2 border border-gray-300 rounded-lg overflow-hidden ${className}`}>
      {views.map(({ mode, label, icon: Icon }) => (
        <button
          key={mode}
          onClick={() => onViewChange(mode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
            currentView === mode
              ? "bg-black text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
          aria-label={`Switch to ${label} view`}
          aria-pressed={currentView === mode}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

