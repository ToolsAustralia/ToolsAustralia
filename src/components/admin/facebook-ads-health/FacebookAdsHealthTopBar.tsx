"use client";
import React from "react";

interface Props {
  alertCount: { investigate: number; cut: number };
  onShowAlertedOnly: () => void;
}

/**
 * Alert banner shown above the pivot table. No metric card — the Health view
 * is an investigation of Meta's algorithmic decisions, so summary numbers are
 * surfaced in the per-row data (and the existing /admin/facebook-ads overview
 * view), not duplicated here.
 */
export function FacebookAdsHealthTopBar({ alertCount, onShowAlertedOnly }: Props) {
  const total = alertCount.investigate + alertCount.cut;
  if (total === 0) return null;
  return (
    <div className="mb-4 rounded-md bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
      <strong>
        {total} adset{total > 1 ? "s" : ""} need attention.
      </strong>
      <span>
        {alertCount.cut} Cut? · {alertCount.investigate} Investigate
      </span>
      <button
        onClick={onShowAlertedOnly}
        className="ml-auto text-xs underline cursor-pointer"
      >
        Show only these
      </button>
    </div>
  );
}
