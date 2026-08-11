"use client";

import React, { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Tag, Users, UserCheck, DollarSign } from "lucide-react";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { formatNumber, formatCurrency, formatPercentageOrDash } from "@/utils/metrics/formatters";
import { queryKeys } from "@/lib/queryKeys";
// Type-only (erased at build — see eslint/rules/no-models-in-client.js), so the data layer is
// never bundled. Imported rather than re-declared: a local copy of an API shape drifts
// silently, compiles fine, and renders `undefined` as "0".
import type { PartnerDiscountSurfaceMetrics } from "@/repositories/PartnerDiscountAnalyticsRepository";

/**
 * Partner-discount funnel, rendered under the promo tables on the Page Analytics tab.
 *
 * A SEPARATE SECTION, NOT EXTRA ROWS IN THE PROMO TABLE. A promo visit is a visitor landing
 * on an ad page; a discount visit is a visitor browsing a 1,833-row catalogue. They share a
 * shape (visits → signups → conversions → revenue) but not a population or a denominator, and
 * merging them would produce a table whose totals mean nothing.
 *
 * THE DATE RANGE IS READ FROM THE URL, not passed down. `PromoAnalyticsManagement` already
 * writes `dateRange`/`startDate`/`endDate` into the query string as its single source of
 * truth, so reading the same params keeps both halves of the tab on one window with no prop
 * drilling and no second date picker to get out of sync.
 *
 * @see docs/partner/analytics.md
 * @see docs/admin/page-analytics.md
 */

interface DiscountAnalyticsResponse {
  success: boolean;
  data: {
    totalVisits: number;
    totalSignups: number;
    totalConversions: number;
    totalRevenue: number;
    bySurface: PartnerDiscountSurfaceMetrics[];
    dateRange: {
      start: string;
      end: string;
      visitsRetainedFrom: string;
      clampedToRetention: boolean;
    };
  };
}

/** Staff-facing labels. The API speaks route names; the panel speaks to a human. */
const SURFACE_LABEL: Record<string, string> = {
  discount: "/discount (public)",
  catalogue: "Rewards catalogue (members)",
};

