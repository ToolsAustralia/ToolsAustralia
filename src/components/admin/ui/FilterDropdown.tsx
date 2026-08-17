"use client";
import { useRef, useState, type ComponentType } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover } from "./Popover";

export interface FilterDropdownOption<T extends string> {
  value: T;
  label: string;
  /** Optional right-aligned hint, e.g. a row count. */
  hint?: string;
}

/**
 * Styled single-select for admin filter bars.
 *
 * Exists because a native `<select>` renders the OS control — which ignores the admin
 * theme entirely and looks nothing like `DateRangeDropdown` sitting beside it. This is the
 * same trigger-button + `Popover` + option-list pattern that component already uses, pulled
 * into the kit so filter bars don't each grow their own copy.
 *
 * Keeps a real `<label>`-able trigger and closes on outside click / scroll via `Popover`.
 */
export function FilterDropdown<T extends string>({
  value,
  options,
  onChange,
  allLabel,
  icon: Icon,
  ariaLabel,
  accent = "#ee0000",
  width = 260,
}: {
  /** `""` selects the "all" option. */
  value: T | "";
  options: FilterDropdownOption<T>[];
  onChange: (value: T | "") => void;
  /** Label for the reset row. Omit to make the dropdown required (no reset row). */
  allLabel?: string;
  icon?: ComponentType<{ className?: string }>;
  ariaLabel: string;
  accent?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);
  const triggerLabel = current?.label ?? allLabel ?? "Select";

  const row = (selected: boolean, label: string, hint: string | undefined, onClick: () => void, key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        onClick();
        setOpen(false);
      }}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition ${
        selected
          ? "text-white"
          : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
      style={selected ? { background: accent } : undefined}
    >
      <span className="truncate text-left">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {hint && (
          <span className={selected ? "text-2xs text-white/80" : "text-2xs text-neutral-400"}>{hint}</span>
        )}
        {selected && <Check className="w-4 h-4" strokeWidth={2.5} />}
      </span>
    </button>
  );

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex max-w-[15rem] items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600"
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} width={width} align="start">
        <div className="max-h-80 overflow-y-auto p-1.5">
          <p className="px-2.5 py-1.5 text-2xs font-bold uppercase tracking-wider text-neutral-400">
            {ariaLabel}
          </p>
          {allLabel && row(value === "", allLabel, undefined, () => onChange(""), "__all")}
          {options.map((o) => row(o.value === value, o.label, o.hint, () => onChange(o.value), o.value))}
        </div>
      </Popover>
    </>
  );
}
