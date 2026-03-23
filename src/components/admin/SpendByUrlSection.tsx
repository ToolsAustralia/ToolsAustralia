"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ChevronDown, ChevronRight, Link2, ArrowDown, ArrowUp } from "lucide-react";
import {
  useSpendByUrlAnalytics,
  useSpendByUrlDetail,
} from "@/hooks/queries/useSpendByUrlAnalytics";
import { META_ADS_UTM_TEMPLATE } from "@/lib/utm/meta-ads-utm";
import type { SpendByUrlDetailRow } from "@/hooks/queries/useSpendByUrlAnalytics";

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

interface SpendByUrlSectionProps {
  startDate: string;
  endDate: string;
  /** When false, insights date range not ready (avoid empty fetch) */
  dateReady: boolean;
}

/** expand + URL + 9 metric columns */
const COL_SPAN = 11;

function groupDetailAdsByFormat(rows: SpendByUrlDetailRow[]) {
  const order: Array<{ format: SpendByUrlDetailRow["adFormat"]; label: string }> = [
    { format: "video", label: "Video ads" },
    { format: "static", label: "Static / image ads" },
    { format: "carousel", label: "Carousel" },
    { format: "unknown", label: "Other / unresolved creative" },
  ];
  return order
    .map(({ format, label }) => ({
      label,
      format,
      rows: rows.filter((r) => (r.adFormat ?? "unknown") === format),
    }))
    .filter((g) => g.rows.length > 0);
}

