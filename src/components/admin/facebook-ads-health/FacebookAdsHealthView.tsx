"use client";
import React, { useMemo, useState } from "react";
import { useFacebookAdsHealth, useFacebookAdsHealthSettings } from "@/hooks/queries/admin/useFacebookAdsHealth";
import { FacebookAdsHealthTopBar } from "./FacebookAdsHealthTopBar";
import { FacebookAdsHealthFilters, type MetricChoice } from "./FacebookAdsHealthFilters";
import { FacebookAdsHealthPivotTable } from "./FacebookAdsHealthPivotTable";
import { FacebookAdsHealthFlatTable } from "./FacebookAdsHealthFlatTable";
import { FacebookAdsHealthMobileCards } from "./FacebookAdsHealthMobileCards";
import { FacebookAdsHealthSettingsModal } from "./FacebookAdsHealthSettingsModal";

interface Props {
  startDate: string;
  endDate: string;
  /**
   * Mirrors the legacy Ads view's level switcher (Account/Campaign/Adset/Ad).
   * The verdict engine is per-row, so any level except Account is meaningful.
   * Account rolls up everything into a single row, so we coerce it to "adset"
   * (the most useful default) — the dropdown stays visible for parity with
   * the legacy view but Account silently falls back.
   */
  level: "account" | "campaign" | "adset" | "ad";
}

export function FacebookAdsHealthView({ startDate, endDate, level }: Props) {
  const effectiveLevel: "campaign" | "adset" | "ad" =
    level === "account" ? "adset" : level;
  const [metric, setMetric] = useState<MetricChoice>("conversions");
  const [verdictFilter, setVerdictFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  // Live-only is a single boolean rather than yet another multi-select chip
  // because the common ad-manager workflow is "hide everything that isn't
  // actually spending money right now." Anything other than ACTIVE → filtered.
  const [liveOnly, setLiveOnly] = useState(false);
  const [minSpend, setMinSpend] = useState<number | "">("");
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data, isLoading, isError } = useFacebookAdsHealth({
    startDate,
    endDate,
    level: effectiveLevel,
    // campaign filter moved client-side — see displayedRows below. Hooking
    // campaign into the queryKey collapsed the campaign list to the current
    // selection (you couldn't switch campaigns without clearing first).
  });

  // Settings power the threshold-based cell colouring:
  //   - ROAS cells green/red vs breakevenRoas
  //   - Spend cells flagged amber when day-over-day climb > spendIncreaseAlertPct
  // Both fall back to sane defaults when settings haven't loaded yet.
  // Response shape: { success, settings: FacebookAdsHealthSettingsValues }.
  const { data: settingsData } = useFacebookAdsHealthSettings();
  const settingsValues =
    (settingsData as { settings?: { breakevenRoas?: number; spendIncreaseAlertPct?: number } } | undefined)?.settings;
  const breakevenRoas: number = settingsValues?.breakevenRoas ?? 1.0;
  const spendIncreaseAlertPct: number = settingsValues?.spendIncreaseAlertPct ?? 20;

  const campaignOptions = useMemo(() => {
    const m = new Map<string, string>();
    (data?.rows ?? []).forEach((r: { campaignId: string; campaignName: string }) => m.set(r.campaignId, r.campaignName));
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [data]);

  // Client-side filtering — verdict/status/spend/search never hit the server so filter toggles are instant
  // and the TanStack Query cache for the unfiltered row set is preserved across filter changes.
  const displayedRows = useMemo(() => {
    if (!data?.rows) return [];
    const verdictSet = verdictFilter.length ? new Set(verdictFilter) : null;
    const statusSet = statusFilter.length ? new Set(statusFilter) : null;
    const minSpendCents = minSpend === "" ? null : minSpend * 100;
    const searchLower = search.trim().toLowerCase();
    const campaignSet = campaignFilter.length ? new Set(campaignFilter) : null;
    return data.rows.filter((row: { verdict: string; learningStatus: string; effectiveStatus: string; campaignId: string; window: { spendCents: number }; name: string }) => {
      if (verdictSet && !verdictSet.has(row.verdict)) return false;
      if (statusSet && !statusSet.has(row.learningStatus)) return false;
      if (liveOnly && row.effectiveStatus !== "ACTIVE") return false;
      if (campaignSet && !campaignSet.has(row.campaignId)) return false;
      if (minSpendCents !== null && row.window.spendCents < minSpendCents) return false;
      if (searchLower && !row.name.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [data?.rows, verdictFilter, statusFilter, liveOnly, campaignFilter, minSpend, search]);

  // Recompute alert count from the filtered visible rows so the banner reflects what's in the table.
  const filteredAlertCount = useMemo(() => {
    let investigate = 0;
    let cut = 0;
    for (const r of displayedRows) {
      if ((r as { verdict: string }).verdict === "investigate") investigate++;
      if ((r as { verdict: string }).verdict === "cut") cut++;
    }
    return { investigate, cut };
  }, [displayedRows]);

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (isError) return <div className="p-6 text-sm text-red-600">Failed to load.</div>;

  return (
    <div>
      {/* Sticky pinned flush below the parent toolbar so users can toggle filters
          without scrolling back to the top. The `top` is driven by --fb-toolbar-h,
          a CSS var set on document.documentElement by FacebookAdsManagement's
          ResizeObserver — guarantees zero gap and zero overlap at any breakpoint or
          when the toolbar wraps. Fallback 60px covers SSR / pre-mount paint. z-20
          sits under the parent toolbar (z-30) so the two snap together cleanly. */}
      <div
        className="sticky z-20 pt-2 pb-2 bg-gray-50/95 dark:bg-neutral-950/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 supports-[backdrop-filter]:dark:bg-neutral-950/80 border-b border-gray-200 dark:border-neutral-800"
        style={{ top: "var(--fb-toolbar-h, 60px)" }}
      >
        <FacebookAdsHealthTopBar
          alertCount={filteredAlertCount}
          onShowAlertedOnly={() => setVerdictFilter(["cut", "investigate"])}
        />
        <FacebookAdsHealthFilters
          metric={metric}
          onMetricChange={setMetric}
          verdictFilter={verdictFilter}
          onVerdictFilterChange={setVerdictFilter}
          learningStatusFilter={statusFilter}
          onLearningStatusFilterChange={setStatusFilter}
          liveOnly={liveOnly}
          onLiveOnlyChange={setLiveOnly}
          minSpend={minSpend}
          onMinSpendChange={setMinSpend}
          campaignFilter={campaignFilter}
          campaignOptions={campaignOptions}
          onCampaignFilterChange={setCampaignFilter}
          search={search}
          onSearchChange={setSearch}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
      <div className="hidden md:block">
        {startDate === endDate ? (
          <FacebookAdsHealthFlatTable rows={displayedRows} level={effectiveLevel} />
        ) : (
          <FacebookAdsHealthPivotTable
            rows={displayedRows}
            metric={metric}
            startDate={startDate}
            endDate={endDate}
            level={effectiveLevel}
            breakevenRoas={breakevenRoas}
            spendIncreaseAlertPct={spendIncreaseAlertPct}
          />
        )}
      </div>
      <div className="md:hidden">
        <FacebookAdsHealthMobileCards
          rows={displayedRows}
          level={effectiveLevel}
          metric={metric}
          breakevenRoas={breakevenRoas}
          spendIncreaseAlertPct={spendIncreaseAlertPct}
        />
      </div>
      <FacebookAdsHealthSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
