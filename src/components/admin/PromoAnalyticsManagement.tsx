"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
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
  HelpCircle,
  Layers,
  Package,
} from "lucide-react";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { formatNumber, formatPercentage } from "@/utils/metrics/formatters";
import { formatCurrency } from "@/utils/metrics/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { getPrizeLabel } from "@/config/prize-summaries";
import { isToolsetLandingSlug, getDefaultPrizeForToolsetSlug } from "@/config/promo-landing-slugs";
import { fromPrizeSlug, getToolbox } from "@/components/sections/promo/prize-selection";
import { DateRange } from "@/components/admin/DateRangeToggle";
import { DateRangeDropdown } from "@/components/admin/overview/DateRangeDropdown";
import { AdminMobileLayoutDateRangeShell } from "@/app/admin/component/AdminMobileLayoutDateRangeShell";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";
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
  /** Unique visitors who assembled a prize on this page (touched at least one reel). */
  builds: number;
  /** The combination built by the most visitors on this page, or null if nobody built one. */
  topBuiltPrize: string | null;
  /** Every combination built on this page, most-built first. Empty when nobody built one. */
  buildDistribution: Array<{ builtPrizeSlug: string; visitors: number }>;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

/** Grouped by the BUILT combination itself, across every landing page (not per-page). */
interface BuiltPrizeMetrics {
  builtPrizeSlug: string;
  builders: number;
  signups: number;
  conversions: number;
  revenue: number;
  builderToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

/**
 * `byBuiltPrize` rolled up to the TOOLBOX only (summed across every toolset variant),
 * derived client-side — see F-006. Rates are recomputed from the summed totals, never
 * averaged from the per-combination rates.
 */
interface ToolboxRollupMetrics {
  toolboxId: string;
  builders: number;
  signups: number;
  conversions: number;
  revenue: number;
  builderToSignupRate: number;
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
    byBuiltPrize?: BuiltPrizeMetrics[];
    dateRange: { start: string; end: string };
  };
}

/**
 * The page's OWN default combination — what a visitor sees if they never touch a reel.
 * Toolset landing slugs (ryobi/milwaukee/dewalt/makita/hikoki) resolve via
 * getDefaultPrizeForToolsetSlug; evergreen pages' `slug` already IS the prize slug.
 */
function getPageDefaultPrizeSlug(slug: string): string {
  return isToolsetLandingSlug(slug) ? getDefaultPrizeForToolsetSlug(slug) : slug;
}

/**
 * "Switched away" = builders whose built combination differs from the page's own default.
 * Percentage is of `builds` (visitors who built anything), not `visits` — builds is the
 * meaningful denominator ("of the people who built something, how many picked something
 * other than the default"). Returns `switchAwayPct: null` when `builds` is 0 so the caller
 * can render an em dash instead of a misleading "0%".
 */
