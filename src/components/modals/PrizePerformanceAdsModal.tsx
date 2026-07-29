"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent } from "@/components/modals/ui";
import {
  useSpendByUrlDetailMany,
  type SpendByUrlDetailRow,
  type SpendByUrlPlatform,
} from "@/hooks/queries/useSpendByUrlAnalytics";
import { groupSpendByUrlDetailRowsByCampaign } from "@/utils/admin/spendByUrlAdBreakdown";
import CampaignTreeTable from "@/components/admin/spend-by-url/CampaignTreeTable";

export interface PrizePerformanceAdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandLabel: string;
  slug: string;
  startDate: string;
  endDate: string;
  canonicalUrls: string[];
  /**
   * Which platform's ads to break down. Required rather than defaulted: ad ids are only
   * unique WITHIN a platform, so a per-ad tree has to name one. The card passes whichever
   * platform the row's figures came from (and "meta" when the card is showing All, where
   * the reader can switch platform in the card itself).
   */
  platform: SpendByUrlPlatform;
}

type FocusKey = "membership" | "one-time" | "unclassified";
type FocusFilter = "all" | FocusKey;
type Platform = "meta" | "tiktok";

const fmtAud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

interface FocusSummary {
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
}

/** Sum a set of per-ad detail rows into per-focus brand-level totals (whole-dollar tiles). */
function summarizeByFocus(rows: SpendByUrlDetailRow[]): Record<FocusKey, FocusSummary> {
  const acc: Record<FocusKey, { spendCents: number; revenueCents: number; conversions: number }> = {
    membership: { spendCents: 0, revenueCents: 0, conversions: 0 },
    "one-time": { spendCents: 0, revenueCents: 0, conversions: 0 },
    unclassified: { spendCents: 0, revenueCents: 0, conversions: 0 },
  };
  for (const r of rows) {
    const a = acc[r.packagesFocus];
    a.spendCents += r.spendCents;
    a.revenueCents += r.revenueCents;
    a.conversions += r.conversions;
  }
  const toSummary = (a: { spendCents: number; revenueCents: number; conversions: number }): FocusSummary => {
    const spend = Math.round(a.spendCents) / 100;
    const revenue = Math.round(a.revenueCents) / 100;
    return { spend, revenue, roas: spend > 0 ? revenue / spend : 0, conversions: a.conversions };
  };
  return {
    membership: toSummary(acc.membership),
    "one-time": toSummary(acc["one-time"]),
    unclassified: toSummary(acc.unclassified),
  };
}

/** Display-only tile matching AdSpendFocusModal's SummaryTile visual (filtering happens via the chips). */
function SummaryTile({ label, summary }: { label: string; summary: FocusSummary }) {
  return (
    <div className="text-left rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
      <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="font-display font-extrabold text-lg text-neutral-900 dark:text-white mt-1">{fmtAud(summary.spend)}</p>
      <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        {`${fmtAud(summary.revenue)} rev · ${summary.roas.toFixed(2)}x ROAS · ${summary.conversions} conv`}
      </p>
    </div>
  );
}

const chipClass = (active: boolean) =>
  `px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
    active
      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent"
      : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
  }`;

function formatRangeLabel(startDate: string, endDate: string): string {
  try {
    const start = format(new Date(`${startDate}T12:00:00`), "MMM d, yyyy");
    const end = format(new Date(`${endDate}T12:00:00`), "MMM d, yyyy");
    return start === end ? start : `${start} – ${end}`;
  } catch {
    return "";
  }
}

/**
 * Per-prize ad drill-down opened from the Prize performance table: a mixed-focus
 * campaign → ad set → ad tree. `useSpendByUrlDetailMany` pulls every ad for the brand's
 * landing URLs, brand-level tiles split spend/return by packages focus (Membership +
 * One-time always, Unclassified when present), and focus chips filter the rows fed into the
 * shared `CampaignTreeTable` (each ad node keeps its own `packagesFocus`, so the "All" view
 * badges every ad by its focus).
 *
 * The platform chips are live for both Meta and TikTok as of 2026-07-29 — switching refetches
 * that platform's per-ad rows. One platform at a time is a hard constraint, not a UI choice:
 * ad ids are only unique WITHIN a platform, so a merged tree would be ambiguous.
 */
