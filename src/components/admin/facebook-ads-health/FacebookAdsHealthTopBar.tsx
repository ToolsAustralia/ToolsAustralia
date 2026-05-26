"use client";
import React from "react";

interface Props {
  trueRoas: { localRevenueAud: number; metaSpendAud: number; ratio: number; metaPurchaseRevenueAud: number | null } | null;
  alertCount: { investigate: number; cut: number };
  onShowAlertedOnly: () => void;
}

export function FacebookAdsHealthTopBar({ trueRoas, alertCount, onShowAlertedOnly }: Props) {
  const total = alertCount.investigate + alertCount.cut;
  return (
    <div className="space-y-3 mb-4">
      {trueRoas && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Account TRUE ROAS (window)</div>
          <div className="flex items-baseline gap-3 mt-1">
            <div className="text-2xl font-bold tabular-nums">{trueRoas.ratio.toFixed(2)}</div>
            {trueRoas.metaPurchaseRevenueAud !== null && trueRoas.metaSpendAud > 0 && (
              <div className="text-xs text-zinc-500">
                Meta-reported: {(trueRoas.metaPurchaseRevenueAud / trueRoas.metaSpendAud).toFixed(2)}
                {trueRoas.localRevenueAud > 0 && (
                  <span className="ml-2">
                    Meta {((trueRoas.metaPurchaseRevenueAud / trueRoas.localRevenueAud - 1) * 100).toFixed(0)}% vs local
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">
            ${trueRoas.localRevenueAud.toFixed(0)} local revenue / ${trueRoas.metaSpendAud.toFixed(0)} Meta spend
          </div>
        </div>
      )}
      {total > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          <strong>{total} adset{total > 1 ? "s" : ""} need attention.</strong>
          <span>{alertCount.cut} Cut? · {alertCount.investigate} Investigate</span>
          <button onClick={onShowAlertedOnly} className="ml-auto text-xs underline cursor-pointer">Show only these</button>
        </div>
      )}
    </div>
  );
}
