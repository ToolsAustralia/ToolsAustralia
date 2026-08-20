"use client";

import { Fragment, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  DollarSign,
  RefreshCw,
  Search,
  UserCog,
} from "lucide-react";
import { useChargePastDueRuns } from "@/hooks/queries/admin/useChargePastDueRuns";
import { useChargePastDueManualRetries } from "@/hooks/queries/admin/useChargePastDueManualRetries";
import { useChargePastDueDeclineSummary } from "@/hooks/queries/admin/useChargePastDueDeclineSummary";
import { formatDurationMs, isStrandedError } from "@/utils/admin/chargePastDueFormat";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { type DateRange } from "@/components/admin/DateRangeToggle";
import { DateRangeDropdown } from "@/components/admin/overview/DateRangeDropdown";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import { AdminMobileLayoutDateRangeShell } from "./AdminMobileLayoutDateRangeShell";
import { useAdminDateToolbarSlot } from "@/hooks/useAdminDateToolbarSlot";
import {
  useCurrentAndLastDrawDates,
  useMajorDrawsForDateRange,
} from "@/hooks/queries/useAdminQueries";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import PastDueChargeHistoryDrawer from "./PastDueChargeHistoryDrawer";
import RecoverInvoiceModal from "@/components/admin/RecoverInvoiceModal";
import BulkRecoverInvoicesModal, { type BulkRecoverItem } from "@/components/admin/BulkRecoverInvoicesModal";
import RecoverStrandedPanel from "@/components/admin/RecoverStrandedPanel";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import AttemptsBreakdown from "@/components/admin/AttemptsBreakdown";
import {
  groupChargeAttemptsByUser,
  type UserAttemptGroup,
} from "@/utils/admin/groupChargeAttemptsByUser";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/utils/cn";

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
  const { isLgUp, slotEl } = useAdminDateToolbarSlot();

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
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [userSearchInput, setUserSearchInput] = useState("");
  const debouncedUserSearch = useDebounce(userSearchInput, 300);
  const [expandedUserKeys, setExpandedUserKeys] = useState<Set<string>>(new Set());

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
      userSearch: debouncedUserSearch.trim() || undefined,
    }),
    [startDate, endDate, debouncedUserSearch]
  );

  const runsQuery = useChargePastDueRuns(filter);
  const retriesQuery = useChargePastDueManualRetries(filter);
  const declineSummaryQuery = useChargePastDueDeclineSummary({
    startDate: filter.startDate,
    endDate: filter.endDate,
  });

  const toggleRow = (key: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const strandedRows = useMemo(
    () =>
      retriesQuery.rows.filter(
        (r) => r.status === "failed" && isStrandedError(r.errorMessage, r.errorCode) && r.userId
      ),
    [retriesQuery.rows]
  );

  const selectedItems: BulkRecoverItem[] = useMemo(() => {
    const itemsArr: BulkRecoverItem[] = [];
    for (const r of strandedRows) {
      const key = `${r.userId}-${r.invoiceId}`;
      if (selectedRows.has(key) && r.userId) {
        itemsArr.push({
          userId: r.userId,
          userEmail: r.userEmail || r.userId,
          originalInvoiceId: r.invoiceId,
          amount: r.amount,
        });
      }
    }
    return itemsArr;
  }, [selectedRows, strandedRows]);

  const groupedRetries = useMemo<UserAttemptGroup<typeof retriesQuery.rows[number]>[]>(
    () => groupChargeAttemptsByUser(retriesQuery.rows),
    [retriesQuery.rows]
  );

  const groupKey = (g: UserAttemptGroup): string => g.userId ?? `email:${g.userEmail}`;

  const toggleGroup = (key: string) => {
    setExpandedUserKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllStrandedForUser = (g: UserAttemptGroup<typeof retriesQuery.rows[number]>) => {
    const keys = g.attempts
      .filter((a) => a.status === "failed" && isStrandedError(a.errorMessage, a.errorCode) && a.userId)
      .map((a) => `${a.userId}-${a.invoiceId}`);
    if (keys.length === 0) return;
    setSelectedRows((prev) => {
      const next = new Set(prev);
      const allSelected = keys.every((k) => next.has(k));
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

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
    <DateRangeDropdown
      selectedRange={dateRange}
      onRangeChange={(range) => updateDateFilter(range)}
      onCustomClick={() => setIsCustomDateModalOpen(true)}
      displayDate={displayDate}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

      {/* Decline-code summary */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Why charges declined
          </h3>
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            Selected range
          </span>
        </div>
        <div className="p-4">
          {declineSummaryQuery.isLoading ? (
            <div className="space-y-2" aria-label="Loading decline summary">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-neutral-800"
                />
              ))}
            </div>
          ) : declineSummaryQuery.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Failed to load decline summary.
            </p>
          ) : !declineSummaryQuery.data || declineSummaryQuery.data.totalFailed === 0 ? (
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              No failed attempts in selected range.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-gray-500 dark:text-neutral-400">
                {declineSummaryQuery.data.totalFailed} failed attempts
              </p>
              <ul className="space-y-2">
                {declineSummaryQuery.data.topCodes.map((row) => (
                  <li
                    key={row.code}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="w-44 truncate font-mono text-xs text-gray-700 dark:text-neutral-300">
                      {row.code}
                    </span>
                    <span className="w-8 text-right tabular-nums text-gray-700 dark:text-neutral-300">
                      {row.count}
                    </span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-neutral-800">
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-red-500/70 dark:bg-red-500/60"
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-gray-500 dark:text-neutral-400">
                      {row.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load charge history. Try refreshing or adjusting the date range.
        </div>
      )}

      {/* Stranded-invoice bulk recovery */}
      <RecoverStrandedPanel />

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
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Type
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Attempts
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
                      <td className="px-4 py-3">
                        {r.kind === "recover" ? (
                          <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                            Recovery
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-700 dark:text-neutral-300">
                            Charge
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AttemptsBreakdown
                          size="cell"
                          total={r.totals.attempted}
                          succeeded={r.totals.succeeded}
                          failed={r.totals.failed}
                          skipped={r.totals.skipped.total}
                          eligibleHint={r.totals.eligibleCount}
                        />
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
                    className={cn("h-3.5 w-3.5", runsQuery.isFetchingNextPage ? "animate-spin" : "")}
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
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
              <input
                type="search"
                value={userSearchInput}
                onChange={(e) => setUserSearchInput(e.target.value)}
                placeholder="Search by email…"
                className="w-44 rounded-md border border-gray-300 bg-white py-1 pl-7 pr-2 text-xs text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500"
              />
            </div>
            {selectedItems.length > 0 && (
              <button
                type="button"
                onClick={() => setBulkModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-semibold dark:bg-amber-600 dark:hover:bg-amber-700"
              >
                Recover Selected ({selectedItems.length})
              </button>
            )}
            {retriesQuery.total > 0 && (
              <span className="text-xs text-gray-500 dark:text-neutral-400">
                Showing {retriesQuery.rows.length} of {retriesQuery.total}
              </span>
            )}
          </div>
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
                    <th className="bg-gray-50 px-3 py-3 dark:bg-neutral-800 w-8" />
                    <th className="bg-gray-50 px-3 py-3 text-left dark:bg-neutral-800 w-10">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Last attempt</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Admin</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">User</th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Attempts</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Latest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
                  {groupedRetries.map((g) => {
                    const key = groupKey(g);
                    const isExpanded = expandedUserKeys.has(key);
                    const strandedKeys = g.attempts
                      .filter((a) => a.status === "failed" && isStrandedError(a.errorMessage, a.errorCode) && a.userId)
                      .map((a) => `${a.userId}-${a.invoiceId}`);
                    const strandedCount = strandedKeys.length;
                    const selectedHere = strandedKeys.filter((k) => selectedRows.has(k)).length;
                    const checkboxState =
                      strandedCount === 0
                        ? "none"
                        : selectedHere === 0
                          ? "unchecked"
                          : selectedHere === strandedCount
                            ? "checked"
                            : "indeterminate";

                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => toggleGroup(key)}
                          className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70"
                        >
                          <td className="px-3 py-3">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-500" />
                            )}
                          </td>
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            {checkboxState !== "none" && (
                              <input
                                type="checkbox"
                                checked={checkboxState === "checked"}
                                ref={(el) => {
                                  if (el) el.indeterminate = checkboxState === "indeterminate";
                                }}
                                onChange={() => toggleAllStrandedForUser(g)}
                                className="h-4 w-4 cursor-pointer rounded border-gray-300 text-amber-600 focus:ring-amber-500 dark:border-neutral-600 dark:bg-neutral-800"
                              />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                            {formatDateTime(g.lastAttemptedAt)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                            {g.adminLabel}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                            <ClickableUserDisplay
                              displayText={g.userEmail || g.userId || "(unknown)"}
                              userId={g.userId ?? undefined}
                              className="text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <AttemptsBreakdown
                              size="cell"
                              total={g.attempts.length}
                              succeeded={g.successCount}
                              failed={g.failedCount}
                              skipped={g.skippedCount}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <RetryStatusBadge status={g.latestStatus} />
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-gray-50/60 dark:bg-neutral-800/40">
                            <td colSpan={7} className="px-4 py-3">
                              <table className="w-full">
                                <thead>
                                  <tr>
                                    <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500 w-8" />
                                    <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500">When</th>
                                    <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500">Invoice</th>
                                    <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500">Status</th>
                                    <th className="px-2 py-2 text-right text-2xs uppercase text-gray-500">Amount</th>
                                    <th className="px-2 py-2 text-left text-2xs uppercase text-gray-500">Error</th>
                                    <th className="px-2 py-2 text-right text-2xs uppercase text-gray-500">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.attempts.map((r) => {
                                    const stranded =
                                      r.status === "failed" && isStrandedError(r.errorMessage, r.errorCode) && r.userId;
                                    return (
                                      <tr key={`${r.invoiceId}-${r.attemptedAt}`}>
                                        <td className="px-2 py-2">
                                          {stranded ? (
                                            <input
                                              type="checkbox"
                                              checked={selectedRows.has(`${r.userId}-${r.invoiceId}`)}
                                              onChange={() => toggleRow(`${r.userId}-${r.invoiceId}`)}
                                              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-amber-600 focus:ring-amber-500 dark:border-neutral-600 dark:bg-neutral-800"
                                            />
                                          ) : null}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-700 dark:text-neutral-300">
                                          {formatDateTime(r.attemptedAt)}
                                        </td>
                                        <td className="px-2 py-2 font-mono text-xs text-gray-700 dark:text-neutral-300">
                                          {r.invoiceId}
                                        </td>
                                        <td className="px-2 py-2 text-xs">
                                          <RetryStatusBadge status={r.status} />
                                        </td>
                                        <td className="px-2 py-2 text-right text-xs font-semibold text-gray-900 dark:text-white">
                                          {formatCents(r.amount)}
                                        </td>
                                        <td className="px-2 py-2 text-xs text-red-700 dark:text-red-400">
                                          {r.declineCode ?? r.errorCode ?? r.errorMessage ?? ""}
                                        </td>
                                        <td className="px-2 py-2 text-right text-xs">
                                          {stranded ? (
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
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {retriesQuery.hasMore && (
              <p className="px-4 pb-2 text-xs text-gray-500 dark:text-neutral-400">
                Per-user counts reflect loaded attempts only. Click &quot;Load more&quot; to widen the view.
              </p>
            )}
            {retriesQuery.hasMore && (
              <div className="flex justify-center border-t border-gray-200 px-4 py-3 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => retriesQuery.fetchNextPage()}
                  disabled={retriesQuery.isFetchingNextPage}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <RefreshCw
                    className={cn("h-3.5 w-3.5", retriesQuery.isFetchingNextPage ? "animate-spin" : "")}
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

      {bulkModalOpen && selectedItems.length > 0 && (
        <BulkRecoverInvoicesModal
          isOpen={true}
          onClose={() => setBulkModalOpen(false)}
          items={selectedItems}
          onCompleted={() => {
            setSelectedRows(new Set());
          }}
        />
      )}
    </div>
  );
}
