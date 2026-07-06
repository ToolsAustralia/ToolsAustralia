"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

export interface SelectMenuOption {
  value: string;
  label: string;
}

interface SelectMenuProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  placeholder?: string;
  className?: string;
}

/**
 * Design-system dropdown — a styled button + popover list, replacing the native
 * `<select>` (whose OS-rendered menu doesn't match our tokens). Closes on outside
 * click / Escape. Keep the trigger + list on our `border-token` / `bg-surface`
 * tokens so it matches the rest of the dashboard.
 */
export default function SelectMenu({ id, value, onChange, options, placeholder = "Select", className }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-token bg-page px-3.5 py-3 text-left text-sm text-primary-token transition-colors focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/25 dark:text-white"
      >
        <span className={cn("truncate", !selected && "text-muted-token")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-token transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-token bg-surface p-1.5 shadow-lg"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  on
                    ? "bg-red-50 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300"
                    : "text-primary-token hover:bg-black/[.04] dark:text-white dark:hover:bg-white/[.06]",
                )}
              >
                <span className="truncate">{o.label}</span>
                {on && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
