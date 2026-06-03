"use client";

import { useMemo, useState } from "react";
import { Clock, DollarSign, TrendingUp, Target, BarChart3 } from "lucide-react";
import { Card, SectionTitle, DataTable, type Column } from "@/components/admin/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useHourlyRevenue, type HourlyRevenueBucket } from "@/hooks/queries/admin/useHourlyRevenue";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Per-platform hour-of-day revenue breakdown for ad platforms that have NO ad-spend
 * sync yet (TikTok, Snapchat). Server-side attributed revenue + conversions from
 * SHARED-1 (/api/admin/analytics/hourly-revenue); spend + ROAS render "—" with a note
 * until that platform's Marketing-API sync ships. Owns its own date range (last 30
 * days) so the empty-shell tabs need no toolbar plumbing.
 */
interface Row extends Record<string, unknown> {
  id: number;
  label: string;
  revenue: number;
  conversions: number;
}

const COLUMNS: Column[] = [
  { key: "label", label: "Hour (AEST)", align: "left", sortable: false },
  { key: "revenue", label: "Revenue", align: "right", sortable: false },
  { key: "conversions", label: "Conversions", align: "right", sortable: false },
];

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

// Last-30-days window as YYYY-MM-DD in AEST — the API buckets these as Australia/Sydney
// calendar days, so format in that zone (toISOString/UTC would drop the current AEST day each morning).
function defaultRange(now: Date): { start: string; end: string } {
  const TZ = "Australia/Sydney";
  const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { start: formatInTimeZone(start, TZ, "yyyy-MM-dd"), end: formatInTimeZone(now, TZ, "yyyy-MM-dd") };
}

export default function PlatformHourlyRevenueSection({
  platform,
  platformLabel,
}: {
  platform: "tiktok" | "snapchat";
  platformLabel: string;
}) {
  const { fmtCompact } = useMetricsFormatting();
  const [range] = useState(() => defaultRange(new Date()));
  const { data, isLoading } = useHourlyRevenue({ platform, startDate: range.start, endDate: range.end });

  const rows: Row[] = useMemo(() => {
    const buckets: HourlyRevenueBucket[] =
      data?.hourly ?? Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, conversions: 0 }));
    return buckets.map((b) => ({
      id: b.hour,
      label: hourLabel(b.hour),
      revenue: b.revenue,
      conversions: b.conversions,
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Ad Spend" value="—" icon={DollarSign} subtitle="Awaiting sync" />
        <MetricCard
          title="Attributed Revenue"
          value={data ? fmtCompact(data.totalRevenue) : "—"}
          icon={TrendingUp}
          color="emerald"
          loading={isLoading}
        />
        <MetricCard
          title="Conversions"
          value={data ? data.totalConversions.toLocaleString() : "—"}
          icon={Target}
          color="purple"
          loading={isLoading}
        />
        <MetricCard title="ROAS" value="—" icon={BarChart3} color="indigo" subtitle="Needs spend" />
      </div>

      <Card className="p-5">
        <SectionTitle
          title={`${platformLabel} — revenue by hour (server-side)`}
          subtitle={`Attributed acquisition revenue · last 30 days (AEST). Ad spend & ROAS arrive when the ${platformLabel} Marketing-API sync ships.`}
          icon={Clock}
        />
        <DataTable<Row>
          columns={COLUMNS}
          rows={rows}
          renderCell={(key, row) => {
            if (key === "label") return <span className="font-medium">{row.label}</span>;
            if (key === "revenue") return <span className="num font-semibold">{fmtCompact(row.revenue)}</span>;
            return <span className="num">{row.conversions.toLocaleString()}</span>;
          }}
        />
      </Card>
    </div>
  );
}
