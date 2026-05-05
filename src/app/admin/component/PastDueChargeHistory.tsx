"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  CheckCircle,
  CreditCard,
  DollarSign,
  ListChecks,
  RefreshCw,
  UserCog,
} from "lucide-react";
import { useChargePastDueRuns } from "@/hooks/queries/admin/useChargePastDueRuns";
import { useChargePastDueManualRetries } from "@/hooks/queries/admin/useChargePastDueManualRetries";
import { formatDurationMs } from "@/utils/admin/chargePastDueFormat";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import DateRangeToggle, { type DateRange } from "@/components/admin/DateRangeToggle";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import { AdminMobileLayoutDateRangeShell } from "./AdminMobileLayoutDateRangeShell";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";
import {
  useCurrentAndLastDrawDates,
  useMajorDrawsForDateRange,
} from "@/hooks/queries/useAdminQueries";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import PastDueChargeHistoryDrawer from "./PastDueChargeHistoryDrawer";
import RecoverInvoiceModal from "@/components/admin/RecoverInvoiceModal";

const AEST_TIMEZONE = "Australia/Sydney";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDateTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isStrandedError(errorMessage?: string | null, errorCode?: string | null): boolean {
  const msg = (errorMessage || "").toLowerCase();
  if (msg.includes("no longer be paid") || msg.includes("no longer payable")) return true;
  // Stripe surfaces this under various codes; the message check above is the reliable signal.
  return errorCode === "invoice_not_payable";
}

function defaultLast30Days() {
  const today = new Date();
  return {
    start: format(subDays(today, 29), "yyyy-MM-dd"),
    end: format(today, "yyyy-MM-dd"),
  };
}

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
    aborted: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200"
      }`}
    >
      {status}
    </span>
  );
}

function RetryStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
    skipped: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200"
      }`}
    >
      {status}
    </span>
  );
}

