import type { ReactNode } from "react";
import { ArrowUp, ArrowDown, Minus, AlertTriangle, SpellCheck2 } from "lucide-react";
import { cn } from "@/utils/cn";

const TONES = {
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  danger: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
} as const;

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: keyof typeof TONES; className?: string }) {
  // `cn` (clsx + tailwind-merge) so a caller's `className` can override a conflicting base
  // utility (e.g. shrinking the built-in `px-2` to `px-1` on mobile) deterministically — a raw
  // template-string concat left that to CSS generation order, which is not guaranteed to pick
  // the caller's value.
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Ad-URL-issue counts a badge renders — the same shape whether it rolls up one ad, a whole
 *  ad set, a campaign, or a brand row; see `AdUrlIssueBadge` below. */
export interface AdUrlIssueCounts {
  /** Ads named for a different brand than the page they land on. */
  mismatchAdCount: number;
  /** Ads carrying a `?toolbox=`/`?toolset=` value that names no known brand (a typo). */
  unrecognisedParamAdCount: number;
}

/**
 * Shared ad-URL-issue badge — red `AlertTriangle` for a wrong-brand ad, amber `SpellCheck2` for a
 * typo'd `?toolbox=`/`?toolset=` value, matching `CampaignTreeTable`'s per-ad icons exactly so a
 * reader who drills in from a badge meets the same vocabulary. One definition shared by the Brand
 * Performance brand row, its Unattributed footer row, and the campaign/ad-set roll-up rows in
 * `CampaignTreeTable` — so all four stay visually identical, including the mobile treatment below.
 *
 * Renders nothing when both counts are zero — there is deliberately no "clean" state (a tick on
 * every row would be scanned past; see the callers for why an unverifiable row is also zero here).
 *
 * ── Mobile ────────────────────────────────────────────────────────────────────────────────
 * Below `sm` the count is hidden (bare icon only) and the badge's own padding shrinks — on a
 * phone the table can only fit a column or two before scrolling, and the badge's numbers were
 * costing width that number column needed. The count and the full explanation stay reachable via
 * `title`/`aria-label` at every breakpoint (both a tap-and-hold and a screen reader still get the
 * count); `sm:` and up shows the count inline again.
 */
export function AdUrlIssueBadge({
  counts,
  title,
  className,
}: {
  counts: AdUrlIssueCounts;
  title: string;
  className?: string;
}) {
  if (counts.mismatchAdCount === 0 && counts.unrecognisedParamAdCount === 0) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 sm:gap-1 shrink-0", className)}
      role="img"
      aria-label={title}
      title={title}
    >
      {counts.mismatchAdCount > 0 && (
        <Badge tone="danger" className="px-1 sm:px-1.5 num">
          <AlertTriangle className="w-2.5 h-2.5" aria-hidden strokeWidth={2.5} />
          <span className="hidden sm:inline">{counts.mismatchAdCount}</span>
        </Badge>
      )}
      {counts.unrecognisedParamAdCount > 0 && (
        <Badge tone="warning" className="px-1 sm:px-1.5 num">
          <SpellCheck2 className="w-2.5 h-2.5" aria-hidden strokeWidth={2.5} />
          <span className="hidden sm:inline">{counts.unrecognisedParamAdCount}</span>
        </Badge>
      )}
    </span>
  );
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
