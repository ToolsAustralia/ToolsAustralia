"use client";

import React, { useState } from "react";
import { ChevronRight, ChevronDown, AlertTriangle, HelpCircle, ExternalLink, SpellCheck2 } from "lucide-react";
import { Badge } from "@/components/admin/ui";
import type {
  PackagesFocusCampaignNode,
  PackagesFocusAdNode,
} from "@/hooks/queries/usePackagesFocusBreakdown";
import { checkAdUrlMismatch } from "@/utils/admin/adUrlMismatchCheck";
import { cn } from "@/utils/cn";

const COL_SPAN = 5;

function formatAud(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNum(n: number) {
  return new Intl.NumberFormat("en-AU").format(n);
}

/**
 * Landing-URL focus pill shown on ad rows — only when the node carries a
 * `packagesFocus` (Task 9's mixed-brand tree). The KPI modal's per-bucket trees
 * leave it unset, so no pill renders there.
 */
const FOCUS_BADGE: Record<
  NonNullable<PackagesFocusAdNode["packagesFocus"]>,
  { tone: "info" | "neutral" | "warning"; label: string }
> = {
  "one-time": { tone: "info", label: "One-time" },
  membership: { tone: "neutral", label: "Membership" },
  unclassified: { tone: "warning", label: "Unclassified" },
};

/** ROAS colouring matches BrandPerformanceCard: emerald ≥ 3, amber below. */
function roasClass(roas: number) {
  return roas >= 3
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-amber-600 dark:text-amber-500";
}

export interface CampaignTreeTableProps {
  campaigns: PackagesFocusCampaignNode[];
  ariaLabel?: string;
  emptyMessage?: string;
  /**
   * Which ad platform `campaigns` belongs to. Gates the "Open in Ads Manager" link — Meta only,
   * since the deep link (`buildAdsManagerAdUrl`) is a Meta Ads Manager URL. Omitted by callers
   * that don't carry per-ad URL data (e.g. the KPI modal's per-bucket trees), which also skips
   * the ad-URL mismatch icon (see `hasUrlInfo` below).
   */
  platform?: "meta" | "tiktok";
  /** Meta ad account id (with or without the `act_` prefix), for the Ads Manager link. */
  adAccountId?: string;
}

/**
 * Expandable campaign → ad set → ad tree, styled like SpendByUrlAdBreakdownTable.
 * Reused by the Ad Spend KPI modal (per-bucket) and Task 9's prize modal (mixed).
 */

/**
 * The readable part of a landing URL, RAW form — path + query, origin dropped. Every row in a
 * drill-down shares an origin, so showing it costs horizontal space and tells the reader
 * nothing. Unlike a query-stripped canonical form, this keeps a `?toolbox=`/`?toolset=`
 * selection visible — it's the evidence a reader checks the mismatch icon's verdict against.
 * `unknown://` placeholders (an ad whose destination never resolved) are shown verbatim,
 * because "unknown" IS the useful signal there. The full URL stays in the `title` attribute.
 */
function shortenRawUrl(url: string): string {
  if (url.startsWith("unknown://")) return url;
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? u.hostname : u.pathname;
    return u.search ? `${path}${u.search}` : path;
  } catch {
    return url;
  }
}

/**
 * Meta Ads Manager deep link for one ad (spec B7, `docs/superpowers/specs/
 * 2026-09-01-coupon-audience-and-ad-url-check-design.md`).
 *
 * `assumed`, NOT verified against a live account — confirm on first click. Kept as the ONE
 * place this shape is written so a correction, if needed, is a one-line change here.
 */