async function fetchDiscountAnalytics(params: {
  dateRange: "today" | "yesterday" | "custom";
  startDate?: string;
  endDate?: string;
}): Promise<DiscountAnalyticsResponse["data"]> {
  const search = new URLSearchParams();
  search.set("dateRange", params.dateRange);
  if (params.startDate) search.set("startDate", params.startDate);
  if (params.endDate) search.set("endDate", params.endDate);
  const res = await fetch(`/api/admin/partner-discount-analytics?${search.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch partner discount analytics");
  const json = (await res.json()) as DiscountAnalyticsResponse;
  if (!json.success || !json.data) {
    throw new Error((json as { error?: string }).error || "Failed to load");
  }
  return json.data;
}

export default function DiscountAnalyticsSection() {
  const searchParams = useSearchParams();

  const urlDateRange = searchParams.get("dateRange") || "today";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  // Same mapping the promo half uses: only today/yesterday are named ranges on the API; every
  // other preset has already been resolved to concrete dates in the URL by the date picker.
  const apiDateRange = useMemo((): "today" | "yesterday" | "custom" => {
    if (urlDateRange === "today" || urlDateRange === "yesterday") return urlDateRange;
    return "custom";
  }, [urlDateRange]);

  const apiStartDate = apiDateRange === "custom" && startDate && endDate ? startDate : undefined;
  const apiEndDate = apiDateRange === "custom" && startDate && endDate ? endDate : undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.admin.partnerDiscountAnalytics({
      dateRange: apiDateRange,
      startDate: apiStartDate ?? "",
      endDate: apiEndDate ?? "",
    }),
    queryFn: () =>
      fetchDiscountAnalytics({
        dateRange: apiDateRange,
        startDate: apiStartDate,
        endDate: apiEndDate,
      }),
    // A custom range with no resolved dates would ask the API for a window it will reject.
    enabled: apiDateRange !== "custom" || Boolean(apiStartDate && apiEndDate),
  });

  const rows = data?.bySurface ?? [];

  return (
    <section className="mt-8" aria-labelledby="discount-analytics-heading">
      <div className="mb-3">
        <h3
          id="discount-analytics-heading"
          className="text-base font-semibold text-gray-900 dark:text-white"
        >
          Partner discounts
        </h3>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-neutral-400">
          The public <code className="font-mono">/discount</code> catalogue and the members&apos;
          rewards catalogue. Every count below is <strong>visitors</strong>, not events, so the
          columns share one denominator.
        </p>
      </div>

      {data?.dateRange.clampedToRetention && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
          Visit rows are deleted after 90 days, so this range starts at{" "}
          {new Date(data.dateRange.visitsRetainedFrom).toLocaleDateString("en-AU")} rather than the
          date requested. Signups and revenue are clamped to the same window, so every rate here is
          computed over one population.
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-200">
          Couldn&apos;t load partner discount analytics.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              title="Discount visitors"
              value={formatNumber(data?.totalVisits ?? 0)}
              subtitle="Deduped across both surfaces"
              icon={Tag}
              loading={isLoading}
            />
            <MetricCard
              title="Signups"
              value={formatNumber(data?.totalSignups ?? 0)}
              subtitle="Registered after a discount visit"
              icon={Users}
              loading={isLoading}
            />
            <MetricCard
              title="Conversions"
              value={formatNumber(data?.totalConversions ?? 0)}
              subtitle="Of those signups, who then bought"
              icon={UserCheck}
              loading={isLoading}
            />
            <MetricCard
              title="Revenue"
              value={formatCurrency(data?.totalRevenue ?? 0)}
              subtitle="Renewals and refunds excluded"
              icon={DollarSign}
              loading={isLoading}
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-neutral-900">
                <tr>
                  <th className="p-3 text-left font-semibold text-gray-800 dark:text-neutral-100">
                    Surface
                  </th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-neutral-100">
                    Visitors
                  </th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-neutral-100">
                    Filtered
                  </th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-neutral-100">
                    Opened an offer
                  </th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-neutral-100">
                    Opened a locked one
                  </th>
                  <th
                    className="p-3 text-right font-semibold text-gray-800 dark:text-neutral-100"
                    title="Of visitors who had an access seam on screen at all — NOT of all visitors. The seam only exists under the access-level sort, and never for someone who can reach everything."
                  >
                    Reached the seam
                  </th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-neutral-100">
                    Unlock clicks
                  </th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-neutral-100">
                    Portal hand-off
                  </th>
                  <th className="hidden p-3 text-right font-semibold text-gray-800 dark:text-neutral-100 md:table-cell">
                    Empty search
                  </th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-neutral-100">
                    Signups
                  </th>
                  <th className="hidden p-3 text-right font-semibold text-gray-800 dark:text-neutral-100 md:table-cell">
                    V→S %
                  </th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-neutral-100">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="p-4 text-center text-gray-500 dark:text-neutral-400"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.surface}
                      className="border-t border-gray-200 dark:border-neutral-800"
                    >
                      <td className="p-3 font-medium text-gray-900 dark:text-white">
                        {SURFACE_LABEL[row.surface] ?? row.surface}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {formatNumber(row.visits)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-600 dark:text-neutral-400">
                        {formatNumber(row.interacted)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {formatNumber(row.offerOpeners)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {formatNumber(row.lockedOfferOpeners)}
                      </td>
                      {/* Two numbers, not one: the rate alone hides how small its base is, and
                          the base is often small — a visitor who never switched to the access
                          sort had no seam to reach and is correctly excluded from it. */}
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {row.seamRendered > 0 ? (
                          <>
                            {formatNumber(row.seamReached)}
                            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-neutral-400">
                              / {formatNumber(row.seamRendered)} (
                              {formatPercentageOrDash(row.seamReachRate, row.seamRendered)})
                            </span>
                          </>
                        ) : (
                          <span
                            className="text-gray-400 dark:text-neutral-500"
                            title="No seam was rendered for any visitor in this window — on the members' catalogue there is never one, and on /discount it only appears under the access-level sort."
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {formatNumber(row.unlockClickers)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {formatNumber(row.portalHandoffs)}
                      </td>
                      <td className="hidden p-3 text-right font-mono tabular-nums text-gray-600 dark:text-neutral-400 md:table-cell">
                        {formatNumber(row.zeroResultSearchers)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {formatNumber(row.signups)}
                      </td>
                      <td className="hidden p-3 text-right text-gray-600 dark:text-neutral-400 md:table-cell">
                        {formatPercentageOrDash(row.visitToSignupRate, row.visits)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(row.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
            A visitor who used both surfaces counts once in the cards above and once in each row
            below, so the rows may sum higher than the totals. Redemption inside the partner portal
            is not visible to us — the hand-off is the last step we can see.
          </p>
        </>
      )}
    </section>
  );
}
