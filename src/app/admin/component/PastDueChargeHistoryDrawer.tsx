"use client";

import { useChargePastDueRunDetail } from "@/hooks/queries/admin/useChargePastDueRunDetail";
import { formatDurationMs } from "@/utils/admin/chargePastDueFormat";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-AU");
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
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold">Run detail</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
          >
            Close
          </button>
        </div>

        {detailQuery.isLoading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
        {detailQuery.isError && <p className="p-4 text-sm text-red-600">Failed to load run.</p>}

        {detailQuery.data && (
          <div className="space-y-4 p-4">
            <section className="rounded border border-gray-200 p-3 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Started:</div>
                <div>{formatDate(detailQuery.data.run.startedAt)}</div>
                <div>Finished:</div>
                <div>
                  {detailQuery.data.run.finishedAt
                    ? formatDate(detailQuery.data.run.finishedAt)
                    : "(still running)"}
                </div>
                <div>Duration:</div>
                <div>{formatDurationMs(detailQuery.data.run.durationMs)}</div>
                <div>Admin:</div>
                <div>{detailQuery.data.run.adminName}</div>
                <div>Status:</div>
                <div>{detailQuery.data.run.status}</div>
                <div>Eligible:</div>
                <div>{detailQuery.data.run.totals.eligibleCount}</div>
                <div>Attempted:</div>
                <div>{detailQuery.data.run.totals.attempted}</div>
                <div>Succeeded:</div>
                <div className="text-green-700">{detailQuery.data.run.totals.succeeded}</div>
                <div>Failed:</div>
                <div className="text-red-700">{detailQuery.data.run.totals.failed}</div>
                <div>Revenue:</div>
                <div className="font-medium">{formatCents(detailQuery.data.run.totals.revenueCents)}</div>
              </div>

              <div className="mt-3 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
                <div className="font-medium">Skip breakdown</div>
                <ul className="ml-4 list-disc">
                  <li>Recently attempted (24h): {detailQuery.data.run.totals.skipped.recentlyAttempted}</li>
                  <li>No longer past_due: {detailQuery.data.run.totals.skipped.noLongerPastDue}</li>
                  <li>Already paid: {detailQuery.data.run.totals.skipped.alreadyPaid}</li>
                  <li>Missing payment method: {detailQuery.data.run.totals.skipped.missingPaymentMethod}</li>
                  <li>Other: {detailQuery.data.run.totals.skipped.other}</li>
                </ul>
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Per-invoice attempts ({detailQuery.data.rows.length})</h4>
              <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Invoice</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {detailQuery.data.rows.map((r) => (
                      <tr key={`${r.invoiceId}-${r.attemptedAt}`}>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.attemptedAt)}</td>
                        <td className="px-3 py-2">{r.userEmail || r.userId}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.invoiceId}</td>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="px-3 py-2 text-right">{formatCents(r.amount)}</td>
                        <td className="px-3 py-2 text-xs text-red-700">{r.errorCode ?? r.errorMessage ?? ""}</td>
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
