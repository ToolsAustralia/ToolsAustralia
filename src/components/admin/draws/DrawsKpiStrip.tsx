"use client";

import React from "react";
import { cn } from "@/utils/cn";
import type { DrawKpi } from "./types";

/**
 * The KPI strip: 4 cells desktop / 2 mobile, 1px dividers, NO card gaps —
 * it reads as one panel, not four cards.
 *
 * No delta chips. The design shows "+9%" / "+7%", but the history API has no
 * prior-period comparison and inventing one would be a fabricated figure on an
 * ops dashboard (plan decision 2).
 */
export default function DrawsKpiStrip({ kpis, isLoading }: { kpis: DrawKpi[]; isLoading?: boolean }) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-[var(--m-radius)] border border-[var(--line)]",
        "bg-[var(--panel)] shadow-[var(--shadow)]",
        "grid-cols-2 draws:grid-cols-4"
      )}
    >
      {kpis.map((kpi, i) => (
        <div
          key={kpi.label}
          className={cn(
            "px-[14px] py-[13px] min-w-0",
            // Dividers between cells, not around the strip. The nth-child rules
            // differ per breakpoint (2-up vs 4-up), so drive them off the index.
            i % 2 === 1 && "border-l border-[var(--line)] draws:border-l",
            i >= 2 && "border-t border-[var(--line)] draws:border-t-0",
            i % 4 !== 0 && "draws:border-l draws:border-[var(--line)]"
          )}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--text3)] truncate">
            {kpi.label}
          </div>
          {isLoading ? (
            <div className="admin-draws-skeleton mt-[6px] h-[23px] w-2/3 rounded-[5px]" />
          ) : (
            <div
              data-figure
              className="mt-[4px] font-poppins text-[20px] font-bold leading-[1.15] tracking-[-.02em] text-[var(--text)] truncate"
            >
              {kpi.value}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
