import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Draw windows as `useCurrentAndLastDrawDates` returns them, described structurally so this
 * util stays importable from anywhere. Declaring the shape here rather than importing the
 * hook's type is what keeps the dependency pointing hook → util; a `"use client"` hook must
 * never end up as a dependency of a plain util.
 */
export interface AestDrawDateWindows {
  currentDraw?: { startDate: string; endDate: string } | null;
  lastDraw?: { startDate: string; endDate: string } | null;
}

/**
 * THE preset → AEST `yyyy-MM-dd` mapping for the admin date filter.
 *
 * Single source of truth: `useAdminDateFilter` (every date-bounded analytics tab) and the
 * card-level consumers that receive `dateRange` + raw props both resolve through this one
 * function. There used to be two copies — this util for the cards and a private `resolveRange`
 * inside the hook — which is exactly the kind of fork that lets two surfaces on the same screen
 * disagree about what "all-time" means.
 *
 * Semantics (unchanged): explicit custom dates win; `today`/`yesterday`/`all-time` resolve
 * against the Australia/Sydney calendar (the stats and hourly APIs bucket by that zone, so UTC
 * would drop the current AEST day each morning); anything that cannot resolve returns
 * `{ undefined, undefined }` so callers can gate their fetches instead of firing a request the
 * route would 400.
 *
 * `drawDates` is optional and only consulted for the `current-draw` / `last-draw` presets. It is
 * the 4th parameter so the three-argument calls that predate it are untouched — those callers
 * receive draw windows already resolved into `customStartDate`/`customEndDate` by their parent.
 */
export function resolveAestDateWindow(
  dateRange: string,
  customStartDate?: string,
  customEndDate?: string,
  drawDates?: AestDrawDateWindows,
): { startDate?: string; endDate?: string } {
  const todayAest = () => formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
  const yesterdayAest = () => formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");

  // Draw presets resolve from `drawDates` when the caller supplies it. Checked before the
  // generic branches below so a caller can pass both without the custom dates shadowing the
  // preset. When the draw windows have not loaded yet this falls through and the preset
  // resolves to `{ undefined, undefined }` — the caller re-runs once they arrive.
  const drawWindow =
    dateRange === "current-draw"
      ? drawDates?.currentDraw
      : dateRange === "last-draw"
        ? drawDates?.lastDraw
        : null;
  if (drawWindow) {
    return { startDate: drawWindow.startDate, endDate: drawWindow.endDate };
  }

  const startDate = (() => {
    if (customStartDate && customEndDate) return customStartDate;
    if (dateRange === "custom" && customStartDate) return customStartDate;
    if (dateRange === "today") return todayAest();
    if (dateRange === "yesterday") return yesterdayAest();
    if (dateRange === "all-time") return formatInTimeZone(getWebsiteLaunchDateUTC(), AEST_TIMEZONE, "yyyy-MM-dd");
    return undefined;
  })();

  const endDate = (() => {
    if (customStartDate && customEndDate) return customEndDate;
    if (dateRange === "custom" && customEndDate) return customEndDate;
    if (dateRange === "today") return todayAest();
    if (dateRange === "yesterday") return yesterdayAest();
    if (dateRange === "all-time") return todayAest();
    return undefined;
  })();

  return { startDate, endDate };
}

/**
 * The previous CALENDAR month in AEST, as `yyyy-MM-dd` bounds — the fixed benchmark the admin
 * period-comparison table compares against.
 *
 * Deliberately NOT `trendCalculationService.getComparisonPeriod`, which returns the equal-length
 * window immediately preceding the selection. Both are correct for their own job and both are
 * kept: the KPI trend arrows want "vs the previous equivalent stretch", the comparison table
 * wants a stable month-on-month benchmark that does not move when the reader changes the range.
 * They are two different questions, so they get two clearly-named functions rather than one
 * function with a mode flag.
 *
 * Computed by walking back from the FIRST of the current AEST month, so it is correct across
 * year boundaries (January → previous December) and unaffected by DST: the arithmetic happens on
 * the AEST calendar date, never on a UTC instant that could land in the neighbouring day.
 */
export function resolvePreviousCalendarMonthAest(now: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const [year, month] = formatInTimeZone(now, AEST_TIMEZONE, "yyyy-MM")
    .split("-")
    .map(Number);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const pad = (n: number) => String(n).padStart(2, "0");

  // `new Date(Date.UTC(y, m, 0))` gives the last day of month `m` (1-indexed) — day 0 of the
  // following month. UTC arithmetic is safe here because we only read the day-of-month off a
  // date built from AEST calendar numbers; no zone conversion happens.
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();

  return {
    startDate: `${prevYear}-${pad(prevMonth)}-01`,
    endDate: `${prevYear}-${pad(prevMonth)}-${pad(lastDay)}`,
  };
}
