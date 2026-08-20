"use client";

import { Calendar } from "lucide-react";
import { DATE_RANGE_PRESETS } from "./DateRangeDropdown";
import type { DateRange } from "@/components/admin/DateRangeToggle";

/**
 * The date filter as ONE INLINE ROW — the desktop form of the control, sitting in the admin
 * header beside the theme toggle.
 *
 * Replaces a sticky bar that floated over the page below the header. That bar had to paint its
 * own backdrop to stop content showing through, and the backdrop is what covered the rows behind
 * it. Living in the header removes the whole problem: the header is already above the scroll
 * container, so the filter is permanently reachable without pinning, without a backdrop, and
 * without stealing a band of vertical space from every analytics page.
 *
 * Presets come from `DATE_RANGE_PRESETS`, shared with `DateRangeDropdown` (the mobile form), so
 * the two cannot drift into offering different ranges.
 *
 * `Custom` is a sibling button rather than a preset: it opens the modal instead of applying a
 * range, and once a custom range is active it shows the dates rather than the word.
 */
export function DateRangePresetRow({
  selectedRange,
  onRangeChange,
  onCustomClick,
  displayDate,
  accent = "#ee0000",
}: {
  selectedRange: DateRange;
  onRangeChange: (r: DateRange) => void;
  onCustomClick?: () => void;
  displayDate?: string;
  accent?: string;
}) {
  const isCustom = selectedRange === "custom";

  // One shared shape for every button so the active pill is the only thing that varies.
  const base =
    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition";
  const off =
    "text-neutral-600 dark:text-neutral-300 hover:bg-white dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100";

  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-neutral-100/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800"
      role="group"
      aria-label="Date range"
    >
      {DATE_RANGE_PRESETS.map((r) => {
        const on = r.id === selectedRange;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onRangeChange(r.id)}
            aria-pressed={on}
            className={`${base} ${on ? "text-white shadow-sm" : off}`}
            style={on ? { background: accent } : undefined}
          >
            {/* `short` at the narrow end of desktop so six presets plus the title still fit on a
                1024px viewport without the row wrapping into the header. */}
            <span className="hidden xl:inline">{r.label}</span>
            <span className="xl:hidden">{r.short}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => (onCustomClick ?? (() => onRangeChange("custom")))()}
        aria-pressed={isCustom}
        // Below `xl` this button is icon-only, so it needs a name that does not depend on the
        // visible label. Always set, not just when a custom range is active.
        aria-label={isCustom && displayDate ? `Custom range: ${displayDate}` : "Custom range"}
        title={isCustom && displayDate ? displayDate : "Custom range"}
        className={`${base} ${isCustom ? "text-white shadow-sm" : off}`}
        style={isCustom ? { background: accent } : undefined}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
        {/* The chosen dates ARE the label once a custom range is active — repeating the word
            "Custom" next to them would say nothing. */}
        <span className={isCustom ? "" : "hidden xl:inline"}>
          {isCustom ? (displayDate ?? "Custom") : "Custom"}
        </span>
      </button>
    </div>
  );
}
