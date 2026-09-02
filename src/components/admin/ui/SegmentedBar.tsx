"use client";

/**
 * Proportional multi-segment bar for the admin UI kit.
 *
 * Unlike `ProgressBar` (one value measured against 100), this shows how a single total splits
 * across mutually exclusive outcomes — e.g. a day's renewals into landed / failed / still to come.
 *
 * `total` is a required prop rather than the sum of `segments` on purpose: a denominator can
 * legitimately exceed its named segments (the renewals cohort counts every cycle status in
 * `dueInRange`, including ones that belong to neither numerator). The leftover must render as
 * visible empty track — silently rescaling the other segments to fill the bar would hide it.
 */
export function SegmentedBar({
  segments,
  total,
  label,
  className = "",
}: {
  segments: { key: string; value: number; className: string }[];
  total: number;
  /** Screen-reader summary, e.g. "31 landed, 20 failed, 51 still to come". */
  label: string;
  className?: string;
}) {
  if (total <= 0) return null;

  return (
    <div
      role="img"
      aria-label={label}
      className={`flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700 ${className}`}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.key}
            className={`h-full rounded-full ${s.className}`}
            style={{ width: `${Math.min(100, (s.value / total) * 100)}%` }}
          />
        ))}
    </div>
  );
}
