"use client";
import { useRef, useState } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { Popover } from "@/components/admin/ui";
import type { DateRange } from "@/components/admin/DateRangeToggle";

/**
 * THE preset list for the admin date filter, in display order.
 *
 * Exported because the control has two forms — this dropdown (mobile) and
 * `DateRangePresetRow` (desktop). A private copy in each is how one surface ends up offering a
 * range the other does not.
 *
 * `short` is used where horizontal space is tight (a narrow phone trigger, or the desktop row
 * below the xl breakpoint).
 */
export const DATE_RANGE_PRESETS: { id: DateRange; label: string; short: string }[] = [
  { id: "today", label: "Today", short: "Today" },
  { id: "yesterday", label: "Yesterday", short: "Yest." },
  { id: "current-draw", label: "Current Draw", short: "Current" },
  { id: "last-draw", label: "Last Draw", short: "Last" },
  { id: "all-time", label: "All Time", short: "All" },
];

export function DateRangeDropdown({
  selectedRange, onRangeChange, onCustomClick, displayDate, accent = "#ee0000",
}: {
  selectedRange: DateRange; onRangeChange: (r: DateRange) => void;
  onCustomClick?: () => void; displayDate?: string; accent?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const cur = DATE_RANGE_PRESETS.find((r) => r.id === selectedRange);
  const triggerLabel = selectedRange === "custom" ? (displayDate ?? "Custom") : (cur?.label ?? "Date range");
  const triggerShort = selectedRange === "custom" ? (displayDate ?? "Custom") : (cur?.short ?? "Range");
  return (
    <>
      <button ref={ref} onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition">
        <Calendar className="w-4 h-4" style={{ color: accent }} strokeWidth={2} />
        <span className="hidden sm:inline">{triggerLabel}</span>
        <span className="sm:hidden">{triggerShort}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} width={240} align="end">
        <div className="p-1.5">
          <p className="px-2.5 py-1.5 text-2xs font-bold uppercase tracking-wider text-neutral-400">Date range</p>
          {DATE_RANGE_PRESETS.map((r) => {
            const on = r.id === selectedRange;
            return (
              <button key={r.id} onClick={() => { onRangeChange(r.id); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition ${on ? "text-white" : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
                style={on ? { background: accent } : undefined}>
                {r.label}{on && <Check className="w-4 h-4" strokeWidth={2.5} />}
              </button>
            );
          })}
          <div className="mt-1 pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
            <button onClick={() => { (onCustomClick ?? (() => onRangeChange("custom")))(); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition ${selectedRange === "custom" ? "text-white" : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
              style={selectedRange === "custom" ? { background: accent } : undefined}>
              <Calendar className="w-4 h-4" strokeWidth={2} /> Custom range…
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
