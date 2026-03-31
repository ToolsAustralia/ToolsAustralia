"use client";

import React, { useMemo, useState } from "react";
import DashboardSection from "./DashboardSection";
import { useSpendByUrlAnalytics } from "@/hooks/queries/useSpendByUrlAnalytics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ArrowDown, ArrowUp } from "lucide-react";
import Image from "next/image";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

/** Same calendar-day semantics as Facebook Ads → Spend by URL (Australia/Sydney) */
const AEST_TIMEZONE = "Australia/Sydney";

interface AdvertisingBreakdownSectionProps {
  dateRange: DateRange;
  customStartDate?: string;
  customEndDate?: string;
  isExpanded: boolean;
}

interface PromotionMetric {
  brand: string;
  slug: string;
  logoPath: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  logoScale?: string;
}

type SortKey = "prize" | "spend" | "revenue" | "conversions" | "roas";
type SortDir = "asc" | "desc";

export default function AdvertisingBreakdownSection({
  dateRange,
  customStartDate,
  customEndDate,
  isExpanded,
}: AdvertisingBreakdownSectionProps) {
  // Same date range as /admin/facebook-ads spend-by-url: AEST calendar + optional URL start/end
  const startDate = useMemo(() => {
    if (customStartDate && customEndDate) return customStartDate;
    if (dateRange === "custom" && customStartDate) return customStartDate;
    if (dateRange === "today") {
      return formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
    }
    if (dateRange === "yesterday") {
      return formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");
    }
    if (dateRange === "all-time") {
      return formatInTimeZone(getWebsiteLaunchDateUTC(), AEST_TIMEZONE, "yyyy-MM-dd");
    }
    return undefined;
  }, [dateRange, customStartDate, customEndDate]);

  const endDate = useMemo(() => {
    if (customStartDate && customEndDate) return customEndDate;
    if (dateRange === "custom" && customEndDate) return customEndDate;
    if (dateRange === "today") {
      return formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
    }
    if (dateRange === "yesterday") {
      return formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");
    }
    if (dateRange === "all-time") {
      return formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
    }
    return undefined;
  }, [dateRange, customStartDate, customEndDate]);

  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error: queryError } = useSpendByUrlAnalytics(startDate, endDate);

  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "roas", dir: "desc" });

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

  const dateReady = Boolean(startDate && endDate);

  // Filter and map promotion URLs to metrics
  const promotionMetrics = useMemo<PromotionMetric[]>(() => {
    if (!data?.rows) return [];

    const promotionBrands = [
      { brand: "Ryobi", slug: "ryobi", logoPath: "/images/brands/name/ryobiText.png" },
      { brand: "Milwaukee", slug: "milwaukee", logoPath: "/images/brands/name/milwaukeeText.png", logoScale: "scale-125" },
      { brand: "Dewalt", slug: "dewalt", logoPath: "/images/brands/name/dewaltText.png" },
      { brand: "Makita", slug: "makita", logoPath: "/images/brands/name/makitaText.png" },
    ];

    return promotionBrands
      .map((promo) => {
        // Sum all URL rows for this promotion (Meta can split spend across URL variants)
        const rowsForPromo = data.rows.filter(
          (r) =>
            r.canonicalUrl.includes(`/promotions/${promo.slug}`) ||
            r.canonicalUrl.endsWith(`/promotions/${promo.slug}`)
        );

        if (rowsForPromo.length === 0) {
          return {
            ...promo,
            spend: 0,
            revenue: 0,
            conversions: 0,
            roas: 0,
          };
        }

        const spend = rowsForPromo.reduce((s, r) => s + r.spend, 0);
        const revenue = rowsForPromo.reduce((s, r) => s + r.revenue, 0);
        const conversions = rowsForPromo.reduce((s, r) => s + r.conversions, 0);
        const roas = spend > 0 ? revenue / spend : 0;

        return {
          ...promo,
          spend,
          revenue,
          conversions,
          roas,
        };
      })
      .filter((metric) => metric.spend > 0 || metric.revenue > 0 || metric.conversions > 0); // Only show rows with data
  }, [data?.rows]);

  const sortedMetrics = useMemo(() => {
    const rows = [...promotionMetrics];
    const { key, dir } = sort;
    const sign = dir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case "prize":
          cmp = a.brand.localeCompare(b.brand);
          break;
        case "spend":
          cmp = a.spend - b.spend;
          break;
        case "revenue":
          cmp = a.revenue - b.revenue;
          break;
        case "conversions":
          cmp = a.conversions - b.conversions;
          break;
        case "roas":
          cmp = a.roas - b.roas;
          break;
        default:
          cmp = 0;
      }
      if (cmp !== 0) return sign * cmp;
      return a.brand.localeCompare(b.brand);
    });
    return rows;
  }, [promotionMetrics, sort]);

  const onSortColumn = (column: SortKey) => {
    setSort((prev) =>
      prev.key === column
        ? { key: column, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key: column, dir: "desc" }
    );
  };

  const SortHeader = ({ column, children }: { column: SortKey; children: React.ReactNode }) => {
    const active = sort.key === column;
    return (
      <th
        className="text-center px-1 py-1.5 sm:px-2 sm:py-2.5 font-semibold text-gray-700 dark:text-neutral-200"
        aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          onClick={() => onSortColumn(column)}
          className="inline-flex w-full min-w-0 items-center justify-center gap-0.5 font-semibold text-inherit hover:opacity-90 -my-0.5 py-0.5 rounded"
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

  if (!isExpanded) return null;

  return (
    <DashboardSection
      title="Prize Performance"
      subtitle="Ad metrics by promotion page"
      headerTrailing={
        <div className="flex items-center gap-1.5 sm:gap-2">
          {isFetching && !isLoading && (
            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-neutral-400 max-w-[5rem] sm:max-w-none truncate sm:whitespace-nowrap">
              Refreshing…
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              syncMutation.mutate();
            }}
            disabled={!dateReady || syncMutation.isPending}
            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-4 sm:py-2 rounded-lg bg-slate-900 text-white text-[11px] sm:text-sm font-medium hover:bg-slate-800 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            <span className="sm:hidden">{syncMutation.isPending ? "…" : "Sync"}</span>
            <span className="hidden sm:inline">{syncMutation.isPending ? "Syncing…" : "Sync from Meta"}</span>
          </button>
        </div>
      }
      noPadding={false}
      className="shadow-md"
    >
      {syncMutation.isError && (
        <div className="text-xs sm:text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 leading-snug mb-3">
          {syncMutation.error instanceof Error ? syncMutation.error.message : "Sync failed"}
        </div>
      )}

      {syncMutation.isSuccess && !syncMutation.isPending && (
        <div className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-100 dark:border-emerald-900/40 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 leading-snug mb-3">
          Sync finished — your latest numbers for this range are loaded.
        </div>
      )}

      {queryError && (
        <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 mb-3">
          {queryError instanceof Error ? queryError.message : "Failed to load spend data"}
        </p>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-5 sm:py-6 text-gray-500 dark:text-neutral-400 text-xs sm:text-sm">
          <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mr-2 shrink-0" />
          <span>Loading advertising breakdown…</span>
        </div>
      )}

      {!isLoading && promotionMetrics.length === 0 && (
        <p className="text-xs sm:text-sm text-gray-500 dark:text-neutral-400 py-3 sm:py-4">
          No advertising data for promotion pages in this period.
        </p>
      )}

      {!isLoading && promotionMetrics.length > 0 && (
        <div className="overflow-x-auto -mx-3 px-3 sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5 [scrollbar-gutter:stable] brand-scrollbar">
          {/* min-width + horizontal scroll on narrow viewports; equal column share avoids huge gaps */}
          <div className="bg-white dark:bg-neutral-900 rounded-md sm:rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden min-w-[540px] sm:min-w-0 sm:w-full">
            <table className="w-full table-fixed text-[10px] sm:text-xs md:text-sm border-collapse">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/90">
                  <SortHeader column="prize">Prize</SortHeader>
                  <SortHeader column="roas">ROAS</SortHeader>
                  <SortHeader column="spend">Spend</SortHeader>
                  <SortHeader column="revenue">Revenue</SortHeader>
                  <SortHeader column="conversions">Conv.</SortHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-700">
                {sortedMetrics.map((metric) => (
                  <tr key={metric.slug} className="hover:bg-gray-50 dark:hover:bg-neutral-800/60">
                    <td className="px-1 py-1.5 sm:p-2 sm:py-2.5 align-middle">
                      <div className="flex items-center justify-center min-h-[2.25rem] sm:min-h-[3rem]">
                        <div className="relative w-12 h-7 sm:w-20 sm:h-10 md:w-24 md:h-12 flex items-center justify-center">
                          <Image
                            src={metric.logoPath}
                            alt={metric.brand}
                            width={96}
                            height={48}
                            className={`object-contain max-h-7 sm:max-h-10 md:max-h-12 ${metric.logoScale || ""}`}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-1 py-1.5 sm:px-2 sm:py-2.5 text-center text-gray-700 dark:text-neutral-200 tabular-nums font-semibold whitespace-nowrap align-middle">
                      {metric.roas.toFixed(2)}x
                    </td>
                    <td className="px-1 py-1.5 sm:px-2 sm:py-2.5 text-center text-gray-700 dark:text-neutral-200 tabular-nums whitespace-nowrap align-middle">
                      ${metric.spend.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-1 py-1.5 sm:px-2 sm:py-2.5 text-center text-gray-700 dark:text-neutral-200 tabular-nums whitespace-nowrap align-middle">
                      ${metric.revenue.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-1 py-1.5 sm:px-2 sm:py-2.5 text-center text-gray-700 dark:text-neutral-200 tabular-nums whitespace-nowrap align-middle">
                      {metric.conversions.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardSection>
  );
}
