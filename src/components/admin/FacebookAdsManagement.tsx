"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { format, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  DollarSign,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  Check,
  CheckCircle,
  Eye,
  MousePointerClick,
  Target,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Search,
  Layers,
  BarChart2,
  LayoutList,
  Image,
} from "lucide-react";
import Checkbox from "@/components/modals/ui/Checkbox";
import Dropdown from "@/components/modals/ui/Dropdown";
import { useFacebookAdsInsights, useHourlyInsights } from "@/hooks/queries/useFacebookAdsInsights";
import type { DateRangeOption, InsightLevel, FacebookAdsBreakdownItem } from "@/types/facebook-ads";
import DateRangeToggle, { DateRange } from "@/components/admin/DateRangeToggle";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import CustomDateRangeModal from "./CustomDateRangeModal";
import { useMajorDrawsForDateRange, useCurrentAndLastDrawDates } from "@/hooks/queries/useAdminQueries";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import { DailyMetricsView } from "./metrics/DailyMetricsView";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Facebook Ads Management Component
 *
 * Displays Facebook ad performance metrics including:
 * - Ad Spend
 * - Revenue (from Facebook Conversions API)
 * - Profit (Revenue - Spend)
 * - ROAS (Return on Ad Spend)
 *
 * Features:
 * - Real-time data fetching with caching
 * - Date range selection (Today / Custom Range)
 * - Granularity levels (Account / Campaign / Ad Set)
 * - Summary cards with key metrics
 * - Data table for breakdown views
 * - Loading states and error handling
 * - Cached data indicators
 */
