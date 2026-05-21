"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";

export type DateRange = "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw";

interface DateRangeToggleProps {
  selectedRange: DateRange;
  onRangeChange: (range: DateRange) => void;
  onCustomClick?: () => void;
  className?: string;
  collapsed?: boolean;
  displayDate?: string;
  onExpand?: () => void;
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
  collapsed = false,
  displayDate,
  onExpand,
}: DateRangeToggleProps) {
  const ranges: { value: DateRange; label: string; shortLabel: string }[] = [
    { value: "today", label: "Today", shortLabel: "Today" },
    { value: "yesterday", label: "Yesterday", shortLabel: "Yesterday" },
    { value: "current-draw", label: "Current Draw", shortLabel: "Curr Draw" },
    { value: "last-draw", label: "Last Draw", shortLabel: "Last Draw" },
    { value: "all-time", label: "All Time", shortLabel: "All Time" },
    { value: "custom", label: "Custom Range", shortLabel: "Custom" },
  ];

  // Collapsed view - show only active filter with abbreviated date
  if (collapsed && displayDate) {
    return (
      <div
        className={cn("bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-none p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30 flex-shrink-0", className)}
      >
        <button
          onClick={() => {
            if (onExpand) {
              onExpand();
            }
          }}
          className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-none text-2xs sm:text-[12px] font-bold transition-all duration-300 whitespace-nowrap focus:outline-none bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)] flex items-center gap-1 sm:gap-1.5 hover:from-yellow-500 hover:via-amber-600 hover:to-yellow-700"
        >
          <span className="sm:hidden">{displayDate.length > 12 ? displayDate.substring(0, 10) + "..." : displayDate}</span>
          <span className="hidden sm:inline">{displayDate}</span>
          <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        </button>
      </div>
    );
  }

  // Expanded view - show all filter buttons
  return (
    <div
      className={cn("bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-none p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30 flex-shrink-0 max-w-full lg:w-auto", className)}
    >
      <div
        className="overflow-x-auto scrollbar-hide w-full max-w-full"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex items-center gap-1 sm:gap-2 flex-nowrap min-w-max">
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
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-none text-2xs sm:text-[12px] font-bold transition-all duration-300 whitespace-nowrap focus:outline-none flex-shrink-0 ${
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
    </div>
  );
}
