"use client";

import { useMemo } from "react";
import Image from "next/image";
import { Trophy, RotateCw } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, SectionTitle, DataTable, type Column } from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useSpendByUrlAnalytics } from "@/hooks/queries/useSpendByUrlAnalytics";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import { cn } from "@/utils/cn";
import type { DateRange } from "@/components/admin/DateRangeToggle";

/** Same calendar-day semantics as Facebook Ads → Spend by URL (Australia/Sydney) */
const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Prize performance (ad spend & return by prize) for the admin Overview.
 *
 * Data logic is ported from the legacy `AdvertisingBreakdownSection`:
 * `useSpendByUrlAnalytics(startDate, endDate)` over the same AEST calendar-day
 * window, grouped/summed per promotion brand (Ryobi / Milwaukee / Dewalt / Makita),
 * with `roas = revenue / spend`. The "Sync from Meta" button (recovered from the
 * legacy section) POSTs to `/api/admin/analytics/spend-by-url/sync` and invalidates
 * the `useSpendByUrlAnalytics` query on success. The per-row detail modal is (for now)
 * dropped — re-adding `PrizePerformanceAdsModal` on row click is a noted follow-up.
 * Presentation uses the kit `Card` + `DataTable`.
 */
interface PrizeRow extends Record<string, unknown> {
  id: string;
  brand: string;
  logoPath: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
}

const COLUMNS: Column[] = [
  { key: "brand", label: "Prize", align: "left" },
  { key: "roas", label: "ROAS", align: "right" },
  { key: "spend", label: "Spend", align: "right" },
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "conversions", label: "Conversions", align: "right" },
];

const PROMOTION_BRANDS = [
  { brand: "Ryobi", slug: "ryobi", logoPath: "/images/brands/name/ryobiText.svg" },
  { brand: "Milwaukee", slug: "milwaukee", logoPath: "/images/brands/name/milwaukeeText.svg" },
  { brand: "Dewalt", slug: "dewalt", logoPath: "/images/brands/name/dewaltText.svg" },
  { brand: "Makita", slug: "makita", logoPath: "/images/brands/name/makitaText.svg" },
] as const;

export default function PrizePerformanceCard({
  dateRange,
  startDate: customStartDate,
  endDate: customEndDate,
}: {
  dateRange: DateRange;
  startDate?: string;
  endDate?: string;
}) {
  const { fmtCompact, formatNumber } = useMetricsFormatting();

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

  const { data, isLoading, error } = useSpendByUrlAnalytics(startDate, endDate);

  // Manual "Sync from Meta" (recovered from the legacy AdvertisingBreakdownSection):
  // POST the active date window, then refresh the spend-by-url query on success.
  const queryClient = useQueryClient();
  const syncMutation = useMutation({
    mutationFn: async () => {
      // Always sync a bounded RECENT window (last 14 days), regardless of the table's
      // selected range. Meta's API can't reliably pull a large span (e.g. all-time
      // ≈ 187 days) in one request — it errors/times out — and only recent days
      // actually change. The table then reflects the refreshed data.
      const until = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
      const since = formatInTimeZone(subDays(new Date(), 13), AEST_TIMEZONE, "yyyy-MM-dd");
      const res = await fetch("/api/admin/analytics/spend-by-url/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: since, endDate: until }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Sync failed");
      }
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "analytics", "spend-by-url"],
      });
    },
  });

  const canSync = !syncMutation.isPending;

  const rows = useMemo<PrizeRow[]>(() => {
    if (!data?.rows) return [];

    return PROMOTION_BRANDS.map((promo) => {
      // Sum all URL rows for this promotion (Meta can split spend across URL variants)
      const rowsForPromo = data.rows.filter(
        (r) =>
          r.canonicalUrl.includes(`/promotions/${promo.slug}`) ||
          r.canonicalUrl.endsWith(`/promotions/${promo.slug}`)
      );

      const spend = rowsForPromo.reduce((s, r) => s + r.spend, 0);
      const revenue = rowsForPromo.reduce((s, r) => s + r.revenue, 0);
      const conversions = rowsForPromo.reduce((s, r) => s + r.conversions, 0);
      const roas = spend > 0 ? revenue / spend : 0;

      return {
        id: promo.slug,
        brand: promo.brand,
        logoPath: promo.logoPath,
        spend,
        revenue,
        conversions,
        roas,
      };
    }).filter((m) => m.spend > 0 || m.revenue > 0 || m.conversions > 0); // Only show rows with data
  }, [data?.rows]);

  const renderCell = (key: string, row: PrizeRow) => {
    if (key === "brand") {
      // Logo only — the brand is already identified by its logo, so the name is
      // redundant. The brand name lives on the `alt` for accessibility.
      return (
        <div className="flex items-center min-h-[2rem]">
          <span className="relative w-20 h-7 flex items-center justify-start shrink-0">
            <Image
              src={row.logoPath}
              alt={row.brand}
              width={96}
              height={48}
              unoptimized
              className="object-contain object-left max-h-7"
              sizes="96px"
            />
          </span>
        </div>
      );
    }

    if (key === "roas") {
      return (
        <span
          className={`num text-xs sm:text-sm font-semibold ${
            row.roas >= 3
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-500"
          }`}
        >
          {row.roas.toFixed(2)}x
        </span>
      );
    }

    if (key === "spend") {
      return <span className="num text-xs sm:text-sm">{fmtCompact(row.spend)}</span>;
    }

    if (key === "revenue") {
      return <span className="num text-xs sm:text-sm">{fmtCompact(row.revenue)}</span>;
    }

    // conversions
    return <span className="num text-xs sm:text-sm">{formatNumber(row.conversions)}</span>;
  };

  return (
    <Card className="p-5">
      <SectionTitle
        title="Prize performance"
        subtitle="Spend & return by prize"
        icon={Trophy}
        right={
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={!canSync}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Sync the latest spend & revenue from Meta"
          >
            <RotateCw
              className={cn("w-3.5 h-3.5", syncMutation.isPending && "animate-spin")}
              strokeWidth={2}
            />
            {syncMutation.isPending ? "Syncing…" : "Sync"}
          </button>
        }
      />

      {syncMutation.isError && (
        <p className="text-xs text-red-600 dark:text-red-400 -mt-2 mb-3">
          {syncMutation.error instanceof Error
            ? syncMutation.error.message
            : "Sync failed"}
        </p>
      )}

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 py-4">
          {error instanceof Error ? error.message : "Failed to load spend data"}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-4">
          Loading prize performance…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-4">
          No advertising data for promotion pages in this period.
        </p>
      ) : (
        <DataTable<PrizeRow> columns={COLUMNS} rows={rows} renderCell={renderCell} />
      )}
    </Card>
  );
}