export function buildAdsManagerAdUrl(adAccountId: string, adId: string): string {
  const bareAccountId = adAccountId.replace(/^act_/, "");
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(bareAccountId)}&selected_ad_ids=${encodeURIComponent(adId)}`;
}

/** Human casing for a resolved brand slug in a tooltip/aria-label (e.g. "stihl" -> "Stihl"). */
function titleCaseBrand(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export default function CampaignTreeTable({
  campaigns,
  ariaLabel = "Campaign breakdown",
  emptyMessage,
  platform,
  adAccountId,
}: CampaignTreeTableProps) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set());

  const toggleCampaign = (campaignId: string) =>
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);
      return next;
    });

  const toggleAdset = (key: string) =>
    setExpandedAdsets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (campaigns.length === 0) {
    return (
      <p className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400 py-4 text-center">
        {emptyMessage ?? "No ads in this bucket for the selected range."}
      </p>
    );
  }

  const theadBg = "bg-slate-50 dark:bg-neutral-800/95";
  const cellPad = "py-1.5 px-1 sm:py-2 sm:px-2";
  const numCell = cn(cellPad, "text-right whitespace-nowrap tabular-nums");
  const headCell = cn("sticky top-0 z-10", theadBg, cellPad, "font-semibold whitespace-nowrap");

  return (
    <div
      className="-mx-1 sm:mx-0 w-full min-w-0 overflow-x-auto brand-scrollbar"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <table
        className={cn("w-full min-w-[520px]", "text-2xs sm:text-xs", "border-collapse")}
        aria-label={ariaLabel}
      >
        <thead>
          <tr className={cn("border-b border-slate-200 text-gray-600 dark:border-neutral-600 dark:text-neutral-300", theadBg)}>
            <th className={cn(headCell, "text-left")}>Name</th>
            <th className={cn(headCell, "text-right")}>Spend</th>
            <th className={cn(headCell, "text-right")}>Revenue</th>
            <th className={cn(headCell, "text-right")}>ROAS</th>
            <th className={cn(headCell, "text-right")}>Conv.</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const campaignOpen = expandedCampaigns.has(campaign.campaignId);
            return (
              <React.Fragment key={campaign.campaignId}>
                {/* Campaign row */}
                <tr className="border-b border-slate-100/80 dark:border-neutral-800/90 bg-slate-200/60 dark:bg-neutral-800/50">
                  <td className={cn(cellPad, "text-gray-900 dark:text-neutral-100")}>
                    <button
                      type="button"
                      onClick={() => toggleCampaign(campaign.campaignId)}
                      aria-expanded={campaignOpen}
                      className="flex items-start gap-1.5 text-left w-full"
                    >
                      {campaignOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" aria-hidden />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="block font-semibold text-gray-800 dark:text-neutral-100 leading-snug line-clamp-2">
                          {campaign.campaignName || "Untitled campaign"}
                        </span>
                        <span className="block font-mono text-3xs sm:text-2xs text-gray-500 dark:text-neutral-500 truncate">
                          {campaign.campaignId}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className={cn(numCell, "font-semibold text-gray-900 dark:text-white")}>
                    {formatAud(campaign.totals.spend)}
                  </td>
                  <td className={cn(numCell, "font-semibold text-emerald-800 dark:text-emerald-300")}>
                    {formatAud(campaign.totals.revenue)}
                  </td>
                  <td className={cn(numCell, "font-semibold", roasClass(campaign.totals.roas))}>
                    {campaign.totals.roas.toFixed(2)}x
                  </td>
                  <td className={cn(numCell, "font-semibold text-gray-900 dark:text-white")}>
                    {formatNum(campaign.totals.conversions)}
                  </td>
                </tr>

                {campaignOpen &&
                  campaign.adsets.map((adset) => {
                    const adsetKey = `${campaign.campaignId}:${adset.adsetId}`;
                    const adsetOpen = expandedAdsets.has(adsetKey);
                    return (
                      <React.Fragment key={adsetKey}>
                        {/* Ad set row */}
                        <tr className="border-b border-slate-100/70 dark:border-neutral-800/80">
                          <td className={cn(cellPad, "text-gray-900 dark:text-neutral-100")}>
                            <button
                              type="button"
                              onClick={() => toggleAdset(adsetKey)}
                              aria-expanded={adsetOpen}
                              className="flex items-start gap-1.5 text-left w-full pl-4"
                            >
                              {adsetOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" aria-hidden />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" aria-hidden />
                              )}
                              <span className="min-w-0">
                                <span className="block font-medium text-gray-700 dark:text-neutral-200 leading-snug line-clamp-2">
                                  {adset.adsetName || "Untitled ad set"}
                                </span>
                                <span className="block font-mono text-3xs sm:text-2xs text-gray-500 dark:text-neutral-500 truncate">
                                  {adset.adsetId}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td className={numCell}>{formatAud(adset.totals.spend)}</td>
                          <td className={cn(numCell, "text-emerald-800 dark:text-emerald-300")}>
                            {formatAud(adset.totals.revenue)}
                          </td>
                          <td className={cn(numCell, roasClass(adset.totals.roas))}>
                            {adset.totals.roas.toFixed(2)}x
                          </td>
                          <td className={numCell}>{formatNum(adset.totals.conversions)}</td>
                        </tr>

                        {adsetOpen &&
                          adset.ads.map((ad) => {
                            const focus = ad.packagesFocus ? FOCUS_BADGE[ad.packagesFocus] : null;

                            // `packagesFocus` is only ever set by the mixed-brand tree
                            // (BrandPerformanceAdsModal's per-ad detail rows always carry it);
                            // the KPI modal's per-bucket trees never populate URL data at all,
                            // so there is nothing to check or show there.
                            const hasUrlInfo = ad.packagesFocus !== undefined;
                            const rawUrlsForCheck: string[] =
                              ad.rawUrls && ad.rawUrls.length > 0
                                ? ad.rawUrls
                                : ad.canonicalUrl
                                  ? [ad.canonicalUrl]
                                  : [];
                            const mismatch = hasUrlInfo
                              ? checkAdUrlMismatch({
                                  campaignName: campaign.campaignName,
                                  adName: ad.adName,
                                  urls: rawUrlsForCheck,
                                })
                              : null;

                            const adsManagerHref =
                              platform === "meta" && adAccountId
                                ? buildAdsManagerAdUrl(adAccountId, ad.adId)
                                : null;

                            return (
                              <tr
                                key={`${adsetKey}:${ad.adId}`}
                                className="border-b border-slate-100/60 dark:border-neutral-800/70"
                              >
                                <td className={cn(cellPad, "text-gray-900 dark:text-neutral-100")}>
                                  <div className="pl-8 min-w-0">
                                    <span className="block font-mono text-3xs sm:text-2xs text-gray-500 dark:text-neutral-500 truncate">
                                      {ad.adId}
                                    </span>
                                    {ad.adName ? (
                                      <span className="block text-gray-700 dark:text-neutral-200 leading-snug line-clamp-2">
                                        {ad.adName}
                                      </span>
                                    ) : null}
                                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300">
                                        {ad.adFormat}
                                      </span>
                                      {focus && <Badge tone={focus.tone}>{focus.label}</Badge>}
                                      {adsManagerHref && (
                                        <a
                                          href={adsManagerHref}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-0.5 text-3xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                        >
                                          Ads Manager
                                          <ExternalLink className="w-2.5 h-2.5" aria-hidden />
                                        </a>
                                      )}
                                    </span>
                                    {/* Which landing URL(s) this ad actually bought — the RAW
                                        form (query intact), not the query-stripped canonical
                                        form, so a `?toolbox=`/`?toolset=` selection stays
                                        visible. A brand drill-down unions several URLs into one
                                        list, so the header's "5 landing URLs" is unreadable
                                        without this. Multiple entries = a carousel/multi-URL ad
                                        (spec B6) — every URL is shown, not just the first. */}
                                    {rawUrlsForCheck.length > 0 && (
                                      <div className="mt-0.5 flex items-start gap-1 min-w-0">
                                        {mismatch && mismatch.verdict === "mismatch" && (
                                          <span
                                            className="shrink-0 mt-0.5"
                                            role="img"
                                            aria-label={`Ad-URL mismatch: campaign names ${titleCaseBrand(mismatch.campaignBrand ?? "")}; URL points at ${mismatch.urlBrands.map(titleCaseBrand).join(", ") || "no recognised brand"}`}
                                            title={`Campaign names ${titleCaseBrand(mismatch.campaignBrand ?? "")}; URL points at ${mismatch.urlBrands.map(titleCaseBrand).join(", ") || "no recognised brand"}`}
                                          >
                                            <AlertTriangle
                                              className="w-3 h-3 text-red-600 dark:text-red-400"
                                              aria-hidden
                                            />
                                          </span>
                                        )}
                                        {/* A typo'd ?toolbox=/?toolset= value (e.g. "milwakee") is a
                                            DIFFERENT problem from a brand mismatch — the URL shape is
                                            right, one character is wrong — so it gets its own colour
                                            (amber, not red) and can appear alongside EITHER the
                                            mismatch icon above or a clean "ok" row; it never implies
                                            or masks a brand mismatch. */}
                                        {mismatch && mismatch.unrecognisedParamValues.length > 0 && (
                                          <span
                                            className="shrink-0 mt-0.5"
                                            role="img"
                                            aria-label={`Unrecognised ${mismatch.unrecognisedParamValues[0].param} value: '${mismatch.unrecognisedParamValues[0].value}'${mismatch.unrecognisedParamValues.length > 1 ? ` (+${mismatch.unrecognisedParamValues.length - 1} more)` : ""}`}
                                            title={`Unrecognised ${mismatch.unrecognisedParamValues[0].param} value: '${mismatch.unrecognisedParamValues[0].value}'${mismatch.unrecognisedParamValues.length > 1 ? ` (+${mismatch.unrecognisedParamValues.length - 1} more)` : ""}`}
                                          >
                                            <SpellCheck2
                                              className="w-3 h-3 text-amber-600 dark:text-amber-400"
                                              aria-hidden
                                            />
                                          </span>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          {rawUrlsForCheck.map((url, i) => (
                                            <span
                                              key={i}
                                              className="block font-mono text-3xs text-sky-700 dark:text-sky-400 truncate"
                                              title={url}
                                            >
                                              {shortenRawUrl(url)}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {/* Unknown: either no destination resolved for this ad at
                                        all, or campaign/ad naming didn't yield exactly one
                                        brand. Muted and quiet by design — the whole value of the
                                        mismatch icon above is that a warning is rare, so this
                                        state must never compete with it visually. */}
                                    {mismatch && mismatch.verdict === "unknown" && (
                                      <span
                                        className="mt-0.5 flex items-center gap-1 text-3xs text-gray-400 dark:text-neutral-600"
                                        role="img"
                                        aria-label="Ad-URL brand check: unknown — destination or naming could not be verified"
                                        title="Ad-URL brand check: unknown — destination or naming could not be verified"
                                      >
                                        <HelpCircle className="w-2.5 h-2.5 shrink-0" aria-hidden />
                                        {rawUrlsForCheck.length === 0 && "No landing URL resolved"}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className={numCell}>{formatAud(ad.totals.spend)}</td>
                                <td className={cn(numCell, "text-emerald-800 dark:text-emerald-300")}>
                                  {formatAud(ad.totals.revenue)}
                                </td>
                                <td className={cn(numCell, roasClass(ad.totals.roas))}>
                                  {ad.totals.roas.toFixed(2)}x
                                </td>
                                <td className={numCell}>{formatNum(ad.totals.conversions)}</td>
                              </tr>
                            );
                          })}

                        {adsetOpen && adset.ads.length === 0 && (
                          <tr className="border-b border-slate-100/60 dark:border-neutral-800/70">
                            <td colSpan={COL_SPAN} className={cn(cellPad, "pl-8 text-gray-400 dark:text-neutral-500")}>
                              No ads in this ad set.
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                {campaignOpen && campaign.adsets.length === 0 && (
                  <tr className="border-b border-slate-100/70 dark:border-neutral-800/80">
                    <td colSpan={COL_SPAN} className={cn(cellPad, "pl-4 text-gray-400 dark:text-neutral-500")}>
                      No ad sets in this campaign.
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
