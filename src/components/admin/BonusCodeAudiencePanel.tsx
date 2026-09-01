"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Users } from "lucide-react";

interface AudienceSampleUser {
  userId: string;
  userName: string;
  userEmail: string;
}

interface AudienceRow {
  trigger: "cancel-click" | "checkout-start" | "one-time-purchase";
  code: string;
  campaignFound: boolean;
  campaignId: string | null;
  campaignActive: boolean | null;
  entriesAmount: number | null;
  addressableCount: number;
  sample: AudienceSampleUser[];
  issuedCount: number;
  redeemedCount: number;
}

const TRIGGER_LABEL: Record<AudienceRow["trigger"], string> = {
  "cancel-click": "Cancel-click win-back",
  "checkout-start": "Checkout-start",
  "one-time-purchase": "One-time purchase",
};

/**
 * checkout-start has no persisted "started checkout" event log — the guest-path
 * signal is a fire-and-forget Klaviyo emit that never writes the selected
 * package back onto the User document (see BonusCodeAudienceService). The
 * count shown is the nearest signal our own data holds — never-converted,
 * zero-entry accounts — which is an UPPER BOUND, not an exact reconstruction.
 */
const TRIGGER_CAVEAT: Partial<Record<AudienceRow["trigger"], string>> = {
  "checkout-start":
    "Approximate — no \"started checkout\" event is stored. Counts every never-converted, zero-entry account, so it reads high relative to the other two triggers.",
};

/**
 * Admin card: "how many customers can each webhook-minted bonus code reach".
 * A FORECAST of the addressable population per trigger, not a count of current
 * holders — see BonusCodeAudienceService for why. Read-only; this panel cannot
 * mint, issue, or redeem anything.
 */
export default function BonusCodeAudiencePanel() {
  const [rows, setRows] = useState<AudienceRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTrigger, setExpandedTrigger] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/monthly-coupon/trigger-audience");
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to fetch trigger audience");
      }
      setRows(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trigger audience");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700">
      <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-red-600 dark:text-red-400" />
              Bonus Code Audience Reach
            </h3>
            <p className="text-gray-600 dark:text-neutral-400 mt-1 text-xs sm:text-sm">
              How many customers each webhook-minted code (BACKIN200 / LOCKIN100 / EXTRA100) can
              reach right now — a forecast, not a count of who currently holds the code.
            </p>
          </div>
          <button
            onClick={load}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-100 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-neutral-700 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-lg px-3 py-2 text-sm border border-red-200 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}

        {isLoading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-gray-600 dark:text-neutral-400">
            No trigger data available.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <article
                key={row.trigger}
                className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-neutral-700 dark:bg-neutral-900/80"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400">
                      {TRIGGER_LABEL[row.trigger]}
                    </p>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                      <span className="font-mono bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 px-1.5 py-0.5 rounded mr-2">
                        {row.code}
                      </span>
                      {row.entriesAmount != null ? `${row.entriesAmount.toLocaleString()} entries` : ""}
                    </h4>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${
                      row.campaignFound && row.campaignActive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                        : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
                    }`}
                  >
                    {row.campaignFound ? (row.campaignActive ? "Campaign active" : "Campaign inactive") : "No campaign yet"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-neutral-800/80">
                    <span className="text-gray-500 dark:text-neutral-400">Addressable</span>
                    <p className="mt-0.5 text-base font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                      {row.addressableCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-neutral-800/80">
                    <span className="text-gray-500 dark:text-neutral-400">Issued</span>
                    <p className="mt-0.5 text-base font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                      {row.issuedCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-neutral-800/80">
                    <span className="text-gray-500 dark:text-neutral-400">Redeemed</span>
                    <p className="mt-0.5 text-base font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                      {row.redeemedCount.toLocaleString()}
                    </p>
                  </div>
                </div>

                {TRIGGER_CAVEAT[row.trigger] && (
                  <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
                    {TRIGGER_CAVEAT[row.trigger]}
                  </p>
                )}

                {row.sample.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() =>
                        setExpandedTrigger(expandedTrigger === row.trigger ? null : row.trigger)
                      }
                      className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
                    >
                      {expandedTrigger === row.trigger
                        ? "Hide sample"
                        : `View sample (${row.sample.length} of ${row.addressableCount.toLocaleString()})`}
                    </button>
                    {expandedTrigger === row.trigger && (
                      <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700 text-xs">
                          <thead>
                            <tr>
                              <th className="px-2 py-1 text-left font-semibold text-gray-600 dark:text-neutral-300">
                                Name
                              </th>
                              <th className="px-2 py-1 text-left font-semibold text-gray-600 dark:text-neutral-300">
                                Email
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                            {row.sample.map((user) => (
                              <tr key={user.userId}>
                                <td className="px-2 py-1 text-gray-800 dark:text-neutral-100">
                                  {user.userName}
                                </td>
                                <td className="px-2 py-1 text-gray-600 dark:text-neutral-300">
                                  {user.userEmail}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
