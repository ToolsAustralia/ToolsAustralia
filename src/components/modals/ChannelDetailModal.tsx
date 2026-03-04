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
import { formatNumber, formatPercentage, formatCurrency } from "@/utils/metrics/formatters";
import { useChannelDetail } from "@/hooks/queries/useChannelDetail";
import UTMCampaignBreakdownTable from "@/components/admin/promo-analytics/UTMCampaignBreakdownTable";
import type { ChannelPageMetrics } from "@/types/promo-analytics";

type PageSortColumn = "visits" | "signups" | "conversions" | "revenue";

interface ChannelDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  utmSource: string;
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
  utmSource,
  startDate,
  endDate,
  summaryFromParent,
}: ChannelDetailModalProps) {
  const { data, isLoading, error } = useChannelDetail(
    isOpen ? utmSource : null,
    startDate,
    endDate
  );

  const [pageSortCol, setPageSortCol] = useState<PageSortColumn>("visits");
  const [pageSortOrder, setPageSortOrder] = useState<"asc" | "desc">("desc");

  const summary = data?.summary ?? summaryFromParent;

  const sortedPages = useMemo(() => {
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

  const campaignRows = useMemo(() => {
    if (!data?.byCampaign) return [];
    return data.byCampaign.map((c) => ({
      utmMedium: c.utmMedium,
      utmCampaign: c.utmCampaign,
      visits: c.visits,
      signups: c.signups,
      conversions: c.conversions,
      revenue: c.revenue,
      visitToSignupRate: c.visitToSignupRate,
      signupToConversionRate: c.signupToConversionRate,
      overallConversionRate: c.overallConversionRate,
    }));
  }, [data?.byCampaign]);

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed">
      <ModalHeader
        title={`${utmSource} — Channel Detail`}
        subtitle="Pages receiving traffic from this channel and campaign breakdown"
        onClose={onClose}
      />
      <ModalContent className="p-4 sm:p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
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
              subtitle={`From ${utmSource}`}
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

        {/* Pages table */}
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
            Pages Receiving Traffic
          </h3>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : sortedPages.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No page data for this channel in the selected period.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 sm:mx-0">
              <table className="w-full min-w-[320px] text-xs sm:text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-1.5 sm:p-2 md:p-3 font-semibold text-gray-700 min-w-[80px]">Page</th>
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
                    <tr key={`${row.pageType}-${row.slug}`} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="p-1.5 sm:p-2 md:p-3 font-medium text-gray-900 break-words">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          <span
                            className={`inline-flex px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap ${
                              row.pageType === "toolset"
                                ? "bg-indigo-100 text-indigo-800"
                                : "bg-amber-100 text-amber-800"
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
                      <td className="hidden md:table-cell p-1.5 sm:p-2 md:p-3 text-right text-gray-600 tabular-nums">{formatPercentage(row.visitToSignupRate)}</td>
                      <td className="hidden md:table-cell p-1.5 sm:p-2 md:p-3 text-right text-gray-600 tabular-nums">{formatPercentage(row.signupToConversionRate)}</td>
                      <td className="hidden md:table-cell p-1.5 sm:p-2 md:p-3 text-right text-gray-600 tabular-nums">{formatPercentage(row.overallConversionRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Campaign breakdown */}
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
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
