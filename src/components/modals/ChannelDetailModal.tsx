"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart3,
  Users,
  UserCheck,
  DollarSign,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent } from "./ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { formatNumber, formatPercentageOrDash, formatCurrency } from "@/utils/metrics/formatters";
import { useChannelDetail } from "@/hooks/queries/useChannelDetail";
import UTMCampaignBreakdownTable from "@/components/admin/promo-analytics/UTMCampaignBreakdownTable";
import type { ChannelPageMetrics, UTMCampaignMetrics } from "@/types/promo-analytics";
import type { ConvertingPlatform } from "@/types/attribution";

type PageSortColumn = "visits" | "signups" | "conversions" | "revenue";

interface ChannelDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Canonical channel KEY — what the API filters on. Never the label. */
  channel: ConvertingPlatform;
  /** Human label for the same channel, for every string a human reads. */
  channelLabel: string;
  startDate: string;
  endDate: string;
  summaryFromParent?: {
    visits: number;
    signups: number;
    conversions: number;
    revenue: number;
  };
}

export default function ChannelDetailModal({
  isOpen,
  onClose,
  channel,
  channelLabel,
  startDate,
  endDate,
  summaryFromParent,
}: ChannelDetailModalProps) {
  const { data, isLoading, error } = useChannelDetail(
    isOpen ? channel : null,
    startDate,
    endDate
  );

  const [pageSortCol, setPageSortCol] = useState<PageSortColumn>("visits");
  const [pageSortOrder, setPageSortOrder] = useState<"asc" | "desc">("desc");

  const summary = data?.summary ?? summaryFromParent;

  const sortedPages = useMemo((): ChannelPageMetrics[] => {
    if (!data?.byPage) return [];
    const arr = [...data.byPage];
    arr.sort((a, b) => {
      const aVal = a[pageSortCol];
      const bVal = b[pageSortCol];
      return pageSortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
    return arr;
  }, [data?.byPage, pageSortCol, pageSortOrder]);

  const handlePageSort = (col: PageSortColumn) => {
    if (pageSortCol === col) {
      setPageSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setPageSortCol(col);
      setPageSortOrder("desc");
    }
  };

  const getPageSortIcon = (col: PageSortColumn) => {
    if (pageSortCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />;
    return pageSortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />;
  };

  // Every campaign in this drill-down belongs to the channel we opened, so the shared campaign
  // table's `channel`/`channelLabel` come straight off the response. The Channel column is hidden
  // here anyway (`showSourceColumn={false}`) — it would repeat the modal title on every row.
  const campaignRows = useMemo((): UTMCampaignMetrics[] => {
    if (!data?.byCampaign) return [];
    return data.byCampaign.map((c) => ({
      channel: data.channel,
      channelLabel: data.channelLabel,
      ...c,
    }));
  }, [data]);

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed">
      <ModalHeader
        title={`${channelLabel} — Channel Detail`}
        subtitle={`Pages receiving traffic from ${channelLabel} and campaign breakdown`}
        onClose={onClose}
      />
      <ModalContent className="p-4 sm:p-6 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/45 rounded-lg p-4 text-red-700 dark:text-red-300">
            {(error as Error).message}
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              title="Visits"
              value={formatNumber(summary.visits)}
              icon={BarChart3}
              color="blue"
              subtitle={`From ${channelLabel}`}
            />
            <MetricCard
              title="Signups"
              value={formatNumber(summary.signups)}
              icon={Users}
              color="purple"
              subtitle="Registrations"
            />
            <MetricCard
              title="Conversions"
              value={formatNumber(summary.conversions)}
              icon={UserCheck}
              color="emerald"
              subtitle="Purchases"
            />
            <MetricCard
              title="Revenue"
              value={formatCurrency(summary.revenue)}
              icon={DollarSign}
              color="green"
              subtitle="Total revenue"
            />
          </div>
        )}

        {/* Traffic sources — the raw utm_source values that folded into this channel */}
        {data?.rawSources && data.rawSources.length > 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900/50 p-3 sm:p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
              Traffic sources
            </h4>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {data.rawSources.map((s) => (
                <span
                  key={s.source}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs sm:text-xs font-medium bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border border-gray-200 dark:border-neutral-600"
                >
                  <span className="break-all">{s.source}</span>
                  <span className="font-mono tabular-nums text-gray-500 dark:text-neutral-400">
                    {formatNumber(s.visits)}
                  </span>
                </span>
              ))}
            </div>
            <p className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400 mt-2">
              Raw utm_source values that folded into this channel. A visitor can appear under more
              than one, so these may sum above the visit total.
            </p>
          </div>
        )}

        {/* Pages table */}
        <div className="bg-white dark:bg-neutral-900/70 rounded-xl shadow-lg border-2 border-red-100 dark:border-red-900/35 overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 p-4 border-b border-gray-200 dark:border-neutral-700">
            Pages Receiving Traffic
          </h3>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">Loading...</div>
          ) : sortedPages.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">
              No page data for this channel in the selected period.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 sm:mx-0">
              <table className="w-full min-w-[320px] text-xs sm:text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-1.5 sm:p-2 md:p-3 font-semibold text-gray-700 dark:text-neutral-200 min-w-[80px]">Page</th>
                    <th className="text-right p-1.5 sm:p-2 md:p-3 font-semibold whitespace-nowrap">
                      <button onClick={() => handlePageSort("visits")} className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600">
                        Visits {getPageSortIcon("visits")}
                      </button>
                    </th>
                    <th className="text-right p-1.5 sm:p-2 md:p-3 font-semibold whitespace-nowrap">
                      <button onClick={() => handlePageSort("signups")} className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600">
                        Signups {getPageSortIcon("signups")}
                      </button>
                    </th>
                    <th className="text-right p-1.5 sm:p-2 md:p-3 font-semibold whitespace-nowrap">
                      <button onClick={() => handlePageSort("conversions")} className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600">
                        Conv {getPageSortIcon("conversions")}
                      </button>
                    </th>
                    <th className="text-right p-1.5 sm:p-2 md:p-3 font-semibold whitespace-nowrap">
                      <button onClick={() => handlePageSort("revenue")} className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600">
                        Rev {getPageSortIcon("revenue")}
                      </button>
                    </th>
                    <th className="hidden md:table-cell text-right p-1.5 sm:p-2 md:p-3 font-semibold whitespace-nowrap">V→S</th>
                    <th className="hidden md:table-cell text-right p-1.5 sm:p-2 md:p-3 font-semibold whitespace-nowrap">S→C</th>
                    <th className="hidden md:table-cell text-right p-1.5 sm:p-2 md:p-3 font-semibold whitespace-nowrap">Conv</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPages.map((row) => (
                    <tr key={`${row.pageType}-${row.slug}`} className="border-t border-gray-100 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800/50">
                      <td className="p-1.5 sm:p-2 md:p-3 font-medium text-gray-900 dark:text-neutral-100 break-words">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          <span
                            className={`inline-flex px-1.5 sm:px-2 py-0.5 rounded text-2xs sm:text-xs font-medium whitespace-nowrap ${
                              row.pageType === "toolset"
                                ? "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200"
                                : "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
                            }`}
                          >
                            {row.pageType === "toolset" ? "Toolset" : "Evergreen"}
                          </span>
                          <span>{row.pageLabel}</span>
                        </div>
                      </td>
                      <td className="p-1.5 sm:p-2 md:p-3 text-right font-mono tabular-nums">{formatNumber(row.visits)}</td>
                      <td className="p-1.5 sm:p-2 md:p-3 text-right font-mono tabular-nums">{formatNumber(row.signups)}</td>
                      <td className="p-1.5 sm:p-2 md:p-3 text-right font-mono tabular-nums">{formatNumber(row.conversions)}</td>
                      <td className="p-1.5 sm:p-2 md:p-3 text-right font-mono tabular-nums">{formatCurrency(row.revenue)}</td>
                      <td className="hidden md:table-cell p-1.5 sm:p-2 md:p-3 text-right text-gray-600 dark:text-neutral-400 tabular-nums">{formatPercentageOrDash(row.visitToSignupRate, row.visits)}</td>
                      <td className="hidden md:table-cell p-1.5 sm:p-2 md:p-3 text-right text-gray-600 dark:text-neutral-400 tabular-nums">{formatPercentageOrDash(row.signupToConversionRate, row.signups)}</td>
                      <td className="hidden md:table-cell p-1.5 sm:p-2 md:p-3 text-right text-gray-600 dark:text-neutral-400 tabular-nums">{formatPercentageOrDash(row.overallConversionRate, row.visits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Campaign breakdown */}
        <div className="bg-white dark:bg-neutral-900/70 rounded-xl shadow-lg border-2 border-red-100 dark:border-red-900/35 overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 p-4 border-b border-gray-200 dark:border-neutral-700">
            Breakdown by Campaign
          </h3>
          <UTMCampaignBreakdownTable
            rows={campaignRows}
            loading={isLoading}
            showSourceColumn={false}
            emptyMessage="No campaign data for this channel in the selected period."
          />
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
