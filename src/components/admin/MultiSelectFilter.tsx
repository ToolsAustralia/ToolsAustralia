"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export type MultiSelectOption = {
  value: string;
  label: string;
  /** Optional grouping label rendered as a non-selectable separator above the option. */
  group?: string;
};

interface Props {
  label: string;
  options: ReadonlyArray<MultiSelectOption>;
  selected: string[];
  onChange: (next: string[]) => void;
  /** Placeholder when nothing is selected. */
  placeholder?: string;
  className?: string;
}

/**
 * Popover-style multi-select. Click the trigger button to open a panel of
 * checkbox rows; click outside to close. Selected values rendered as a
 * count on the trigger (or the placeholder if 0). Used by the admin
 * Blocked Transactions filters for both eligibility and decline-code lists.
 */
export default function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  placeholder = "Any",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const triggerText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  let prevGroup: string | undefined;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-neutral-300">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
        aria-expanded={open}
      >
        <span className="truncate">{triggerText}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 dark:text-neutral-500" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            const showGroup = opt.group && opt.group !== prevGroup;
            prevGroup = opt.group;
            return (
              <React.Fragment key={opt.value}>
                {showGroup && (
                  <div className="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-gray-400 dark:text-neutral-500">
                    {opt.group}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="h-4 w-4 text-red-600 dark:text-red-400" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
