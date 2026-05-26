"use client";
import React, { useMemo, useState } from "react";
import { useFacebookAdsHealth } from "@/hooks/queries/admin/useFacebookAdsHealth";
import { FacebookAdsHealthTopBar } from "./FacebookAdsHealthTopBar";
import { FacebookAdsHealthFilters, type MetricChoice } from "./FacebookAdsHealthFilters";
import { FacebookAdsHealthPivotTable } from "./FacebookAdsHealthPivotTable";
import { FacebookAdsHealthMobileCards } from "./FacebookAdsHealthMobileCards";
import { FacebookAdsHealthSettingsModal } from "./FacebookAdsHealthSettingsModal";

interface Props {
  startDate: string;
  endDate: string;
}

export function FacebookAdsHealthView({ startDate, endDate }: Props) {
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
    level: "adset",
    verdict: verdictFilter.length ? verdictFilter : undefined,
    learningStatus: statusFilter.length ? statusFilter : undefined,
    minSpend: minSpend === "" ? undefined : minSpend,
    campaign: campaignFilter.length ? campaignFilter : undefined,
    search: search || undefined,
  });

  const campaignOptions = useMemo(() => {
    const m = new Map<string, string>();
    (data?.rows ?? []).forEach((r: { campaignId: string; campaignName: string }) => m.set(r.campaignId, r.campaignName));
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [data]);

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (isError) return <div className="p-6 text-sm text-red-600">Failed to load.</div>;

  return (
    <div className="p-4">
      <FacebookAdsHealthTopBar
        alertCount={data?.alertCount ?? { investigate: 0, cut: 0 }}
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
        <FacebookAdsHealthPivotTable rows={data?.rows ?? []} metric={metric} />
      </div>
      <div className="md:hidden">
        <FacebookAdsHealthMobileCards rows={data?.rows ?? []} />
      </div>
      <FacebookAdsHealthSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