export default function PrizePerformanceAdsModal({
  isOpen,
  onClose,
  brandLabel,
  slug: _slug,
  startDate,
  endDate,
  canonicalUrls,
  platform: initialPlatform,
}: PrizePerformanceAdsModalProps) {
  // The chips own the live platform; the prop only seeds it, so opening from a TikTok row
  // lands on TikTok while the reader can still flip to Meta without closing the modal.
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");

  const { data, isLoading, error } = useSpendByUrlDetailMany(
    canonicalUrls,
    startDate,
    endDate,
    { enabled: isOpen && canonicalUrls.length > 0, platform }
  );

  useEffect(() => {
    if (!isOpen) {
      setPlatform(initialPlatform);
      setFocusFilter("all");
    }
  }, [isOpen, initialPlatform]);

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const summary = useMemo(() => summarizeByFocus(rows), [rows]);
  const hasUnclassified = rows.some((r) => r.packagesFocus === "unclassified");

  const filteredRows = useMemo(
    () => (focusFilter === "all" ? rows : rows.filter((r) => r.packagesFocus === focusFilter)),
    [rows, focusFilter]
  );
  const campaigns = useMemo(() => groupSpendByUrlDetailRowsByCampaign(filteredRows), [filteredRows]);

  const rangeLabel = formatRangeLabel(startDate, endDate);
  const urlCount = canonicalUrls.length;

  const subtitle = (() => {
    if (canonicalUrls.length === 0) {
      return "No landing URLs for this prize in this period";
    }
    if (isLoading) {
      return `Loading ads… · ${urlCount} landing URL${urlCount === 1 ? "" : "s"}${rangeLabel ? ` · ${rangeLabel}` : ""}`;
    }
    const count = data?.rows?.length ?? 0;
    return `${count.toLocaleString()} ad${count === 1 ? "" : "s"} · ${urlCount} landing URL${urlCount === 1 ? "" : "s"}${rangeLabel ? ` · ${rangeLabel}` : ""}`;
  })();

  const focusChip = (value: FocusFilter, label: string) => (
    <button type="button" onClick={() => setFocusFilter(value)} className={chipClass(focusFilter === value)}>
      {label}
    </button>
  );

  const platformChip = (p: Platform, label: string) => (
    <button type="button" onClick={() => setPlatform(p)} className={chipClass(platform === p)}>
      {label}
    </button>
  );

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" className="!max-w-[1100px]">
      <ModalHeader title={`${brandLabel} — ad breakdown`} subtitle={subtitle} onClose={onClose} />
      <ModalContent padding="none">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {platformChip("meta", "Meta")}
            {platformChip("tiktok", "TikTok")}
          </div>

          {canonicalUrls.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              No matching promotion URLs were found for this period.
            </p>
          )}
          {error && canonicalUrls.length > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {error instanceof Error ? error.message : "Failed to load ads"}
            </p>
          )}
          {isLoading && canonicalUrls.length > 0 && (
            <div className="flex items-center justify-center py-12 text-gray-500 dark:text-neutral-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin shrink-0" aria-hidden />
              <span>Loading ads…</span>
            </div>
          )}
          {!isLoading && !error && canonicalUrls.length > 0 && data?.rows && (
            <>
              <div className={`grid gap-3 ${hasUnclassified ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                <SummaryTile label="Membership focus" summary={summary.membership} />
                <SummaryTile label="One-time focus" summary={summary["one-time"]} />
                {hasUnclassified && <SummaryTile label="Unclassified" summary={summary.unclassified} />}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {focusChip("all", "All")}
                {focusChip("membership", "Membership")}
                {focusChip("one-time", "One-time")}
                {hasUnclassified && focusChip("unclassified", "Unclassified")}
              </div>

              <CampaignTreeTable
                campaigns={campaigns}
                ariaLabel={`Campaigns for ${brandLabel}`}
                emptyMessage={`No ${platform === "tiktok" ? "TikTok" : "Meta"} ads ran for ${brandLabel} in this range.`}
              />
            </>
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