export default function SpendByUrlSection({ startDate, endDate, dateReady }: SpendByUrlSectionProps) {
  const queryClient = useQueryClient();
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortColumn; dir: SortDir }>({ key: "spend", dir: "desc" });
  const [showUnresolvedUrls, setShowUnresolvedUrls] = useState(false);

  const { data, isLoading, error, isFetching } = useSpendByUrlAnalytics(
    dateReady ? startDate : undefined,
    dateReady ? endDate : undefined
  );

  const detailQuery = useSpendByUrlDetail(
    expandedUrl,
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
        body: JSON.stringify({ startDate, endDate }),
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
          className={`inline-flex w-full items-center gap-0.5 sm:gap-1 font-semibold text-inherit hover:opacity-90 -my-0.5 py-0.5 rounded ${align === "right" ? "justify-end" : "justify-start text-left"}`}
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
    <div className="space-y-3 sm:space-y-4">
      

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
            <label className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-gray-300 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0"
                checked={showUnresolvedUrls}
                onChange={(e) => setShowUnresolvedUrls(e.target.checked)}
              />
              <span>
                <span className="sm:hidden">Unresolved URLs</span>
                <span className="hidden sm:inline">Show unresolved landing URLs</span>
              </span>
            </label>
            {unresolvedRowCount > 0 && !showUnresolvedUrls && (
              <span className="text-[10px] sm:text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 sm:px-2 sm:py-1 truncate max-w-full">
                Hiding {unresolvedRowCount} (unknown://)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={!dateReady || syncMutation.isPending}
            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-slate-900 text-white text-xs sm:text-sm font-medium hover:bg-slate-800 disabled:opacity-50 shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing…" : "Sync from Meta"}
          </button>
      </div>

      

      {syncMutation.isError && (
        <div className="text-xs sm:text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 leading-snug">
          {syncMutation.error instanceof Error ? syncMutation.error.message : "Sync failed"}
        </div>
      )}

      {syncMutation.isSuccess && syncMutation.data && (
        <div className="text-xs sm:text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 leading-snug">
          Sync done — insights:{" "}
          {(syncMutation.data as { data?: { insights?: { rowsUpserted?: number } } }).data?.insights
            ?.rowsUpserted ?? "—"}
          , destinations:{" "}
          {(syncMutation.data as { data?: { destinations?: { upserted?: number } } }).data?.destinations
            ?.upserted ?? "—"}
        </div>
      )}

      {!dateReady && (
        <p className="text-xs sm:text-sm text-gray-500">Select a date range to load URL spend.</p>
      )}

      {dateReady && isLoading && (
        <p className="text-xs sm:text-sm text-gray-600">Loading…</p>
      )}

      {dateReady && error && (
        <p className="text-xs sm:text-sm text-red-600 leading-snug">{error instanceof Error ? error.message : "Failed to load"}</p>
      )}

      {dateReady && !isLoading && data?.rows && (
        <div className="bg-white rounded-lg sm:rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2 min-w-0">
              <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 shrink-0" />
              <span className="truncate">Landing URLs</span>
            </h3>
            {isFetching && !isLoading && (
              <span className="text-[10px] sm:text-xs text-gray-500 shrink-0">Refreshing…</span>
            )}
          </div>
          <div
            className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <table className="w-full min-w-[300px] sm:min-w-[900px] lg:min-w-[1100px] text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 w-7 sm:w-8" />
                  <SortHeader
                    column="url"
                    align="left"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-[11px] sm:text-sm text-gray-700 min-w-[100px] sm:min-w-[180px] whitespace-nowrap"
                  >
                    URL
                  </SortHeader>
                  <SortHeader
                    column="spend"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 whitespace-nowrap text-[11px] sm:text-sm"
                  >
                    Spend
                  </SortHeader>
                  <SortHeader
                    column="clicks"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 whitespace-nowrap hidden md:table-cell"
                  >
                    Clicks
                  </SortHeader>
                  <SortHeader
                    column="impressions"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 whitespace-nowrap hidden lg:table-cell"
                  >
                    Impr.
                  </SortHeader>
                  <SortHeader
                    column="cpc"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 whitespace-nowrap hidden sm:table-cell"
                  >
                    CPC
                  </SortHeader>
                  <SortHeader
                    column="revenue"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-emerald-900 whitespace-nowrap text-[11px] sm:text-sm"
                  >
                    <span className="sm:hidden">Rev</span>
                    <span className="hidden sm:inline">Meta revenue</span>
                  </SortHeader>
                  <SortHeader
                    column="conversions"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 whitespace-nowrap text-[11px] sm:text-sm"
                  >
                    <span className="sm:hidden">Conv</span>
                    <span className="hidden sm:inline">Conv.</span>
                  </SortHeader>
                  <SortHeader
                    column="cpa"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 whitespace-nowrap hidden sm:table-cell"
                  >
                    CPA
                  </SortHeader>
                  <SortHeader
                    column="roas"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 whitespace-nowrap hidden sm:table-cell"
                  >
                    ROAS
                  </SortHeader>
                  <SortHeader
                    column="profit"
                    align="right"
                    className="sticky top-0 z-10 bg-gray-50 py-1.5 px-0.5 sm:py-2 sm:px-2 text-right text-gray-700 whitespace-nowrap hidden xl:table-cell"
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
                          No data for this range. Run <strong>Sync from Meta</strong> to import insights.
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
                            className="p-0.5 sm:p-1 rounded hover:bg-gray-200 text-gray-600"
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
                          <span className="block break-all text-[11px] sm:text-sm leading-snug line-clamp-3 sm:line-clamp-none">
                            {row.canonicalUrl}
                          </span>
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right font-medium whitespace-nowrap tabular-nums text-[11px] sm:text-sm">
                          {formatAud(row.spend)}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right hidden md:table-cell whitespace-nowrap tabular-nums">
                          {formatNum(row.clicks)}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right hidden lg:table-cell whitespace-nowrap tabular-nums">
                          {formatNum(row.impressions)}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right hidden sm:table-cell whitespace-nowrap tabular-nums text-[11px] sm:text-sm">
                          {formatAud(row.cpc)}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right font-medium text-emerald-800 whitespace-nowrap tabular-nums text-[11px] sm:text-sm">
                          {formatAud(row.revenue)}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right whitespace-nowrap tabular-nums text-[11px] sm:text-sm">
                          {formatNum(row.conversions)}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right hidden sm:table-cell whitespace-nowrap tabular-nums text-[11px] sm:text-sm">
                          {row.conversions > 0 ? formatAud(cpa) : "—"}
                        </td>
                        <td className="py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right hidden sm:table-cell whitespace-nowrap tabular-nums text-[11px] sm:text-sm">
                          {row.roas.toFixed(2)}x
                        </td>
                        <td
                          className={`py-1.5 px-0.5 sm:py-2.5 sm:px-2 text-right font-medium hidden xl:table-cell whitespace-nowrap tabular-nums text-[11px] sm:text-sm ${
                            profit >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {formatAud(profit)}
                        </td>
                      </tr>
                      {expandedUrl === row.canonicalUrl && (
                        <tr className="bg-slate-50">
                          <td colSpan={COL_SPAN} className="px-2 py-2 sm:px-3 sm:py-3">
                            {detailQuery.isLoading && (
                              <p className="text-[11px] sm:text-xs text-gray-600">Loading ads…</p>
                            )}
                            {detailQuery.error && (
                              <p className="text-[11px] sm:text-xs text-red-600 leading-snug">
                                {detailQuery.error instanceof Error
                                  ? detailQuery.error.message
                                  : "Failed to load ads"}
                              </p>
                            )}
                            {detailQuery.data?.rows && detailQuery.data.rows.length > 0 && (
                              <div
                                className="-mx-1 sm:mx-0 overflow-x-auto scrollbar-hide"
                                style={{ WebkitOverflowScrolling: "touch" }}
                              >
                                <table className="w-full min-w-[280px] sm:min-w-[640px] text-[10px] sm:text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-gray-600">
                                      <th className="sticky top-0 z-10 bg-slate-50 text-left py-1 px-0.5 sm:py-1.5 sm:px-1 font-semibold">
                                        Ad
                                      </th>
                                      <th className="sticky top-0 z-10 bg-slate-50 text-right py-1 px-0.5 sm:py-1.5 sm:px-1 font-semibold whitespace-nowrap">
                                        Spend
                                      </th>
                                      <th className="sticky top-0 z-10 bg-slate-50 text-right py-1 px-0.5 sm:py-1.5 sm:px-1 font-semibold hidden md:table-cell">
                                        Clicks
                                      </th>
                                      <th className="sticky top-0 z-10 bg-slate-50 text-right py-1 px-0.5 sm:py-1.5 sm:px-1 font-semibold hidden lg:table-cell">
                                        Impr.
                                      </th>
                                      <th className="sticky top-0 z-10 bg-slate-50 text-right py-1 px-0.5 sm:py-1.5 sm:px-1 font-semibold hidden sm:table-cell whitespace-nowrap">
                                        CPC
                                      </th>
                                      <th className="sticky top-0 z-10 bg-slate-50 text-right py-1 px-0.5 sm:py-1.5 sm:px-1 font-semibold text-emerald-900 whitespace-nowrap">
                                        <span className="sm:hidden">Rev</span>
                                        <span className="hidden sm:inline">Meta rev.</span>
                                      </th>
                                      <th className="sticky top-0 z-10 bg-slate-50 text-right py-1 px-0.5 sm:py-1.5 sm:px-1 font-semibold whitespace-nowrap">
                                        <span className="sm:hidden">Conv</span>
                                        <span className="hidden sm:inline">Conv.</span>
                                      </th>
                                      <th className="sticky top-0 z-10 bg-slate-50 text-right py-1 px-0.5 sm:py-1.5 sm:px-1 font-semibold hidden sm:table-cell whitespace-nowrap">
                                        ROAS
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {groupDetailAdsByFormat(detailQuery.data.rows).map((group) => (
                                      <React.Fragment key={group.format}>
                                        <tr className="bg-slate-200/80">
                                          <td
                                            colSpan={8}
                                            className="py-1 px-1 sm:py-1.5 sm:px-2 text-[10px] sm:text-[11px] font-semibold text-gray-800 uppercase tracking-wide"
                                          >
                                            {group.label}
                                          </td>
                                        </tr>
                                        {group.rows.map((d) => (
                                          <tr key={d.adId} className="border-b border-slate-100/80">
                                            <td className="py-1 px-0.5 sm:px-1 text-gray-900 max-w-[7rem] sm:max-w-none">
                                              <span className="font-mono text-[9px] sm:text-[11px] text-gray-500 block truncate">
                                                {d.adId}
                                              </span>
                                              {d.adName ? (
                                                <span className="block text-gray-700 text-[10px] sm:text-xs leading-snug line-clamp-2 sm:line-clamp-none">
                                                  {d.adName}
                                                </span>
                                              ) : null}
                                            </td>
                                            <td className="py-1 px-0.5 sm:px-1 text-right whitespace-nowrap tabular-nums">
                                              {formatAud(d.spend)}
                                            </td>
                                            <td className="py-1 px-0.5 sm:px-1 text-right hidden md:table-cell whitespace-nowrap tabular-nums">
                                              {formatNum(d.clicks)}
                                            </td>
                                            <td className="py-1 px-0.5 sm:px-1 text-right hidden lg:table-cell whitespace-nowrap tabular-nums">
                                              {formatNum(d.impressions)}
                                            </td>
                                            <td className="py-1 px-0.5 sm:px-1 text-right hidden sm:table-cell whitespace-nowrap tabular-nums">
                                              {formatAud(d.cpc)}
                                            </td>
                                            <td className="py-1 px-0.5 sm:px-1 text-right whitespace-nowrap tabular-nums text-emerald-800">
                                              {formatAud(d.revenue)}
                                            </td>
                                            <td className="py-1 px-0.5 sm:px-1 text-right whitespace-nowrap tabular-nums">
                                              {formatNum(d.conversions)}
                                            </td>
                                            <td className="py-1 px-0.5 sm:px-1 text-right hidden sm:table-cell whitespace-nowrap tabular-nums">
                                              {d.roas.toFixed(2)}x
                                            </td>
                                          </tr>
                                        ))}
                                      </React.Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
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
