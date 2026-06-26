"use client";

/**
 * Minimal horizontal progress bar for the admin UI kit.
 * Colour is driven by `pct`: green < 50%, amber 50–80%, red > 80%.
 */
export function ProgressBar({
  pct,
  className = "",
}: {
  /** 0–100 percentage (clamped). */
  pct: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color =
    clamped >= 80
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