export default function FacebookAdsManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // State management - synced with URL params
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const [level, setLevel] = useState<InsightLevel>("campaign");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  // View mode with URL persistence
  const urlViewMode = (searchParams.get("viewMode") as "ads" | "metrics") || "ads";
  const [viewMode, setViewMode] = useState<"ads" | "metrics">(urlViewMode);

  // Sync viewMode with URL params on mount and when URL changes
  // Use a stable value from searchParams to avoid dependency array issues
  const urlViewModeValue = searchParams.get("viewMode") || "ads";
  useEffect(() => {
    setViewMode(urlViewModeValue as "ads" | "metrics");
  }, [urlViewModeValue]);

  // Update URL when viewMode changes
  const handleViewModeChange = (mode: "ads" | "metrics") => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("viewMode", mode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Sync date filter state with URL params on mount and when URL changes
  useEffect(() => {
    const urlDateRange = (searchParams.get("dateRange") as DateRange) || "today";
    let urlStartDate = searchParams.get("startDate") || "";
    let urlEndDate = searchParams.get("endDate") || "";

    // If "today" or "yesterday" is selected but no dates in URL, calculate and set them (for hourly breakdown)
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

    // If "all-time" is selected but no dates in URL, calculate and set them (website launch → today)
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

    // Update state from URL params (only if changed to avoid unnecessary re-renders)
    setDateRange((prev) => (prev !== urlDateRange ? urlDateRange : prev));
    setStartDate((prev) => (prev !== urlStartDate ? urlStartDate : prev));
    setEndDate((prev) => (prev !== urlEndDate ? urlEndDate : prev));

    // Don't auto-collapse on mobile anymore since title is hidden
  }, [searchParams, pathname, router]);

  // Fetch major draws for date range selection
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  // Fetch current and last draw dates
  const { data: drawDates } = useCurrentAndLastDrawDates();

  // Convert DateRange to DateRangeOption
  // Note: "all-time", "current-draw", and "last-draw" are converted to "custom" with dates for API compatibility
  const dateRangeOption: DateRangeOption = useMemo(() => {
    if (dateRange === "all-time" || dateRange === "current-draw" || dateRange === "last-draw") {
      // If we have dates already (from URL), use them
      if (startDate && endDate) {
        return "custom";
      }
      // Otherwise, return "custom" (dates will be set by updateDateFilter)
      return "custom";
    }
    return dateRange as DateRangeOption;
  }, [dateRange, startDate, endDate]);

  // Build query parameters
  const queryParams = useMemo(() => {
    const params: {
      dateRange: DateRangeOption;
      startDate?: string;
      endDate?: string;
      level: InsightLevel;
      refresh?: boolean;
      enabled?: boolean;
    } = {
      dateRange: dateRangeOption,
      level,
    };

    // Include dates for custom ranges (including converted draw-based ranges)
    if (dateRangeOption === "custom") {
      // For all-time: always compute dates inline (don't rely on async state)
      if (dateRange === "all-time") {
        const launchDate = getWebsiteLaunchDateUTC();
        const today = new Date();
        params.startDate = formatInTimeZone(launchDate, AEST_TIMEZONE, "yyyy-MM-dd");
        params.endDate = formatInTimeZone(today, AEST_TIMEZONE, "yyyy-MM-dd");
      }
      // For draw-based ranges, ensure dates are available
      else if ((dateRange === "current-draw" || dateRange === "last-draw") && drawDates) {
        if (dateRange === "current-draw" && drawDates.currentDraw) {
          params.startDate = drawDates.currentDraw.startDate;
          params.endDate = drawDates.currentDraw.endDate;
        } else if (dateRange === "last-draw" && drawDates.lastDraw) {
          params.startDate = drawDates.lastDraw.startDate;
          params.endDate = drawDates.lastDraw.endDate;
        }
      } else if (startDate && endDate) {
        // For regular custom ranges (from modal)
        params.startDate = startDate;
        params.endDate = endDate;
      }

      // Only run query when we have valid dates (avoid 400 from API)
      params.enabled = !!(params.startDate && params.endDate);
    } else {
      params.enabled = true; // today/yesterday always valid
    }

    return params;
  }, [dateRangeOption, startDate, endDate, level, dateRange, drawDates]);

  // Fetch insights data
  const { data, isLoading, error } = useFacebookAdsInsights(queryParams);

  // Facebook-attributed conversions only (not all site purchases – you have Klaviyo, organic, etc.)
  const displayConversions = data?.summary?.conversions ?? 0;

  // Format currency (AUD)
  // Note: API returns summary values in dollars, not cents
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number, decimals: number = 1) => {
    return `${value.toFixed(decimals)}%`;
  };

  // Format number with commas
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-AU").format(value);
  };

  // Format ROAS (e.g., "4.6x")
  const formatROAS = (roas: number) => {
    return `${roas.toFixed(2)}x`;
  };

  // Update URL params when date filter changes
  const updateDateFilter = (range: DateRange, start?: string, end?: string) => {
    let finalRange = range;
    let finalStart = start;
    let finalEnd = end;

    // Handle today and yesterday - set dates in AEST so hourly breakdown works
    if (range === "today") {
      const now = new Date();
      finalStart = formatInTimeZone(now, AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "yesterday") {
      const yesterday = subDays(new Date(), 1);
      finalStart = formatInTimeZone(yesterday, AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "current-draw" && drawDates?.currentDraw) {
      finalRange = range;
      finalStart = drawDates.currentDraw.startDate;
      finalEnd = drawDates.currentDraw.endDate;
    } else if (range === "last-draw" && drawDates?.lastDraw) {
      finalRange = range;
      finalStart = drawDates.lastDraw.startDate;
      finalEnd = drawDates.lastDraw.endDate;
    } else if (range === "all-time") {
      // Handle "all-time": website launch date → today
      finalRange = "all-time"; // Keep as "all-time" in URL for UI
      const launchDate = getWebsiteLaunchDateUTC();
      const today = new Date();
      finalStart = formatInTimeZone(launchDate, AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = formatInTimeZone(today, AEST_TIMEZONE, "yyyy-MM-dd");
    }

    // Update state immediately for responsive UI
    setDateRange(finalRange);
    if (finalStart && finalEnd) {
      setStartDate(finalStart);
      setEndDate(finalEnd);
    } else {
      setStartDate("");
      setEndDate("");
    }

    // Don't auto-collapse on mobile anymore since title is hidden

    // Update URL params
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

  // Handle date range change from DateRangeToggle
  const handleDateRangeChange = (range: DateRange) => {
    if (range === "custom") {
      setIsCustomDateModalOpen(true);
    } else {
      updateDateFilter(range);
    }
  };

  // Format abbreviated date for collapsed view (matching AdminPage)
  const formatAbbreviatedDate = (startDate: string, endDate: string): string => {
    if (!startDate || !endDate) return "";
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check if same date
      if (format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
        return format(start, "MMM d, yyyy"); // "Dec 27, 2025"
      }
      
      // Different dates - show abbreviated range
      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`; // "Nov 27 - Dec 27, 2025"
    } catch {
      return "";
    }
  };

  // Get display date for collapsed view (matching AdminPage)
  const displayDate = useMemo(() => {
    if (dateRange === "custom" && startDate && endDate) {
      return formatAbbreviatedDate(startDate, endDate);
    }
    if (dateRange === "all-time") {
      return "All Time";
    }
    if (dateRange === "current-draw" && drawDates?.currentDraw) {
      return `Current Draw`;
    }
    if (dateRange === "last-draw" && drawDates?.lastDraw) {
      return `Last Draw`;
    }
    return null;
  }, [dateRange, startDate, endDate, drawDates]);

  // Table sorting functions
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Sort breakdown data
  const sortedBreakdown = useMemo(() => {
    if (!data?.breakdown || !sortColumn) {
      return data?.breakdown || [];
    }

    const getItemName = (a: FacebookAdsBreakdownItem) => {
      if (level === "campaign") return a.campaignName || a.campaignId || "";
      if (level === "adset") return a.adsetName || a.adsetId || "";
      return a.adName || a.adId || "";
    };

    const sorted = [...data.breakdown];
    sorted.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortColumn) {
        case "name":
          aValue = getItemName(a);
          bValue = getItemName(b);
          break;
        case "spend":
          aValue = a.spend;
          bValue = b.spend;
          break;
        case "revenue":
          aValue = a.revenue;
          bValue = b.revenue;
          break;
        case "profit":
          aValue = a.profit;
          bValue = b.profit;
          break;
        case "roas":
          aValue = a.roas;
          bValue = b.roas;
          break;
        case "conversions":
          aValue = a.conversions;
          bValue = b.conversions;
          break;
        default:
          return 0;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      const numA = typeof aValue === "number" ? aValue : 0;
      const numB = typeof bValue === "number" ? bValue : 0;
      return sortDirection === "asc" ? numA - numB : numB - numA;
    });

    return sorted;
  }, [data?.breakdown, sortColumn, sortDirection, level]);

  // Group ad sets by campaign
  const groupedAdsets = useMemo(() => {
    if (!sortedBreakdown.length || level !== "adset") return null;
    const groups: Record<string, { campaignName: string; items: FacebookAdsBreakdownItem[] }> = {};
    for (const item of sortedBreakdown) {
      const cid = item.campaignId ?? "";
      if (!groups[cid]) {
        groups[cid] = { campaignName: item.campaignName || "Unknown Campaign", items: [] };
      }
      groups[cid].items.push(item);
    }
    return Object.entries(groups).map(([cid, g]) => ({ campaignId: cid, campaignName: g.campaignName, items: g.items }));
  }, [sortedBreakdown, level]);

  // Group ads by campaign > ad set
  const groupedAds = useMemo(() => {
    if (!sortedBreakdown.length || level !== "ad") return null;
    const groups: Record<string, { campaignName: string; adSets: Record<string, { adsetName: string; items: FacebookAdsBreakdownItem[] }> }> = {};
    for (const item of sortedBreakdown) {
      const cid = item.campaignId ?? "";
      const aid = item.adsetId ?? "";
      if (!groups[cid]) {
        groups[cid] = { campaignName: item.campaignName || "Unknown Campaign", adSets: {} };
      }
      if (!groups[cid].adSets[aid]) {
        groups[cid].adSets[aid] = { adsetName: item.adsetName || "Unknown Ad Set", items: [] };
      }
      groups[cid].adSets[aid].items.push(item);
    }
    return Object.entries(groups).map(([cid, g]) => ({
      campaignId: cid,
      campaignName: g.campaignName,
      adSets: Object.entries(g.adSets).map(([aid, a]) => ({ adsetId: aid, adsetName: a.adsetName, items: a.items })),
    }));
  }, [sortedBreakdown, level]);

  // Breakdown table totals (sum of all rows)
  const breakdownTotals = useMemo(() => {
    if (!sortedBreakdown.length) return null;
    const t = sortedBreakdown.reduce(
      (acc, item) => ({
        spend: acc.spend + item.spend,
        revenue: acc.revenue + item.revenue,
        profit: acc.profit + item.profit,
        conversions: acc.conversions + item.conversions,
      }),
      { spend: 0, revenue: 0, profit: 0, conversions: 0 }
    );
    return { ...t, roas: t.spend > 0 ? t.revenue / t.spend : 0 };
  }, [sortedBreakdown]);

  // Get sort icon for column header
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 ml-1 text-gray-700" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-gray-700" />
    );
  };

  // Loading skeleton (also when query disabled waiting for params, e.g. draw dates)
  if (isLoading || queryParams.enabled === false) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6 animate-pulse">
              <div className="h-10 w-10 bg-gray-200 rounded-lg mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>

        {/* Controls Skeleton */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6 animate-pulse">
          <div className="h-10 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-200 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900">Error Loading Facebook Ads Data</h3>
        </div>
        <p className="text-gray-600">{error.message || "An error occurred while fetching data."}</p>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-6 sm:p-8 text-center">
        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Available</h3>
        <p className="text-gray-600">No Facebook ads data found for the selected date range.</p>
      </div>
    );
  }

  const { summary } = data;

  // Component for hourly breakdown table – Facebook data only
  function HourlyBreakdownSection({
    startDate,
    endDate,
    breakdown,
    breakdownLevel,
    showFilter = true,
  }: {
    startDate: string;
    endDate: string;
    breakdown: FacebookAdsBreakdownItem[];
    breakdownLevel: InsightLevel;
    showFilter?: boolean;
  }) {
    const [hourlySortColumn, setHourlySortColumn] = useState<string>("hour");
    const [hourlySortDirection, setHourlySortDirection] = useState<"asc" | "desc">("asc");
    const [hourlyColumnsExpanded, setHourlyColumnsExpanded] = useState(false);
    // Filter: empty = all; non-empty = selected campaigns/ad sets only
    const [selectedFilterIds, setSelectedFilterIds] = useState<Set<string>>(new Set());
    // Pending selection (only applied when user clicks Apply)
    const [pendingFilterIds, setPendingFilterIds] = useState<Set<string>>(new Set());
    const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
    const [dropdownSearchQuery, setDropdownSearchQuery] = useState("");
    const filterDropdownRef = useRef<HTMLDivElement>(null);

    const filterLevel: "campaign" | "adset" | "ad" | undefined =
      breakdownLevel === "campaign"
        ? "campaign"
        : breakdownLevel === "adset"
          ? "adset"
          : breakdownLevel === "ad"
            ? "ad"
            : undefined;

    // Reset filter when switching between campaign/ad set level
    useEffect(() => {
      setSelectedFilterIds(new Set());
      setPendingFilterIds(new Set());
      setDropdownSearchQuery("");
    }, [breakdownLevel]);

    // Filter breakdown items by search query
    const filteredBreakdownForDropdown = useMemo(() => {
      const q = dropdownSearchQuery.trim().toLowerCase();
      if (!q) return breakdown;
      return breakdown.filter((item) => {
        const name =
          breakdownLevel === "campaign"
            ? item.campaignName || item.campaignId || ""
            : breakdownLevel === "adset"
              ? item.adsetName || item.adsetId || ""
              : item.adName || item.adId || "";
        return name.toLowerCase().includes(q);
      });
    }, [breakdown, breakdownLevel, dropdownSearchQuery]);

    // Group filtered items for hierarchical display: Campaign > Ad Set > Ad
    const groupedForFilterDropdown = useMemo(() => {
      if (breakdownLevel === "campaign") {
        return filteredBreakdownForDropdown.map((item) => ({
          type: "campaign" as const,
          campaignId: item.campaignId ?? "",
          campaignName: item.campaignName || "Unknown Campaign",
          items: [item],
        }));
      }
      if (breakdownLevel === "adset") {
        const byCampaign: Record<string, { campaignName: string; adSets: { adsetId: string; adsetName: string; items: FacebookAdsBreakdownItem[] }[] }> = {};
        for (const item of filteredBreakdownForDropdown) {
          const cid = item.campaignId ?? "";
          if (!byCampaign[cid]) {
            byCampaign[cid] = { campaignName: item.campaignName || "Unknown Campaign", adSets: [] };
          }
          const aid = item.adsetId ?? "";
          const existing = byCampaign[cid].adSets.find((a) => a.adsetId === aid);
          if (existing) existing.items.push(item);
          else byCampaign[cid].adSets.push({ adsetId: aid, adsetName: item.adsetName || "Unknown Ad Set", items: [item] });
        }
        return Object.entries(byCampaign).map(([cid, g]) => ({
          type: "adset" as const,
          campaignId: cid,
          campaignName: g.campaignName,
          adSets: g.adSets,
        }));
      }
      // Ad level: Campaign > Ad Set > Ad
      const byCampaign: Record<
        string,
        {
          campaignName: string;
          adSets: Record<string, { adsetName: string; ads: FacebookAdsBreakdownItem[] }>;
        }
      > = {};
      for (const item of filteredBreakdownForDropdown) {
        const cid = item.campaignId ?? "";
        if (!byCampaign[cid]) {
          byCampaign[cid] = { campaignName: item.campaignName || "Unknown Campaign", adSets: {} };
        }
        const aid = item.adsetId ?? "";
        if (!byCampaign[cid].adSets[aid]) {
          byCampaign[cid].adSets[aid] = { adsetName: item.adsetName || "Unknown Ad Set", ads: [] };
        }
        byCampaign[cid].adSets[aid].ads.push(item);
      }
      return Object.entries(byCampaign).map(([cid, g]) => ({
        type: "ad" as const,
        campaignId: cid,
        campaignName: g.campaignName,
        adSets: Object.entries(g.adSets).map(([aid, a]) => ({ adsetId: aid, adsetName: a.adsetName, ads: a.ads })),
      }));
    }, [breakdownLevel, filteredBreakdownForDropdown]);

    // Close filter dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
          setFilterDropdownOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const allIds = useMemo(
      () =>
        breakdown
          .map((b) =>
            breakdownLevel === "campaign"
              ? b.campaignId ?? ""
              : breakdownLevel === "adset"
                ? b.adsetId ?? ""
                : breakdownLevel === "ad"
                  ? b.adId ?? ""
                  : ""
          )
          .filter(Boolean),
      [breakdown, breakdownLevel]
    );

    // Pass level-specific IDs so hourly matches the breakdown table:
    // - No filter or all selected: use allIds (all campaigns or all ad sets at this level)
    // - Subset selected: use selectedFilterIds
    // - Empty breakdown: undefined = account-level
    const filterIds = useMemo(() => {
      if (allIds.length === 0) return undefined;
      if (selectedFilterIds.size === 0 || selectedFilterIds.size === allIds.length) {
        return allIds;
      }
      return Array.from(selectedFilterIds);
    }, [allIds, selectedFilterIds]);

    const { data: hourlyData, isLoading: hourlyLoading, error: hourlyError } = useHourlyInsights({
      startDate,
      endDate,
      enabled: !!startDate && !!endDate,
      filterLevel: filterLevel,
      filterIds,
    });

    const handleOpenDropdown = () => {
      setPendingFilterIds(new Set(selectedFilterIds));
      setFilterDropdownOpen(true);
    };

    const handleApplyFilter = () => {
      setSelectedFilterIds(new Set(pendingFilterIds));
      setFilterDropdownOpen(false);
    };

    const handleSelectAllInDropdown = () => {
      if (pendingFilterIds.size === allIds.length) {
        setPendingFilterIds(new Set());
      } else {
        setPendingFilterIds(new Set(allIds));
      }
    };

    const handleTogglePendingItem = (id: string, checked: boolean) => {
      setPendingFilterIds((prev) => {
        const next = new Set(prev);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      });
    };

    // Toggle all items in a group: select all if any unselected, deselect all if all selected
    const handleToggleGroup = (ids: string[]) => {
      const validIds = ids.filter(Boolean);
      if (validIds.length === 0) return;
      setPendingFilterIds((prev) => {
        const allSelected = validIds.every((id) => prev.has(id));
        const next = new Set(prev);
        if (allSelected) {
          validIds.forEach((id) => next.delete(id));
        } else {
          validIds.forEach((id) => next.add(id));
        }
        return next;
      });
    };

    const handleHourlySort = (column: string) => {
      if (hourlySortColumn === column) {
        setHourlySortDirection(hourlySortDirection === "asc" ? "desc" : "asc");
      } else {
        setHourlySortColumn(column);
        setHourlySortDirection("desc");
      }
    };

    const sortedHourlyData = useMemo(() => {
      if (!hourlyData?.hourly) return [];
      const sorted = [...hourlyData.hourly];
      sorted.sort((a, b) => {
        let aValue: number;
        let bValue: number;
        switch (hourlySortColumn) {
          case "hour":
            aValue = a.hour;
            bValue = b.hour;
            break;
          case "spend":
            aValue = a.spend;
            bValue = b.spend;
            break;
          case "impressions":
            aValue = a.impressions;
            bValue = b.impressions;
            break;
          case "clicks":
            aValue = a.clicks;
            bValue = b.clicks;
            break;
          case "ctr":
            aValue = a.ctr;
            bValue = b.ctr;
            break;
          case "cpc":
            aValue = a.cpc;
            bValue = b.cpc;
            break;
          case "revenue":
            aValue = a.revenue;
            bValue = b.revenue;
            break;
          case "conversions":
            aValue = a.conversions;
            bValue = b.conversions;
            break;
          case "roas":
            aValue = a.roas;
            bValue = b.roas;
            break;
          case "profit":
            aValue = a.profit;
            bValue = b.profit;
            break;
          default:
            return 0;
        }
        return hourlySortDirection === "asc" ? aValue - bValue : bValue - aValue;
      });
      return sorted;
    }, [hourlyData, hourlySortColumn, hourlySortDirection]);

    const hourlyTotals = useMemo(() => {
      if (!hourlyData?.hourly?.length) return null;
      const t = hourlyData.hourly.reduce(
        (acc, h) => ({
          spend: acc.spend + h.spend,
          impressions: acc.impressions + h.impressions,
          clicks: acc.clicks + h.clicks,
          revenue: acc.revenue + h.revenue,
          conversions: acc.conversions + h.conversions,
          profit: acc.profit + h.profit,
        }),
        { spend: 0, impressions: 0, clicks: 0, revenue: 0, conversions: 0, profit: 0 }
      );
      return {
        ...t,
        ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
        cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
        roas: t.spend > 0 ? t.revenue / t.spend : 0,
      };
    }, [hourlyData]);

    const getHourlySortIcon = (column: string) => {
      if (hourlySortColumn !== column) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400" />;
      return hourlySortDirection === "asc" ? (
        <ArrowUp className="w-3 h-3 ml-1 text-gray-700" />
      ) : (
        <ArrowDown className="w-3 h-3 ml-1 text-gray-700" />
      );
    };

    if (hourlyLoading) {
      return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      );
    }

    if (hourlyError) {
      return (
        <div className="bg-white rounded-xl shadow-lg border-2 border-yellow-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900">Hourly Data Unavailable</h3>
          </div>
          <p className="text-sm text-gray-600">Unable to load hourly breakdown. {hourlyError.message}</p>
        </div>
      );
    }

    if (!hourlyData?.hourly || hourlyData.hourly.length === 0) return null;

    const someSelected = selectedFilterIds.size > 0;
    const filterLabel =
      breakdownLevel === "campaign"
        ? "Campaign"
        : breakdownLevel === "adset"
          ? "Ad Set"
          : "Ad";
    const pendingAllSelected = pendingFilterIds.size === allIds.length && allIds.length > 0;

    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-3">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900">
            Hourly Breakdown{showFilter && filterIds ? (filterIds.length === allIds.length ? " (All)" : ` (${filterIds.length} ${filterLabel}${filterIds.length === 1 ? "" : "s"} selected)`) : " (Account)"}
          </h3>
          <div className="flex flex-row items-center justify-between sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setHourlyColumnsExpanded((v) => !v)}
              className="sm:hidden flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              {hourlyColumnsExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" /> Show fewer columns
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" /> Show more columns
                </>
              )}
            </button>
            {showFilter && breakdown.length > 0 && (
            <div className="relative ml-auto sm:ml-0" ref={filterDropdownRef}>
              <button
                type="button"
                onClick={() => (filterDropdownOpen ? setFilterDropdownOpen(false) : handleOpenDropdown())}
                className={`
                  inline-flex items-center justify-between gap-2 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg border-2 transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                  ${filterDropdownOpen ? "ring-2 ring-red-500 border-transparent" : "border-gray-300 bg-white hover:border-gray-400"}
                `}
                aria-expanded={filterDropdownOpen}
              >
                <span className="truncate max-w-[140px] sm:max-w-[180px]">
                  {someSelected ? `${selectedFilterIds.size} selected` : "Filter by " + filterLabel}
                </span>
                <ChevronDown
                  className="flex-shrink-0 w-4 h-4 text-gray-400 transition-transform duration-200"
                  style={{ transform: filterDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              {filterDropdownOpen && (
                <div
                  className="absolute right-0 mt-1 min-w-[280px] min-h-[320px] max-h-[480px] overflow-hidden bg-white border-2 border-gray-300 rounded-lg shadow-lg z-50 flex flex-col"
                  style={{
                    touchAction: "pan-y",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  <div className="flex items-center gap-2 px-2 py-2 border-b border-gray-200 shrink-0">
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                      <input
                        type="text"
                        value={dropdownSearchQuery}
                        onChange={(e) => setDropdownSearchQuery(e.target.value)}
                        placeholder={`Search ${filterLabel}s...`}
                        className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-red-500/30 focus:border-red-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSelectAllInDropdown}
                      className="text-xs font-medium text-gray-700 hover:text-red-600 transition-colors whitespace-nowrap shrink-0"
                    >
                      {pendingAllSelected ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="overflow-y-auto flex-1 min-h-0 max-h-[320px] py-2">
                    {groupedForFilterDropdown.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs sm:text-sm text-gray-500">
                        {dropdownSearchQuery.trim()
                          ? `No ${filterLabel}s match "${dropdownSearchQuery}"`
                          : `No ${filterLabel}s available`}
                      </div>
                    ) : (
                      groupedForFilterDropdown.map((group) => {
                        if (group.type === "campaign") {
                          return (
                            <div key={group.campaignId} className="border-b border-gray-100 last:border-b-0">
                              {group.items.map((item) => {
                                const id = item.campaignId ?? "";
                                const displayName = item.campaignName || id || "Unknown";
                                if (!id) return null;
                                return (
                                  <div key={id} className="px-3 py-1.5">
                                    <Checkbox
                                      id={`hourly-filter-${id}`}
                                      checked={pendingFilterIds.has(id)}
                                      onChange={(e) => handleTogglePendingItem(id, e.target.checked)}
                                      label={displayName}
                                      className="text-xs sm:text-sm"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        if (group.type === "adset") {
                          const campaignAdsetIds = group.adSets.flatMap((a) => a.items.map((i) => i.adsetId ?? "").filter(Boolean));
                          const allSelected = campaignAdsetIds.length > 0 && campaignAdsetIds.every((id) => pendingFilterIds.has(id));
                          return (
                            <div key={group.campaignId} className="border-b border-gray-100 last:border-b-0">
                              <button
                                type="button"
                                onClick={() => handleToggleGroup(campaignAdsetIds)}
                                className="w-full px-3 py-1.5 mt-1 bg-gray-50 text-xs font-semibold text-gray-600 truncate text-left hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                              >
                                <span
                                  className={`inline-flex w-4 h-4 shrink-0 items-center justify-center rounded border-2 ${
                                    allSelected ? "bg-red-600 border-red-600" : "border-gray-300"
                                  }`}
                                >
                                  {allSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                </span>
                                {group.campaignName}
                              </button>
                              {group.adSets.map((adset) =>
                                adset.items.map((item) => {
                                  const id = item.adsetId ?? "";
                                  const displayName = item.adsetName || id || "Unknown";
                                  if (!id) return null;
                                  return (
                                    <div key={id} className="pl-6 pr-3 py-1">
                                      <Checkbox
                                        id={`hourly-filter-${id}`}
                                        checked={pendingFilterIds.has(id)}
                                        onChange={(e) => handleTogglePendingItem(id, e.target.checked)}
                                        label={displayName}
                                        className="text-xs sm:text-sm"
                                      />
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          );
                        }
                        // Ad level: Campaign > Ad Set > Ad
                        const campaignAdIds = group.adSets.flatMap((a) => a.ads.map((i) => i.adId ?? "").filter(Boolean));
                        const campaignAllSelected = campaignAdIds.length > 0 && campaignAdIds.every((id) => pendingFilterIds.has(id));
                        return (
                          <div key={group.campaignId} className="border-b border-gray-100 last:border-b-0">
                            <button
                              type="button"
                              onClick={() => handleToggleGroup(campaignAdIds)}
                              className="w-full px-3 py-1 mt-1 bg-gray-50 text-xs font-semibold text-gray-600 truncate text-left hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                            >
                              <span
                                className={`inline-flex w-4 h-4 shrink-0 items-center justify-center rounded border-2 ${
                                  campaignAllSelected ? "bg-red-600 border-red-600" : "border-gray-300"
                                }`}
                              >
                                {campaignAllSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                              </span>
                              {group.campaignName}
                            </button>
                            {group.adSets.map((adset) => {
                              const adsetAdIds = adset.ads.map((i) => i.adId ?? "").filter(Boolean);
                              const adsetAllSelected = adsetAdIds.length > 0 && adsetAdIds.every((id) => pendingFilterIds.has(id));
                              return (
                              <div key={adset.adsetId}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleGroup(adsetAdIds)}
                                  className="w-full pl-4 py-0.5 text-xs font-medium text-gray-500 truncate text-left hover:bg-gray-50/80 cursor-pointer flex items-center gap-2"
                                >
                                  <span
                                    className={`inline-flex w-3.5 h-3.5 shrink-0 items-center justify-center rounded border-2 ${
                                      adsetAllSelected ? "bg-red-600 border-red-600" : "border-gray-300"
                                    }`}
                                  >
                                    {adsetAllSelected && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
                                  </span>
                                  {adset.adsetName}
                                </button>
                                {adset.ads.map((item) => {
                                  const id = item.adId ?? "";
                                  const displayName = item.adName || id || "Unknown";
                                  if (!id) return null;
                                  return (
                                    <div key={id} className="pl-8 pr-3 py-0.5">
                                      <Checkbox
                                        id={`hourly-filter-${id}`}
                                        checked={pendingFilterIds.has(id)}
                                        onChange={(e) => handleTogglePendingItem(id, e.target.checked)}
                                        label={displayName}
                                        className="text-xs sm:text-sm"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            );
                            })}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex justify-end gap-2 px-3 py-2 border-t border-gray-200 bg-gray-50">
                    <button
                      type="button"
                      onClick={() => setFilterDropdownOpen(false)}
                      className="px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:text-gray-900 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyFilter}
                      className="px-3 py-1.5 text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
        <div className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: "touch" }}>
          <table className="w-full min-w-[300px] sm:min-w-[700px]">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th
                  className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-left py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                  onClick={() => handleHourlySort("hour")}
                >
                  <div className="flex items-center">Hour{getHourlySortIcon("hour")}</div>
                </th>
                <th
                  className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                  onClick={() => handleHourlySort("spend")}
                >
                  <div className="flex items-center justify-end">Spend{getHourlySortIcon("spend")}</div>
                </th>
                <th
                  className={`sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}
                  onClick={() => handleHourlySort("impressions")}
                >
                  <div className="flex items-center justify-end">Impressions{getHourlySortIcon("impressions")}</div>
                </th>
                <th
                  className={`sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}
                  onClick={() => handleHourlySort("clicks")}
                >
                  <div className="flex items-center justify-end">Clicks{getHourlySortIcon("clicks")}</div>
                </th>
                <th
                  className={`sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}
                  onClick={() => handleHourlySort("ctr")}
                >
                  <div className="flex items-center justify-end">CTR{getHourlySortIcon("ctr")}</div>
                </th>
                <th
                  className={`sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}
                  onClick={() => handleHourlySort("cpc")}
                >
                  <div className="flex items-center justify-end">CPC{getHourlySortIcon("cpc")}</div>
                </th>
                <th
                  className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                  onClick={() => handleHourlySort("revenue")}
                >
                  <div className="flex items-center justify-end" title="Revenue">Rev{getHourlySortIcon("revenue")}</div>
                </th>
                <th
                  className={`sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}
                  onClick={() => handleHourlySort("profit")}
                >
                  <div className="flex items-center justify-end">Profit{getHourlySortIcon("profit")}</div>
                </th>
                <th
                  className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                  onClick={() => handleHourlySort("roas")}
                >
                  <div className="flex items-center justify-end">ROAS{getHourlySortIcon("roas")}</div>
                </th>
                <th
                  className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                  onClick={() => handleHourlySort("conversions")}
                >
                  <div className="flex items-center justify-end" title="Conversions">Conv{getHourlySortIcon("conversions")}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedHourlyData.map((hour) => (
                <tr key={hour.hour} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900 font-medium">{hour.label}</td>
                  <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">{formatCurrency(hour.spend)}</td>
                  <td className={`py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>{formatNumber(hour.impressions)}</td>
                  <td className={`py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>{formatNumber(hour.clicks)}</td>
                  <td className={`py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>{formatPercentage(hour.ctr)}</td>
                  <td className={`py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>{formatCurrency(hour.cpc)}</td>
                  <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">{formatCurrency(hour.revenue)}</td>
                  <td className={`py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right font-semibold ${hour.profit >= 0 ? "text-emerald-600" : "text-red-600"} ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>
                    {formatCurrency(hour.profit)}
                  </td>
                  <td className={`py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right font-semibold ${hour.roas >= 2 ? "text-emerald-600" : hour.roas >= 1 ? "text-gray-900" : "text-red-600"}`}>
                    {formatROAS(hour.roas)}
                  </td>
                  <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">{hour.conversions}</td>
                </tr>
              ))}
              {hourlyTotals && (
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900">Total</td>
                  <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">{formatCurrency(hourlyTotals.spend)}</td>
                  <td className={`py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>{formatNumber(hourlyTotals.impressions)}</td>
                  <td className={`py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>{formatNumber(hourlyTotals.clicks)}</td>
                  <td className={`py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>{formatPercentage(hourlyTotals.ctr)}</td>
                  <td className={`py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>{formatCurrency(hourlyTotals.cpc)}</td>
                  <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">{formatCurrency(hourlyTotals.revenue)}</td>
                  <td className={`py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right ${hourlyTotals.profit >= 0 ? "text-emerald-600" : "text-red-600"} ${!hourlyColumnsExpanded ? "hidden sm:table-cell" : ""}`}>
                    {formatCurrency(hourlyTotals.profit)}
                  </td>
                  <td className={`py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right ${hourlyTotals.roas >= 1 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatROAS(hourlyTotals.roas)}
                  </td>
                  <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">{hourlyTotals.conversions}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* Header with Controls - View Level on top for easier toggling */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 min-w-0 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="hidden sm:block text-sm sm:text-lg lg:text-xl font-bold text-gray-900 truncate">
            Facebook Ads Performance
          </h2>
         
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 min-w-0 max-w-full flex-wrap">
          {/* View Level - Top for easier toggling, default Campaign */}
          {viewMode === "ads" && (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 min-w-[200px] sm:min-w-[240px]">
              <label className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap hidden sm:inline">
                View Level:
              </label>
              <Dropdown
                options={[
                  { value: "account", label: "Account", icon: Layers },
                  { value: "campaign", label: "Campaign", icon: BarChart2 },
                  { value: "adset", label: "Ad Set", icon: LayoutList },
                  { value: "ad", label: "Ad", icon: Image },
                ]}
                value={level}
                onChange={(value) => setLevel(value as InsightLevel)}
                placeholder="View Level"
                compact
              />
            </div>
          )}
          {/* View Mode Toggle - Hidden on mobile, shown on desktop */}
          <div className="hidden sm:flex items-center gap-2 bg-gray-100 rounded-lg p-1 flex-shrink-0">
            <button
              onClick={() => handleViewModeChange("ads")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "ads"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Ads
            </button>
            <button
              onClick={() => handleViewModeChange("metrics")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "metrics"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Metrics
            </button>
          </div>
          {/* Date Range Toggle - Only show for Ads view */}
          {viewMode === "ads" && (
            <div className="flex-shrink-0 min-w-0 max-w-full sm:w-auto">
              <DateRangeToggle
                selectedRange={dateRange}
                onRangeChange={handleDateRangeChange}
                onCustomClick={() => setIsCustomDateModalOpen(true)}
                collapsed={false}
                displayDate={displayDate || undefined}
                onExpand={() => {}}
              />
            </div>
          )}
        </div>
      </div>

      {/* Content based on view mode */}
      {viewMode === "metrics" ? (
        <DailyMetricsView />
      ) : (
        <>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Ad Spend"
          value={formatCurrency(summary.spend)}
          subtitle="Total advertising cost"
          icon={DollarSign}
          color="red"
        />
        <MetricCard
          title="Revenue"
          value={formatCurrency(summary.revenue)}
          subtitle="From Facebook conversions"
          icon={TrendingUp}
          color="emerald"
        />
        <MetricCard
          title="Profit"
          value={formatCurrency(summary.profit)}
          subtitle="Revenue - Spend"
          icon={BarChart3}
          color={summary.profit >= 0 ? "emerald" : "red"}
        />
        <MetricCard
          title="ROAS"
          value={formatROAS(summary.roas)}
          subtitle="Return on Ad Spend"
          icon={Target}
          color="purple"
        />
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard title="Impressions" value={formatNumber(summary.impressions)} icon={Eye} color="blue" />
        <MetricCard title="Clicks" value={formatNumber(summary.clicks)} icon={MousePointerClick} color="indigo" />
        <MetricCard title="CTR" value={formatPercentage(summary.ctr)} icon={Target} color="yellow" />
        <MetricCard title="CPC" value={formatCurrency(summary.cpc)} icon={DollarSign} color="blue" />
      </div>

      {/* Conversions - Facebook-attributed only (not all site purchases) */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
        <div className="flex items-center justify-between mb-2 sm:mb-4">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900">Conversions</h3>
          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-gray-900">{formatNumber(displayConversions)}</div>
        <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Facebook-attributed purchases only</p>
      </div>

      {/* Hourly Breakdown - Show when date range is available (Account level shows account totals) */}
      {startDate && endDate && (
        <HourlyBreakdownSection
          startDate={startDate}
          endDate={endDate}
          breakdown={data.breakdown ?? []}
          breakdownLevel={level}
          showFilter={level !== "account"}
        />
      )}

      {/* Breakdown Table (for Campaign/Ad Set/Ad levels) - hidden for Account */}
      {data.breakdown && data.breakdown.length > 0 && level !== "account" && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-1">
            {level === "campaign" ? "Campaign Breakdown" : level === "adset" ? "Ad Set Breakdown" : "Ad Breakdown"}
          </h3>
          <p className="text-xs text-gray-500 mb-3 sm:mb-4">
            {level === "adset" || level === "ad"
              ? "Grouped by campaign. All metrics from Facebook (matches Conversions card above)."
              : "All metrics from Facebook (matches Conversions card above)."}
          </p>
          <div className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="w-full min-w-[300px] sm:min-w-[600px]">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th
                    className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-left py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center truncate">
                      {level === "campaign"
                        ? "Campaign"
                        : level === "adset"
                          ? "Ad Set"
                          : "Ad"}
                      {getSortIcon("name")}
                    </div>
                  </th>
                  <th
                    className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("spend")}
                  >
                    <div className="flex items-center justify-end">
                      Spend
                      {getSortIcon("spend")}
                    </div>
                  </th>
                  <th
                    className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("revenue")}
                  >
                    <div className="flex items-center justify-end" title="Revenue">
                      Rev
                      {getSortIcon("revenue")}
                    </div>
                  </th>
                  <th
                    className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("profit")}
                  >
                    <div className="flex items-center justify-end">
                      Profit
                      {getSortIcon("profit")}
                    </div>
                  </th>
                  <th
                    className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("roas")}
                  >
                    <div className="flex items-center justify-end">
                      ROAS
                      {getSortIcon("roas")}
                    </div>
                  </th>
                  <th
                    className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("conversions")}
                  >
                    <div className="flex items-center justify-end" title="Conversions">
                      Conv
                      {getSortIcon("conversions")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedAdsets ? (
                    groupedAdsets.map((group) => (
                      <React.Fragment key={group.campaignId}>
                        <tr className="bg-gray-100 border-b border-gray-200">
                          <td colSpan={6} className="py-1.5 px-0.5 sm:py-2.5 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
                            📁 {group.campaignName}
                          </td>
                        </tr>
                        {group.items.map((item, idx) => (
                          <tr
                            key={item.adsetId ?? idx}
                            className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                          >
                            <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900 font-medium pl-4 sm:pl-8">
                              {item.adsetName || item.adsetId || "Unknown Ad Set"}
                            </td>
                            <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                              {formatCurrency(item.spend)}
                            </td>
                            <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                              {formatCurrency(item.revenue)}
                            </td>
                            <td
                              className={`py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right font-semibold ${
                                item.profit >= 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {formatCurrency(item.profit)}
                            </td>
                            <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                              {formatROAS(item.roas)}
                            </td>
                            <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-medium">
                              {formatNumber(item.conversions)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                ) : groupedAds ? (
                    groupedAds.map((group) => (
                      <React.Fragment key={group.campaignId}>
                        <tr className="bg-gray-100 border-b border-gray-200">
                          <td colSpan={6} className="py-1.5 px-0.5 sm:py-2.5 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">
                            📁 {group.campaignName}
                          </td>
                        </tr>
                        {group.adSets.map((adSetGroup) => (
                          <React.Fragment key={adSetGroup.adsetId}>
                            <tr className="bg-gray-50/80 border-b border-gray-200">
                              <td colSpan={6} className="py-1 px-0.5 sm:py-2 sm:px-4 text-xs sm:text-xs font-medium text-gray-600 pl-4 sm:pl-8">
                                ↳ {adSetGroup.adsetName}
                              </td>
                            </tr>
                            {adSetGroup.items.map((item, idx) => (
                              <tr
                                key={item.adId ?? idx}
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                              >
                                <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900 font-medium pl-6 sm:pl-12">
                                  {item.adName || item.adId || "Unknown Ad"}
                                </td>
                                <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                                  {formatCurrency(item.spend)}
                                </td>
                                <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                                  {formatCurrency(item.revenue)}
                                </td>
                                <td
                                  className={`py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right font-semibold ${
                                    item.profit >= 0 ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {formatCurrency(item.profit)}
                                </td>
                                <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                                  {formatROAS(item.roas)}
                                </td>
                                <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-medium">
                                  {formatNumber(item.conversions)}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))
                ) : (
                  sortedBreakdown.map((item, index) => (
                    <tr
                      key={index}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors even:bg-gray-50/30"
                    >
                      <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900 font-medium">
                        {level === "campaign"
                          ? item.campaignName || item.campaignId || "Unknown Campaign"
                          : item.adsetName || item.adsetId || "Unknown Ad Set"}
                      </td>
                    <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                      {formatCurrency(item.spend)}
                    </td>
                    <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                      {formatCurrency(item.revenue)}
                    </td>
                    <td
                      className={`py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right font-semibold ${
                        item.profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(item.profit)}
                    </td>
                    <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                      {formatROAS(item.roas)}
                    </td>
                    <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 font-medium">
                      {formatNumber(item.conversions)}
                    </td>
                  </tr>
                )))}
                {breakdownTotals && (
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <td className="py-2 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900">Total</td>
                    <td className="py-2 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">
                      {formatCurrency(breakdownTotals.spend)}
                    </td>
                    <td className="py-2 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">
                      {formatCurrency(breakdownTotals.revenue)}
                    </td>
                    <td
                      className={`py-2 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right font-semibold ${
                        breakdownTotals.profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(breakdownTotals.profit)}
                    </td>
                    <td className="py-2 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">
                      {formatROAS(breakdownTotals.roas)}
                    </td>
                    <td className="py-2 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900">
                      {formatNumber(breakdownTotals.conversions)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Custom Date Range Modal */}
      <CustomDateRangeModal
        isOpen={isCustomDateModalOpen}
        onClose={() => setIsCustomDateModalOpen(false)}
        onApply={(startDateStr, endDateStr) => {
          updateDateFilter("custom", startDateStr, endDateStr);
        }}
        currentStartDate={startDate}
        currentEndDate={endDate}
        majorDraws={majorDraws}
      />
        </>
      )}

    </div>
  );
}
