"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ChevronDown, ChevronUp, ChevronRight, Link2, ArrowDown, ArrowUp } from "lucide-react";
import {
  useSpendByUrlAnalytics,
  useSpendByUrlDetail,
  type SpendByUrlPlatform,
} from "@/hooks/queries/useSpendByUrlAnalytics";
import { usePackagesFocusBreakdown, type PackagesFocusTotals } from "@/hooks/queries/usePackagesFocusBreakdown";
import SpendByUrlAdBreakdownTable from "@/components/admin/spend-by-url/SpendByUrlAdBreakdownTable";
import { Badge } from "@/components/admin/ui";
import { cn } from "@/utils/cn";

function isUnresolvedLandingUrl(canonicalUrl: string): boolean {
  return canonicalUrl.startsWith("unknown://");
}

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

type SortColumn =
  | "url"
  | "spend"
  | "clicks"
  | "impressions"
  | "cpc"
  | "revenue"
  | "conversions"
  | "cpa"
  | "roas"
  | "profit";

type SortDir = "asc" | "desc";

function cpaForSort(row: { spend: number; conversions: number }) {
  return row.conversions > 0 ? row.spend / row.conversions : Number.POSITIVE_INFINITY;
}

function profitForSort(row: { revenue: number; spend: number }) {
  return row.revenue - row.spend;
}

function FocusTile({ label, totals }: { label: string; totals: PackagesFocusTotals }) {
  // Always-white card like this tab's other cards (see the table card below) — no dark:
  // text variants, or the spend figure renders white-on-white in admin dark mode.
  return (
    <div className="bg-white rounded-lg sm:rounded-xl shadow-lg border border-gray-100 p-3 min-w-0">
      <p className="text-2xs sm:text-xs font-medium text-gray-500 truncate">{label}</p>
      <p className="text-sm sm:text-base font-semibold text-gray-900 tabular-nums mt-0.5">
        {formatAud(totals.spend)}
      </p>
      <p className="text-2xs sm:text-xs text-gray-500 tabular-nums truncate mt-0.5">
        {formatAud(totals.revenue)} · {totals.roas.toFixed(2)}x · {formatNum(totals.conversions)}
      </p>
    </div>
  );
}

interface SpendByUrlSectionProps {
  startDate: string;
  endDate: string;
  /** When false, insights date range not ready (avoid empty fetch) */
  dateReady: boolean;
  /**
   * Which ad platform's rows to show. Defaults to meta so the Facebook Ads tab is unchanged;
   * the TikTok tab passes "tiktok". Every query, the sync POST, and the revenue column label
   * derive from this — the same component serves both tabs rather than being forked, so a fix
   * to the table can't land on one platform and miss the other.
   */
  platform?: SpendByUrlPlatform;
}

/** expand + URL + 9 metric columns */
const COL_SPAN = 11;

