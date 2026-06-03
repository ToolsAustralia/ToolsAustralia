"use client";

import { useMemo, useState } from "react";
import { Clock, DollarSign, TrendingUp, Target, BarChart3 } from "lucide-react";
import { Card, SectionTitle, DataTable, type Column } from "@/components/admin/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useHourlyRevenue, type HourlyRevenueBucket } from "@/hooks/queries/admin/useHourlyRevenue";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Per-platform hour-of-day breakdown for an ad platform tab (TikTok, Snapchat).
 * Server-side attributed revenue + conversions from SHARED-1, merged with ad **spend**
 * from that platform's Marketing API (→ Profit = revenue − spend, ROAS = revenue ÷
 * spend). Where a platform has no spend source yet (e.g. Snapchat, or TikTok before
 * its creds), Spend/Profit/ROAS render "—" (not 0). Owns a default last-30-day range.
 */
interface Row extends Record<string, unknown> {
  id: number;
  label: string;
  spend: number | null;
  revenue: number;
  profit: number | null;
  roas: number | null;
  conversions: number;
}

const COLUMNS: Column[] = [
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

  const hasSpend = data?.totalSpend != null;

  const rows: Row[] = useMemo(() => {
    const buckets: HourlyRevenueBucket[] =
      data?.hourly ?? Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, conversions: 0, spend: null }));
    return buckets.map((b) => {
      const spend = b.spend;
      const profit = spend == null ? null : b.revenue - spend;
      const roas = spend != null && spend > 0 ? b.revenue / spend : null;
      return { id: b.hour, label: hourLabel(b.hour), spend, revenue: b.revenue, profit, roas, conversions: b.conversions };
    });
  }, [data]);

  const fmtSigned = (n: number) => (n < 0 ? `−${fmtCompact(Math.abs(n))}` : fmtCompact(n));
  const overallRoas = hasSpend && (data?.totalSpend ?? 0) > 0 ? data!.totalRevenue / (data!.totalSpend as number) : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Ad Spend"
          value={hasSpend ? fmtCompact(data!.totalSpend as number) : "—"}
          icon={DollarSign}
          subtitle={hasSpend ? undefined : "Awaiting sync"}
          loading={isLoading}
        />
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
        <MetricCard
          title="ROAS"
          value={overallRoas != null ? `${overallRoas.toFixed(2)}x` : "—"}
          icon={BarChart3}
          color="indigo"
          subtitle={hasSpend ? undefined : "Needs spend"}
          loading={isLoading}
        />
      </div>

      <Card className="p-5">
        <SectionTitle
          title={`${platformLabel} — by hour (server-side)`}
          subtitle={
            hasSpend
              ? "Attributed revenue + ad spend → profit & ROAS · last 30 days (AEST)"
              : `Attributed acquisition revenue · last 30 days (AEST). Spend / profit / ROAS arrive when the ${platformLabel} Marketing-API sync ships.`
          }
          icon={Clock}
        />
        <DataTable<Row>
          columns={COLUMNS}
          rows={rows}
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
    </div>
  );
}
