"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import type { PrizeSlug } from "@/config/prizes";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";
import { useThemeStore } from "@/stores/useThemeStore";
import { usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { getLandingPageThemeFromSlug, hexToRgbString } from "@/utils/package-colors/packageColorScheme";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import PromoBadgeImage from "@/components/ui/PromoBadgeImage";
import { formatMajorDrawStripSchedule } from "@/utils/draws/major-draw-strip-schedule";
import { isPromoMultiplier } from "@/types/promo-multiplier";

/** How long each slide stays visible before cross-fading to the other */
const ROTATE_MS = 10_000;

interface MajorDrawHeaderStripProps {
  /** Fallback before promo store sync (e.g. first paint / no showcase yet) */
  prizeSlug?: PrizeSlug;
  drawName: string;
  entryCount: number;
  /** Major draw `drawDate` ISO for alternating “Saturday, April 27th” / time slide */
  drawDateIso?: string | null;
  onBoostEntries: () => void;
}

/**
 * Major-draw strip: alternates draw name + entries vs draw date + time (Sydney) every 5s when `drawDateIso` is set.
 */
export default function MajorDrawHeaderStrip({
  prizeSlug: prizeSlugFallback = DEFAULT_PRIZE_SLUG,
  drawName,
  entryCount,
  drawDateIso,
  onBoostEntries,
}: MajorDrawHeaderStripProps) {
  const isDark = useThemeStore((s) => s.theme === "dark");
  const storeSlug = usePromoThemeStore((s) => s.slug);
  const prizeSlug = ((storeSlug as PrizeSlug | null) ?? prizeSlugFallback) as PrizeSlug;

  const schedule = drawDateIso ? formatMajorDrawStripSchedule(drawDateIso) : null;
  const [showSchedule, setShowSchedule] = useState(false);

  useEffect(() => {
    const s = drawDateIso ? formatMajorDrawStripSchedule(drawDateIso) : null;
    if (!s) {
      setShowSchedule(false);
      return;
    }
    setShowSchedule(false);
    const id = window.setInterval(() => {
      setShowSchedule((prev) => !prev);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [drawDateIso]);

  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");
  const displayMultiplier =
    resolvedMembershipMultiplier != null && resolvedMembershipMultiplier > 1
      ? resolvedMembershipMultiplier
      : resolvedOneTimeMultiplier != null && resolvedOneTimeMultiplier > 1
        ? resolvedOneTimeMultiplier
        : null;

  const lp = getLandingPageThemeFromSlug(prizeSlug);

  const surfaceStyle: CSSProperties = isDark
    ? {
        background: `color-mix(in srgb, ${lp.primary} 14%, rgb(10 10 10))`,
        borderColor: hexToRgbString(lp.primaryDark),
        boxShadow: "0 10px 28px -10px rgb(0 0 0 / 0.45), 0 4px 14px -8px rgb(0 0 0 / 0.35)",
      }
    : {
        background: `color-mix(in srgb, ${lp.primary} 7%, white)`,
        borderColor: hexToRgbString(lp.primaryDark),
        boxShadow: "0 12px 32px -14px rgb(15 23 42 / 0.14), 0 4px 16px -8px rgb(15 23 42 / 0.08)",
      };

  const shellClass =
    "flex w-full min-w-0 flex-row items-center justify-between gap-3 rounded-2xl border border-l-[5px] px-3.5 py-3 sm:gap-4 sm:px-5 sm:py-3.5 lg:gap-5 lg:px-6 lg:py-4 " +
    (isDark ? "ring-1 ring-neutral-700" : "ring-1 ring-neutral-200");

  const titleClass =
    "truncate text-sm font-semibold leading-tight sm:text-base lg:text-lg lg:font-bold " +
    (isDark ? "text-neutral-50" : "text-neutral-900");
  const entriesLabelClass =
    "text-[11px] sm:text-xs lg:text-sm font-medium " + (isDark ? "text-neutral-400" : "text-neutral-600");
  const entriesValueClass =
    "tabular-nums font-extrabold leading-none tracking-tight text-sm sm:text-xl lg:text-2xl";
  const entriesValueStyle = { color: isDark ? lp.primaryLight : lp.primaryDark };
  const entriesWordClass =
    "tabular-nums font-extrabold text-[11px] sm:text-sm lg:text-lg leading-none";

  const dateTitleClass =
    "text-left text-sm font-semibold leading-tight sm:text-base lg:text-lg lg:font-bold line-clamp-2 " +
    (isDark ? "text-neutral-50" : "text-neutral-900");
  const timeLineClass =
    "text-left text-[11px] sm:text-xs lg:text-sm font-medium lg:font-semibold " +
    (isDark ? "text-neutral-300" : "text-neutral-700");

  const boostButtonClass =
    "group relative shrink-0 min-w-[8.5rem] sm:min-w-[11rem] lg:min-w-[12.5rem] get-more-entries-cta overflow-visible rounded-xl font-bold " +
    "px-3 py-2.5 sm:px-4 sm:py-3 lg:px-5 lg:py-3.5 text-black dark:text-gray-900 " +
    "bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 dark:from-amber-500 dark:via-yellow-500 dark:to-amber-600 " +
    "border border-amber-500/40 dark:border-amber-400/25 " +
    "shadow-[0_2px_12px_rgba(251,191,36,0.4),0_0_1px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_24px_rgba(234,179,8,0.35)] " +
    "hover:shadow-[0_4px_20px_rgba(251,191,36,0.5),0_0_24px_rgba(234,179,8,0.4)] dark:hover:shadow-[0_6px_28px_rgba(0,0,0,0.5),0_0_40px_rgba(234,179,8,0.45)] " +
    "transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 self-center";

  const slideTransition = "transition-opacity duration-1000 ease-in-out";
  const slideOn = `absolute inset-0 z-10 flex flex-col justify-center opacity-100 ${slideTransition} w-full min-w-0 overflow-hidden`;
  const slideOff = `absolute inset-0 z-0 flex flex-col justify-center ${slideTransition} pointer-events-none w-full min-w-0 overflow-hidden opacity-0`;

  return (
    <div className={shellClass} style={{ ...surfaceStyle, borderLeftColor: lp.primary }}>
      <div
        className="relative min-h-[2.75rem] sm:min-h-[3.25rem] lg:min-h-[3.75rem] flex-1 min-w-0 pr-1"
        aria-live="polite"
      >
        <div
          className={!schedule || !showSchedule ? slideOn : slideOff}
          aria-hidden={Boolean(schedule && showSchedule)}
        >
          <p className={titleClass}>{drawName}</p>
          <p className={`${entriesLabelClass} mt-0.5 lg:mt-1`}>
            Your Entries:{" "}
            <span className={entriesValueClass} style={entriesValueStyle}>
              {entryCount.toLocaleString()}
            </span>{" "}
            <span className={entriesWordClass} style={entriesValueStyle}>
              {entryCount === 1 ? "Entry" : "Entries"}
            </span>
          </p>
        </div>
        {schedule ? (
          <div
            className={showSchedule ? slideOn : slideOff}
            aria-hidden={!showSchedule}
          >
            <p className={dateTitleClass}>{schedule.dateLine}</p>
            <p className={`${timeLineClass} mt-0.5 lg:mt-1`}>{schedule.timeLine}</p>
          </div>
        ) : null}
      </div>
      <button type="button" onClick={onBoostEntries} className={boostButtonClass}>
        <div className="get-more-entries-shimmer rounded-xl" aria-hidden="true" />
        <div className="absolute -top-3 -left-1 z-20 pointer-events-none">
          <span
            className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-wide sm:tracking-wider text-white animate-badge-pulse"
            style={{
              background: "linear-gradient(135deg, #dc2626 0%, #ea580c 40%, #dc2626 70%, #b91c1c 100%)",
              boxShadow: "0 0 12px rgba(238,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          > 
            50% OFF
          </span>
        </div>
        {displayMultiplier != null && isPromoMultiplier(displayMultiplier) ? (
          <div className="absolute -top-3 -right-4  z-20 pointer-events-none flex flex-col items-end">
            <PromoBadgeImage
              multiplier={displayMultiplier}
              size="small"
              className="h-9 w-auto sm:h-8 drop-shadow-md"
            />
          </div>
        ) : null}
        <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2 lg:gap-2.5">
          <Zap className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 shrink-0" />
          <span className="text-xs sm:text-sm lg:text-base">Boost Entries</span>
        </span>
      </button>
    </div>
  );
}
