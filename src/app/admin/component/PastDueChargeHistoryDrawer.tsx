"use client";

import { X } from "lucide-react";
import { useChargePastDueRunDetail } from "@/hooks/queries/admin/useChargePastDueRunDetail";
import { formatDurationMs } from "@/utils/admin/chargePastDueFormat";

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

export default function PastDueChargeHistoryDrawer({
  runId,
  onClose,
}: {
  runId: string | null;
  onClose: () => void;
}) {
  const detailQuery = useChargePastDueRunDetail(runId);

  if (!runId) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto bg-white shadow-2xl dark:bg-neutral-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 backdrop-blur px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/95">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Run detail</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {detailQuery.isLoading && (
          <p className="p-6 text-sm text-gray-500 dark:text-neutral-400">Loading…</p>
        )}
        {detailQuery.isError && (
          <p className="p-6 text-sm text-red-600 dark:text-red-400">Failed to load run.</p>
        )}

        {detailQuery.data && (
          <div className="space-y-4 p-4">
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                  Summary
                </span>
                <RunStatusBadge status={detailQuery.data.run.status} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500 dark:text-neutral-400">Started</dt>
                <dd className="text-gray-900 dark:text-white">
                  {formatDateTime(detailQuery.data.run.startedAt)}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Finished</dt>
                <dd className="text-gray-900 dark:text-white">
                  {detailQuery.data.run.finishedAt
                    ? formatDateTime(detailQuery.data.run.finishedAt)
                    : "(still running)"}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Duration</dt>
                <dd className="text-gray-900 dark:text-white">
                  {formatDurationMs(detailQuery.data.run.durationMs)}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Admin</dt>
                <dd className="text-gray-900 dark:text-white">{detailQuery.data.run.adminName}</dd>
                <dt className="text-gray-500 dark:text-neutral-400">Eligible</dt>
                <dd className="text-gray-900 dark:text-white">
                  {detailQuery.data.run.totals.eligibleCount}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Attempted</dt>
                <dd className="text-gray-900 dark:text-white">
                  {detailQuery.data.run.totals.attempted}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Succeeded</dt>
                <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {detailQuery.data.run.totals.succeeded}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Failed</dt>
                <dd className="font-semibold text-red-700 dark:text-red-400">
                  {detailQuery.data.run.totals.failed}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Revenue</dt>
                <dd className="font-semibold text-gray-900 dark:text-white">
                  {formatCents(detailQuery.data.run.totals.revenueCents)}
                </dd>
              </dl>

              <div className="mt-4 border-t border-gray-200 pt-3 dark:border-neutral-800">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                  Skip breakdown
                </div>
                <ul className="space-y-1 text-sm text-gray-700 dark:text-neutral-300">
                  <li className="flex justify-between">
                    <span>Recently attempted (24h)</span>
                    <span className="font-medium">
                      {detailQuery.data.run.totals.skipped.recentlyAttempted}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>No longer past_due</span>
                    <span className="font-medium">
                      {detailQuery.data.run.totals.skipped.noLongerPastDue}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Already paid</span>
                    <span className="font-medium">
                      {detailQuery.data.run.totals.skipped.alreadyPaid}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Missing payment method</span>
                    <span className="font-medium">
                      {detailQuery.data.run.totals.skipped.missingPaymentMethod}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Other</span>
                    <span className="font-medium">{detailQuery.data.run.totals.skipped.other}</span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Per-invoice attempts
                </h4>
                <span className="text-xs text-gray-500 dark:text-neutral-400">
                  {detailQuery.data.rows.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-neutral-700">
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                        When
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
                    {detailQuery.data.rows.map((r) => (
                      <tr
                        key={`${r.invoiceId}-${r.attemptedAt}`}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          {formatDateTime(r.attemptedAt)}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </aside>
    </>
  );
}
