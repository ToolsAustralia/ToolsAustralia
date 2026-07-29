"use client";

import { useMemo } from "react";
import { DollarSign, TrendingUp, Target, BarChart3, Clock } from "lucide-react";
import { Card, SectionTitle } from "@/components/admin/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { HourlyBreakdownTable } from "@/components/admin/PlatformHourlyRevenueSection";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useAdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import { useHourlyRevenue, type HourlyRevenueBucket } from "@/hooks/queries/admin/useHourlyRevenue";
import { useAdminDateFilter } from "@/hooks/useAdminDateFilter";
import { AdminDateRangeToolbar } from "@/components/admin/AdminDateRangeToolbar";
import { computeAggregate } from "./overview/sections/advertisingCardModel";
import AdvertisingPlatformCard from "./overview/sections/AdvertisingPlatformCard";

/**
 * All-Platforms aggregate tab (Part D). Ad-effectiveness only (renewals excluded):
 * KPI rollup (SHARED-3 `computeAggregate`, client-side) + the per-platform breakdown
 * (reused `AdvertisingPlatformCard`) + the overall hour-of-day revenue (SHARED-1,
 * `platform="all"`). Overall ROAS + contribution are on the PAID basis (mirrors the
 * overview card's blended ROAS so they reconcile); totals span all 5 ad channels.
 */
interface HourRow {
  id: number;
  label: string;
  spend: number | null;
  revenue: number;
  profit: number | null;
  roas: number | null;
  conversions: number;
}

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

export default function AllPlatformsManagement() {
  const { fmtCompact } = useMetricsFormatting();
  const df = useAdminDateFilter("today");
  // Draw presets (current/last) require resolved dates — the stats route 400s on a
  // draw range with none (e.g. before draw dates load, or when there IS no current/last
  // draw). Gate the query until ready and skeleton in the meantime, mirroring the
  // Facebook Ads tab. Non-draw presets carry no dates and resolve server-side, so
  // they're always ready.
  const statsReady =
    (df.dateRange !== "current-draw" && df.dateRange !== "last-draw") ||
    (!!df.startDate && !!df.endDate);
  // Pass the preset itself (not a forced "custom") so the stats API self-resolves
  // today / all-time / draw windows. Both resolve to the same AEST window as the hourly
  // query, so the KPIs and the hourly table reconcile.
  const { data: stats, isLoading } = useAdminDashboardStats(df.dateRange, df.startDate, df.endDate, {
    enabled: statsReady,
  });
  const statsLoading = isLoading || !statsReady;
  // "ad-channels" (the 5 advertising channels) matches the KPI scope (computeAggregate),
  // so the hourly table reconciles with the headline — NOT "all" (which adds direct/google/other).
  const { data: hourly } = useHourlyRevenue({ platform: "ad-channels", startDate: df.startDate, endDate: df.endDate });

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
      {/* empty:hidden — on mobile the dropdown portals to the header slot, leaving this
          wrapper childless; without it the empty wrapper would still claim a space-y slot. */}
      <div className="flex justify-end empty:hidden">
        <AdminDateRangeToolbar filter={df} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard title="Total Ad Spend" value={fmtCompact(agg.totalSpend)} icon={DollarSign} loading={statsLoading} />
        <MetricCard
          title="Attributed Revenue"
          subtitle="acquisition · ad channels"
          value={fmtCompact(agg.totalAcquisitionRevenue)}
          icon={TrendingUp}
          color="emerald"
          loading={statsLoading}
        />
        <MetricCard
          title="Overall ROAS"
          subtitle="paid channels"
          value={agg.overallRoas != null ? `${agg.overallRoas.toFixed(2)}x` : "—"}
          icon={BarChart3}
          color="indigo"
          loading={statsLoading}
        />
        <MetricCard
          title="Contribution"
          subtitle="revenue − ad spend"
          value={fmtSigned(agg.contributionAfterAdSpend)}
          icon={DollarSign}
          color="purple"
          loading={statsLoading}
        />
        <MetricCard title="Conversions" value={agg.totalConversions.toLocaleString()} icon={Target} loading={statsLoading} />
      </div>

      {/* Per-platform breakdown (reused overview card). Pass the tab's active date
          filter through — without it the card's drill-down popover/modal default to
          "today" while the surrounding tab shows the selected range (panel F-011). */}
      <AdvertisingPlatformCard
        stats={stats}
        loading={statsLoading}
        dateRange={df.dateRange}
        startDate={df.startDate}
        endDate={df.endDate}
      />

      {/* Overall hour-of-day revenue across all channels */}
      <Card className="p-5">
        <SectionTitle
          title="All-platforms by hour (server-side)"
          subtitle="Spend · revenue · profit · ROAS across all ad channels · selected range (AEST)"
          icon={Clock}
        />
        <HourlyBreakdownTable rows={hourRows} fmtCompact={fmtCompact} />
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
