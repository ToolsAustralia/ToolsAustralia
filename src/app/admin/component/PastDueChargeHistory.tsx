"use client";

import { useState } from "react";
import { useChargePastDueRuns } from "@/hooks/queries/admin/useChargePastDueRuns";
import { useChargePastDueManualRetries } from "@/hooks/queries/admin/useChargePastDueManualRetries";
import { formatDurationMs } from "@/services/admin/chargePastDueHistory";
import PastDueChargeHistoryDrawer from "./PastDueChargeHistoryDrawer";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PastDueChargeHistory() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const filter = { startDate: startDate || undefined, endDate: endDate || undefined };

  const runsQuery = useChargePastDueRuns(filter);
  const retriesQuery = useChargePastDueManualRetries(filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-gray-600 dark:text-gray-300">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-gray-600 dark:text-gray-300">End date</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          />
        </label>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
            className="text-sm text-gray-600 underline hover:text-gray-900 dark:text-gray-300"
          >
            Clear
          </button>
        )}
      </div>

      {/* Bulk Runs */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Bulk Runs</h2>
        {runsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {runsQuery.isError && (
          <p className="text-sm text-red-600">Failed to load runs.</p>
        )}
        {runsQuery.data && runsQuery.data.runs.length === 0 && (
          <p className="text-sm text-gray-500">No bulk runs in this date range.</p>
        )}
        {runsQuery.data && runsQuery.data.runs.length > 0 && (
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2 text-right">Eligible</th>
                  <th className="px-3 py-2 text-right">Attempted</th>
                  <th className="px-3 py-2 text-right">Succeeded</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2 text-right">Skipped</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {runsQuery.data.runs.map((r) => (
                  <tr
                    key={r._id}
                    onClick={() => setOpenRunId(r._id)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-3 py-2 text-sm">{formatDate(r.startedAt)}</td>
                    <td className="px-3 py-2 text-sm">{r.adminName}</td>
                    <td className="px-3 py-2 text-right text-sm">{r.totals.eligibleCount}</td>
                    <td className="px-3 py-2 text-right text-sm">{r.totals.attempted}</td>
                    <td className="px-3 py-2 text-right text-sm text-green-700">{r.totals.succeeded}</td>
                    <td className="px-3 py-2 text-right text-sm text-red-700">{r.totals.failed}</td>
                    <td className="px-3 py-2 text-right text-sm text-gray-600">{r.totals.skipped.total}</td>
                    <td className="px-3 py-2 text-right text-sm font-medium">{formatCents(r.totals.revenueCents)}</td>
                    <td className="px-3 py-2 text-sm">{formatDurationMs(r.durationMs)}</td>
                    <td className="px-3 py-2 text-sm">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Manual Retries */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Manual Retries (per-user)</h2>
        {retriesQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {retriesQuery.isError && (
          <p className="text-sm text-red-600">Failed to load manual retries.</p>
        )}
        {retriesQuery.data && retriesQuery.data.rows.length === 0 && (
          <p className="text-sm text-gray-500">No manual retries in this date range.</p>
        )}
        {retriesQuery.data && retriesQuery.data.rows.length > 0 && (
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {retriesQuery.data.rows.map((r) => (
                  <tr key={`${r.invoiceId}-${r.attemptedAt}`}>
                    <td className="px-3 py-2 text-sm">{formatDate(r.attemptedAt)}</td>
                    <td className="px-3 py-2 text-sm">{r.adminName}</td>
                    <td className="px-3 py-2 text-sm">{r.userEmail || r.userId}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.invoiceId}</td>
                    <td className="px-3 py-2 text-sm">{r.status}</td>
                    <td className="px-3 py-2 text-right text-sm">{formatCents(r.amount)}</td>
                    <td className="px-3 py-2 text-xs text-red-700">{r.errorCode ?? r.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PastDueChargeHistoryDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />
    </div>
  );
}
