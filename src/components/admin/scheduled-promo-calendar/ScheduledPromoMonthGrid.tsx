"use client";

import React from "react";
import type { ScheduledPromoMultiplier } from "@/types/admin";
import type {
  CalendarPaintValue,
  ScheduledPromoCalendarCell,
} from "@/utils/promo/scheduled-promo-calendar";

export type BrushMode = ScheduledPromoMultiplier | "clear";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function cellDisplay(multiplier: CalendarPaintValue): string {
  if (multiplier === null) return "—";
  return `${multiplier}x`;
}

export type ScheduledPromoMonthGridProps = {
  weekRows: (ScheduledPromoCalendarCell | null)[][];
  paintByKey: ReadonlyMap<string, CalendarPaintValue>;
  onCellPointerDown: (dateKey: string) => void;
  onCellPointerEnter: (dateKey: string) => void;
};

/**
 * Read-only month layout (Mon–Sun) with pointer painting driven by parent.
 */
export function ScheduledPromoMonthGrid({
  weekRows,
  paintByKey,
  onCellPointerDown,
  onCellPointerEnter,
}: ScheduledPromoMonthGridProps) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {weekRows.map((row, ri) => (
            <div key={ri} className="grid grid-cols-7 gap-1">
              {row.map((cell, ci) => {
                if (!cell) {
                  return <div key={`empty-${ri}-${ci}`} className="aspect-square min-h-[2.5rem] sm:min-h-[2.75rem]" />;
                }
                const mult = paintByKey.get(cell.dateKey) ?? null;
                const label = cellDisplay(mult);
                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                      onCellPointerDown(cell.dateKey);
                    }}
                    onPointerEnter={() => onCellPointerEnter(cell.dateKey)}
                    className={`aspect-square min-h-[2.5rem] sm:min-h-[2.75rem] rounded-lg border text-xs sm:text-sm font-semibold transition-colors touch-manipulation
                      ${mult === null ? "bg-gray-50 border-gray-200 text-gray-400" : "bg-red-50 border-red-200 text-red-800"}
                      active:scale-[0.98] hover:brightness-95`}
                    aria-label={`${cell.dateKey}, ${mult === null ? "no scheduled promo" : `${mult} times entries`}`}
                  >
                    <span className="block text-[0.65rem] sm:text-xs text-gray-500 font-medium leading-tight">{cell.day}</span>
                    <span className="block leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
