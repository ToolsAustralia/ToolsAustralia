"use client";

import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { HolidayPromoSlot } from "@/utils/promo-banner/holiday-promo-banner";
import {
  getActiveHolidayPromoSlot,
  PROMO_HOLIDAY_DEV_ITEMS,
  readHolidayDevToolbarHidden,
  writeHolidayDevToolbarHidden,
  writeHolidayPromoDevSessionSlot,
} from "@/utils/promo-banner/holiday-promo-banner";

export type PromoHolidayDevToolbarProps = {
  forcedSlot: HolidayPromoSlot | null;
  onForcedSlotChange: (slot: HolidayPromoSlot | null) => void;
};

/**
 * Fixed dev-only controls to preview Easter long-weekend left banner art without changing system time.
 * Persists choice in sessionStorage; URL `?promoHoliday=good-friday` (aliases: gf, gfe, easter, ee, …) also works.
 */
export function PromoHolidayDevToolbar({ forcedSlot, onForcedSlotChange }: PromoHolidayDevToolbarProps) {
  const [toolbarHidden, setToolbarHidden] = useState(false);
  // Fully dismissed for THIS page view. Deliberately in-memory (not sessionStorage, unlike
  // `toolbarHidden`): the collapsed pill still occupies bottom-left at z-10000 and covers
  // whatever corner UI you're working on, so you need a way to clear the corner outright —
  // but a dev tool you can permanently lose is a dev tool you forget exists. A reload brings
  // it back, which is also how you get it back after dismissing.
  const [dismissedForPageView, setDismissedForPageView] = useState(false);

  useEffect(() => {
    setToolbarHidden(readHolidayDevToolbarHidden());
  }, []);

  if (process.env.NODE_ENV !== "development") return null;
  if (dismissedForPageView) return null;

  const liveSlot = getActiveHolidayPromoSlot();

  const chipActive = (slot: HolidayPromoSlot) =>
    forcedSlot !== null ? forcedSlot === slot : liveSlot === slot;

  if (toolbarHidden) {
    return (
      <div className="pointer-events-auto fixed bottom-3 left-3 z-[10000] flex items-stretch overflow-hidden rounded-lg border border-amber-400/35 bg-neutral-950/95 text-2xs font-semibold text-amber-100 shadow-[0_8px_28px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <button
          type="button"
          className="px-2.5 py-1.5 hover:bg-neutral-900/95"
          onClick={() => {
            writeHolidayDevToolbarHidden(false);
            setToolbarHidden(false);
          }}
          title="Show holiday banner dev tools"
          aria-label="Show holiday banner development tools"
        >
          Holiday dev
        </button>
        <button
          type="button"
          className="border-l border-amber-400/25 px-1.5 text-amber-200/70 hover:bg-neutral-900/95 hover:text-amber-100"
          onClick={() => setDismissedForPageView(true)}
          title="Clear this corner — comes back on the next page load"
          aria-label="Dismiss the holiday dev toggle until the next page load"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto fixed bottom-3 left-3 z-[10000] max-w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-white/15 bg-neutral-950/92 px-3 py-2.5 text-2xs text-neutral-100 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
      role="region"
      aria-label="Development: holiday promo banner preview"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <span className="min-w-0 font-semibold tracking-wide text-amber-300/95">Holiday banner</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            title="Collapse to the “Holiday dev” pill (saved for this tab)"
            onClick={() => {
              writeHolidayDevToolbarHidden(true);
              setToolbarHidden(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-400/45 bg-amber-950/70 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-amber-100 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] hover:bg-amber-900/80"
          >
            <ChevronDown className="h-3.5 w-3.5 opacity-90" aria-hidden />
            Hide
          </button>
          <span className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-2xs font-semibold uppercase text-white/80">
            Dev
          </span>
          <button
            type="button"
            title="Clear this corner — comes back on the next page load"
            aria-label="Dismiss the holiday dev panel until the next page load"
            onClick={() => setDismissedForPageView(true)}
            className="rounded-md border border-white/15 bg-white/5 px-1.5 py-1 text-white/70 hover:bg-white/15 hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mb-2 text-2xs leading-snug text-neutral-400">
        Preview Apr 3–6 art per brand. <span className="text-neutral-500">Calendar</span> uses real AEST date;
        forced chips ignore the clock.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          title="Use live AEST date (Apr 3–6 2026 shows artwork automatically)"
          onClick={() => {
            writeHolidayPromoDevSessionSlot(null);
            onForcedSlotChange(null);
          }}
          className={`rounded-lg px-2 py-1 font-medium transition ${
            forcedSlot === null
              ? "bg-amber-400/25 text-amber-200 ring-1 ring-amber-400/50"
              : "bg-white/10 text-white/85 hover:bg-white/15"
          }`}
        >
          Calendar
        </button>
        {PROMO_HOLIDAY_DEV_ITEMS.map((item) => (
          <button
            key={item.slot}
            type="button"
            title={item.hint}
            onClick={() => {
              writeHolidayPromoDevSessionSlot(item.slot);
              onForcedSlotChange(item.slot);
            }}
            className={`rounded-lg px-2 py-1 font-medium transition ${
              chipActive(item.slot)
                ? "bg-amber-400/25 text-amber-200 ring-1 ring-amber-400/50"
                : "bg-white/10 text-white/85 hover:bg-white/15"
            }`}
          >
            {item.shortLabel}
          </button>
        ))}
      </div>
      <p className="mt-2 text-3xs leading-relaxed text-neutral-500">
        URL: add{" "}
        <code className="rounded bg-black/40 px-0.5 text-neutral-300">?promoHoliday=good-friday</code>{" "}
        (or <code className="rounded bg-black/40 px-0.5">easter</code>, etc.)
      </p>
    </div>
  );
}
