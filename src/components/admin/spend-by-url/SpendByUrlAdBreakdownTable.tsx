"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search, ChevronDown, ChevronUp } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import type { SpendByUrlDetailRow } from "@/hooks/queries/useSpendByUrlAnalytics";
import {
  filterSpendByUrlDetailRows,
  groupAdsByFormatForDisplay,
  rollupSpendByUrlDetailRows,
  sortSpendByUrlDetailRows,
  spendByUrlDetailRowsFingerprint,
  type SpendByUrlAdSortColumn,
  type SpendByUrlAdSortDir,
} from "@/utils/admin/spendByUrlAdBreakdown";
import { cn } from "@/utils/cn";

const COL_SPAN = 8;

function formatAud(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNum(n: number) {
  return new Intl.NumberFormat("en-AU").format(n);
}

export interface SpendByUrlAdBreakdownTableProps {
  rows: SpendByUrlDetailRow[];
  /** When true, shows search field (debounced). Default false for inline expand rows. */
  showSearch?: boolean;
  searchPlaceholder?: string;
  density?: "compact" | "comfortable";
  ariaLabel?: string;
  className?: string;
}

export default function SpendByUrlAdBreakdownTable({
  rows,
  showSearch = false,
  searchPlaceholder = "Search by ad id or name…",
  density = "compact",
  ariaLabel = "Ad performance breakdown",
  className = "",
}: SpendByUrlAdBreakdownTableProps) {
  const [sort, setSort] = useState<{ key: SpendByUrlAdSortColumn; dir: SpendByUrlAdSortDir }>({
    key: "spend",
    dir: "desc",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [columnsExpanded, setColumnsExpanded] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const rowsFingerprint = useMemo(() => spendByUrlDetailRowsFingerprint(rows), [rows]);

  useEffect(() => {
    setSort({ key: "spend", dir: "desc" });
    setSearchQuery("");
    setColumnsExpanded(false);
  }, [rowsFingerprint]);

  const processedRows = useMemo(() => {
    const q = showSearch ? debouncedSearch : "";
    const filtered = filterSpendByUrlDetailRows(rows, q);
    return sortSpendByUrlDetailRows(filtered, sort.key, sort.dir);
  }, [rows, showSearch, debouncedSearch, sort.key, sort.dir]);

  const groups = useMemo(() => groupAdsByFormatForDisplay(processedRows), [processedRows]);

  const rollupByFormat = useMemo(() => {
    const m = new Map<
      SpendByUrlDetailRow["adFormat"],
      ReturnType<typeof rollupSpendByUrlDetailRows>
    >();
    for (const g of groups) {
      m.set(g.format, rollupSpendByUrlDetailRows(g.rows));
    }
    return m;
  }, [groups]);

  const onSortColumn = (column: SpendByUrlAdSortColumn) => {
    setSort((prev) =>
      prev.key === column
        ? { key: column, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key: column, dir: "desc" }
    );
  };

  const SortHeader = ({
    column,
    align,
    className: thClass,
    children,
  }: {
    column: SpendByUrlAdSortColumn;
    align: "left" | "right";
    className?: string;
    children: React.ReactNode;
  }) => {
    const active = sort.key === column;
    return (
      <th
        className={thClass}
        aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          onClick={() => onSortColumn(column)}
          className={`inline-flex w-full items-center gap-0.5 sm:gap-1 font-semibold text-inherit hover:opacity-90 -my-0.5 py-0.5 rounded ${
            align === "right" ? "justify-end" : "justify-start text-left"
          }`}
        >
          <span className="min-w-0">{children}</span>
          {active ? (
            sort.dir === "desc" ? (
              <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 opacity-80" aria-hidden />
            ) : (
              <ArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 opacity-80" aria-hidden />
            )
          ) : (
            <span className="inline-block w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" aria-hidden />
          )}
        </button>
      </th>
    );
  };

  const cellPad =
    density === "comfortable"
      ? "py-1.5 px-1 sm:py-2 sm:px-2"
      : "py-1 px-0.5 sm:py-1.5 sm:px-1";
  const textSize =
    density === "comfortable" ? "text-xs sm:text-sm" : "text-2xs sm:text-xs";
  const theadBg = "bg-slate-50 dark:bg-neutral-800/95";
  const sectionBg = "bg-slate-200/80 dark:bg-neutral-800/60";

  const moreColsHidden = !columnsExpanded;

  if (rows.length === 0) {
    return (
      <p className={cn("text-gray-500 dark:text-neutral-400", textSize)}>No ads in this breakdown.</p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {showSearch && (
        <div className="relative max-w-md">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500"
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
            aria-label="Search ads"
          />
        </div>
      )}

      <div className="flex justify-end sm:hidden">
        <button
          type="button"
          onClick={() => setColumnsExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-2xs font-medium text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white"
        >
          {columnsExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" aria-hidden />
              Show fewer columns
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" aria-hidden />
              Show more columns
            </>
          )}
        </button>
      </div>

      <div
        className="-mx-1 sm:mx-0 w-full min-w-0 overflow-x-auto brand-scrollbar"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <table
          className={cn("w-full min-w-[260px] sm:min-w-[640px]", textSize, "border-collapse")}
          aria-label={ariaLabel}
        >
          <thead>
            <tr
              className={cn("border-b border-slate-200 text-gray-600 dark:border-neutral-600 dark:text-neutral-300", theadBg)}
            >
              <SortHeader
                column="ad"
                align="left"
                className={cn("sticky top-0 z-10", theadBg, "text-left", cellPad, "font-semibold")}
              >
                Ad
              </SortHeader>
              <SortHeader
                column="spend"
                align="right"
                className={cn("sticky top-0 z-10", theadBg, "text-right", cellPad, "font-semibold whitespace-nowrap")}
              >
                Spend
              </SortHeader>
              <SortHeader
                column="clicks"
                align="right"
                className={cn("sticky top-0 z-10", theadBg, "text-right", cellPad, "font-semibold", moreColsHidden ? "hidden md:table-cell" : "")}
              >
                Clicks
              </SortHeader>
              <SortHeader
                column="impressions"
                align="right"
                className={cn("sticky top-0 z-10", theadBg, "text-right", cellPad, "font-semibold", moreColsHidden ? "hidden lg:table-cell" : "")}
              >
                Impr.
              </SortHeader>
              <SortHeader
                column="cpc"
                align="right"
                className={cn("sticky top-0 z-10", theadBg, "text-right", cellPad, "font-semibold whitespace-nowrap", moreColsHidden ? "hidden sm:table-cell" : "")}
              >
                CPC
              </SortHeader>
              <SortHeader
                column="revenue"
                align="right"
                className={cn("sticky top-0 z-10", theadBg, "text-right", cellPad, "font-semibold text-emerald-900 dark:text-emerald-300 whitespace-nowrap")}
              >
                <span className="sm:hidden">Rev</span>
                <span className="hidden sm:inline">Meta rev.</span>
              </SortHeader>
              <SortHeader
                column="conversions"
                align="right"
                className={cn("sticky top-0 z-10", theadBg, "text-right", cellPad, "font-semibold whitespace-nowrap", moreColsHidden ? "hidden sm:table-cell" : "")}
              >
                <span className="sm:hidden">Conv</span>
                <span className="hidden sm:inline">Conv.</span>
              </SortHeader>
              <SortHeader
                column="roas"
                align="right"
                className={cn("sticky top-0 z-10", theadBg, "text-right", cellPad, "font-semibold whitespace-nowrap")}
              >
                ROAS
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td
                  colSpan={COL_SPAN}
                  className={cn(cellPad, "text-center text-gray-500 dark:text-neutral-400")}
                >
                  No ads match your search.
                </td>
              </tr>
            )}
            {groups.map((group) => {
              const t = rollupByFormat.get(group.format)!;
              return (
              <React.Fragment key={group.format}>
                <tr
                  className={cn(sectionBg, "border-b border-slate-200/90 dark:border-neutral-600/80")}
                >
                  <td
                    colSpan={COL_SPAN}
                    className={cn(cellPad, "font-semibold text-gray-800 dark:text-neutral-100 uppercase tracking-wide")}
                  >
                    {group.label}
                  </td>
                </tr>
                {group.rows.map((d) => (
                  <tr
                    key={d.adId}
                    className="border-b border-slate-100/80 dark:border-neutral-800/90"
                  >
                    <td className={cn(cellPad, "text-gray-900 dark:text-neutral-100 max-w-[7rem] sm:max-w-none")}>
                      <span
                        className={`font-mono text-gray-500 dark:text-neutral-500 block truncate ${
                          density === "comfortable" ? "text-2xs sm:text-xs" : "text-3xs sm:text-2xs"
                        }`}
                      >
                        {d.adId}
                      </span>
                      {d.adName ? (
                        <span
                          className={`block text-gray-700 dark:text-neutral-200 leading-snug line-clamp-2 sm:line-clamp-none ${
                            density === "comfortable" ? "text-xs sm:text-sm" : "text-2xs sm:text-xs"
                          }`}
                        >
                          {d.adName}
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(cellPad, "text-right whitespace-nowrap tabular-nums")}>
                      {formatAud(d.spend)}
                    </td>
                    <td
                      className={cn(cellPad, "text-right whitespace-nowrap tabular-nums", moreColsHidden ? "hidden md:table-cell" : "")}
                    >
                      {formatNum(d.clicks)}
                    </td>
                    <td
                      className={cn(cellPad, "text-right whitespace-nowrap tabular-nums", moreColsHidden ? "hidden lg:table-cell" : "")}
                    >
                      {formatNum(d.impressions)}
                    </td>
                    <td
                      className={cn(cellPad, "text-right whitespace-nowrap tabular-nums", moreColsHidden ? "hidden sm:table-cell" : "")}
                    >
                      {formatAud(d.cpc)}
                    </td>
                    <td
                      className={cn(cellPad, "text-right whitespace-nowrap tabular-nums text-emerald-800 dark:text-emerald-300")}
                    >
                      {formatAud(d.revenue)}
                    </td>
                    <td
                      className={cn(cellPad, "text-right whitespace-nowrap tabular-nums", moreColsHidden ? "hidden sm:table-cell" : "")}
                    >
                      {formatNum(d.conversions)}
                    </td>
                    <td className={cn(cellPad, "text-right whitespace-nowrap tabular-nums")}>
                      {d.roas.toFixed(2)}x
                    </td>
                  </tr>
                ))}
                <tr
                  className="border-b border-slate-200 bg-slate-100/95 dark:bg-slate-800/60"
                >
                  <td
                    className={cn(cellPad, "text-left text-gray-800 dark:text-neutral-100 font-semibold")}
                    aria-label={`${group.label} subtotal, ${t.adCount} ads`}
                  >
                    <span className="normal-case tracking-normal">
                      Total · {t.adCount} ad{t.adCount === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className={cn(cellPad, "text-right whitespace-nowrap tabular-nums font-semibold text-gray-900 dark:text-white")}>
                    {formatAud(t.spend)}
                  </td>
                  <td
                    className={cn(cellPad, "text-right whitespace-nowrap tabular-nums font-semibold text-gray-900 dark:text-white", moreColsHidden ? "hidden md:table-cell" : "")}
                  >
                    {formatNum(t.clicks)}
                  </td>
                  <td
                    className={cn(cellPad, "text-right whitespace-nowrap tabular-nums font-semibold text-gray-900 dark:text-white", moreColsHidden ? "hidden lg:table-cell" : "")}
                  >
                    {formatNum(t.impressions)}
                  </td>
                  <td
                    className={cn(cellPad, "text-right whitespace-nowrap tabular-nums font-semibold text-gray-900 dark:text-white", moreColsHidden ? "hidden sm:table-cell" : "")}
                  >
                    {t.clicks > 0 ? formatAud(t.cpc) : "—"}
                  </td>
                  <td className={cn(cellPad, "text-right whitespace-nowrap tabular-nums font-semibold text-emerald-900 dark:text-emerald-300")}>
                    {formatAud(t.revenue)}
                  </td>
                  <td
                    className={cn(cellPad, "text-right whitespace-nowrap tabular-nums font-semibold text-gray-900 dark:text-white", moreColsHidden ? "hidden sm:table-cell" : "")}
                  >
                    {formatNum(t.conversions)}
                  </td>
                  <td className={cn(cellPad, "text-right whitespace-nowrap tabular-nums font-semibold text-gray-900 dark:text-white")}>
                    {t.spend > 0 ? `${t.roas.toFixed(2)}x` : "—"}
                  </td>
                </tr>
              </React.Fragment>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