export default function SpendByUrlSection({
  startDate,
  endDate,
  dateReady,
  platform = "meta",
}: SpendByUrlSectionProps) {
  const platformLabel = platform === "tiktok" ? "TikTok" : "Meta";
  const queryClient = useQueryClient();
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortColumn; dir: SortDir }>({ key: "spend", dir: "desc" });
  const [showUnresolvedUrls, setShowUnresolvedUrls] = useState(false);
  /** Mobile: match Hourly Breakdown — extra columns hidden until expanded */
  const [urlColumnsExpanded, setUrlColumnsExpanded] = useState(false);

  const { data, isLoading, error, isFetching } = useSpendByUrlAnalytics(
    dateReady ? startDate : undefined,
    dateReady ? endDate : undefined,
    { platform }
  );

  const detailQuery = useSpendByUrlDetail(
    expandedUrl,
    dateReady ? startDate : undefined,
    dateReady ? endDate : undefined,
    { platform }
  );

  const focusQuery = usePackagesFocusBreakdown(
    platform,
    dateReady ? startDate : undefined,
    dateReady ? endDate : undefined
  );

  const sortedRows = useMemo(() => {
    if (!data?.rows?.length) return [];
    const rows = [...data.rows];
    const { key, dir } = sort;
    const sign = dir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case "url":
          cmp = a.canonicalUrl.localeCompare(b.canonicalUrl);
          break;
        case "spend":
          cmp = a.spend - b.spend;
          break;
        case "clicks":
          cmp = a.clicks - b.clicks;
          break;
        case "impressions":
          cmp = a.impressions - b.impressions;
          break;
        case "cpc":
          cmp = a.cpc - b.cpc;
          break;
        case "revenue":
          cmp = a.revenue - b.revenue;
          break;
        case "conversions":
          cmp = a.conversions - b.conversions;
          break;
        case "cpa":
          cmp = cpaForSort(a) - cpaForSort(b);
          break;
        case "roas":
          cmp = a.roas - b.roas;
          break;
        case "profit":
          cmp = profitForSort(a) - profitForSort(b);
          break;
        default:
          cmp = 0;
      }
      if (cmp !== 0) return sign * cmp;
      return a.canonicalUrl.localeCompare(b.canonicalUrl);
    });
    return rows;
  }, [data?.rows, sort]);

  const unresolvedRowCount = useMemo(
    () => sortedRows.filter((r) => isUnresolvedLandingUrl(r.canonicalUrl)).length,
    [sortedRows]
  );

  const visibleRows = useMemo(() => {
    if (showUnresolvedUrls) return sortedRows;
    return sortedRows.filter((r) => !isUnresolvedLandingUrl(r.canonicalUrl));
  }, [sortedRows, showUnresolvedUrls]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/analytics/spend-by-url/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, platform }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Sync failed");
      }
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "analytics", "spend-by-url"] });
    },
  });

  const toggleRow = (url: string) => {
    setExpandedUrl((prev) => (prev === url ? null : url));
  };

  const onSortColumn = (column: SortColumn) => {
    setSort((prev) =>
      prev.key === column ? { key: column, dir: prev.dir === "desc" ? "asc" : "desc" } : { key: column, dir: "desc" }
    );
  };

  const SortHeader = ({
    column,
    align,
    className,
    children,
  }: {
    column: SortColumn;
    align: "left" | "right";
    className?: string;
    children: React.ReactNode;
  }) => {
    const active = sort.key === column;
    return (
      <th
        className={className}
        aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          onClick={() => onSortColumn(column)}
          className={cn("inline-flex w-full items-center gap-0.5 sm:gap-1 font-semibold text-inherit hover:opacity-90 -my-0.5 py-0.5 rounded", align === "right" ? "justify-end" : "justify-start text-left")}
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

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0 w-full">
      {dateReady &&
        !focusQuery.isError &&
        focusQuery.data &&
        focusQuery.data.summary.total.spendCents > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <FocusTile label="Membership" totals={focusQuery.data.summary.membership} />
            <FocusTile label="One-time" totals={focusQuery.data.summary["one-time"]} />
            {focusQuery.data.summary.unclassified.spendCents > 0 && (
              <FocusTile label="Unclassified" totals={focusQuery.data.summary.unclassified} />
            )}
          </div>
        )}

      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 min-w-0 w-full">
          <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <label className="flex items-center gap-1.5 sm:gap-2 text-2xs sm:text-xs text-gray-700 dark:text-neutral-200 cursor-pointer select-none min-w-0">
              <input
                type="checkbox"
                className="rounded border-gray-300 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0"
                checked={showUnresolvedUrls}
                onChange={(e) => setShowUnresolvedUrls(e.target.checked)}
              />
              <span className="min-w-0">
                <span className="sm:hidden">Unresolved URLs</span>
                <span className="hidden sm:inline">Show unresolved landing URLs</span>
              </span>
            </label>
            {unresolvedRowCount > 0 && !showUnresolvedUrls && (
              <span className="text-2xs sm:text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 sm:px-2 sm:py-1 truncate max-w-full">
                Hiding {unresolvedRowCount} (unknown://)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={!dateReady || syncMutation.isPending}
            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-slate-900 text-white text-xs sm:text-sm font-medium hover:bg-slate-800 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4", syncMutation.isPending ? "animate-spin" : "")} />
            {syncMutation.isPending ? "Syncing…" : `Sync from ${platformLabel}`}
          </button>
      </div>

      

      {syncMutation.isError && (
        <div className="text-xs sm:text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 leading-snug">
          {syncMutation.error instanceof Error ? syncMutation.error.message : "Sync failed"}
        </div>
      )}

      {syncMutation.isSuccess && (
        <div className="text-xs sm:text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 leading-snug">
          Sync finished — your latest numbers for this range are loaded.
        </div>
      )}

      {!dateReady && (
        <p className="text-xs sm:text-sm text-gray-500">Select a date range to load URL spend.</p>
      )}

      {dateReady && isLoading && (
        <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">Loading…</p>
      )}

      {dateReady && error && (
        <p className="text-xs sm:text-sm text-red-600 leading-snug">{error instanceof Error ? error.message : "Failed to load"}</p>
      )}

      {dateReady && !isLoading && data?.rows && (
        <div className="bg-white rounded-lg sm:rounded-xl shadow-lg border border-gray-100 min-w-0 w-full">
          <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2 min-w-0">
              <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 shrink-0" />
              <span className="truncate">Landing URLs</span>
            </h3>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => setUrlColumnsExpanded((v) => !v)}
                className="sm:hidden inline-flex items-center gap-1.5 text-2xs font-medium text-gray-600 dark:text-neutral-400 hover:text-gray-900"
              >
                {urlColumnsExpanded ? (
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
              {isFetching && !isLoading && (
                <span className="text-2xs sm:text-xs text-gray-500 shrink-0">Refreshing…</span>
              )}
            </div>
          </div>
          <div
            className="-mx-3 sm:mx-0 px-3 sm:px-0 w-full min-w-0 overflow-x-auto brand-scrollbar"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <table className="w-full min-w-[300px] sm:min-w-[900px] lg:min-w-[1100px] text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 w-7 sm:w-8" />
                  <SortHeader
                    column="url"
                    align="left"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-2xs sm:text-sm text-gray-700 dark:text-neutral-200 min-w-[100px] sm:min-w-[180px] whitespace-nowrap"
                  >
                    URL
                  </SortHeader>
                  <SortHeader
                    column="spend"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 dark:text-neutral-200 whitespace-nowrap text-2xs sm:text-sm"
                  >
                    Spend
                  </SortHeader>
                  <SortHeader
                    column="clicks"
                    align="right"
                    className={cn("sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 dark:text-neutral-200 whitespace-nowrap", !urlColumnsExpanded ? "hidden md:table-cell" : "")}
                  >
                    Clicks
                  </SortHeader>
                  <SortHeader
                    column="impressions"
                    align="right"
                    className={cn("sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 dark:text-neutral-200 whitespace-nowrap", !urlColumnsExpanded ? "hidden lg:table-cell" : "")}
                  >
                    Impr.
                  </SortHeader>
                  <SortHeader
                    column="cpc"
                    align="right"
                    className={cn("sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 dark:text-neutral-200 whitespace-nowrap", !urlColumnsExpanded ? "hidden sm:table-cell" : "")}
                  >
                    CPC
                  </SortHeader>
                  <SortHeader
                    column="revenue"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-emerald-900 whitespace-nowrap text-2xs sm:text-sm"
                  >
                    <span className="sm:hidden">Rev</span>
                    <span className="hidden sm:inline">{platformLabel} revenue</span>
                  </SortHeader>
                  <SortHeader
                    column="conversions"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 dark:text-neutral-200 whitespace-nowrap text-2xs sm:text-sm"
                  >
                    <span className="sm:hidden">Conv</span>
                    <span className="hidden sm:inline">Conv.</span>
                  </SortHeader>
                  <SortHeader
                    column="cpa"
                    align="right"
                    className={cn("sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 dark:text-neutral-200 whitespace-nowrap", !urlColumnsExpanded ? "hidden sm:table-cell" : "")}
                  >
                    CPA
                  </SortHeader>
                  <SortHeader
                    column="roas"
                    align="right"
                    className={cn("sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 dark:text-neutral-200 whitespace-nowrap", !urlColumnsExpanded ? "hidden sm:table-cell" : "")}
                  >
                    ROAS
                  </SortHeader>
                  <SortHeader
                    column="profit"
                    align="right"
                    className={cn("sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 dark:text-neutral-200 whitespace-nowrap", !urlColumnsExpanded ? "hidden xl:table-cell" : "")}
                  >
                    Profit
                  </SortHeader>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={COL_SPAN} className="py-6 sm:py-8 px-3 sm:px-4 text-center text-xs sm:text-sm text-gray-500 leading-snug">
                      {sortedRows.length === 0 ? (
                        <>
                          No data for this range. Run <strong>Sync from {platformLabel}</strong> to import insights.
                        </>
                      ) : (
                        <>
                          All rows are unresolved landing URLs (<code className="text-xs">unknown://</code>).
                          Enable <strong>Show unresolved landing URLs</strong> above to view them.
                        </>
                      )}
                    </td>
                  </tr>
                )}
                {visibleRows.map((row) => {
                  const cpa = row.conversions > 0 ? row.spend / row.conversions : 0;
                  const profit = row.revenue - row.spend;
                  return (
                    <React.Fragment key={row.canonicalUrl}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 align-top">
                          <button
                            type="button"
                            onClick={() => toggleRow(row.canonicalUrl)}
                            className="p-0.5 sm:p-1 rounded hover:bg-gray-200 text-gray-600 dark:text-neutral-400"
                            aria-label={expandedUrl === row.canonicalUrl ? "Collapse" : "Expand"}
                          >
                            {expandedUrl === row.canonicalUrl ? (
                              <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-gray-900 max-w-[9rem] sm:max-w-md">
                          <span className="block break-all text-2xs sm:text-sm leading-snug line-clamp-3 sm:line-clamp-none">
                            {row.canonicalUrl}
                          </span>
                          {row.packagesFocus && (
                            <span className="flex flex-wrap gap-1 mt-0.5">
                              {row.packagesFocus.membership.spend > 0 && (
                                <Badge tone="neutral">M {formatAud(row.packagesFocus.membership.spend)}</Badge>
                              )}
                              {row.packagesFocus["one-time"].spend > 0 && (
                                <Badge tone="info">OT {formatAud(row.packagesFocus["one-time"].spend)}</Badge>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right font-medium whitespace-nowrap tabular-nums text-2xs sm:text-sm">
                          {formatAud(row.spend)}
                        </td>
                        <td
                          className={cn("py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right whitespace-nowrap tabular-nums", !urlColumnsExpanded ? "hidden md:table-cell" : "")}
                        >
                          {formatNum(row.clicks)}
                        </td>
                        <td
                          className={cn("py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right whitespace-nowrap tabular-nums", !urlColumnsExpanded ? "hidden lg:table-cell" : "")}
                        >
                          {formatNum(row.impressions)}
                        </td>
                        <td
                          className={cn("py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right whitespace-nowrap tabular-nums text-2xs sm:text-sm", !urlColumnsExpanded ? "hidden sm:table-cell" : "")}
                        >
                          {formatAud(row.cpc)}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right font-medium text-emerald-800 whitespace-nowrap tabular-nums text-2xs sm:text-sm">
                          {formatAud(row.revenue)}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right whitespace-nowrap tabular-nums text-2xs sm:text-sm">
                          {formatNum(row.conversions)}
                        </td>
                        <td
                          className={cn("py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right whitespace-nowrap tabular-nums text-2xs sm:text-sm", !urlColumnsExpanded ? "hidden sm:table-cell" : "")}
                        >
                          {row.conversions > 0 ? formatAud(cpa) : "—"}
                        </td>
                        <td
                          className={cn("py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right whitespace-nowrap tabular-nums text-2xs sm:text-sm", !urlColumnsExpanded ? "hidden sm:table-cell" : "")}
                        >
                          {row.roas.toFixed(2)}x
                        </td>
                        <td
                          className={`py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right font-medium whitespace-nowrap tabular-nums text-2xs sm:text-sm ${
                            profit >= 0 ? "text-emerald-700" : "text-red-600"
                          } ${!urlColumnsExpanded ? "hidden xl:table-cell" : ""}`}
                        >
                          {formatAud(profit)}
                        </td>
                      </tr>
                      {expandedUrl === row.canonicalUrl && (
                        <tr className="bg-slate-50">
                          <td colSpan={COL_SPAN} className="px-2 py-2 sm:px-3 sm:py-3">
                            {detailQuery.isLoading && (
                              <p className="text-2xs sm:text-xs text-gray-600 dark:text-neutral-400">Loading ads…</p>
                            )}
                            {detailQuery.error && (
                              <p className="text-2xs sm:text-xs text-red-600 leading-snug">
                                {detailQuery.error instanceof Error
                                  ? detailQuery.error.message
                                  : "Failed to load ads"}
                              </p>
                            )}
                            {detailQuery.data?.rows && detailQuery.data.rows.length > 0 && (
                              <SpendByUrlAdBreakdownTable
                                rows={detailQuery.data.rows}
                                showSearch={false}
                                density="compact"
                                ariaLabel="Ads for this landing URL"
                              />
                            )}
                            {detailQuery.data?.rows?.length === 0 && !detailQuery.isLoading && (
                              <p className="text-xs text-gray-500">
                                No per-ad rows (destinations may be missing).
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
