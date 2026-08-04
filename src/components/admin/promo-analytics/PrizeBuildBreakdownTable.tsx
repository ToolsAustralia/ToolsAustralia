"use client";

import React, { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatNumber, formatPercentage, formatPercentageOrDash, formatCurrency } from "@/utils/metrics/formatters";
import { getPrizeLabel } from "@/config/prize-summaries";
import type { PrizeBuildMetrics } from "@/types/promo-analytics";
import { cn } from "@/utils/cn";

/**
 * Per-combination prize-build breakdown for ONE landing page.
 *
 * ⚠️ Do NOT render a totals/footer row summing `builders`. These are per-combination uniques:
 * a visitor who landed twice and settled on two different combinations is counted in BOTH rows,
 * so the column deliberately sums ABOVE the page-level visitor count shown in the section
 * header. A footer total would read as a contradiction. (The page-level numbers are rendered by
 * the parent modal as chips, from `PageBuildBreakdown.buildVisitors` / `.builds`.)
 */

type SortableColumn = "builders" | "interactedBuilders" | "signups" | "conversions" | "revenue";

interface PrizeBuildBreakdownTableProps {
  rows: PrizeBuildMetrics[];
  loading?: boolean;
  emptyMessage?: string;
}

/** Fallback display for a slug the prize catalog doesn't know: "makita-kincrome" → "Makita Kincrome". */
function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function PrizeBuildBreakdownTable({
  rows,
  loading = false,
  emptyMessage = "No prize-build data for this period.",
}: PrizeBuildBreakdownTableProps) {
  const [sortColumn, setSortColumn] = useState<SortableColumn>("builders");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    // Copy first — never sort the props array in place.
    const arr = [...rows];
    arr.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
    return arr;
  }, [rows, sortColumn, sortOrder]);

  const handleSort = (col: SortableColumn) => {
    if (sortColumn === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortOrder("desc");
    }
  };

  const getSortIcon = (col: SortableColumn) => {
    if (sortColumn !== col)
      return <ArrowUpDown className="w-3.5 h-3.5 opacity-50 text-gray-500 dark:text-neutral-500 shrink-0" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
    );
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500 dark:text-neutral-400">Loading...</div>;
  }

  if (rows.length === 0) {
    return <div className="p-8 text-center text-gray-500 dark:text-neutral-400">{emptyMessage}</div>;
  }

  const cellPad = "p-1.5 sm:p-2 md:p-3";
  const textSize = "text-xs sm:text-sm";

  return (
    <div className="overflow-x-auto -mx-1 sm:mx-0">
      <table className={cn("w-full min-w-[360px]", textSize)}>
        <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
          <tr>
            <th
              className={cn("text-left", cellPad, "font-semibold text-gray-800 dark:text-neutral-100 min-w-[140px]")}
            >
              Combination
            </th>
            <th
              className={cn("text-right", cellPad, "font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap")}
            >
              <button
                onClick={() => handleSort("builders")}
                className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
              >
                Builders {getSortIcon("builders")}
              </button>
            </th>
            <th
              className={cn("text-right", cellPad, "font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap")}
            >
              <button
                onClick={() => handleSort("interactedBuilders")}
                className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
              >
                Changed {getSortIcon("interactedBuilders")}
              </button>
            </th>
            <th
              className={cn("text-right", cellPad, "font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap")}
            >
              <button
                onClick={() => handleSort("signups")}
                className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
              >
                Signups {getSortIcon("signups")}
              </button>
            </th>
            <th
              className={cn("text-right", cellPad, "font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap")}
            >
              <button
                onClick={() => handleSort("conversions")}
                className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
              >
                Conv {getSortIcon("conversions")}
              </button>
            </th>
            <th
              className={cn("text-right", cellPad, "font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap")}
            >
              <button
                onClick={() => handleSort("revenue")}
                className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
              >
                Rev {getSortIcon("revenue")}
              </button>
            </th>
            <th
              className={cn("hidden md:table-cell text-right", cellPad, "font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap")}
            >
              B→S
            </th>
            <th
              className={cn("hidden md:table-cell text-right", cellPad, "font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap")}
            >
              Conv %
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const label = getPrizeLabel(row.builtPrizeSlug) ?? prettifySlug(row.builtPrizeSlug);
            // Never print "0.0%" off a zero denominator — an em dash says "not measurable".
            const changedShare =
              row.builders === 0
                ? "—"
                : formatPercentage((row.interactedBuilders / row.builders) * 100);
            return (
              <tr
                key={row.builtPrizeSlug}
                className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/60"
              >
                <td
                  className={cn(cellPad, "font-medium text-gray-900 dark:text-white break-words")}
                  title={label}
                >
                  <span className="align-middle">{label}</span>
                  {row.isPageDefault && (
                    <span className="ml-1.5 inline-block px-1.5 sm:px-2 py-0.5 rounded text-2xs sm:text-xs font-medium whitespace-nowrap align-middle bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/50">
                      Page default
                    </span>
                  )}
                </td>
                <td
                  className={cn(cellPad, "text-right font-mono text-gray-900 dark:text-white tabular-nums")}
                >
                  {formatNumber(row.builders)}
                </td>
                <td
                  className={cn(cellPad, "text-right font-mono text-gray-900 dark:text-white tabular-nums")}
                >
                  <div>{formatNumber(row.interactedBuilders)}</div>
                  <div className="text-2xs sm:text-xs font-normal text-gray-500 dark:text-neutral-400">
                    {changedShare}
                  </div>
                </td>
                <td
                  className={cn(cellPad, "text-right font-mono text-gray-900 dark:text-white tabular-nums")}
                >
                  {formatNumber(row.signups)}
                </td>
                <td
                  className={cn(cellPad, "text-right font-mono text-gray-900 dark:text-white tabular-nums")}
                >
                  {formatNumber(row.conversions)}
                </td>
                <td
                  className={cn(cellPad, "text-right font-mono text-gray-900 dark:text-white tabular-nums")}
                >
                  {formatCurrency(row.revenue)}
                </td>
                <td className={cn("hidden md:table-cell", cellPad, "text-right text-gray-600 dark:text-neutral-400 tabular-nums")}>{formatPercentageOrDash(row.builderToSignupRate, row.builders)}</td>
                <td className={cn("hidden md:table-cell", cellPad, "text-right text-gray-600 dark:text-neutral-400 tabular-nums")}>{formatPercentageOrDash(row.overallConversionRate, row.builders)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
