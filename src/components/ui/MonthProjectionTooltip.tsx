"use client";

import React from "react";

export interface MonthProjectionTooltipProps {
  /** Whether the tooltip is visible */
  isVisible: boolean;
  /** Position of the tooltip (top and left in pixels relative to container) */
  position: { top: number; left: number } | null;
  /** Placement: "top" = above anchor (avoids overlap), "right" = to the right (default) */
  placement?: "top" | "right";
  /** Current accumulated entries */
  current: number;
  /** Next month's projected entries */
  nextMonth: number;
  /** Month 3's projected entries */
  month3: number;
  /** Promo multiplier if active (optional) */
  promoMultiplier?: number;
  /** Custom className for additional styling */
  className?: string;
}

/**
 * MonthProjectionTooltip Component
 * 
 * A reusable tooltip component for displaying accumulation projection
 * showing current, next month, and month 3 entries.
 * 
 * @example
 * ```tsx
 * <MonthProjectionTooltip
 *   isVisible={isHovered}
 *   position={{ top: 100, left: 200 }}
 *   current={150}
 *   nextMonth={165}
 *   month3={180}
 *   promoMultiplier={10}
 * />
 * ```
 */
export default function MonthProjectionTooltip({
  isVisible,
  position,
  placement = "right",
  current,
  nextMonth,
  month3,
  promoMultiplier,
  className = "",
}: MonthProjectionTooltipProps) {
  if (!isVisible || !position) return null;

  const transform =
    placement === "top"
      ? "translate(-50%, -100%)"
      : "translateY(-50%)";

  return (
    <div
      className={`absolute px-3 py-2 sm:px-4 sm:py-3 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white text-2xs sm:text-sm rounded-xl shadow-2xl border border-slate-500/50 pointer-events-none w-[180px] sm:w-auto sm:min-w-[220px] backdrop-blur-sm ${className}`}
      style={{
        zIndex: 10000,
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform,
      }}
    >
      <div className="font-bold mb-2 sm:mb-3 text-[12px] sm:text-base bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
        Entry Accumulation
      </div>
      
      <div className="space-y-2 sm:space-y-2.5">
        {/* Current */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-700/50">
          <span className="text-gray-300 text-2xs sm:text-xs font-medium">Current</span>
          <span className="text-white font-bold text-2xs sm:text-sm tabular-nums">
            {current.toLocaleString()}
          </span>
        </div>
        
        {/* Next Month */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-700/50">
          <span className="text-blue-300 text-2xs sm:text-xs font-medium">Next Month</span>
          <span className="text-blue-400 font-bold text-2xs sm:text-sm tabular-nums">
            {nextMonth.toLocaleString()}
          </span>
        </div>
        
        {/* Month 3 */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-green-300 text-2xs sm:text-xs font-medium">Month 3</span>
          <span className="text-green-400 font-bold text-2xs sm:text-sm tabular-nums">
            {month3.toLocaleString()}
          </span>
        </div>
      </div>
      
      {promoMultiplier && promoMultiplier > 1 && (
        <div className="mt-2 sm:mt-2.5 pt-2 sm:pt-2.5 border-t border-slate-700/50">
          <div className="flex items-center gap-1.5">
            <span className="text-yellow-400 text-3xs sm:text-xs font-semibold">
              ⚡ {promoMultiplier}x Promo Active
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

