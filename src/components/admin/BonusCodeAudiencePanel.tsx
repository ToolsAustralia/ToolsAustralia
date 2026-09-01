"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Users } from "lucide-react";

interface AudienceSampleUser {
  userId: string;
  userName: string;
  userEmail: string;
  qualifiedAt: string | null;
}

interface AudienceBuckets {
  last30: number;
  last90: number;
  allTime: number;
}

interface AudienceRow {
  trigger: "cancel-click" | "checkout-start" | "one-time-purchase";
  code: string;
  campaignFound: boolean;
  campaignId: string | null;
  campaignActive: boolean | null;
  entriesAmount: number | null;
  addressable: AudienceBuckets;
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
 * zero-entry accounts, bucketed by registration date — which is an UPPER
 * BOUND, not an exact reconstruction.
 *
 * Calibrated 2026-09-01 against Klaviyo's own "Started Checkout" metric (id
 * TZevX2, Australia/Sydney): 6,888 / 5,902 / 9,612 unique profiles for
 * Jun / Jul / Aug 2026. This proxy's own last-30-day count on the same date
 * was 7,120 — about 74% of Klaviyo's August figure, same order of magnitude
 * (contrast the all-time count, which was ~4.7x Klaviyo's monthly number).
 * Read as defensible for rough planning, not exact — likely low because it
 * only sees NEW registrations, missing an existing plain account's later
 * checkout attempt or an authed member selecting a package. See the report
 * for the full comparison.
 */
const TRIGGER_CAVEAT: Partial<Record<AudienceRow["trigger"], string>> = {
  "checkout-start":
    "Approximate — no \"started checkout\" event is stored. Counts every never-converted, zero-entry account by registration date. Calibrated 2026-09-01 against Klaviyo's own Started Checkout metric: this proxy's last-30-day count (7,120) was ~74% of Klaviyo's August figure (9,612) — same ballpark, defensible for planning but not exact.",
};

function formatQualifiedAt(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "2-digit" });
}

/**
 * Admin card: "how many customers can each webhook-minted bonus code reach".
 * A FORECAST of the addressable population per trigger, bucketed by how
 * recently the customer qualified — last 30 days and last 90 days are the
 * actionable numbers (the Klaviyo flow behind each trigger fires 2.5–17 days
 * after qualifying, so it cannot reach someone who qualified months ago);
 * all-time is kept only as a ceiling. See BonusCodeAudienceService for the
 * per-trigger qualifying-date field. Read-only; this panel cannot mint,
 * issue, or redeem anything.
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
              still reach, bucketed by how recently they qualified — the marketing flow only fires
              2.5–17 days after that, so last 30/90 days is the actionable pool. All-time is a
              ceiling, not a target.
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

                {/* Addressable pool leads with the ACTIONABLE recency buckets; all-time is
                    visually secondary (smaller, muted) — it's a ceiling, never the headline. */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-red-50 px-2 py-1.5 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
                    <span className="text-red-700 dark:text-red-300 font-medium">Last 30 days</span>
                    <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                      {row.addressable.last30.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-md bg-red-50/60 px-2 py-1.5 dark:bg-red-950/10 border border-red-100/70 dark:border-red-900/25">
                    <span className="text-red-700/80 dark:text-red-300/80 font-medium">Last 90 days</span>
                    <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                      {row.addressable.last90.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-neutral-800/80">
                    <span className="text-gray-500 dark:text-neutral-400">All-time ceiling</span>
                    <p className="mt-0.5 text-base font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                      {row.addressable.allTime.toLocaleString()}
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
                        : `View sample (${row.sample.length} of ${row.addressable.allTime.toLocaleString()} all-time)`}
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
                              <th className="px-2 py-1 text-left font-semibold text-gray-600 dark:text-neutral-300">
                                Qualified
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
                                <td className="px-2 py-1 text-gray-600 dark:text-neutral-300 whitespace-nowrap">
                                  {formatQualifiedAt(user.qualifiedAt)}
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
