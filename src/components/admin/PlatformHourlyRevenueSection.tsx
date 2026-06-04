"use client";

import { useMemo, useState } from "react";
import { Clock, DollarSign, TrendingUp, Target, BarChart3, ChevronUp, ChevronDown } from "lucide-react";
import { Card, SectionTitle } from "@/components/admin/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useHourlyRevenue, type HourlyRevenueBucket } from "@/hooks/queries/admin/useHourlyRevenue";
import { cn } from "@/utils/cn";

/**
 * Per-platform hour-of-day breakdown for an ad platform tab (TikTok, Snapchat).
 * Server-side attributed revenue + conversions from SHARED-1, merged with ad **spend**
 * from that platform's Marketing API (→ Profit = revenue − spend, ROAS = revenue ÷
 * spend). Where a platform has no spend source yet (e.g. Snapchat, or TikTok before
 * its creds), Spend/Profit/ROAS render "—" (not 0). The AEST date window is owned by
 * the parent tab (TikTok/Snapchat wrappers) and passed in as `startDate`/`endDate`.
 */
interface Row {
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

/**
 * Shared presentational hourly-breakdown table — matches the Facebook Ads hourly
 * section's look (FacebookAdsManagement.tsx → HourlyBreakdownSection). Reused by the
 * TikTok/Snapchat (this file), Klaviyo, and All-Platforms tabs so the layout, mobile
 * single-view, threshold colors, and text sizes stay in lockstep with Facebook.
 *
 * Mobile single-view (no horizontal scroll): **Hour · Spend · Rev · ROAS · Conv** are
 * always visible; **Profit** sits behind the "Show more columns" toggle (`sm:hidden`
 * button + `hidden sm:table-cell`), exactly like Facebook. Owned / no-spend channels
 * (Klaviyo, or paid platforms before their spend sync ships) render Spend / Profit /
 * ROAS as "—" via the `null` checks. Color thresholds copied verbatim from Facebook:
 * profit ≥0 green / <0 red; ROAS ≥2 green / ≥1 default / <1 red.
 */
export function HourlyBreakdownTable({
  rows,
  fmtCompact,
}: {
  rows: Row[];
  fmtCompact: (n: number) => string;
}) {
  const [columnsExpanded, setColumnsExpanded] = useState(false);
  const fmtSigned = (n: number) => (n < 0 ? `−${fmtCompact(Math.abs(n))}` : fmtCompact(n));

  return (
    <>
      <div className="flex justify-end sm:hidden -mt-2 mb-2">
        <button
          type="button"
          onClick={() => setColumnsExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white"
        >
          {columnsExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" /> Show fewer columns
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" /> Show more columns
            </>
          )}
        </button>
      </div>
      <div className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto brand-scrollbar" style={{ WebkitOverflowScrolling: "touch" }}>
        <table className="w-full min-w-[300px] sm:min-w-[560px]">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-neutral-600">
              <th className="text-left py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Hour
              </th>
              <th className="text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Spend
              </th>
              <th className="text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Rev
              </th>
              <th
                className={cn(
                  "text-right py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100",
                  !columnsExpanded ? "hidden sm:table-cell" : ""
                )}
              >
                Profit
              </th>
              <th className="text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                ROAS
              </th>
              <th className="text-right py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100">
                Conv
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors"
              >
                <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-gray-900 dark:text-white font-medium">
                  {row.label}
                </td>
                <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white">
                  {row.spend == null ? (
                    <span className="text-neutral-300 dark:text-neutral-600">—</span>
                  ) : (
                    fmtCompact(row.spend)
                  )}
                </td>
                <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white font-semibold">
                  {fmtCompact(row.revenue)}
                </td>
                <td
                  className={cn(
                    "py-2 px-2 sm:py-3 sm:px-4 text-xs sm:text-sm text-right font-semibold",
                    row.profit == null
                      ? ""
                      : row.profit >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    !columnsExpanded ? "hidden sm:table-cell" : ""
                  )}
                >
                  {row.profit == null ? (
                    <span className="text-neutral-300 dark:text-neutral-600 font-normal">—</span>
                  ) : (
                    fmtSigned(row.profit)
                  )}
                </td>
                <td
                  className={cn(
                    "py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right font-semibold",
                    row.roas == null
                      ? ""
                      : row.roas >= 2
                        ? "text-emerald-600 dark:text-emerald-400"
                        : row.roas >= 1
                          ? "text-gray-900 dark:text-white"
                          : "text-red-600 dark:text-red-400"
                  )}
                >
                  {row.roas == null ? (
                    <span className="text-neutral-300 dark:text-neutral-600 font-normal">—</span>
                  ) : (
                    `${row.roas.toFixed(2)}x`
                  )}
                </td>
                <td className="py-1.5 px-0.5 sm:py-3 sm:px-4 text-xs sm:text-sm text-right text-gray-900 dark:text-white">
                  {row.conversions.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function PlatformHourlyRevenueSection({
  platform,
  platformLabel,
  startDate,
  endDate,
}: {
  platform: "tiktok" | "snapchat";
  platformLabel: string;
  startDate: string;
  endDate: string;
}) {
  const { fmtCompact } = useMetricsFormatting();
  const { data, isLoading } = useHourlyRevenue({ platform, startDate, endDate });

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
              ? "Attributed revenue + ad spend → profit & ROAS · selected range (AEST)"
              : `Attributed acquisition revenue · selected range (AEST). Spend / profit / ROAS arrive when the ${platformLabel} Marketing-API sync ships.`
          }
          icon={Clock}
        />
        <HourlyBreakdownTable rows={rows} fmtCompact={fmtCompact} />
      </Card>
    </div>
  );
}
