import type { ReactNode } from "react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

const TONES = {
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  danger: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
} as const;

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}

/**
 * Hidden when value == null (e.g. all-time). invert=true → a drop is "good"
 * (cancellations). A value within ±0.05% reads as "no change": neutral grey with a
 * dash, never a coloured arrow (so a true 0.0% isn't painted as green growth).
 */
export function TrendPill({ value, invert = false }: { value?: number | null; invert?: boolean }) {
  if (value == null) return null;
  const neutral = Math.abs(value) < 0.05;
  const up = value > 0;
  const good = invert ? !up : up;
  const tone = neutral
    ? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
    : good
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-2xs font-bold num ${tone}`}>
      {neutral ? <Minus className="w-3 h-3" strokeWidth={2.5} /> : up ? <ArrowUp className="w-3 h-3" strokeWidth={2.5} /> : <ArrowDown className="w-3 h-3" strokeWidth={2.5} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
