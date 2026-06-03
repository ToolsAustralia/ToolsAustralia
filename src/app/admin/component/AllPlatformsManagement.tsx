"use client";

import { useMemo, useState } from "react";
import { DollarSign, TrendingUp, Target, BarChart3, Clock } from "lucide-react";
import { Card, SectionTitle, DataTable, type Column } from "@/components/admin/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useAdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import { useHourlyRevenue, type HourlyRevenueBucket } from "@/hooks/queries/admin/useHourlyRevenue";
import { formatInTimeZone } from "date-fns-tz";
import { computeAggregate } from "./overview/sections/advertisingCardModel";
import AdvertisingPlatformCard from "./overview/sections/AdvertisingPlatformCard";

/**
 * All-Platforms aggregate tab (Part D). Ad-effectiveness only (renewals excluded):
 * KPI rollup (SHARED-3 `computeAggregate`, client-side) + the per-platform breakdown
 * (reused `AdvertisingPlatformCard`) + the overall hour-of-day revenue (SHARED-1,
 * `platform="all"`). Overall ROAS + contribution are on the PAID basis (mirrors the
 * overview card's blended ROAS so they reconcile); totals span all 5 ad channels.
 */
interface HourRow extends Record<string, unknown> {
  id: number;
  label: string;
  spend: number | null;
  revenue: number;
  profit: number | null;
  roas: number | null;
  conversions: number;
}

const HOUR_COLUMNS: Column[] = [
  { key: "label", label: "Hour (AEST)", align: "left", sortable: false },
  { key: "spend", label: "Spend", align: "right", sortable: false },
  { key: "revenue", label: "Revenue", align: "right", sortable: false },
  { key: "profit", label: "Profit", align: "right", sortable: false },
  { key: "roas", label: "ROAS", align: "right", sortable: false },
  { key: "conversions", label: "Conv.", align: "right", sortable: false },
];

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

// Last-30-days window in AEST (the stats + hourly APIs bucket by Australia/Sydney calendar days).
function defaultRange(now: Date): { start: string; end: string } {
  const TZ = "Australia/Sydney";
  const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { start: formatInTimeZone(start, TZ, "yyyy-MM-dd"), end: formatInTimeZone(now, TZ, "yyyy-MM-dd") };
}

export default function AllPlatformsManagement() {
  const { fmtCompact } = useMetricsFormatting();
  const [range] = useState(() => defaultRange(new Date()));
  const { data: stats, isLoading } = useAdminDashboardStats("custom", range.start, range.end);
  // "ad-channels" (the 5 advertising channels) matches the KPI scope (computeAggregate),
  // so the hourly table reconciles with the headline — NOT "all" (which adds direct/google/other).
  const { data: hourly } = useHourlyRevenue({ platform: "ad-channels", startDate: range.start, endDate: range.end });

  const agg = useMemo(() => computeAggregate(stats?.attributedRevenue), [stats]);

  const hourRows: HourRow[] = useMemo(() => {
    const buckets: HourlyRevenueBucket[] =
      hourly?.hourly ?? Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, conversions: 0, spend: null }));
    return buckets.map((b) => {
      const spend = b.spend;
      const profit = spend == null ? null : b.revenue - spend;
      const roas = spend != null && spend > 0 ? b.revenue / spend : null;
      return { id: b.hour, label: hourLabel(b.hour), spend, revenue: b.revenue, profit, roas, conversions: b.conversions };
    });
  }, [hourly]);

  const fmtSigned = (n: number) => (n < 0 ? `−${fmtCompact(Math.abs(n))}` : fmtCompact(n));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard title="Total Ad Spend" value={fmtCompact(agg.totalSpend)} icon={DollarSign} loading={isLoading} />
        <MetricCard
          title="Attributed Revenue"
          subtitle="acquisition · ad channels"
          value={fmtCompact(agg.totalAcquisitionRevenue)}
          icon={TrendingUp}
          color="emerald"
          loading={isLoading}
        />
        <MetricCard
          title="Overall ROAS"
          subtitle="paid channels"
          value={agg.overallRoas != null ? `${agg.overallRoas.toFixed(2)}x` : "—"}
          icon={BarChart3}
          color="indigo"
          loading={isLoading}
        />
        <MetricCard
          title="Contribution"
          subtitle="revenue − ad spend"
          value={fmtSigned(agg.contributionAfterAdSpend)}
          icon={DollarSign}
          color="purple"
          loading={isLoading}
        />
        <MetricCard title="Conversions" value={agg.totalConversions.toLocaleString()} icon={Target} loading={isLoading} />
      </div>

      {/* Per-platform breakdown (reused overview card) */}
      <AdvertisingPlatformCard stats={stats} loading={isLoading} />

      {/* Overall hour-of-day revenue across all channels */}
      <Card className="p-5">
        <SectionTitle
          title="All-platforms by hour (server-side)"
          subtitle="Spend · revenue · profit · ROAS across all ad channels · last 30 days (AEST)"
          icon={Clock}
        />
        <DataTable<HourRow>
          columns={HOUR_COLUMNS}
          rows={hourRows}
          renderCell={(key, row) => {
            if (key === "label") return <span className="font-medium">{row.label}</span>;
            if (key === "spend")
              return row.spend == null ? <span className="text-neutral-300 dark:text-neutral-600">—</span> : <span className="num">{fmtCompact(row.spend)}</span>;
            if (key === "revenue") return <span className="num font-semibold">{fmtCompact(row.revenue)}</span>;
            if (key === "profit")
              return row.profit == null ? <span className="text-neutral-300 dark:text-neutral-600">—</span> : <span className="num">{fmtSigned(row.profit)}</span>;
            if (key === "roas")
              return row.roas == null ? (
                <span className="text-neutral-300 dark:text-neutral-600">—</span>
              ) : (
                <span className={`num ${row.roas >= 3 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-500"}`}>{row.roas.toFixed(2)}x</span>
              );
            return <span className="num">{row.conversions.toLocaleString()}</span>;
          }}
        />
      </Card>

      <p className="text-2xs text-neutral-400 leading-snug">
        Ad-effectiveness view — <strong>renewals excluded</strong>. Overall ROAS &amp; contribution use only paid channels with ad spend
        (Meta today; TikTok/Snapchat join when their spend syncs); revenue totals span all ad channels. Owned channels (Klaviyo) count
        toward revenue but not ROAS. All-source/total revenue lives on the Overview revenue card. The KPI <em>Total Ad Spend</em> is the
        snapshot/attributed figure; the hourly <em>Spend</em> column is the live ad-API breakdown — they can differ slightly.
      </p>
    </div>
  );
}
