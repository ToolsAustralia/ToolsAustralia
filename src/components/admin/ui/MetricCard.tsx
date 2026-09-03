import type { ElementType, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { TrendPill } from "./Badge";

export const TONES = {
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
} as const;

export type Tone = keyof typeof TONES;

export function MetricCard({
  title, value, valueAside, sub, footer, icon: Icon, tone = "red", trend, invert = false, onClick, active = false, loading = false,
}: {
  title: string; value: string; valueAside?: string; sub?: string;
  /** Extra row under `sub` — a bar, a legend. The card's root is a <button>, so keep this
   *  non-interactive: nested interactive elements are invalid HTML and swallow the card's click. */
  footer?: ReactNode;
  icon: ElementType; tone?: Tone;
  trend?: number | null; invert?: boolean; onClick?: () => void; active?: boolean; loading?: boolean;
}) {
  // A loading card is never clickable — keep its shape stable so it doesn't jump when data arrives.
  const interactive = !loading && !!onClick;
  return (
    <button type="button" onClick={interactive ? onClick : undefined} disabled={loading}
      className={`group relative text-left w-full rounded-2xl border bg-white dark:bg-neutral-900 transition-all p-3 sm:p-[18px] ${
        active ? "border-neutral-900 dark:border-white ring-1 ring-neutral-900 dark:ring-white lift"
               : "border-neutral-200/80 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:lift"
      } ${interactive ? "cursor-pointer" : "cursor-default"}`}>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className={`shrink-0 w-7 h-7 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
          <Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={2} />
        </div>
        {loading
          ? <div className="h-5 w-12 rounded-md bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
          : trend !== undefined && <TrendPill value={trend} invert={invert} />}
      </div>
      <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 truncate">{title}</p>
      {loading ? (
        <>
          <div className="mt-1 h-7 w-24 rounded-md bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
          <div className="mt-2.5 h-3 w-28 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
        </>
      ) : (
        <>
          <div className="mt-1 flex items-baseline gap-1.5 min-w-0">
            <p className="font-display font-extrabold text-lg sm:text-[27px] leading-none text-neutral-900 dark:text-white num whitespace-nowrap">{value}</p>
            {valueAside && (
              <span className="text-2xs sm:text-xs font-semibold text-neutral-400 dark:text-neutral-500 num truncate">{valueAside}</span>
            )}
          </div>
          {sub && <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-2 truncate">{sub}</p>}
          {footer && <div className="mt-2">{footer}</div>}
        </>
      )}
      {interactive && <div className="absolute right-3 bottom-3 text-neutral-300 dark:text-neutral-600 opacity-0 group-hover:opacity-100 transition"><ChevronRight className="w-4 h-4" strokeWidth={2.5} /></div>}
    </button>
  );
}
