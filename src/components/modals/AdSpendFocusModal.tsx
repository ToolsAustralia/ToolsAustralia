"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent } from "@/components/modals/ui";
import {
  usePackagesFocusBreakdown,
  type PackagesFocusTotals,
} from "@/hooks/queries/usePackagesFocusBreakdown";
import CampaignTreeTable from "@/components/admin/spend-by-url/CampaignTreeTable";

type FocusTab = "membership" | "one-time" | "unclassified";
type Platform = "meta" | "tiktok";

const fmtAud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

function SummaryTile({ label, totals, totalSpendCents, active, onClick }: {
  label: string;
  totals: PackagesFocusTotals | undefined;
  /** Sum of all three buckets' spend, for the share-of-total badge. Cents to avoid float drift. */
  totalSpendCents: number;
  active: boolean;
  onClick: () => void;
}) {
  // Share of total ad spend across all focus buckets. One decimal so tiny buckets
  // (e.g. unclassified) read honestly instead of rounding to 0%.
  const sharePct = totals && totalSpendCents > 0 ? (totals.spendCents / totalSpendCents) * 100 : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-3 transition-colors ${
        active
          ? "border-neutral-900 dark:border-white ring-1 ring-neutral-900 dark:ring-white"
          : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
      }`}
    >
      <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="font-display font-extrabold text-lg text-neutral-900 dark:text-white mt-1">
        {totals ? fmtAud(totals.spend) : "—"}
        {sharePct !== null && (
          <span className="ml-1.5 align-middle text-xs font-semibold text-neutral-400 dark:text-neutral-500">
            {sharePct.toFixed(1)}%
          </span>
        )}
      </p>
      <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        {totals ? `${fmtAud(totals.revenue)} rev · ${totals.roas.toFixed(2)}x ROAS · ${totals.conversions} conv` : ""}
      </p>
    </button>
  );
}

/**
 * Drill-down for the Ad Spend + ROAS KPI tiles: how spend/return splits between
 * membership-focus landing URLs (default) and one-time-focus URLs
 * (?packages=one-time), with a campaign → ad set → ad tree per bucket.
 * Revenue here is Meta-reported (action_values) — the same basis as the KPI.
 */
export default function AdSpendFocusModal({
  isOpen, onClose, startDate, endDate, rangeLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  startDate?: string;
  endDate?: string;
  rangeLabel?: string;
}) {
  const [platform, setPlatform] = useState<Platform>("meta");
  const [focusTab, setFocusTab] = useState<FocusTab>("one-time");

  const { data, isLoading, error } = usePackagesFocusBreakdown(platform, startDate, endDate, { enabled: isOpen });

  useEffect(() => {
    if (!isOpen) {
      setPlatform("meta");
      setFocusTab("one-time");
    }
  }, [isOpen]);

  const summary = data?.supported ? data.summary : undefined;
  const buckets = data?.supported ? data.detail.buckets : undefined;
  const showUnclassified = (summary?.unclassified.spendCents ?? 0) > 0;

  const platformChip = (p: Platform, label: string) => (
    <button
      type="button"
      onClick={() => setPlatform(p)}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        platform === p
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent"
          : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
      }`}
    >
      {label}
    </button>
  );

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" className="!max-w-[1100px]">
      <ModalHeader
        title="Ad spend — packages focus"
        subtitle={
          data?.supported
            ? `Membership vs one-time landing URLs${rangeLabel ? ` · ${rangeLabel}` : ""} · ${
                platform === "tiktok" ? "TikTok" : "Meta"
              }-reported revenue`
            : rangeLabel
        }
        onClose={onClose}
      />
      <ModalContent padding="none">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {platformChip("meta", "Meta")}
            {platformChip("tiktok", "TikTok")}
          </div>

          {data && !data.supported && (
            <div className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
              {platform === "tiktok" ? "TikTok" : "Meta"} isn&apos;t connected in this environment — no ad
              account is configured, so there is nothing to split. This is not the same as $0 spent.
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/45 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-red-700 dark:text-red-300 text-sm">
                {error instanceof Error ? error.message : "Failed to load"}
              </span>
            </div>
          )}

          {isLoading && !data && (
            <div className="p-8 text-center">
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-gray-400 animate-spin" />
              <p className="text-gray-600 dark:text-neutral-400">Loading…</p>
            </div>
          )}

          {summary && (() => {
            // Total across all three buckets (unclassified is 0 when hidden — safe to include).
            const totalSpendCents =
              summary.membership.spendCents + summary["one-time"].spendCents + summary.unclassified.spendCents;
            return (
              <div className={`grid gap-3 ${showUnclassified ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                <SummaryTile label="Membership focus" totals={summary.membership} totalSpendCents={totalSpendCents} active={focusTab === "membership"} onClick={() => setFocusTab("membership")} />
                <SummaryTile label="One-time focus" totals={summary["one-time"]} totalSpendCents={totalSpendCents} active={focusTab === "one-time"} onClick={() => setFocusTab("one-time")} />
                {showUnclassified && (
                  <SummaryTile label="Unclassified" totals={summary.unclassified} totalSpendCents={totalSpendCents} active={focusTab === "unclassified"} onClick={() => setFocusTab("unclassified")} />
                )}
              </div>
            );
          })()}

          {data?.supported && !data.detail.complete && (
            <p className="text-2xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded px-2 py-1">
              {data.detail.availableSince
                ? `Per-campaign detail covers ${data.detail.availableSince} onwards (older per-ad data has expired); the summary tiles above cover the full selected range.`
                : "No per-ad campaign detail is available yet (no synced ad-level data); the summary tiles above still cover the full selected range."}
            </p>
          )}

          {buckets && (
            <CampaignTreeTable
              campaigns={buckets[focusTab]}
              ariaLabel={`Campaigns — ${focusTab} focus`}
              // An empty bucket has two very different causes and the reader can't tell them
              // apart from a blank table: the bucket genuinely has no spend, or the per-ad
              // detail behind it has aged out. Say which.
              emptyMessage={
                summary && summary[focusTab].spendCents > 0
                  ? `No per-ad detail retained for the ${focusTab} bucket in this range — the summary tile above still counts its $${summary[focusTab].spend.toFixed(2)}.`
                  : `No ${focusTab} spend on ${platform === "tiktok" ? "TikTok" : "Meta"} in this range.`
              }
            />
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
