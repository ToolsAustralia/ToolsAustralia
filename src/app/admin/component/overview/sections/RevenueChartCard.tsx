"use client";

import { useMemo, useState } from "react";
import { LineChart } from "lucide-react";
import { Card, Segmented, RevenueAreaChart } from "@/components/admin/ui";
import { useRevenueBreakdown, type ChartData } from "@/hooks/queries/useAdminQueries";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useIsLgUp } from "@/hooks/useIsLgUp";

type Period = "days" | "months" | "years";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "days", label: "Days" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
];

const AXIS_LABEL: Record<Period, string> = {
  days: "Day",
  months: "Month",
  years: "Year",
};

/**
 * Revenue overview area chart for the admin Overview.
 *
 * A single smooth area of `total` revenue. A Days / Months / Years toggle drives
 * the period. We let the revenue-breakdown API apply its per-period default window
 * (Days = last 30, Months = last 12, Years = since launch) rather than forcing the
 * full launch→now range on every period — fetching the entire payment-event history
 * at day granularity on every Overview load is what made the dashboard slow. The
 * chart is still scrollable within each period's window. Each point carries its own
 * date label so the hover tooltip shows the real date (not the sampled axis tick).
 */
export default function RevenueChartCard() {
  const { fmtCompact } = useMetricsFormatting();
  const isLgUp = useIsLgUp();
  const [period, setPeriod] = useState<Period>("days");
  // Toggle: subtract membership-renewal (recurring) revenue so the operator can
  // see "new" revenue — e.g. a day spiking on renewals drops to its real new-sales
  // figure. Subtracted client-side from each point's `total` (no refetch).
  const [excludeRenewals, setExcludeRenewals] = useState(false);

  const { data, isLoading } = useRevenueBreakdown(period);

  const points: ChartData[] = useMemo(() => data?.chartData ?? [], [data?.chartData]);
  const series = useMemo(
    () => points.map((p) => (excludeRenewals ? p.total - (p.membershipRenewals ?? 0) : p.total)),
    [points, excludeRenewals],
  );
  const pointLabels = useMemo(() => points.map((p) => p.date), [points]);
  // Only offer the toggle when there's actually renewal revenue in this window.
  const hasRenewals = useMemo(() => points.some((p) => (p.membershipRenewals ?? 0) > 0), [points]);

  // Sample up to ~8 evenly-spaced date labels for the x-axis ticks.
  const ticks = useMemo(() => {
    const labels = points.map((p) => p.date);
    if (labels.length <= 8) return labels;
    const step = (labels.length - 1) / 7;
    return Array.from({ length: 8 }, (_, i) => labels[Math.round(i * step)]);
  }, [points]);

  const axisLabel = AXIS_LABEL[period];
  const hasSeries = series.length >= 2;

  return (
    <Card className="p-5">
      {/* Header — on mobile the period toggle drops to its own row below the title. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center">
            <LineChart className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-[15px] sm:text-base text-neutral-900 dark:text-white leading-tight">
              Revenue overview
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {excludeRenewals ? "Excluding membership renewals · hover for figures" : "Hover the line for exact figures"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          {!isLoading && hasRenewals && (
            <label
              className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-medium text-neutral-600 dark:text-neutral-300 whitespace-nowrap"
              title="Subtract membership renewal (recurring) revenue from the chart"
            >
              <input
                type="checkbox"
                checked={excludeRenewals}
                onChange={(e) => setExcludeRenewals(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-[#ee0000]"
              />
              Exclude renewals
            </label>
          )}
          <Segmented
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            size={isLgUp ? "md" : "sm"}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="h-[230px] rounded-xl bg-neutral-100 dark:bg-neutral-800/60 animate-pulse" />
      ) : hasSeries ? (
        <RevenueAreaChart
          data={series}
          ticks={ticks}
          pointLabels={pointLabels}
          axisLabel={axisLabel}
          accent="#ee0000"
          valueFmt={fmtCompact}
          // Both platforms scroll horizontally for dense series (e.g. the 30-point
          // Days view). Mobile gets a slightly wider per-point so the chart overflows
          // and is comfortably draggable; tap a point to read its value.
          minPointPx={isLgUp ? 24 : 30}
        />
      ) : (
        <div className="flex items-center justify-center h-[230px] text-sm text-neutral-400 dark:text-neutral-500">
          Not enough revenue data to chart yet
        </div>
      )}
    </Card>
  );
}
