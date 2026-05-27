"use client";
import React, { useMemo, useState } from "react";
import { useFacebookAdsHealth } from "@/hooks/queries/admin/useFacebookAdsHealth";
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
  const [minSpend, setMinSpend] = useState<number | "">("");
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data, isLoading, isError } = useFacebookAdsHealth({
    startDate,
    endDate,
    level: effectiveLevel,
    campaign: campaignFilter.length ? campaignFilter : undefined,
  });

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
    return data.rows.filter((row: { verdict: string; learningStatus: string; window: { spendCents: number }; name: string }) => {
      if (verdictSet && !verdictSet.has(row.verdict)) return false;
      if (statusSet && !statusSet.has(row.learningStatus)) return false;
      if (minSpendCents !== null && row.window.spendCents < minSpendCents) return false;
      if (searchLower && !row.name.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [data?.rows, verdictFilter, statusFilter, minSpend, search]);

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
        minSpend={minSpend}
        onMinSpendChange={setMinSpend}
        campaignFilter={campaignFilter}
        campaignOptions={campaignOptions}
        onCampaignFilterChange={setCampaignFilter}
        search={search}
        onSearchChange={setSearch}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="hidden md:block">
        {startDate === endDate ? (
          <FacebookAdsHealthFlatTable rows={displayedRows} />
        ) : (
          <FacebookAdsHealthPivotTable rows={displayedRows} metric={metric} />
        )}
      </div>
      <div className="md:hidden">
        <FacebookAdsHealthMobileCards rows={displayedRows} />
      </div>
      <FacebookAdsHealthSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
