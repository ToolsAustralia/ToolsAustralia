"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, Maximize2, X, ArrowUpDown } from "lucide-react";
import { Card, SectionTitle } from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useAdminDashboardStats, type AdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import { resolvePreviousCalendarMonthAest } from "@/utils/admin/resolveAestDateWindow";
import { cn } from "@/utils/cn";
import {
  buildPeriodComparison,
  aestToday,
  inclusiveDayCount,
  perDay,
  type ComparisonMetric,
} from "./periodComparisonModel";

/**
 * Selected period vs the previous CALENDAR month.
 *
 * Deliberately not `trendCalculationService.getComparisonPeriod`, which the KPI trend arrows
 * use — that returns the equal-length window immediately preceding the selection. Both are
 * correct for their own job and both are kept: an arrow wants "vs the previous equivalent
 * stretch", this table wants a stable month-on-month benchmark that does not move when the
 * reader changes the range. The two are clearly labelled so nobody has to guess which is which.
 *
 * No new aggregation: the comparison window is a second call to the SAME
 * `useAdminDashboardStats` the dashboard already uses. This card introduces no second
 * definition of "revenue".
 *
 * ⚠️ Length asymmetry is real — "Today" against a whole month is not like-for-like. Rather
 * than hide the comparison or quietly mislead, the header states both windows and a per-day
 * column appears whenever the two differ in length.
 */
