"use client";

import { useCallback, useEffect, useState } from "react";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import { useCurrentAndLastDrawDates } from "@/hooks/queries/useAdminQueries";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

/**
 * Shared admin date-range filter state for tabs that drive AEST date-bounded
 * queries (All-Platforms, TikTok, Snapchat). Packages the date-preset resolution
 * the FacebookAds tab does inline so the 4 tabs share ONE source of truth for the
 * AEST math (the stats/hourly APIs bucket by Australia/Sydney calendar days, so
 * every preset resolves to `yyyy-MM-dd` in that zone — UTC would drop the current
 * AEST day each morning). Local state only (no URL sync) — one tab is mounted at a
 * time and these tabs don't currently round-trip the range through the URL.
 *
 * Render the matching control with `<AdminDateRangeToolbar filter={…} />`.
 */
const AEST = "Australia/Sydney";

export interface AdminDateFilter {
  dateRange: DateRange;
  /** yyyy-MM-dd in AEST. "" until resolved (draw presets resolve once draw dates load). */
  startDate: string;
  endDate: string;
  /** Short label for the "Custom" dropdown trigger, e.g. "1 Jun – 30 Jun". */
  displayDate: string;
  isCustomOpen: boolean;
  setIsCustomOpen: (v: boolean) => void;
  handleRangeChange: (r: DateRange) => void;
  applyCustom: (start: string, end: string) => void;
}

type DrawDates = ReturnType<typeof useCurrentAndLastDrawDates>["data"];

/** Resolve a preset to concrete AEST yyyy-MM-dd bounds. Draw presets need
 *  `drawDates`; if those aren't loaded yet they resolve to "" (the effect re-runs). */
function resolveRange(
  range: DateRange,
  drawDates: DrawDates,
  start?: string,
  end?: string
): { start: string; end: string } {
  if (range === "today") {
    const d = formatInTimeZone(new Date(), AEST, "yyyy-MM-dd");
    return { start: d, end: d };
  }
  if (range === "yesterday") {
    const d = formatInTimeZone(subDays(new Date(), 1), AEST, "yyyy-MM-dd");
    return { start: d, end: d };
  }
  if (range === "all-time") {
    return {
      start: formatInTimeZone(getWebsiteLaunchDateUTC(), AEST, "yyyy-MM-dd"),
      end: formatInTimeZone(new Date(), AEST, "yyyy-MM-dd"),
    };
  }
  if (range === "current-draw") {
    return drawDates?.currentDraw
      ? { start: drawDates.currentDraw.startDate, end: drawDates.currentDraw.endDate }
      : { start: "", end: "" };
  }
  if (range === "last-draw") {
    return drawDates?.lastDraw
      ? { start: drawDates.lastDraw.startDate, end: drawDates.lastDraw.endDate }
      : { start: "", end: "" };
  }
  // custom
  return { start: start ?? "", end: end ?? "" };
}

/** Build a date from a yyyy-MM-dd string in LOCAL time (no UTC shift) for display only. */
function formatShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function useAdminDateFilter(initial: DateRange = "today"): AdminDateFilter {
  const { data: drawDates } = useCurrentAndLastDrawDates();
  const [dateRange, setDateRange] = useState<DateRange>(initial);
  // Resolve the initial preset synchronously so date-gated queries enable on first
  // paint (draw presets resolve "" here and fill in via the effect once dates load).
  const [dates, setDates] = useState(() => resolveRange(initial, undefined));
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const apply = useCallback(
    (range: DateRange, start?: string, end?: string) => {
      setDateRange(range);
      setDates(resolveRange(range, drawDates, start, end));
    },
    [drawDates]
  );

  // A draw preset selected before its dates loaded — re-resolve once they arrive.
  useEffect(() => {
    if (
      (dateRange === "current-draw" || dateRange === "last-draw") &&
      (!dates.start || !dates.end) &&
      drawDates
    ) {
      const r = resolveRange(dateRange, drawDates);
      if (r.start && r.end) setDates(r);
    }
  }, [drawDates, dateRange, dates.start, dates.end]);

  const handleRangeChange = useCallback(
    (range: DateRange) => {
      if (range === "custom") setIsCustomOpen(true);
      else apply(range);
    },
    [apply]
  );

  const applyCustom = useCallback((start: string, end: string) => apply("custom", start, end), [apply]);

  const displayDate =
    dateRange === "custom" && dates.start && dates.end
      ? `${formatShort(dates.start)} – ${formatShort(dates.end)}`
      : "";

  return {
    dateRange,
    startDate: dates.start,
    endDate: dates.end,
    displayDate,
    isCustomOpen,
    setIsCustomOpen,
    handleRangeChange,
    applyCustom,
  };
}
