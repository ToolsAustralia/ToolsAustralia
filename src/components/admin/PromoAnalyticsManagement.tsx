"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  BarChart3,
  Users,
  UserCheck,
  DollarSign,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Hash,
} from "lucide-react";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { formatNumber, formatPercentage } from "@/utils/metrics/formatters";
import { formatCurrency } from "@/utils/metrics/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { getPrizeLabel } from "@/config/prizes";
import DateRangeToggle, { DateRange } from "@/components/admin/DateRangeToggle";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import { useCurrentAndLastDrawDates, useMajorDrawsForDateRange } from "@/hooks/queries/useAdminQueries";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import PromoPageDetailModal from "@/components/modals/PromoPageDetailModal";
import ChannelDetailModal from "@/components/modals/ChannelDetailModal";

const AEST_TIMEZONE = "Australia/Sydney";

interface PromoPageMetrics {
  pageType: "evergreen" | "toolset";
  slug: string;
  visits: number;
  crossVisits: number;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

interface UTMSourceMetrics {
  utmSource: string;
  visits: number;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

interface PromoAnalyticsResponse {
  success: boolean;
  data: {
    totalVisits: number;
    totalSignups: number;
    totalConversions: number;
    totalRevenue: number;
    byPage: PromoPageMetrics[];
    byUTMSource?: UTMSourceMetrics[];
    dateRange: { start: string; end: string };
  };
}

async function fetchPromoAnalytics(params: {
  dateRange: "today" | "yesterday" | "custom";
  startDate?: string;
  endDate?: string;
}): Promise<PromoAnalyticsResponse["data"]> {
  const search = new URLSearchParams();
  search.set("dateRange", params.dateRange);
  if (params.startDate) search.set("startDate", params.startDate);
  if (params.endDate) search.set("endDate", params.endDate);
  const res = await fetch(`/api/admin/promo-analytics?${search.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch promo analytics");
  const json = (await res.json()) as PromoAnalyticsResponse;
  if (!json.success || !json.data) throw new Error((json as { error?: string }).error || "Failed to load");
  return json.data;
}

export default function PromoAnalyticsManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<keyof PromoPageMetrics>("visits");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedPage, setSelectedPage] = useState<{
    pageType: "evergreen" | "toolset";
    slug: string;
    pageLabel: string;
    summary: { visits: number; signups: number; conversions: number; revenue: number };
  } | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<{
    utmSource: string;
    summary: { visits: number; signups: number; conversions: number; revenue: number };
  } | null>(null);

  const { data: drawDates } = useCurrentAndLastDrawDates();
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  // Sync date filter state with URL params (same pattern as Overview / Facebook Ads)
  useEffect(() => {
    const urlDateRange = (searchParams.get("dateRange") as DateRange) || "today";
    let urlStartDate = searchParams.get("startDate") || "";
    let urlEndDate = searchParams.get("endDate") || "";

    if ((urlDateRange === "today" || urlDateRange === "yesterday") && (!urlStartDate || !urlEndDate)) {
      const ref = urlDateRange === "yesterday" ? subDays(new Date(), 1) : new Date();
      const calculatedStart = formatInTimeZone(ref, AEST_TIMEZONE, "yyyy-MM-dd");
      const calculatedEnd = calculatedStart;
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", calculatedStart);
      params.set("endDate", calculatedEnd);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      urlStartDate = calculatedStart;
      urlEndDate = calculatedEnd;
    }

    if (urlDateRange === "all-time" && (!urlStartDate || !urlEndDate)) {
      const launchDate = getWebsiteLaunchDateUTC();
      const today = new Date();
      const calculatedStart = formatInTimeZone(launchDate, AEST_TIMEZONE, "yyyy-MM-dd");
      const calculatedEnd = formatInTimeZone(today, AEST_TIMEZONE, "yyyy-MM-dd");
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", calculatedStart);
      params.set("endDate", calculatedEnd);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      urlStartDate = calculatedStart;
      urlEndDate = calculatedEnd;
    }

    setDateRange(urlDateRange);
    setStartDate(urlStartDate);
    setEndDate(urlEndDate);
  }, [searchParams, pathname, router]);

  // When current-draw/last-draw is selected but dates missing (e.g. drawDates just loaded), populate from drawDates
  useEffect(() => {
    if (!drawDates) return;
    if (dateRange === "current-draw" && drawDates.currentDraw && (!startDate || !endDate)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", drawDates.currentDraw.startDate);
      params.set("endDate", drawDates.currentDraw.endDate);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setStartDate(drawDates.currentDraw.startDate);
      setEndDate(drawDates.currentDraw.endDate);
    } else if (dateRange === "last-draw" && drawDates.lastDraw && (!startDate || !endDate)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", drawDates.lastDraw.startDate);
      params.set("endDate", drawDates.lastDraw.endDate);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setStartDate(drawDates.lastDraw.startDate);
      setEndDate(drawDates.lastDraw.endDate);
    }
  }, [dateRange, drawDates, startDate, endDate, searchParams, pathname, router]);

  const updateDateFilter = (range: DateRange, start?: string, end?: string) => {
    const finalRange = range;
    let finalStart = start;
    let finalEnd = end;

    if (range === "today") {
      const now = new Date();
      finalStart = formatInTimeZone(now, AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "yesterday") {
      finalStart = formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "current-draw" && drawDates?.currentDraw) {
      finalStart = drawDates.currentDraw.startDate;
      finalEnd = drawDates.currentDraw.endDate;
    } else if (range === "last-draw" && drawDates?.lastDraw) {
      finalStart = drawDates.lastDraw.startDate;
      finalEnd = drawDates.lastDraw.endDate;
    } else if (range === "all-time") {
      const launchDate = getWebsiteLaunchDateUTC();
      const today = new Date();
      finalStart = formatInTimeZone(launchDate, AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = formatInTimeZone(today, AEST_TIMEZONE, "yyyy-MM-dd");
    }

    setDateRange(finalRange);
    if (finalStart && finalEnd) {
      setStartDate(finalStart);
      setEndDate(finalEnd);
    } else {
      setStartDate("");
      setEndDate("");
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("dateRange", finalRange);
    if (finalStart && finalEnd) {
      params.set("startDate", finalStart);
      params.set("endDate", finalEnd);
    } else {
      params.delete("startDate");
      params.delete("endDate");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Map dateRange to API format (today/yesterday or custom with dates)
  const apiDateRange = useMemo((): "today" | "yesterday" | "custom" => {
    if (dateRange === "today" || dateRange === "yesterday") return dateRange;
    return "custom";
  }, [dateRange]);

  const apiStartDate = useMemo(() => {
    if (apiDateRange === "custom" && startDate && endDate) return startDate;
    return undefined;
  }, [apiDateRange, startDate, endDate]);

  const apiEndDate = useMemo(() => {
    if (apiDateRange === "custom" && startDate && endDate) return endDate;
    return undefined;
  }, [apiDateRange, startDate, endDate]);

  const { data, isLoading, error, refetch: _refetch } = useQuery({
    queryKey: queryKeys.admin.promoAnalytics({
      dateRange: apiDateRange,
      startDate: apiStartDate ?? "",
      endDate: apiEndDate ?? "",
    }),
    queryFn: () =>
      fetchPromoAnalytics({
        dateRange: apiDateRange,
        startDate: apiStartDate,
        endDate: apiEndDate,
      }),
    enabled: apiDateRange === "today" || apiDateRange === "yesterday" || !!(apiStartDate && apiEndDate),
  });

  const displayDate = useMemo(() => {
    if (dateRange === "custom" && startDate && endDate) {
      try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
          return format(start, "MMM d, yyyy");
        }
        return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
      } catch {
        return "";
      }
    }
    if (dateRange === "all-time") return "All Time";
    if (dateRange === "current-draw" && drawDates?.currentDraw) return "Current Draw";
    if (dateRange === "last-draw" && drawDates?.lastDraw) return "Last Draw";
    return null;
  }, [dateRange, startDate, endDate, drawDates]);

  const sortedPages = React.useMemo(() => {
    if (!data?.byPage) return [];
    const arr = [...data.byPage];
    arr.sort((a, b) => {
      const aVal = a[sortColumn] as number;
      const bVal = b[sortColumn] as number;
      if (sortOrder === "asc") return aVal - bVal;
      return bVal - aVal;
    });
    return arr;
  }, [data?.byPage, sortColumn, sortOrder]);

  const handleSort = (col: keyof PromoPageMetrics) => {
    if (sortColumn === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortOrder("desc");
    }
  };

  const getSortIcon = (col: keyof PromoPageMetrics) => {
    if (sortColumn !== col) return <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5" />
    );
  };

  const _visitToSignupPct = data?.totalVisits ? (data.totalSignups / data.totalVisits) * 100 : 0;
  const _signupToConversionPct = data?.totalSignups ? (data.totalConversions / data.totalSignups) * 100 : 0;
  const _overallPct = data?.totalVisits ? (data.totalConversions / data.totalVisits) * 100 : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-bold text-gray-900">Promo Page Analytics</h2>
        <div className="flex items-center gap-2">
          <DateRangeToggle
            selectedRange={dateRange}
            onRangeChange={(range) => {
              if (range === "custom") {
                setIsCustomDateModalOpen(true);
              } else {
                updateDateFilter(range);
              }
            }}
            onCustomClick={() => setIsCustomDateModalOpen(true)}
            collapsed={false}
            displayDate={displayDate || undefined}
            onExpand={() => {}}
          />
         
        </div>
      </div>

      <CustomDateRangeModal
        isOpen={isCustomDateModalOpen}
        onClose={() => setIsCustomDateModalOpen(false)}
        onApply={(start, end) => {
          updateDateFilter("custom", start, end);
          setIsCustomDateModalOpen(false);
        }}
        currentStartDate={startDate}
        currentEndDate={endDate}
        majorDraws={majorDraws}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {(error as Error).message}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Visits"
          value={isLoading ? "—" : formatNumber(data?.totalVisits ?? 0)}
          icon={BarChart3}
          color="blue"
          subtitle="Promo page visits"
        />
        <MetricCard
          title="Signups"
          value={isLoading ? "—" : formatNumber(data?.totalSignups ?? 0)}
          icon={Users}
          color="purple"
          subtitle="Registrations from promo pages"
        />
        <MetricCard
          title="Conversions"
          value={isLoading ? "—" : formatNumber(data?.totalConversions ?? 0)}
          icon={UserCheck}
          color="emerald"
          subtitle="Purchases attributed"
        />
        <MetricCard
          title="Revenue"
          value={isLoading ? "—" : formatCurrency(data?.totalRevenue ?? 0)}
          icon={DollarSign}
          color="green"
          subtitle="From attributed conversions"
        />
      </div>

      {/* Channel Attribution (UTM Source: Klaviyo, Facebook, etc.) */}
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200 flex items-center gap-2">
          <Hash className="w-5 h-5 text-indigo-500" />
          Channel Attribution (UTM Source)
        </h3>
        <p className="text-sm text-gray-500 px-4 pt-2 pb-1">
          Visitors, signups, and conversions by marketing channel (e.g. Klaviyo, Facebook). Add{" "}
          <code className="bg-gray-100 px-1 rounded">utm_source=klaviyo</code> or{" "}
          <code className="bg-gray-100 px-1 rounded">utm_source=facebook</code> to campaign URLs.
        </p>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : (() => {
            const rows = data?.byUTMSource ?? [];
            if (rows.length === 0) {
              return (
                <div className="p-8 text-center text-gray-500">
                  No channel data for this period. Campaign links need <code className="bg-gray-100 px-1 rounded">utm_source</code> in the URL.
                </div>
              );
            }
            return (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-700">Channel</th>
                    <th className="text-right p-3 font-semibold">Visits</th>
                    <th className="text-right p-3 font-semibold">Signups</th>
                    <th className="text-right p-3 font-semibold">Conversions</th>
                    <th className="text-right p-3 font-semibold">Revenue</th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold">V→S %</th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold">S→C %</th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold">Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.utmSource}
                      className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() =>
                        setSelectedChannel({
                          utmSource: row.utmSource,
                          summary: { visits: row.visits, signups: row.signups, conversions: row.conversions, revenue: row.revenue },
                        })
                      }
                    >
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            row.utmSource === "Direct"
                              ? "bg-gray-100 text-gray-700"
                              : "bg-indigo-100 text-indigo-800"
                          }`}
                        >
                          {row.utmSource}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono">{formatNumber(row.visits)}</td>
                      <td className="p-3 text-right font-mono">{formatNumber(row.signups)}</td>
                      <td className="p-3 text-right font-mono">{formatNumber(row.conversions)}</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(row.revenue)}</td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600">{formatPercentage(row.visitToSignupRate)}</td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600">{formatPercentage(row.signupToConversionRate)}</td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600">{formatPercentage(row.overallConversionRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
          Performance by Promotion Page
        </h3>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-700">Page</th>
                  <th className="text-right p-3 font-semibold">
                    <button
                      onClick={() => handleSort("visits")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600"
                    >
                      Visits {getSortIcon("visits")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold">
                    <button
                      onClick={() => handleSort("crossVisits")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600"
                      title="Visits from other toolset landing pages"
                    >
                      Cross-visits {getSortIcon("crossVisits")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold">
                    <button
                      onClick={() => handleSort("signups")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600"
                    >
                      Signups {getSortIcon("signups")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold">
                    <button
                      onClick={() => handleSort("conversions")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600"
                    >
                      Conversions {getSortIcon("conversions")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold">
                    <button
                      onClick={() => handleSort("revenue")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600"
                    >
                      Revenue {getSortIcon("revenue")}
                    </button>
                  </th>
                  <th className="hidden md:table-cell text-right p-3 font-semibold">V→S %</th>
                  <th className="hidden md:table-cell text-right p-3 font-semibold">S→C %</th>
                  <th className="hidden md:table-cell text-right p-3 font-semibold">Conv %</th>
                </tr>
              </thead>
              <tbody>
                {sortedPages.map((row) => (
                  <tr
                    key={`${row.pageType}-${row.slug}`}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() =>
                      setSelectedPage({
                        pageType: row.pageType,
                        slug: row.slug,
                        pageLabel: getPrizeLabel(row.slug) ?? row.slug,
                        summary: { visits: row.visits, signups: row.signups, conversions: row.conversions, revenue: row.revenue },
                      })
                    }
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            row.pageType === "toolset" ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {row.pageType === "toolset" ? "Toolset" : "Evergreen"}
                        </span>
                        <span className="font-medium text-gray-900">
                          {getPrizeLabel(row.slug) ?? row.slug}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono">{formatNumber(row.visits)}</td>
                    <td className="p-3 text-right font-mono" title="From other toolset pages">{formatNumber(row.crossVisits ?? 0)}</td>
                    <td className="p-3 text-right font-mono">{formatNumber(row.signups)}</td>
                    <td className="p-3 text-right font-mono">{formatNumber(row.conversions)}</td>
                    <td className="p-3 text-right font-mono">{formatCurrency(row.revenue)}</td>
                    <td className="hidden md:table-cell p-3 text-right text-gray-600">{formatPercentage(row.visitToSignupRate)}</td>
                    <td className="hidden md:table-cell p-3 text-right text-gray-600">{formatPercentage(row.signupToConversionRate)}</td>
                    <td className="hidden md:table-cell p-3 text-right text-gray-600">{formatPercentage(row.overallConversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Page Detail Modal */}
      {selectedPage && (
        <PromoPageDetailModal
          isOpen={true}
          onClose={() => setSelectedPage(null)}
          pageType={selectedPage.pageType}
          slug={selectedPage.slug}
          pageLabel={selectedPage.pageLabel}
          startDate={startDate}
          endDate={endDate}
          summaryFromParent={selectedPage.summary}
        />
      )}

      {/* Channel Detail Modal */}
      {selectedChannel && (
        <ChannelDetailModal
          isOpen={true}
          onClose={() => setSelectedChannel(null)}
          utmSource={selectedChannel.utmSource}
          startDate={startDate}
          endDate={endDate}
          summaryFromParent={selectedChannel.summary}
        />
      )}
    </div>
  );
}
