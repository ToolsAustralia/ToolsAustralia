"use client";

import React, { useState } from "react";
import DashboardSection from "./DashboardSection";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import { useUpcomingRenewals } from "@/hooks/queries/useAdminQueries";
import type { UpcomingRenewalsRange } from "@/hooks/queries/useAdminQueries";
import { RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface UpcomingRenewalsSectionProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const UPCOMING_RENEWALS_PAGE_SIZE = 15;

export default function UpcomingRenewalsSection({ isExpanded, onToggleExpand }: UpcomingRenewalsSectionProps) {
  const [upcomingRenewalsRange, setUpcomingRenewalsRange] = useState<UpcomingRenewalsRange>(0);
  const [upcomingRenewalsPage, setUpcomingRenewalsPage] = useState(1);

  // Always fetch on mount (collapsed header still shows subtitle); expand only toggles body visibility
  const { data: upcomingRenewalsData, isLoading: upcomingRenewalsLoading } = useUpcomingRenewals(
    upcomingRenewalsRange,
    upcomingRenewalsPage,
    UPCOMING_RENEWALS_PAGE_SIZE
  );

  return (
    <DashboardSection
      title="Upcoming Renewals"
      subtitle={
        upcomingRenewalsData && !upcomingRenewalsLoading
          ? `${upcomingRenewalsData.total} renewals · $${(upcomingRenewalsData.totalRevenue ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} expected`
          : undefined
      }
      collapsible={true}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      noPadding={false}
      className="shadow-md"
    >
      {/* Range filter — compact */}
      <div className="flex flex-wrap gap-1 mb-2 sm:mb-3">
        {([0, 3, 7, 27] as const).map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => {
              setUpcomingRenewalsRange(days);
              setUpcomingRenewalsPage(1);
            }}
            className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-semibold transition-all ${
              upcomingRenewalsRange === days
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:border-emerald-300"
            }`}
          >
            {days === 0 ? "Today" : days === 27 ? "To 27th" : `${days}d`}
          </button>
        ))}
      </div>

      {upcomingRenewalsLoading && !upcomingRenewalsData && (
        <div className="flex items-center justify-center py-4 text-gray-500 text-xs sm:text-sm">
          <RefreshCw className="w-5 h-5 animate-spin mr-2 shrink-0" />
          Loading renewals…
        </div>
      )}

      {upcomingRenewalsData && (
        <>
          {upcomingRenewalsData.total === 0 ? (
            <p className="text-xs sm:text-sm text-gray-500 py-2">No renewals in this window.</p>
          ) : (
            <>
              {upcomingRenewalsData.total > UPCOMING_RENEWALS_PAGE_SIZE && (
                <p className="text-[10px] sm:text-xs text-gray-600 mb-1">
                  {(upcomingRenewalsPage - 1) * UPCOMING_RENEWALS_PAGE_SIZE + 1}–
                  {Math.min(upcomingRenewalsPage * UPCOMING_RENEWALS_PAGE_SIZE, upcomingRenewalsData.total)} of{" "}
                  {upcomingRenewalsData.total}
                </p>
              )}

              <div className="overflow-x-auto -mx-1 px-1 rounded-md border border-gray-200 bg-white">
                <table className="w-full text-[10px] sm:text-xs border-collapse min-w-[260px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-1.5 px-1.5 sm:px-2 font-semibold text-gray-700">Customer</th>
                      <th className="text-right py-1.5 px-1.5 sm:px-2 font-semibold text-gray-700 whitespace-nowrap">Amount</th>
                      <th className="text-right py-1.5 px-1.5 sm:px-2 font-semibold text-gray-700 whitespace-nowrap">Renews</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {upcomingRenewalsData.renewals.map((r) => {
                      const displayName = r.customerName?.trim() || r.customerEmail || r.customerId;
                      return (
                        <tr key={r.subscriptionId} className="hover:bg-gray-50">
                          <td className="py-1 px-1.5 sm:px-2 align-middle max-w-[9rem] sm:max-w-none">
                            <ClickableUserDisplay
                              displayText={displayName}
                              userId={r.userId ?? null}
                              className="text-[10px] sm:text-xs text-gray-900 font-medium"
                            />
                          </td>
                          <td className="py-1 px-1.5 sm:px-2 text-right tabular-nums whitespace-nowrap align-middle">
                            {r.amountFormatted}
                          </td>
                          <td className="py-1 px-1.5 sm:px-2 text-right text-gray-600 whitespace-nowrap align-middle">
                            {r.renewalDateFormatted}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {upcomingRenewalsData.total > UPCOMING_RENEWALS_PAGE_SIZE &&
                (() => {
                  const totalPages = Math.ceil(upcomingRenewalsData.total / UPCOMING_RENEWALS_PAGE_SIZE);
                  const hasPrevPage = upcomingRenewalsPage > 1;
                  const hasNextPage = upcomingRenewalsPage < totalPages;
                  return (
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setUpcomingRenewalsPage(1)}
                          disabled={!hasPrevPage}
                          className="p-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                          aria-label="First page"
                        >
                          <ChevronsLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setUpcomingRenewalsPage((p) => Math.max(1, p - 1))}
                          disabled={!hasPrevPage}
                          className="p-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-[10px] sm:text-xs text-gray-600 tabular-nums">
                        {upcomingRenewalsPage}/{totalPages}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setUpcomingRenewalsPage((p) => Math.min(totalPages, p + 1))}
                          disabled={!hasNextPage}
                          className="p-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                          aria-label="Next page"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setUpcomingRenewalsPage(totalPages)}
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
    </DashboardSection>
  );
}
