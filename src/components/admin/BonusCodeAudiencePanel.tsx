"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Gift, Loader2, RefreshCw } from "lucide-react";

interface IssuanceSampleUser {
  userId: string;
  userName: string;
  userEmail: string;
  entriesAmount: number;
  at: string | null;
}

interface IssuanceState {
  issuedCount: number;
  stillRedeemableCount: number;
  redeemedCount: number;
  redeemedEntries: number;
  expiredOrLapsedCount: number;
  stillRedeemableSample: IssuanceSampleUser[];
  redeemedSample: IssuanceSampleUser[];
  expiredOrLapsedSample: IssuanceSampleUser[];
}

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
  issuance: IssuanceState;
  addressable: AudienceBuckets;
  sample: AudienceSampleUser[];
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
 * was 7,120 — about 74% of Klaviyo's August figure, same order of magnitude.
 * Read as defensible for rough planning, not exact.
 */
const TRIGGER_CAVEAT: Partial<Record<AudienceRow["trigger"], string>> = {
  "checkout-start":
    "Approximate — no \"started checkout\" event is stored. Counts every never-converted, zero-entry account by registration date. Calibrated 2026-09-01 against Klaviyo's own Started Checkout metric: this proxy's last-30-day count (7,120) was ~74% of Klaviyo's August figure (9,612) — same ballpark, defensible for planning but not exact.",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "2-digit" });
}

type IssuanceBucketKey = "stillRedeemable" | "redeemed" | "expiredOrLapsed";

const ISSUANCE_BUCKET_LABEL: Record<IssuanceBucketKey, string> = {
  stillRedeemable: "Still redeemable",
  redeemed: "Redeemed",
  expiredOrLapsed: "Expired / lapsed",
};

function issuanceSampleForBucket(issuance: IssuanceState, bucket: IssuanceBucketKey): IssuanceSampleUser[] {
  if (bucket === "stillRedeemable") return issuance.stillRedeemableSample;
  if (bucket === "redeemed") return issuance.redeemedSample;
  return issuance.expiredOrLapsedSample;
}

function issuanceCountForBucket(issuance: IssuanceState, bucket: IssuanceBucketKey): number {
  if (bucket === "stillRedeemable") return issuance.stillRedeemableCount;
  if (bucket === "redeemed") return issuance.redeemedCount;
  return issuance.expiredOrLapsedCount;
}

