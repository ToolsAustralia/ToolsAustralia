"use client";

/**
 * Minimal horizontal progress bar for the admin UI kit.
 *
 * `tone` picks the colour scale, and the default preserves the original behaviour:
 *
 *  - `"risk"` (default) — green < 50%, amber 50–80%, red > 80%. A BUDGET/consumption scale:
 *    more is worse.
 *  - `"neutral"` — one flat accent at every value. For share-of-total metrics where high is
 *    not bad (e.g. what fraction of a brand's revenue is new membership). Using the risk
 *    scale there would paint a healthy 85% red and quietly editorialise the number.
 */
export function ProgressBar({
  pct,
  tone = "risk",
  className = "",
}: {
  /** 0–100 percentage (clamped). */
  pct: number;
  tone?: "risk" | "neutral";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color =
    tone === "neutral"
      ? "bg-blue-500 dark:bg-blue-400"
      : clamped >= 80
        ? "bg-red-500"
        : clamped >= 50
          ? "bg-amber-400"
          : "bg-emerald-500";

  return (
    <div
      className={`h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all duration-300 ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
