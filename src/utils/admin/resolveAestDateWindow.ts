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
  const todayAest = () => aestToday();
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
 * Today as `yyyy-MM-dd` in AEST — the calendar every admin date filter resolves against.
 *
 * THE one definition. It used to be duplicated as a local closure in `resolveAestDateWindow` and
 * again as `aestToday` in `periodComparisonModel.ts`; three copies of "what day is it" is how two
 * surfaces on the same screen end up disagreeing about where "today" ends.
 */
export function aestToday(): string {
  return formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
}

/**
 * Shift a `yyyy-MM-dd` AEST calendar date by whole months, clamping to the target month's length.
 *
 * Pure calendar arithmetic on the date NUMBERS — no UTC instant is ever constructed from them, so
 * a DST transition cannot slide the result into the neighbouring day.
 *
 * Clamping is the standard month-shift behaviour and is deliberate: 31 Jul − 1 month is 30 Jun,
 * because June has no 31st. It is the only case where the shifted window comes out a day shorter
 * than the selected one, and the per-day normalisation in `periodComparisonModel` absorbs that.
 */
function shiftMonthsAest(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  let year = y;
  let month = m + delta;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  // Day 0 of month+1 is the last day of month (1-indexed month into a 0-indexed constructor).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

/**
 * The window to benchmark the SELECTED window against: **the same dates, one calendar month
 * earlier** — with the current window first truncated at today.
 *
 * ── Why this shape ─────────────────────────────────────────────────────────────────────────
 *
 * This replaced a fixed "previous calendar month" benchmark, which compared whatever the reader
 * had selected against the whole of last month. That is not a comparison, it is two unrelated
 * numbers side by side: on 20 Aug it put ONE day of revenue next to THIRTY-ONE days of it.
 *
 * The rule now is "same span, one month back", which reads the way a person actually means it:
 *
 * | Selected                          | Compared against              |
 * |-----------------------------------|-------------------------------|
 * | Today, 20 Aug                     | 20 Jul                        |
 * | Current draw, 28 Jul → 27 Aug     | 28 Jun → 20 Jul               |
 * | Custom, 31 Jul → 7 Aug            | 30 Jun → 7 Jul                |
 *
 * ── The truncation is the load-bearing part ────────────────────────────────────────────────
 *
 * A draw window ENDS ON THE DRAW DATE, which is in the future while the draw is running. On
 * 20 Aug the current draw is 28 Jul → 27 Aug, but only 28 Jul → 20 Aug has actually happened.
 * Truncate FIRST, then shift, so the previous window is 28 Jun → 20 Jul — not 28 Jun → 27 Jul,
 * which would pit 24 days of live data against 31 days of history and invent a decline.
 *
 * Returns `null` when there is nothing honest to compare: unresolved bounds, an inverted range,
 * or a window that has not started yet. Callers hide the comparison rather than render a
 * fabricated one.
 */
export function resolvePreviousPeriodAest(
  selected: { startDate?: string | null; endDate?: string | null },
  today: string = aestToday(),
): {
  current: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
} | null {
  const startDate = selected.startDate ?? "";
  const endDate = selected.endDate ?? "";
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  if (!ISO_DAY.test(startDate) || !ISO_DAY.test(endDate)) return null;
  if (startDate > endDate) return null;

  // `yyyy-MM-dd` sorts lexicographically, so a string compare IS a date compare.
  const effectiveEnd = endDate > today ? today : endDate;
  // The whole window is still in the future — there is no data on either side yet.
  if (effectiveEnd < startDate) return null;

  return {
    current: { startDate, endDate: effectiveEnd },
    previous: {
      startDate: shiftMonthsAest(startDate, -1),
      endDate: shiftMonthsAest(effectiveEnd, -1),
    },
  };
}
