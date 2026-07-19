"use client";

import React from "react";
import { useTikTokAdsInsights } from "@/hooks/queries/admin/useTikTokAdsInsights";

function formatAud(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNum(n: number) {
  return new Intl.NumberFormat("en-AU").format(Math.round(n));
}

/**
 * Per-TikTok-ad breakdown: adName + spend + TikTok-reported conversions/revenue + ROAS.
 * The TikTok analogue of the Meta "Ads" / Spend-by-URL per-ad tables. Revenue is
 * TikTok's OWN attributed value (labelled "TikTok rev."), consistent with how the Meta
 * view shows "Meta rev." — this is the platform's reported number, not first-party sales.
 */
export default function TikTokAdBreakdownTable({
  startDate,
  endDate,
}: {
  startDate?: string;
  endDate?: string;
}) {
  const { data, isLoading, isError, error } = useTikTokAdsInsights({ startDate, endDate });

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Ad performance (per ad)
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Spend + conversions/revenue as reported by TikTok. ROAS = TikTok rev. ÷ spend.
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      )}

      {isError && (
        <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">
          {error instanceof Error ? error.message : "Failed to load TikTok ad insights."}
        </p>
      )}

      {!isLoading && !isError && data && data.rows.length === 0 && (
        <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {data.configured
            ? "No TikTok ad spend recorded for this range yet."
            : "Awaiting sync — set TIKTOK_ADVERTISER_ID + TIKTOK_MARKETING_ACCESS_TOKEN, then the nightly sync populates this."}
        </p>
      )}

      {!isLoading && !isError && data && data.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <th className="py-2 pr-3 font-medium">Ad</th>
                <th className="py-2 px-3 text-right font-medium">Spend</th>
                <th className="py-2 px-3 text-right font-medium">Impr.</th>
                <th className="py-2 px-3 text-right font-medium">Clicks</th>
                <th className="py-2 px-3 text-right font-medium">Conv.</th>
                <th className="py-2 px-3 text-right font-medium">TikTok rev.</th>
                <th className="py-2 pl-3 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.adId}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {r.adName ?? `Ad ${r.adId}`}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {[r.campaignName, r.adsetName].filter(Boolean).join(" · ") || r.adId}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{formatAud(r.spend)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{formatNum(r.impressions)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{formatNum(r.clicks)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{formatNum(r.conversions)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{formatAud(r.revenue)}</td>
                  <td className="py-2 pl-3 text-right font-medium tabular-nums">
                    {r.roas.toFixed(2)}×
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 font-semibold dark:border-neutral-700">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatAud(data.totals.spend)}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {formatNum(data.totals.impressions)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{formatNum(data.totals.clicks)}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {formatNum(data.totals.conversions)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{formatAud(data.totals.revenue)}</td>
                <td className="py-2 pl-3 text-right tabular-nums">{data.totals.roas.toFixed(2)}×</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