export default function PastDueChargeHistory() {
  const { isLgUp, slotEl } = useAdminMobileDateToolbarSlot();

  const initialRange = useMemo(() => defaultLast30Days(), []);
  const [dateRange, setDateRange] = useState<DateRange>("custom");
  const [startDate, setStartDate] = useState<string>(initialRange.start);
  const [endDate, setEndDate] = useState<string>(initialRange.end);
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [recoverTarget, setRecoverTarget] = useState<{
    userId: string;
    userEmail: string;
    originalInvoiceId: string;
  } | null>(null);

  const { data: drawDates } = useCurrentAndLastDrawDates();
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  const updateDateFilter = (range: DateRange, start?: string, end?: string) => {
    let finalStart = start;
    let finalEnd = end;

    if (range === "today") {
      finalStart = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "yesterday") {
      finalStart = formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = finalStart;
    } else if (range === "current-draw" && drawDates?.currentDraw) {
      finalStart = drawDates.currentDraw.startDate;
      finalEnd = drawDates.currentDraw.endDate;
    } else if (range === "last-draw" && drawDates?.lastDraw) {
      finalStart = drawDates.lastDraw.startDate;
      finalEnd = drawDates.lastDraw.endDate;
    } else if (range === "all-time") {
      finalStart = formatInTimeZone(getWebsiteLaunchDateUTC(), AEST_TIMEZONE, "yyyy-MM-dd");
      finalEnd = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
    }

    setDateRange(range);
    if (finalStart && finalEnd) {
      setStartDate(finalStart);
      setEndDate(finalEnd);
    }
  };

  const filter = useMemo(
    () => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [startDate, endDate]
  );

  const runsQuery = useChargePastDueRuns(filter);
  const retriesQuery = useChargePastDueManualRetries(filter);

  const summary = useMemo(() => {
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let revenue = 0;
    for (const r of runsQuery.runs) {
      attempted += r.totals.attempted;
      succeeded += r.totals.succeeded;
      failed += r.totals.failed;
      revenue += r.totals.revenueCents;
    }
    return { runs: runsQuery.runs.length, attempted, succeeded, failed, revenue };
  }, [runsQuery.runs]);

  const displayDate = useMemo(() => {
    if (dateRange === "custom" && startDate && endDate) {
      try {
        const s = new Date(startDate);
        const e = new Date(endDate);
        if (format(s, "yyyy-MM-dd") === format(e, "yyyy-MM-dd")) {
          return format(s, "MMM d, yyyy");
        }
        return `${format(s, "MMM d")} - ${format(e, "MMM d, yyyy")}`;
      } catch {
        return undefined;
      }
    }
    if (dateRange === "all-time") return "All Time";
    if (dateRange === "current-draw") return "Current Draw";
    if (dateRange === "last-draw") return "Last Draw";
    return undefined;
  }, [dateRange, startDate, endDate]);

  const dateRangeToggle = (
    <DateRangeToggle
      selectedRange={dateRange}
      onRangeChange={(range) => {
        if (range === "custom") setIsCustomDateModalOpen(true);
        else updateDateFilter(range);
      }}
      onCustomClick={() => setIsCustomDateModalOpen(true)}
      collapsed={false}
      displayDate={displayDate}
      onExpand={() => {}}
      className={isLgUp ? undefined : "w-full"}
    />
  );

  const isLoading = runsQuery.isLoading;
  const isError = runsQuery.isError || retriesQuery.isError;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Past-Due Charge History
        </h2>
        {isLgUp ? <div className="flex items-center gap-2">{dateRangeToggle}</div> : null}
      </div>

      {!isLgUp && slotEl
        ? createPortal(
            <AdminMobileLayoutDateRangeShell>{dateRangeToggle}</AdminMobileLayoutDateRangeShell>,
            slotEl
          )
        : null}
      {!isLgUp && !slotEl ? (
        <div className="lg:hidden">
          <AdminMobileLayoutDateRangeShell>{dateRangeToggle}</AdminMobileLayoutDateRangeShell>
        </div>
      ) : null}

      <CustomDateRangeModal
        isOpen={isCustomDateModalOpen}
        onClose={() => setIsCustomDateModalOpen(false)}
        onApply={(start, end) => {
          updateDateFilter("custom", start, end);
          setIsCustomDateModalOpen(false);
        }}
        currentStartDate={startDate}
        currentEndDate={endDate}
        majorDraws={majorDraws}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Bulk runs"
          value={isLoading ? "—" : summary.runs}
          icon={ListChecks}
          color="blue"
          subtitle="In selected range"
        />
        <MetricCard
          title="Invoices attempted"
          value={isLoading ? "—" : summary.attempted}
          icon={CreditCard}
          color="indigo"
          subtitle={`${summary.failed} failed`}
        />
        <MetricCard
          title="Succeeded"
          value={isLoading ? "—" : summary.succeeded}
          icon={CheckCircle}
          color="emerald"
          subtitle="Successful retries"
        />
        <MetricCard
          title="Revenue recovered"
          value={isLoading ? "—" : formatCents(summary.revenue)}
          icon={DollarSign}
          color="purple"
          subtitle="From bulk runs"
        />
      </div>

      {isError && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load charge history. Try refreshing or adjusting the date range.
        </div>
      )}

      {/* Bulk Runs */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bulk Runs</h3>
          </div>
          {runsQuery.total > 0 && (
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              Showing {runsQuery.runs.length} of {runsQuery.total}
            </span>
          )}
        </div>
        {runsQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
            Loading bulk runs…
          </div>
        ) : runsQuery.runs.length === 0 ? (
          <div className="p-8 text-center">
            <RefreshCw className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              No bulk runs in this range
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
              Try widening the date range.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-neutral-700">
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Started
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Admin
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Eligible
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Attempted
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Succeeded
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Failed
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Skipped
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Revenue
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Duration
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
                  {runsQuery.runs.map((r) => (
                    <tr
                      key={r._id}
                      onClick={() => setOpenRunId(r._id)}
                      className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {formatDateTime(r.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {r.adminName}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-neutral-300">
                        {r.totals.eligibleCount}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-neutral-300">
                        {r.totals.attempted}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        {r.totals.succeeded}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-red-700 dark:text-red-400">
                        {r.totals.failed}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-neutral-400">
                        {r.totals.skipped.total}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCents(r.totals.revenueCents)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {formatDurationMs(r.durationMs)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <RunStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {runsQuery.hasMore && (
              <div className="flex justify-center border-t border-gray-200 px-4 py-3 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => runsQuery.fetchNextPage()}
                  disabled={runsQuery.isFetchingNextPage}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${runsQuery.isFetchingNextPage ? "animate-spin" : ""}`}
                  />
                  {runsQuery.isFetchingNextPage ? "Loading more..." : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Manual Retries */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Manual Retries (per-user)
            </h3>
          </div>
          {retriesQuery.total > 0 && (
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              Showing {retriesQuery.rows.length} of {retriesQuery.total}
            </span>
          )}
        </div>
        {retriesQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
            Loading manual retries…
          </div>
        ) : retriesQuery.rows.length === 0 ? (
          <div className="p-8 text-center">
            <UserCog className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              No manual retries in this range
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
              Try widening the date range.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-neutral-700">
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      When
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Admin
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      User
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Invoice
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Status
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Amount
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Error
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
                  {retriesQuery.rows.map((r) => (
                    <tr
                      key={`${r.invoiceId}-${r.attemptedAt}`}
                      className="transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {formatDateTime(r.attemptedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {r.adminName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {r.userEmail || r.userId}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-neutral-300">
                        {r.invoiceId}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <RetryStatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCents(r.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-700 dark:text-red-400">
                        {r.errorCode ?? r.errorMessage ?? ""}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {r.status === "failed" && isStrandedError(r.errorMessage, r.errorCode) && r.userId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRecoverTarget({
                                userId: r.userId!,
                                userEmail: r.userEmail || r.userId!,
                                originalInvoiceId: r.invoiceId,
                              });
                            }}
                            className="rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 text-xs font-semibold dark:bg-amber-950/50 dark:hover:bg-amber-900/60 dark:text-amber-200"
                          >
                            Recover
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {retriesQuery.hasMore && (
              <div className="flex justify-center border-t border-gray-200 px-4 py-3 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => retriesQuery.fetchNextPage()}
                  disabled={retriesQuery.isFetchingNextPage}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${retriesQuery.isFetchingNextPage ? "animate-spin" : ""}`}
                  />
                  {retriesQuery.isFetchingNextPage ? "Loading more..." : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <PastDueChargeHistoryDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />

      {recoverTarget && (
        <RecoverInvoiceModal
          isOpen={true}
          onClose={() => setRecoverTarget(null)}
          userId={recoverTarget.userId}
          userEmail={recoverTarget.userEmail}
          originalInvoiceId={recoverTarget.originalInvoiceId}
          onRecovered={() => {
            setRecoverTarget(null);
          }}
        />
      )}
    </div>
  );
}