function IssuanceSampleTable({ rows }: { rows: IssuanceSampleUser[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700 text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-semibold text-gray-600 dark:text-neutral-300">Name</th>
            <th className="px-2 py-1 text-left font-semibold text-gray-600 dark:text-neutral-300">Email</th>
            <th className="px-2 py-1 text-right font-semibold text-gray-600 dark:text-neutral-300">Entries</th>
            <th className="px-2 py-1 text-left font-semibold text-gray-600 dark:text-neutral-300">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
          {rows.map((user) => (
            <tr key={user.userId}>
              <td className="px-2 py-1 text-gray-800 dark:text-neutral-100">{user.userName}</td>
              <td className="px-2 py-1 text-gray-600 dark:text-neutral-300">{user.userEmail}</td>
              <td className="px-2 py-1 text-right text-gray-800 dark:text-neutral-100 tabular-nums">
                {user.entriesAmount.toLocaleString()}
              </td>
              <td className="px-2 py-1 text-gray-600 dark:text-neutral-300 whitespace-nowrap">
                {formatDateTime(user.at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Admin card: real bonus-code issuance state, per trigger — "those who already
 * minted it (have access), those still able to redeem it, and how many
 * redeemed" (the owner's own framing, 2026-09-01). This is the PRIMARY view.
 *
 * The addressable-population FORECAST (how many customers a trigger COULD
 * reach, bucketed by recency) is kept — the owner said not to delete it — but
 * demoted to a collapsed "Potential reach" section per row, closed by default.
 *
 * All three codes sit at 0 issuances in production today, so every primary
 * tile renders 0 — that is correct, not broken, and rendered as a plain empty
 * state rather than blank/zero tiles. Read-only; this panel cannot mint,
 * issue, or redeem anything.
 */
export default function BonusCodeAudiencePanel() {
  const [rows, setRows] = useState<AudienceRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);

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

  const toggleBucket = (key: string) => setExpandedBucket((current) => (current === key ? null : key));

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700">
      <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-red-600 dark:text-red-400" />
              Bonus Code Status
            </h3>
            <p className="text-gray-600 dark:text-neutral-400 mt-1 text-xs sm:text-sm">
              Who already holds each webhook-minted code (BACKIN200 / LOCKIN100 / EXTRA100), who
              can still redeem it, and who already has.
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
            {rows.map((row) => {
              const buckets: IssuanceBucketKey[] = ["stillRedeemable", "redeemed", "expiredOrLapsed"];
              return (
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

                  {row.issuance.issuedCount === 0 ? (
                    <div className="mt-3 rounded-lg border border-dashed border-gray-300 dark:border-neutral-700 px-3 py-4 text-center">
                      <p className="text-sm text-gray-600 dark:text-neutral-400">
                        No {row.code} codes minted yet.
                      </p>
                      <p className="mt-0.5 text-2xs text-gray-500 dark:text-neutral-500">
                        This fills in once the Klaviyo flow starts calling the webhook — not a
                        broken screen.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* PRIMARY: real issuance state — the owner's actual ask. */}
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-neutral-800/80">
                          <span className="text-gray-500 dark:text-neutral-400">Minted</span>
                          <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                            {row.issuance.issuedCount.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-md bg-emerald-50 px-2 py-1.5 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                          <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                            Still redeemable
                          </span>
                          <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                            {row.issuance.stillRedeemableCount.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-md bg-red-50 px-2 py-1.5 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
                          <span className="text-red-700 dark:text-red-300 font-medium">Redeemed</span>
                          <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                            {row.issuance.redeemedCount.toLocaleString()}
                          </p>
                          <p className="text-2xs text-red-700/80 dark:text-red-300/80">
                            {row.issuance.redeemedEntries.toLocaleString()} entries granted
                          </p>
                        </div>
                        <div className="rounded-md bg-amber-50 px-2 py-1.5 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
                          <span className="text-amber-700 dark:text-amber-300 font-medium">
                            Expired / lapsed
                          </span>
                          <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-neutral-100 tabular-nums">
                            {row.issuance.expiredOrLapsedCount.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-3">
                        {buckets.map((bucket) => {
                          const count = issuanceCountForBucket(row.issuance, bucket);
                          if (count === 0) return null;
                          const key = `${row.trigger}:${bucket}`;
                          return (
                            <button
                              key={bucket}
                              onClick={() => toggleBucket(key)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
                            >
                              <ChevronRight
                                className={`w-3 h-3 transition-transform ${expandedBucket === key ? "rotate-90" : ""}`}
                              />
                              {ISSUANCE_BUCKET_LABEL[bucket]} ({count.toLocaleString()})
                            </button>
                          );
                        })}
                      </div>

                      {buckets.map((bucket) => {
                        const key = `${row.trigger}:${bucket}`;
                        if (expandedBucket !== key) return null;
                        return (
                          <IssuanceSampleTable key={key} rows={issuanceSampleForBucket(row.issuance, bucket)} />
                        );
                      })}
                    </>
                  )}

                  {/* SECONDARY / demoted: the addressable-population forecast. Collapsed by
                      default — the owner was explicit this is not what he wants to look at. */}
                  <details className="mt-3 group">
                    <summary className="cursor-pointer select-none text-2xs font-medium text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200">
                      Potential reach (forecast, not current holders) ▸
                    </summary>
                    <div className="mt-2 rounded-lg bg-gray-50/60 dark:bg-neutral-800/40 p-2.5">
                      <p className="text-2xs text-gray-500 dark:text-neutral-500 mb-2">
                        How many customers this trigger COULD reach if it fired today — a forecast
                        from our own data, bucketed by how recently they qualified. Not who
                        currently holds the code (see above).
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-md bg-white dark:bg-neutral-900 px-2 py-1.5 border border-gray-200 dark:border-neutral-700">
                          <span className="text-gray-500 dark:text-neutral-400">Last 30 days</span>
                          <p className="mt-0.5 font-bold text-gray-800 dark:text-neutral-200 tabular-nums">
                            {row.addressable.last30.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-md bg-white dark:bg-neutral-900 px-2 py-1.5 border border-gray-200 dark:border-neutral-700">
                          <span className="text-gray-500 dark:text-neutral-400">Last 90 days</span>
                          <p className="mt-0.5 font-bold text-gray-800 dark:text-neutral-200 tabular-nums">
                            {row.addressable.last90.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-md bg-white dark:bg-neutral-900 px-2 py-1.5 border border-gray-200 dark:border-neutral-700">
                          <span className="text-gray-500 dark:text-neutral-400">All-time ceiling</span>
                          <p className="mt-0.5 font-bold text-gray-800 dark:text-neutral-200 tabular-nums">
                            {row.addressable.allTime.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {TRIGGER_CAVEAT[row.trigger] && (
                        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
                          {TRIGGER_CAVEAT[row.trigger]}
                        </p>
                      )}

                      {row.sample.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => toggleBucket(`${row.trigger}:forecast`)}
                            className="text-2xs font-semibold text-gray-600 dark:text-neutral-300 hover:underline"
                          >
                            {expandedBucket === `${row.trigger}:forecast`
                              ? "Hide sample"
                              : `View sample (${row.sample.length} of ${row.addressable.allTime.toLocaleString()} all-time)`}
                          </button>
                          {expandedBucket === `${row.trigger}:forecast` && (
                            <div className="mt-2 overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700 text-2xs">
                                <thead>
                                  <tr>
                                    <th className="px-2 py-1 text-left font-semibold text-gray-500 dark:text-neutral-400">
                                      Name
                                    </th>
                                    <th className="px-2 py-1 text-left font-semibold text-gray-500 dark:text-neutral-400">
                                      Email
                                    </th>
                                    <th className="px-2 py-1 text-left font-semibold text-gray-500 dark:text-neutral-400">
                                      Qualified
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                                  {row.sample.map((user) => (
                                    <tr key={user.userId}>
                                      <td className="px-2 py-1 text-gray-700 dark:text-neutral-300">
                                        {user.userName}
                                      </td>
                                      <td className="px-2 py-1 text-gray-500 dark:text-neutral-400">
                                        {user.userEmail}
                                      </td>
                                      <td className="px-2 py-1 text-gray-500 dark:text-neutral-400 whitespace-nowrap">
                                        {formatDate(user.qualifiedAt)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
