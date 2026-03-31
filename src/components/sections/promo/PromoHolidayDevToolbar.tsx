"use client";

import type { HolidayPromoSlot } from "@/utils/promo-banner/holiday-promo-banner";
import {
  getActiveHolidayPromoSlot,
  PROMO_HOLIDAY_DEV_ITEMS,
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
  if (process.env.NODE_ENV !== "development") return null;

  const liveSlot = getActiveHolidayPromoSlot();

  const chipActive = (slot: HolidayPromoSlot) =>
    forcedSlot !== null ? forcedSlot === slot : liveSlot === slot;

  return (
    <div
      className="pointer-events-auto fixed bottom-3 left-3 z-[500] max-w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-white/15 bg-neutral-950/92 px-3 py-2.5 text-[11px] text-neutral-100 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
      role="region"
      aria-label="Development: holiday promo banner preview"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold tracking-wide text-amber-300/95">Holiday banner</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-white/60">
          dev
        </span>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-neutral-400">
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
      <p className="mt-2 text-[9px] leading-relaxed text-neutral-500">
        URL: add{" "}
        <code className="rounded bg-black/40 px-0.5 text-neutral-300">?promoHoliday=good-friday</code>{" "}
        (or <code className="rounded bg-black/40 px-0.5">easter</code>, etc.)
      </p>
    </div>
  );
}
