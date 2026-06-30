"use client";
import { cn } from "@/utils/cn";

export interface SegOption<T extends string> {
  value: T;
  label: string;
  shortLabel?: string;
}

/** Dark ink on light accents (yellow/cyan), white on dark accents (red). */
function contrastInk(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#111827" : "#ffffff";
}

/**
 * Generic segmented toggle. `tone="dark"` for dark sections (entries-stack, prize),
 * `tone="light"` (default) for light surfaces. Selected pill uses `accentHex` with
 * auto-contrasting text.
 */
export default function Seg<T extends string>({
  value,
  onChange,
  options,
  accentHex = "#ee0000",
  tone = "light",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  accentHex?: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl border p-1.5",
        dark
          ? "border-white/10 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
          : "border-token bg-surface shadow-sm dark:bg-neutral-900/80",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-w-[88px] rounded-xl px-3 py-2 text-xs font-semibold tracking-[0.06em] transition-colors sm:min-w-[120px] sm:px-4",
              on
                ? "shadow"
                : dark
                  ? "text-white/55 hover:bg-white/10 hover:text-white"
                  : "text-muted-token hover:bg-black/5 hover:text-primary-token dark:hover:bg-white/10",
            )}
            style={on ? { background: accentHex, color: contrastInk(accentHex) } : undefined}
          >
            <span className="sm:hidden">{o.shortLabel ?? o.label}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
