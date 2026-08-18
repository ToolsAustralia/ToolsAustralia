"use client";

import React from "react";
import {
  useTikTokAdsInsights,
  type TikTokAdInsightsRow,
  type TikTokInsightLevel,
  type TikTokSyncHealth,
} from "@/hooks/queries/admin/useTikTokAdsInsights";

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

function formatSydney(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Truthful empty-state copy (panel F-002): staff must be able to tell "not connected"
 * from "the sync is FAILING" from "synced fine, genuinely no spend". Never surfaces
 * raw env-var names.
 */
function emptyStateMessage(health: TikTokSyncHealth | undefined): {
  text: string;
  failing: boolean;
} {
  if (!health || !health.configured) {
    return {
      text: "TikTok Marketing API isn't connected yet — ad spend will appear here once it's linked.",
      failing: false,
    };
  }
  if (health.lastRun?.outcome === "error") {
    const code = health.lastRun.errorCode != null ? ` (code ${health.lastRun.errorCode})` : "";
    return {
      text:
        `TikTok spend sync is FAILING — last attempt ${formatSydney(health.lastRun.finishedAt)} AEST: ` +
        `${health.lastRun.errorMessage ?? "unknown error"}${code}`,
      failing: true,
    };
  }
  if (health.lastRun?.outcome === "ok") {
    return {
      text: `Synced ${formatSydney(health.lastRun.finishedAt)} AEST — no TikTok ad spend recorded for this range.`,
      failing: false,
    };
  }
  return {
    text: "Waiting for the first TikTok spend sync (runs nightly).",
    failing: false,
  };
}

const LEVELS: { value: TikTokInsightLevel; label: string }[] = [
  { value: "campaign", label: "Campaign" },
  { value: "adset", label: "Ad set" },
  { value: "ad", label: "Ad" },
];

const LEVEL_COPY: Record<TikTokInsightLevel, { heading: string; column: string }> = {
  campaign: { heading: "Ad performance (per campaign)", column: "Campaign" },
  adset: { heading: "Ad performance (per ad set)", column: "Ad set" },
  ad: { heading: "Ad performance (per ad)", column: "Ad" },
};

/**
 * The row's own name, and the parent context beneath it.
 *
 * Kept as one function so the two lines can never disagree about which level is being
 * rendered — at ad-set level the title is the ad set and the subtitle is its campaign, and
 * at campaign level there is no parent to show at all.
 */
function rowIdentity(
  r: TikTokAdInsightsRow,
  level: TikTokInsightLevel,
): { key: string; title: string; subtitle: string } {
  if (level === "campaign") {
    return {
      key: r.campaignId ?? "unattributed-campaign",
      title: r.campaignName ?? `Campaign ${r.campaignId ?? "—"}`,
      subtitle: "",
    };
  }
  if (level === "adset") {
    return {
      key: r.adsetId ?? "unattributed-adset",
      title: r.adsetName ?? `Ad set ${r.adsetId ?? "—"}`,
      subtitle: r.campaignName ?? "",
    };
  }
  return {
    key: r.adId ?? "unattributed-ad",
    title: r.adName ?? `Ad ${r.adId ?? "—"}`,
    subtitle: [r.campaignName, r.adsetName].filter(Boolean).join(" · ") || (r.adId ?? ""),
  };
}

/**
 * TikTok spend breakdown at campaign / ad-set / ad level: spend + TikTok-reported
 * conversions/revenue + ROAS. The TikTok analogue of the Meta "Ads" / Spend-by-URL tables
 * and their level switcher. Revenue is TikTok's OWN attributed value (labelled "TikTok
 * rev."), consistent with how the Meta view shows "Meta rev." — the platform's reported
 * number, not first-party sales.
 *
 * The level is a pure REGROUPING of the same synced ad-days, so the totals row is identical
 * whichever level is selected. That is worth knowing when reading the table: switching level
 * never changes the money, only how it is split.
 */
export default function TikTokAdBreakdownTable({
  startDate,
  endDate,
}: {
  startDate?: string;
  endDate?: string;
}) {
  // Defaults to `ad`, matching what this table showed before the switcher existed.
  const [level, setLevel] = React.useState<TikTokInsightLevel>("ad");
  const { data, isLoading, isError, error } = useTikTokAdsInsights({ startDate, endDate, level });

  // Render against the level the DATA came back at, never the selected one — otherwise the
  // headers flip to "Campaign" while the previous level's rows are still on screen.
  const shownLevel = data?.level ?? level;
  const copy = LEVEL_COPY[shownLevel];

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {copy.heading}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Spend + conversions/revenue as reported by TikTok. ROAS = TikTok rev. ÷ spend.
          </p>
        </div>

        <div
          role="group"
          aria-label="Group by"
          className="inline-flex shrink-0 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700"
        >
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLevel(l.value)}
              aria-pressed={level === l.value}
              className={`px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
                level === l.value
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-white text-neutral-600 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {l.label}
            </button>
          ))}
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

      {!isLoading && !isError && data && data.rows.length === 0 && (() => {
        const state = emptyStateMessage(data.syncHealth);
        return (
          <p
            className={`py-6 text-center text-sm ${
              state.failing
                ? "font-medium text-red-600 dark:text-red-400"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            {state.text}
          </p>
        );
      })()}

      {/* Rows exist but the latest sync attempt failed → the table is showing STALE
          data; say so instead of letting it read as current (panel F-002). */}
      {!isLoading && !isError && data && data.rows.length > 0 &&
        data.syncHealth?.lastRun?.outcome === "error" && (
          <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Latest TikTok sync attempt failed ({formatSydney(data.syncHealth.lastRun.finishedAt)}{" "}
            AEST) — figures below are from the last successful sync and may be stale.
          </p>
        )}

      {!isLoading && !isError && data && data.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <th className="py-2 pr-3 font-medium">{copy.column}</th>
                <th className="py-2 px-3 text-right font-medium">Spend</th>
                <th className="py-2 px-3 text-right font-medium">Impr.</th>
                <th className="py-2 px-3 text-right font-medium">Clicks</th>
                <th className="py-2 px-3 text-right font-medium">Conv.</th>
                <th className="py-2 px-3 text-right font-medium">TikTok rev.</th>
                <th className="py-2 pl-3 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const id = rowIdentity(r, shownLevel);
                return (
                <tr
                  key={id.key}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {id.title}
                    </div>
                    {id.subtitle && (
                      <div className="text-xs text-neutral-400">{id.subtitle}</div>
                    )}
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
                );
              })}
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