function getSwitchAwayRate(row: PromoPageMetrics): {
  defaultSlug: string;
  switchAwayCount: number;
  switchAwayPct: number | null;
} {
  const defaultSlug = getPageDefaultPrizeSlug(row.slug);
  const switchAwayCount = (row.buildDistribution ?? [])
    .filter((d) => d.builtPrizeSlug !== defaultSlug)
    .reduce((sum, d) => sum + d.visitors, 0);
  const switchAwayPct = row.builds > 0 ? (switchAwayCount / row.builds) * 100 : null;
  return { defaultSlug, switchAwayCount, switchAwayPct };
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
  const { isLgUp, slotEl } = useAdminMobileDateToolbarSlot();
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

  /**
   * `byBuiltPrize` rolled up to the toolbox only — F-006. `builtPrizeSlug` is
   * `{toolset}-{toolbox}`; `fromPrizeSlug` splits it by matching both segments against the
   * `TOOLSETS`/`TOOLBOXES` registries (not a positional split), so it stays correct even if a
   * future brand id ever gained a hyphen. It also returns `null` for `cash-prize` (no toolbox
   * lane) and any unrecognised slug, so both are excluded from this rollup rather than landing
   * in a bogus bucket.
   */
  const toolboxRollup = React.useMemo((): ToolboxRollupMetrics[] => {
    const rows = data?.byBuiltPrize ?? [];
    const sums = new Map<string, { builders: number; signups: number; conversions: number; revenue: number }>();
    for (const row of rows) {
      const parsed = fromPrizeSlug(row.builtPrizeSlug);
      if (!parsed) continue; // cash-prize or unrecognised slug — no toolbox lane
      const acc = sums.get(parsed.toolbox) ?? { builders: 0, signups: 0, conversions: 0, revenue: 0 };
      acc.builders += row.builders;
      acc.signups += row.signups;
      acc.conversions += row.conversions;
      acc.revenue += row.revenue;
      sums.set(parsed.toolbox, acc);
    }
    const result: ToolboxRollupMetrics[] = Array.from(sums.entries()).map(([toolboxId, s]) => ({
      toolboxId,
      ...s,
      // Recomputed from the SUMMED totals — averaging the per-combination rates would
      // weight a 1-builder combo the same as a 100-builder one.
      builderToSignupRate: s.builders > 0 ? (s.signups / s.builders) * 100 : 0,
      signupToConversionRate: s.signups > 0 ? (s.conversions / s.signups) * 100 : 0,
      overallConversionRate: s.builders > 0 ? (s.conversions / s.builders) * 100 : 0,
    }));
    result.sort((a, b) => {
      if (b.builders !== a.builders) return b.builders - a.builders;
      const aName = getToolbox(a.toolboxId)?.brandName ?? a.toolboxId;
      const bName = getToolbox(b.toolboxId)?.brandName ?? b.toolboxId;
      return aName.localeCompare(bName);
    });
    return result;
  }, [data?.byBuiltPrize]);

  const handleSort = (col: keyof PromoPageMetrics) => {
    if (sortColumn === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortOrder("desc");
    }
  };

  const getSortIcon = (col: keyof PromoPageMetrics) => {
    if (sortColumn !== col)
      return <ArrowUpDown className="w-3.5 h-3.5 opacity-50 text-gray-500 dark:text-neutral-500" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
    );
  };

  /** Accessible label + native tooltip for metric definitions */
  function MetricLabelWithHint({ label, hint }: { label: string; hint: string }) {
    return (
      <span className="inline-flex items-center gap-1 max-w-[min(100%,11rem)]">
        <span>{label}</span>
        <span
          className="inline-flex shrink-0 text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 cursor-help"
          title={hint}
          aria-label={hint}
        >
          <HelpCircle className="w-3.5 h-3.5" aria-hidden />
        </span>
      </span>
    );
  }

  const _visitToSignupPct = data?.totalVisits ? (data.totalSignups / data.totalVisits) * 100 : 0;
  const _signupToConversionPct = data?.totalSignups ? (data.totalConversions / data.totalSignups) * 100 : 0;
  const _overallPct = data?.totalVisits ? (data.totalConversions / data.totalVisits) * 100 : 0;

  const promoDateRangeToggle = (
    <DateRangeDropdown
      selectedRange={dateRange}
      onRangeChange={(range) => updateDateFilter(range)}
      onCustomClick={() => setIsCustomDateModalOpen(true)}
      displayDate={displayDate || undefined}
    />
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Promo Page Analytics</h2>
        {isLgUp ? <div className="flex items-center gap-2">{promoDateRangeToggle}</div> : null}
      </div>
      {!isLgUp && slotEl
        ? createPortal(<AdminMobileLayoutDateRangeShell>{promoDateRangeToggle}</AdminMobileLayoutDateRangeShell>, slotEl)
        : null}
      {!isLgUp && !slotEl ? (
        <div className="lg:hidden">
          <AdminMobileLayoutDateRangeShell>{promoDateRangeToggle}</AdminMobileLayoutDateRangeShell>
        </div>
      ) : null}

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
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg p-4 text-red-700 dark:text-red-300">
          {(error as Error).message}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title={
            <MetricLabelWithHint
              label="Unique visitors"
              hint="Sum of unique visitors per promotion page in this period. The same person browsing two different pages is counted twice here—not one global site visitor count."
            />
          }
          value={isLoading ? "—" : formatNumber(data?.totalVisits ?? 0)}
          icon={BarChart3}
          color="blue"
          subtitle="Summed across pages (not deduplicated globally)"
        />
        <MetricCard
          title={
            <MetricLabelWithHint
              label="New registrations"
              hint="Count of new user accounts that stored promo attribution at signup (one row per account)."
            />
          }
          value={isLoading ? "—" : formatNumber(data?.totalSignups ?? 0)}
          icon={Users}
          color="purple"
          subtitle="Accounts with promo page attribution"
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

      <p className="text-xs text-gray-600 dark:text-neutral-400 leading-relaxed max-w-4xl">
        Each table row compares <strong>unique visitors to that page</strong> with{" "}
        <strong>new accounts</strong> attributed to that page. V→S % can exceed 100% when several
        accounts are created from the same browser session, or when a visit was not recorded but
        signup still carried the promo slug.
      </p>

      {/* Channel Attribution (UTM Source: Klaviyo, Facebook, etc.) */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 border-b border-gray-200 dark:border-neutral-700 flex items-center gap-2">
          <Hash className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          Channel Attribution (UTM Source)
        </h3>
        <p className="text-sm text-gray-500 dark:text-neutral-400 px-4 pt-2 pb-1">
          Unique visitors, new registrations, and conversions by marketing channel (e.g. Klaviyo,
          Facebook). Add{" "}
          <code className="bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 px-1 rounded">
            utm_source=klaviyo
          </code>{" "}
          or{" "}
          <code className="bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 px-1 rounded">
            utm_source=facebook
          </code>{" "}
          to campaign URLs.
        </p>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">Loading…</div>
          ) : (() => {
            const rows = data?.byUTMSource ?? [];
            if (rows.length === 0) {
              return (
                <div className="p-8 text-center text-gray-500 dark:text-neutral-400">
                  No channel data for this period. Campaign links need{" "}
                  <code className="bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 px-1 rounded">
                    utm_source
                  </code>{" "}
                  in the URL.
                </div>
              );
            }
            return (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100">Channel</th>
                    <th
                      className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100"
                      title="Unique visitors (deduped per channel)"
                    >
                      Unique visitors
                    </th>
                    <th
                      className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100"
                      title="New accounts with promo attribution"
                    >
                      Registrations
                    </th>
                    <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">Conversions</th>
                    <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">Revenue</th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                      V→S %
                    </th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                      S→C %
                    </th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                      Conv %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.utmSource}
                      className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/60 cursor-pointer transition-colors"
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
                              ? "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border border-gray-200/80 dark:border-neutral-600"
                              : "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/50"
                          }`}
                        >
                          {row.utmSource}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatNumber(row.visits)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatNumber(row.signups)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatNumber(row.conversions)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.visitToSignupRate)}</td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.signupToConversionRate)}</td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.overallConversionRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 border-b border-gray-200 dark:border-neutral-700">
          Performance by Promotion Page
        </h3>
        <p className="text-xs text-gray-500 dark:text-neutral-400 px-4 pt-2 pb-1">
          Per page: unique visitors vs new accounts; headline totals above sum visitors across all
          pages.
        </p>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100">Page</th>
                  <th
                    className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100"
                    title="Unique visitors to this page (deduped by browser / user)"
                  >
                    <button
                      onClick={() => handleSort("visits")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
                    >
                      Unique visitors {getSortIcon("visits")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                    <button
                      onClick={() => handleSort("crossVisits")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
                      title="Visits from other toolset landing pages"
                    >
                      Cross-visits {getSortIcon("crossVisits")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                    <button
                      onClick={() => handleSort("builds")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
                      title="Visitors who assembled a prize in Build your prize"
                    >
                      Builds {getSortIcon("builds")}
                    </button>
                  </th>
                  <th
                    className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100"
                    title="New user accounts with this promo attribution"
                  >
                    <button
                      onClick={() => handleSort("signups")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
                    >
                      Registrations {getSortIcon("signups")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                    <button
                      onClick={() => handleSort("conversions")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
                    >
                      Conversions {getSortIcon("conversions")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                    <button
                      onClick={() => handleSort("revenue")}
                      className="flex items-center justify-end gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
                    >
                      Revenue {getSortIcon("revenue")}
                    </button>
                  </th>
                  <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                    V→S %
                  </th>
                  <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                    S→C %
                  </th>
                  <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                    Conv %
                  </th>
                  <th
                    className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100"
                    title="Share of builders who assembled a different combination than this page's own default build"
                  >
                    Switched away % of Builds
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPages.map((row) => {
                  const { defaultSlug, switchAwayCount, switchAwayPct } = getSwitchAwayRate(row);
                  return (
                  <tr
                    key={`${row.pageType}-${row.slug}`}
                    className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/60 cursor-pointer transition-colors"
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
                            row.pageType === "toolset"
                              ? "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/50"
                              : "bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/50"
                          }`}
                        >
                          {row.pageType === "toolset" ? "Toolset" : "Evergreen"}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {getPrizeLabel(row.slug) ?? row.slug}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                      {formatNumber(row.visits)}
                    </td>
                    <td
                      className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums"
                      title="From other toolset pages"
                    >
                      {formatNumber(row.crossVisits ?? 0)}
                    </td>
                    <td
                      className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums"
                      title={
                        row.topBuiltPrize
                          ? `Most built here: ${getPrizeLabel(row.topBuiltPrize) ?? row.topBuiltPrize}`
                          : "Nobody built a prize on this page in this period"
                      }
                    >
                      {formatNumber(row.builds ?? 0)}
                      {row.topBuiltPrize && (
                        <span className="block truncate text-[10px] font-sans text-gray-500 dark:text-neutral-400 max-w-[110px] ml-auto">
                          Top: {getPrizeLabel(row.topBuiltPrize) ?? row.topBuiltPrize}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                      {formatNumber(row.signups)}
                    </td>
                    <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                      {formatNumber(row.conversions)}
                    </td>
                    <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                      {formatCurrency(row.revenue)}
                    </td>
                    <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.visitToSignupRate)}</td>
                    <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.signupToConversionRate)}</td>
                    <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.overallConversionRate)}</td>
                    <td
                      className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400"
                      title={
                        row.builds > 0
                          ? `${formatNumber(switchAwayCount)} of ${formatNumber(row.builds)} builders picked a different combination than this page's default (${getPrizeLabel(defaultSlug) ?? defaultSlug})`
                          : "Nobody built a prize on this page in this period"
                      }
                    >
                      {switchAwayPct === null ? "—" : formatPercentage(switchAwayPct)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* By Built Prize breakdown */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 border-b border-gray-200 dark:border-neutral-700 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          By Built Prize
        </h3>
        <p className="text-sm text-gray-500 dark:text-neutral-400 px-4 pt-2 pb-1">
          Builders, registrations, conversions and revenue grouped by the exact combination
          assembled in Build your prize, across every landing page — do Kincrome-box builders
          convert better than Milwaukee-box builders?
        </p>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">Loading…</div>
          ) : (() => {
            const rows = data?.byBuiltPrize ?? [];
            if (rows.length === 0) {
              return (
                <div className="p-8 text-center text-gray-500 dark:text-neutral-400">
                  No builds recorded for this period.
                </div>
              );
            }
            return (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100">Built prize</th>
                    <th
                      className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100"
                      title="Unique visitors who assembled this combination, on any landing page"
                    >
                      Builders
                    </th>
                    <th
                      className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100"
                      title="New accounts whose signup carried this built combination"
                    >
                      Registrations
                    </th>
                    <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">Conversions</th>
                    <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">Revenue</th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                      B→S %
                    </th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                      S→C %
                    </th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                      Conv %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.builtPrizeSlug}
                      className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors"
                    >
                      <td className="p-3 font-medium text-gray-900 dark:text-white">
                        {getPrizeLabel(row.builtPrizeSlug) ?? row.builtPrizeSlug}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatNumber(row.builders)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatNumber(row.signups)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatNumber(row.conversions)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.builderToSignupRate)}</td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.signupToConversionRate)}</td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.overallConversionRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {/* By Toolbox rollup — F-006: answers "Kincrome-box vs Milwaukee-box" without hand-summing */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 border-b border-gray-200 dark:border-neutral-700 flex items-center gap-2">
          <Package className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          By Toolbox
        </h3>
        <p className="text-sm text-gray-500 dark:text-neutral-400 px-4 pt-2 pb-1">
          The table above rolled up to the toolbox only, summed across every toolset variant —
          do Kincrome-box builders convert better than Milwaukee-box builders? Cash builds have
          no toolbox and are excluded.
        </p>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">Loading…</div>
          ) : (() => {
            const rows = toolboxRollup;
            if (rows.length === 0) {
              return (
                <div className="p-8 text-center text-gray-500 dark:text-neutral-400">
                  No builds recorded for this period.
                </div>
              );
            }
            return (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100">Toolbox</th>
                    <th
                      className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100"
                      title="Unique visitors who assembled any toolset with this toolbox, summed across combinations"
                    >
                      Builders
                    </th>
                    <th
                      className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100"
                      title="New accounts whose signup carried a build with this toolbox"
                    >
                      Registrations
                    </th>
                    <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">Conversions</th>
                    <th className="text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">Revenue</th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                      B→S %
                    </th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                      S→C %
                    </th>
                    <th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100">
                      Conv %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.toolboxId}
                      className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors"
                    >
                      <td className="p-3 font-medium text-gray-900 dark:text-white">
                        {getToolbox(row.toolboxId)?.brandName ?? row.toolboxId}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatNumber(row.builders)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatNumber(row.signups)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatNumber(row.conversions)}
                      </td>
                      <td className="p-3 text-right font-mono text-gray-900 dark:text-white tabular-nums">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.builderToSignupRate)}</td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.signupToConversionRate)}</td>
                      <td className="hidden md:table-cell p-3 text-right text-gray-600 dark:text-neutral-400">{formatPercentage(row.overallConversionRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
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
