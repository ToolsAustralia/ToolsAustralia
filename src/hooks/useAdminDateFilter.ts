"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import { useCurrentAndLastDrawDates } from "@/hooks/queries/useAdminQueries";
import { resolveAestDateWindow } from "@/utils/admin/resolveAestDateWindow";

/**
 * Shared admin date-range filter state for every tab that drives AEST date-bounded queries
 * (Overview, All-Platforms, Facebook/TikTok/Snapchat Ads, Repeat Purchases, …).
 *
 * ONE source of truth for the AEST math: the preset → `yyyy-MM-dd` mapping lives in
 * `resolveAestDateWindow` and this hook calls it. It used to keep a private copy, which meant
 * the cards (which call the util directly) and the toolbar (which called the copy) could drift
 * on what a preset meant.
 *
 * `syncToUrl` mirrors the filter into `?dateRange=&startDate=&endDate=` so the range survives a
 * refresh and can be deep-linked. Off by default — the single-tab consumers never round-tripped
 * through the URL and there is no reason to start writing history entries for them.
 *
 * Render the matching control with `<AdminDateRangeToolbar filter={…} />`.
 */
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

export interface UseAdminDateFilterOptions {
  /**
   * Mirror the filter into the URL query and rehydrate from it on mount.
   *
   * Only the presets that CARRY dates (`custom`, `current-draw`, `last-draw`) write
   * `startDate`/`endDate`; the rest clear them, because for those the preset alone is the
   * complete description and a stale pair in the URL would outrank it on the next mount.
   */
  syncToUrl?: boolean;
}

/** Build a date from a yyyy-MM-dd string in LOCAL time (no UTC shift) for display only. */
function formatShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** Presets whose meaning depends on explicit dates travelling alongside them. */
function carriesDates(range: DateRange): boolean {
  return range === "custom" || range === "current-draw" || range === "last-draw";
}

export function useAdminDateFilter(
  initial: DateRange = "today",
  options: UseAdminDateFilterOptions = {},
): AdminDateFilter {
  const { syncToUrl = false } = options;
  const { data: drawDates } = useCurrentAndLastDrawDates();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Seed from the URL when syncing, so a refresh or a shared link lands on the same window
  // instead of snapping back to the default for one render.
  const urlSeed = useMemo(() => {
    if (!syncToUrl) return null;
    const range = searchParams.get("dateRange") as DateRange | null;
    if (!range) return null;
    return { range, start: searchParams.get("startDate") ?? "", end: searchParams.get("endDate") ?? "" };
    // Seed only — deliberately not reactive. Live URL changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncToUrl]);

  const [dateRange, setDateRange] = useState<DateRange>(urlSeed?.range ?? initial);
  // Resolve the initial preset synchronously so date-gated queries enable on first paint
  // (draw presets resolve "" here and fill in via the effect once dates load).
  const [dates, setDates] = useState(() => {
    const r = resolveAestDateWindow(urlSeed?.range ?? initial, urlSeed?.start, urlSeed?.end);
    return { start: r.startDate ?? "", end: r.endDate ?? "" };
  });
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const writeUrl = useCallback(
    (range: DateRange, start: string, end: string) => {
      if (!syncToUrl) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("dateRange", range);
      if (carriesDates(range) && start && end) {
        params.set("startDate", start);
        params.set("endDate", end);
      } else {
        params.delete("startDate");
        params.delete("endDate");
      }
      const next = params.toString();
      // Writing an identical query would re-run this component's own URL effect and bounce
      // state back and forth forever. Compare before navigating.
      if (next === searchParams.toString()) return;
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [syncToUrl, searchParams, router, pathname],
  );

  const apply = useCallback(
    (range: DateRange, start?: string, end?: string) => {
      const r = resolveAestDateWindow(range, start, end, drawDates);
      const resolved = { start: r.startDate ?? "", end: r.endDate ?? "" };
      setDateRange(range);
      setDates(resolved);
      writeUrl(range, resolved.start, resolved.end);
    },
    [drawDates, writeUrl],
  );

  // A draw preset selected before its dates loaded — re-resolve once they arrive.
  useEffect(() => {
    if (
      (dateRange === "current-draw" || dateRange === "last-draw") &&
      (!dates.start || !dates.end) &&
      drawDates
    ) {
      const r = resolveAestDateWindow(dateRange, undefined, undefined, drawDates);
      if (r.startDate && r.endDate) {
        setDates({ start: r.startDate, end: r.endDate });
        writeUrl(dateRange, r.startDate, r.endDate);
      }
    }
  }, [drawDates, dateRange, dates.start, dates.end, writeUrl]);

  // Adopt EXTERNAL url changes (back/forward, a deep link followed mid-session). Guarded on the
  // values actually differing so our own `writeUrl` never round-trips back into state.
  const lastAppliedUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!syncToUrl) return;
    const key = searchParams.toString();
    if (lastAppliedUrl.current === key) return;
    lastAppliedUrl.current = key;

    const range = searchParams.get("dateRange") as DateRange | null;
    if (!range || range === dateRange) return;

    const r = resolveAestDateWindow(
      range,
      searchParams.get("startDate") ?? undefined,
      searchParams.get("endDate") ?? undefined,
      drawDates,
    );
    setDateRange(range);
    setDates({ start: r.startDate ?? "", end: r.endDate ?? "" });
  }, [syncToUrl, searchParams, dateRange, drawDates]);

  const handleRangeChange = useCallback(
    (range: DateRange) => {
      if (range === "custom") setIsCustomOpen(true);
      else apply(range);
    },
    [apply],
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