export default function PeriodComparisonCard({
  stats,
  statsLoading,
  startDate,
  endDate,
  rangeLabel,
}: {
  /** The selected window's payload — already fetched by DashboardOverview, passed in to avoid a duplicate request. */
  stats: AdminDashboardStats | undefined;
  statsLoading: boolean;
  /** Resolved AEST bounds of the selected window, for the day-count normalisation. */
  startDate: string;
  endDate: string;
  rangeLabel: string;
}) {
  const { formatCurrency, formatNumber } = useMetricsFormatting();
  const [isOpen, setIsOpen] = useState(false);

  const previousMonth = useMemo(() => resolvePreviousCalendarMonthAest(), []);

  /**
   * The comparison window is always an explicit custom range — the preset the reader picked
   * describes the CURRENT window only.
   *
   * Its cache key is STABLE across date-range changes (last month doesn't move), so flipping
   * presets costs nothing after the first fetch. The freshness overrides matter though: the
   * hook's defaults poll this fairly heavy route every 5 minutes, which is right for a window
   * containing today and pure waste for a closed calendar month that can only change if a late
   * refund lands. One fetch per hour, no polling.
   */
  const { data: previousStats, isLoading: previousLoading } = useAdminDashboardStats(
    "custom",
    previousMonth.startDate,
    previousMonth.endDate,
    { staleTime: 60 * 60 * 1000, refetchInterval: false },
  );

  // Clamped to today: a still-running window (this month, the current draw) must be divided by
  // the days it has LIVED, not the days it will eventually have. The previous calendar month is
  // always closed, so the clamp is a no-op there and the two sides stay like-for-like.
  const today = aestToday();
  const currentDays = inclusiveDayCount(startDate, endDate, today);
  const previousDays = inclusiveDayCount(previousMonth.startDate, previousMonth.endDate, today);
  const unequal = currentDays > 0 && previousDays > 0 && currentDays !== previousDays;

  const metrics = useMemo(
    () => buildPeriodComparison(stats, previousStats, { currentDays, previousDays }),
    [stats, previousStats, currentDays, previousDays],
  );

  const loading = statsLoading || previousLoading;

  const fmt = (value: number, format: ComparisonMetric["format"]) => {
    if (format === "currency") return formatCurrency(value);
    if (format === "ratio") return `${value.toFixed(2)}x`;
    return formatNumber(value);
  };

  /**
   * Δ cell. `deltaPct` is null when the prior value was 0 — a change from nothing has no
   * meaningful percentage, so it reads "new" rather than ∞ or a flat 100%.
   */
  const DeltaCell = ({ m }: { m: ComparisonMetric }) => {
    if (m.deltaPct === null) {
      return (
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {m.current === 0 ? "—" : "new"}
        </span>
      );
    }
    if (Math.abs(m.deltaPct) < 0.05) {
      return <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>;
    }
    const up = m.deltaPct > 0;
    // Direction ≠ sentiment. More cancellations is a rise AND bad news, so the colour follows
    // `m.invert` while the arrow keeps following the number — same rule as `TrendPill`, which is
    // what the Cancellations KPI tile on this page uses. Colouring on `up` alone made the drawer
    // paint a cancellation spike green directly below a tile painting it red.
    const good = m.invert ? !up : up;
    return (
      <span
        className={cn(
          "num text-xs sm:text-sm font-semibold tabular-nums",
          good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
        )}
      >
        {up ? "▲" : "▼"} {Math.abs(m.deltaPct).toFixed(1)}%
      </span>
    );
  };

  const headline = metrics.filter((m) => m.headline);

  const windowLine = (
    <span className="tabular-nums">
      {rangeLabel} vs {previousMonth.startDate} → {previousMonth.endDate}
    </span>
  );

  return (
    <>
      <Card className="p-5">
        <SectionTitle
          title="Period comparison"
          subtitle="vs previous calendar month"
          icon={CalendarRange}
          right={
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label="Open the full comparison table"
              title="Open the full comparison table"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" strokeWidth={2} />
              All metrics
            </button>
          }
        />

        <p className="text-2xs text-neutral-500 dark:text-neutral-400 -mt-2 mb-3">{windowLine}</p>

        {loading ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500 py-4">Loading comparison…</p>
        ) : (
          <>
            <ComparisonTable
              metrics={headline}
              fmt={fmt}
              DeltaCell={DeltaCell}
              unequal={unequal}
              currentDays={currentDays}
              previousDays={previousDays}
            />
            {unequal && (
              <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-3">
                Windows differ in length ({currentDays}d vs {previousDays}d), so Δ compares the
                per-day rate — comparing the raw totals would just measure the calendar.
              </p>
            )}
          </>
        )}
      </Card>

      {/*
        PORTALED to <body>, not rendered in place.

        The card is a child of DashboardOverview's `space-y-5` stack, and `space-y-*` sets
        `margin-top` on every child after the first — including position:fixed ones. Rendered
        inline, the overlay and drawer inherited a 20px top margin and sat 20px below the
        viewport, leaving a strip of the admin header uncovered (caught on a phone, but it was
        wrong at every width). Portaling also guarantees the drawer can never be trapped by a
        future transform/filter ancestor, the same reason the kit's Popover portals.

        Safe during SSR: `isOpen` starts false, so this branch never runs on the server.
      */}
      {isOpen && createPortal(
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setIsOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Full period comparison"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto admin-scrollbar bg-white shadow-2xl dark:bg-neutral-900"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 backdrop-blur px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/95">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Period comparison
                </h3>
                <p className="text-2xs text-neutral-500 dark:text-neutral-400">{windowLine}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-4">
              <FullComparison
                metrics={metrics}
                fmt={fmt}
                DeltaCell={DeltaCell}
                unequal={unequal}
                currentDays={currentDays}
                previousDays={previousDays}
              />
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}

interface TableProps {
  metrics: ComparisonMetric[];
  fmt: (value: number, format: ComparisonMetric["format"]) => string;
  DeltaCell: (props: { m: ComparisonMetric }) => React.ReactElement;
  unequal: boolean;
  currentDays: number;
  previousDays: number;
}

/** Shared header-cell styling, so the two header rows can't drift apart. */
const TH =
  "py-2 px-2 text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400";

/**
 * Sticky first column. The table scrolls horizontally on a phone, and without this the metric
 * name scrolls away with it — leaving a column of numbers with nothing naming the row. The
 * background is opaque and matches `Card`, or the scrolling cells show through underneath.
 */
const STICKY_COL = "sticky left-0 z-[1] bg-white dark:bg-neutral-900";

/**
 * Metric rows × Selected / Last month / Δ / Per day.
 *
 * Hand-rolled rather than the kit `DataTable` because the rows are METRICS, not records: the
 * label column is a row header (`<th scope="row">`), the value formats differ per row, and
 * column sorting would be meaningless. Reusing DataTable here would mean fighting its
 * record-shaped API for no gain.
 *
 * ⚠️ Column ORDER is load-bearing on narrow screens. Δ sits immediately after the two values it
 * compares, and the (optional, supporting) per-day column trails it — because on a phone the
 * table scrolls and whatever is 5th is effectively hidden. Putting per-day 4th pushed Δ — the
 * entire point of the table — off-screen by default.
 */
function ComparisonTable({ metrics, fmt, DeltaCell, unequal, currentDays, previousDays }: TableProps) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th className={`${TH} text-left ${STICKY_COL}`}>Metric</th>
            <th className={`${TH} text-right`}>Selected</th>
            <th className={`${TH} text-right`}>Last month</th>
            <th className={`${TH} text-right whitespace-nowrap`}>{unequal ? "Δ / day" : "Δ"}</th>
            {unequal && <th className={`${TH} text-right whitespace-nowrap`}>Per day</th>}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const curPerDay = perDay(m.current, currentDays, m.format);
            const prevPerDay = perDay(m.previous, previousDays, m.format);
            return (
              <tr
                key={m.key}
                className="border-b border-neutral-100 dark:border-neutral-800/60"
              >
                <th
                  scope="row"
                  className={`py-2.5 px-2 text-left text-xs sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 ${STICKY_COL}`}
                >
                  {m.label}
                </th>
                <td className="py-2.5 px-2 text-right num text-xs sm:text-sm">
                  {fmt(m.current, m.format)}
                </td>
                <td className="py-2.5 px-2 text-right num text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
                  {fmt(m.previous, m.format)}
                </td>
                <td className="py-2.5 px-2 text-right">
                  <DeltaCell m={m} />
                </td>
                {unequal && (
                  <td className="py-2.5 px-2 text-right num text-2xs text-neutral-500 dark:text-neutral-400 tabular-nums whitespace-nowrap">
                    {curPerDay === null || prevPerDay === null ? (
                      "—"
                    ) : (
                      <>
                        {fmt(curPerDay, m.format)}
                        <span className="mx-1 text-neutral-300 dark:text-neutral-600">vs</span>
                        {fmt(prevPerDay, m.format)}
                      </>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Every metric, grouped, with a biggest-movers sort. */
function FullComparison(props: TableProps) {
  const [sortByMovement, setSortByMovement] = useState(false);

  const groups = useMemo(() => {
    if (sortByMovement) {
      // One flat list, largest absolute % change first. Metrics with no comparable percentage
      // (prior value 0) sort last rather than to either extreme.
      const sorted = [...props.metrics].sort(
        (a, b) => (Math.abs(b.deltaPct ?? -1) || -1) - (Math.abs(a.deltaPct ?? -1) || -1),
      );
      return [{ group: "Biggest movers" as const, metrics: sorted }];
    }
    const order = ["Revenue", "Customers", "Advertising"] as const;
    return order.map((group) => ({
      group,
      metrics: props.metrics.filter((m) => m.group === group),
    }));
  }, [props.metrics, sortByMovement]);

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setSortByMovement((v) => !v)}
          aria-pressed={sortByMovement}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
            sortByMovement
              ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
              : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800",
          )}
        >
          <ArrowUpDown className="w-3.5 h-3.5" strokeWidth={2} />
          Biggest movers
        </button>
      </div>

      {groups.map(({ group, metrics }) => (
        <section key={group}>
          <h4 className="text-2xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5">
            {group}
          </h4>
          <ComparisonTable {...props} metrics={metrics} />
        </section>
      ))}
    </>
  );
}
