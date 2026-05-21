"use client";

import { Fragment } from "react";
import { cn } from "@/utils/cn";

export interface AttemptsBreakdownProps {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** When provided and ≠ total, renders "X of Y eligible" on the headline line. */
  eligibleHint?: number;
  size: "cell" | "block";
}

const HEADLINE = {
  cell: "text-sm font-semibold text-gray-900 dark:text-white",
  block: "text-base font-semibold text-gray-900 dark:text-white",
};

const HINT = {
  cell: "ml-1 text-xs font-normal text-gray-500 dark:text-neutral-400",
  block: "ml-2 text-xs font-normal text-gray-500 dark:text-neutral-400",
};

const CHIPS_WRAP = {
  cell: "mt-0.5 flex flex-wrap items-center gap-x-2 text-xs",
  block: "mt-1 flex flex-wrap items-center gap-x-3 text-xs",
};

export default function AttemptsBreakdown({
  total,
  succeeded,
  failed,
  skipped,
  eligibleHint,
  size,
}: AttemptsBreakdownProps) {
  const showHint = typeof eligibleHint === "number" && eligibleHint !== total;
  const chips: { key: string; node: React.ReactNode }[] = [];
  if (succeeded > 0) {
    chips.push({
      key: "s",
      node: (
        <span className="text-emerald-700 dark:text-emerald-400">
          {succeeded}✓ succeeded
        </span>
      ),
    });
  }
  if (failed > 0) {
    chips.push({
      key: "f",
      node: (
        <span className="text-red-700 dark:text-red-400">
          {failed}✗ failed
        </span>
      ),
    });
  }
  if (skipped > 0) {
    chips.push({
      key: "k",
      node: (
        <span className="text-gray-500 dark:text-neutral-400">{skipped} skipped</span>
      ),
    });
  }

  return (
    <div className={size === "cell" ? "text-right" : ""}>
      <div className={HEADLINE[size]}>
        {total}
        {showHint && (
          <span className={HINT[size]}>{" "}of {eligibleHint} eligible</span>
        )}
      </div>
      {chips.length > 0 && (
        <div className={cn(CHIPS_WRAP[size], size === "cell" ? "justify-end" : "")}>
          {chips.map((c) => (
            <Fragment key={c.key}>{c.node}</Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
