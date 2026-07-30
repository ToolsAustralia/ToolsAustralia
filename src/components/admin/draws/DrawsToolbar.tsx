"use client";

import React, { useEffect, useRef } from "react";
import { Search, Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/utils/cn";
import type { DrawFilter, DrawToolbarAction } from "./types";

/**
 * Search + filter dropdowns + actions. Shared by Mini Draws, Draw Results and
 * Upcoming Draws.
 *
 * The search box is a REAL input bound to a filter — three pages have one and
 * they must filter live and fall through to the empty state.
 *
 * Only one dropdown is open at a time (the container owns `openFilterKey`), and
 * Escape closes the dropdown BEFORE it closes any modal or drawer — hence the
 * stopPropagation on the handled keydown.
 */
export default function DrawsToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search draws…",
  filters = [],
  openFilterKey,
  onToggleFilter,
  onPickFilter,
  actions = [],
  children,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: DrawFilter[];
  openFilterKey: string | null;
  onToggleFilter: (key: string | null) => void;
  onPickFilter: (key: string, value: string) => void;
  actions?: DrawToolbarAction[];
  /** Extra controls rendered between the filters and the actions (e.g. status chips). */
  children?: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the open dropdown on outside click and on Escape.
  useEffect(() => {
    if (!openFilterKey) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onToggleFilter(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape closes the topmost layer: dropdown first, so stop this event
      // reaching a modal/drawer handler further up.
      event.stopPropagation();
      onToggleFilter(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    // Capture phase so we win the race against any ancestor Escape handler.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [openFilterKey, onToggleFilter]);

  return (
    <div
      ref={rootRef}
      // Below the breakpoint the search takes the full width, so the filters
      // would wrap to their own line each. Keeping them on ONE horizontally
      // scrollable row costs no vertical space on a phone; above it everything
      // fits inline and wrapping is fine.
      className="flex flex-col gap-[10px] rounded-[var(--m-radius)] border border-[var(--line)] bg-[var(--panel)] p-[10px] shadow-[var(--shadow)] draws:flex-row draws:flex-wrap draws:items-center"
    >
      {/* Search — a real input, not a styled div. */}
      <div
        className={cn(
          "flex items-center gap-[8px] rounded-[8px] border border-[var(--line)] bg-[var(--input-bg)] px-[10px]",
          // `shrink-0` + explicit height, and `flex-1` ONLY at draws:. The toolbar
          // is flex-col on mobile, where `flex: 1 1 0%` would apply to HEIGHT and
          // collapse the 44px row to nothing.
          "h-[var(--m-btn-h)] w-full shrink-0 draws:w-auto draws:min-w-[var(--m-searchMin)] draws:max-w-[var(--m-searchMax)] draws:flex-1"
        )}
      >
        <Search className="h-[15px] w-[15px] shrink-0 text-[var(--text3)]" aria-hidden />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          // align-self stretch: the row is the 44px tap target on mobile even
          // though the input's own content box measures less.
          className="w-full self-stretch bg-transparent text-[12.5px] text-[var(--text)] placeholder:text-[var(--text3)] outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="shrink-0 rounded-[5px] p-[2px] text-[var(--text3)] hover:text-[var(--text)]"
          >
            <X className="h-[14px] w-[14px]" />
          </button>
        )}
      </div>

      {/* One horizontally scrollable row on mobile (the search takes full width
          there, so wrapping would give each filter its own line); inline on desktop.
          The scroll is dropped WHILE A MENU IS OPEN: `overflow-x: auto` forces
          `overflow-y` to `auto` as well, which would clip the absolutely-positioned
          dropdown. Only one menu opens at a time and you don't need to scroll the
          chips while reading it, so trading the scroll for a visible menu is free. */}
      <div
        className={cn(
          "flex w-full items-center gap-[8px] [scrollbar-width:none] draws:w-auto draws:flex-wrap [&::-webkit-scrollbar]:hidden",
          openFilterKey ? "overflow-visible" : "overflow-x-auto"
        )}
      >
      {filters.map((filter) => {
        const isOpen = openFilterKey === filter.key;
        return (
          <div key={filter.key} className="relative shrink-0">
            <button
              type="button"
              onClick={() => onToggleFilter(isOpen ? null : filter.key)}
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              className={cn(
                "flex h-[var(--m-btn-sm)] items-center gap-[8px] whitespace-nowrap rounded-[8px] border px-[10px]",
                "bg-[var(--input-bg)] text-[12.5px] font-medium text-[var(--text)]",
                isOpen ? "border-[var(--accent)]" : "border-[var(--line)]"
              )}
            >
              <span className="text-[var(--text3)]">{filter.label}</span>
              <span>{filter.value}</span>
              <ChevronDown className={cn("h-[14px] w-[14px] text-[var(--text3)]", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
              <div
                role="listbox"
                className="absolute left-0 top-[calc(100%+6px)] z-30 w-[196px] rounded-[9px] border border-[var(--line)] bg-[var(--panel)] p-[5px] shadow-[var(--shadow-dropdown)]"
              >
                {filter.options.map((option) => {
                  const selected = option === filter.value;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onPickFilter(filter.key, option)}
                      className={cn(
                        "flex w-full items-center gap-[8px] whitespace-nowrap rounded-[7px] px-[10px] py-[8px] text-left text-[12.5px] font-medium",
                        selected ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text)] hover:bg-[var(--hover)]"
                      )}
                    >
                      <Check className={cn("h-[14px] w-[14px] shrink-0", !selected && "invisible")} />
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      </div>

      {children}

      {actions.length > 0 && (
        // Mobile: the primary takes the full row and secondaries collapse to
        // icon-only squares beside it — a right-aligned cluster of labelled
        // buttons wastes a whole row on a phone. Desktop keeps them inline right.
        <div className="flex w-full items-center gap-[8px] draws:ml-auto draws:w-auto draws:flex-wrap">
          {actions.map((action) => {
            const Icon = action.icon;
            const isPrimary = action.variant !== "secondary";
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                // Secondaries keep an accessible name when the label is hidden.
                aria-label={isPrimary ? undefined : action.label}
                title={isPrimary ? undefined : action.label}
                className={cn(
                  "flex h-[var(--m-btn-h)] items-center justify-center gap-[7px] whitespace-nowrap rounded-[9px] text-[12.5px] font-semibold",
                  isPrimary
                    ? "flex-1 bg-[var(--accent)] px-[14px] text-white hover:opacity-90 draws:flex-none"
                    : cn(
                        "shrink-0 border border-[var(--line)] bg-[var(--panel)] text-[var(--text)]",
                        "hover:border-[var(--accent-line)] hover:text-[var(--accent)]",
                        // Icon-only square on mobile; labelled from draws: up.
                        Icon ? "w-[var(--m-btn-h)] draws:w-auto draws:px-[14px]" : "px-[14px]"
                      )
                )}
              >
                {Icon && <Icon className="h-[15px] w-[15px] shrink-0" />}
                <span className={cn(!isPrimary && Icon && "hidden draws:inline")}>{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
