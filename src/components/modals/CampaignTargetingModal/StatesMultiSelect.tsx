"use client";

import React, { type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { cn } from "@/utils/cn";

interface StatesMultiSelectProps {
  selected: string[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggleState: (code: string) => void;
  containerRef: RefObject<HTMLDivElement | null>;
}

export default function StatesMultiSelect({
  selected,
  isOpen,
  onToggleOpen,
  onToggleState,
  containerRef,
}: StatesMultiSelectProps) {
  const summary =
    selected.length === 0 ? "States" : selected.length === 1 ? selected[0]! : `${selected.length} states`;

  return (
    <div ref={containerRef} className="relative">
      <span className="text-xs font-medium text-gray-600 dark:text-neutral-400 block mb-1">State / territory</span>
      <button
        type="button"
        onClick={onToggleOpen}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm text-gray-800 dark:text-neutral-100"
      >
        {summary}
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition", isOpen ? "rotate-180" : "")} />
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-1">
          {AUSTRALIAN_STATES.map((s) => (
            <label
              key={s.code}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(s.code)}
                onChange={() => onToggleState(s.code)}
              />
              <span>
                {s.code} — {s.name}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
