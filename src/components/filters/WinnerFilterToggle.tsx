"use client";



import type { CSSProperties } from "react";

import { usePromoTheme } from "@/stores/usePromoThemeStore";



export type WinnerFilterType = "all" | "major" | "mini";



interface WinnerFilterToggleProps {

  selectedFilter: WinnerFilterType;

  onFilterChange: (filter: WinnerFilterType) => void;

  className?: string;

}



function getContrastText(hex: string) {

  const clean = hex.replace("#", "");

  const r = parseInt(clean.slice(0, 2), 16);

  const g = parseInt(clean.slice(2, 4), 16);

  const b = parseInt(clean.slice(4, 6), 16);

  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  return luminance > 0.62 ? "#111827" : "#ffffff";

}



/**

 * Winner filter control — aligned with promo / winners surfaces (theme-aware).

 */

export default function WinnerFilterToggle({

  selectedFilter,

  onFilterChange,

  className = "",

}: WinnerFilterToggleProps) {

  const theme = usePromoTheme();

  const selectedLabelColor = getContrastText(theme.primary);



  const filters: { value: WinnerFilterType; label: string; shortLabel: string }[] = [

    { value: "all", label: "All Winners", shortLabel: "All" },

    { value: "major", label: "Major Draws", shortLabel: "Major" },

    { value: "mini", label: "Mini Draws", shortLabel: "Mini" },

  ];



  const vars = {

    ["--filter-ring" as string]: theme.primaryLight,

  } as CSSProperties;



  return (

    <div

      className={`inline-flex rounded-2xl border bg-slate-950/95 p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.22)] backdrop-blur dark:bg-slate-950 ${className}`}

      style={{ borderColor: theme.borderRgba, ...vars }}

      role="tablist"

      aria-label="Filter winners"

    >

      <div className="flex items-center gap-1">

        {filters.map((filter) => {

          const isSelected = selectedFilter === filter.value;

          return (

            <button

              key={filter.value}

              type="button"

              onClick={() => onFilterChange(filter.value)}

              role="tab"

              aria-selected={isSelected}

              className={`min-w-[72px] rounded-xl px-3 py-2 text-xs font-semibold tracking-[0.08em] whitespace-nowrap transition-[transform,box-shadow,background-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--filter-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:min-w-[120px] sm:px-4 ${

                isSelected

                  ? "shadow-[0_12px_28px_rgba(0,0,0,0.35)]"

                  : "text-slate-300 hover:bg-slate-800/95 hover:text-white"

              }`}

              style={

                isSelected

                  ? { background: theme.gradient, color: selectedLabelColor }

                  : undefined

              }

            >

              <span className="sm:hidden">{filter.shortLabel}</span>

              <span className="hidden sm:inline">{filter.label}</span>

            </button>

          );

        })}

      </div>

    </div>

  );

}


