"use client";

import React from "react";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import type { UpcomingRenewalsData, UpcomingRenewalsRange } from "@/hooks/queries/useAdminQueries";
import { RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface UpcomingRenewalsSchedulePanelProps {
  upcomingRenewalsRange: UpcomingRenewalsRange;
  onRangeChange: (days: UpcomingRenewalsRange) => void;
  upcomingRenewalsPage: number;
  onPageChange: (page: number) => void;
  upcomingRenewalsData: UpcomingRenewalsData | undefined;
  upcomingRenewalsLoading: boolean;
  pageSize: number;
}

export default function UpcomingRenewalsSchedulePanel({
  upcomingRenewalsRange,
  onRangeChange,
  upcomingRenewalsPage,
  onPageChange,
  upcomingRenewalsData,
  upcomingRenewalsLoading,
  pageSize,
}: UpcomingRenewalsSchedulePanelProps) {
  return (
    <>
      <div className="flex flex-wrap gap-1 mb-2 sm:mb-3">
        {([0, 3, 7, 27] as const).map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => onRangeChange(days)}
            className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-semibold transition-all ${
              upcomingRenewalsRange === days
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-600 text-gray-600 dark:text-neutral-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-600"
            }`}
          >
            {days === 0 ? "Today" : days === 27 ? "To 27th" : `${days}d`}
          </button>
        ))}
      </div>

      {upcomingRenewalsLoading && !upcomingRenewalsData && (
        <div className="flex items-center justify-center py-4 text-gray-500 dark:text-neutral-400 text-xs sm:text-sm">
          <RefreshCw className="w-5 h-5 animate-spin mr-2 shrink-0" />
          Loading renewals…
        </div>
      )}

      {upcomingRenewalsData && (
        <>
          {upcomingRenewalsData.total === 0 ? (
            <p className="text-xs sm:text-sm text-gray-500 dark:text-neutral-400 py-2">No renewals in this window.</p>
          ) : (
            <>
              {upcomingRenewalsData.total > pageSize && (
                <p className="text-[10px] sm:text-xs text-gray-600 dark:text-neutral-400 mb-1">
                  {(upcomingRenewalsPage - 1) * pageSize + 1}–
                  {Math.min(upcomingRenewalsPage * pageSize, upcomingRenewalsData.total)} of {upcomingRenewalsData.total}
                </p>
              )}

              <div className="overflow-x-auto -mx-1 px-1 rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                <table className="w-full text-[10px] sm:text-xs border-collapse min-w-[260px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/80">
                      <th className="text-left py-1.5 px-1.5 sm:px-2 font-semibold text-gray-700 dark:text-neutral-300">
                        Customer
                      </th>
                      <th className="text-right py-1.5 px-1.5 sm:px-2 font-semibold text-gray-700 dark:text-neutral-300 whitespace-nowrap">
                        Amount
                      </th>
                      <th className="text-right py-1.5 px-1.5 sm:px-2 font-semibold text-gray-700 dark:text-neutral-300 whitespace-nowrap">
                        Renews
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-neutral-800 text-gray-800 dark:text-neutral-200">
                    {upcomingRenewalsData.renewals.map((r) => {
                      const displayName = r.customerName?.trim() || r.customerEmail || r.customerId;
                      return (
                        <tr key={r.subscriptionId} className="hover:bg-gray-50 dark:hover:bg-neutral-800/60">
                          <td className="py-1 px-1.5 sm:px-2 align-middle max-w-[9rem] sm:max-w-none">
                            <ClickableUserDisplay
                              displayText={displayName}
                              userId={r.userId ?? null}
                              className="text-[10px] sm:text-xs text-gray-900 dark:text-white font-medium"
                            />
                          </td>
                          <td className="py-1 px-1.5 sm:px-2 text-right tabular-nums whitespace-nowrap align-middle">
                            {r.amountFormatted}
                          </td>
                          <td className="py-1 px-1.5 sm:px-2 text-right text-gray-600 dark:text-neutral-400 whitespace-nowrap align-middle">
                            {r.renewalDateFormatted}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {upcomingRenewalsData.total > pageSize &&
                (() => {
                  const totalPages = Math.ceil(upcomingRenewalsData.total / pageSize);
                  const hasPrevPage = upcomingRenewalsPage > 1;
                  const hasNextPage = upcomingRenewalsPage < totalPages;
                  return (
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onPageChange(1)}
                          disabled={!hasPrevPage}
                          className="p-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                          aria-label="First page"
                        >
                          <ChevronsLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onPageChange(Math.max(1, upcomingRenewalsPage - 1))}
                          disabled={!hasPrevPage}
                          className="p-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-[10px] sm:text-xs text-gray-600 dark:text-neutral-400 tabular-nums">
                        {upcomingRenewalsPage}/{totalPages}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onPageChange(Math.min(totalPages, upcomingRenewalsPage + 1))}
                          disabled={!hasNextPage}
                          className="p-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                          aria-label="Next page"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onPageChange(totalPages)}
                          disabled={!hasNextPage}
                          className="p-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                          aria-label="Last page"
                        >
                          <ChevronsRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })()}
            </>
          )}
        </>
      )}
    </>
  );
}
