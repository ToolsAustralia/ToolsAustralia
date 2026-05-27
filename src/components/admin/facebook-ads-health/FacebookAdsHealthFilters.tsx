"use client";
import React from "react";
import { Search, SlidersHorizontal } from "lucide-react";

export type MetricChoice = "spend" | "conversions" | "revenue" | "roas" | "linkClicks" | "linkCtr" | "costPerLinkClick";

const METRIC_LABELS: Record<MetricChoice, string> = {
  spend: "Spend",
  conversions: "Conv",
  revenue: "Revenue",
  roas: "ROAS",
  linkClicks: "Link Clicks",
  linkCtr: "Link CTR",
  costPerLinkClick: "Cost/Link Click",
};

interface Props {
  metric: MetricChoice;
  onMetricChange: (m: MetricChoice) => void;
  verdictFilter: string[];
  onVerdictFilterChange: (v: string[]) => void;
  learningStatusFilter: string[];
  onLearningStatusFilterChange: (v: string[]) => void;
  liveOnly: boolean;
  onLiveOnlyChange: (v: boolean) => void;
  minSpend: number | "";
  onMinSpendChange: (n: number | "") => void;
  campaignFilter: string[];
  campaignOptions: Array<{ id: string; name: string }>;
  onCampaignFilterChange: (v: string[]) => void;
  search: string;
  onSearchChange: (s: string) => void;
  onOpenSettings: () => void;
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

export function FacebookAdsHealthFilters(props: Props) {
  return (
    <div className="flex flex-wrap gap-2 items-center text-xs mb-3">
      <span className="text-zinc-500">Metric:</span>
      {(Object.keys(METRIC_LABELS) as MetricChoice[]).map((m) => (
        <button
          key={m}
          onClick={() => props.onMetricChange(m)}
          className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${props.metric === m ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
        >
          {METRIC_LABELS[m]}
        </button>
      ))}
      <span className="text-zinc-300 dark:text-zinc-700">|</span>
      <span className="text-zinc-500">Verdict:</span>
      {["scale", "hold", "investigate", "cut"].map((v) => (
        <button
          key={v}
          onClick={() => props.onVerdictFilterChange(toggleInArray(props.verdictFilter, v))}
          className={`px-2 py-1 rounded-full border text-[10px] ${props.verdictFilter.includes(v) ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
        >
          {v}
        </button>
      ))}
      <span className="text-zinc-300 dark:text-zinc-700">|</span>
      <button
        onClick={() => props.onLiveOnlyChange(!props.liveOnly)}
        title="Hide paused, archived, deleted, or in-review ad sets — show only ad sets currently delivering."
        className={`px-2 py-1 rounded-full border text-[10px] font-semibold ${props.liveOnly ? "bg-emerald-600 text-white border-emerald-600" : "border-zinc-300 dark:border-zinc-700"}`}
      >
        Live only
      </button>
      <span className="text-zinc-300 dark:text-zinc-700">|</span>
      <span className="text-zinc-500">Learning:</span>
      {(["Active", "Learning", "LearningLimited", "Unknown"] as const).map((s) => (
        <button
          key={s}
          onClick={() => props.onLearningStatusFilterChange(toggleInArray(props.learningStatusFilter, s))}
          className={`px-2 py-1 rounded-full border text-[10px] ${props.learningStatusFilter.includes(s) ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
        >
          {s}
        </button>
      ))}
      <span className="text-zinc-300 dark:text-zinc-700">|</span>
      <label className="text-zinc-500">
        Spend ≥ $
        <input
          type="number"
          value={props.minSpend}
          onChange={(e) => props.onMinSpendChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="ml-1 w-16 px-1 py-0.5 border rounded text-[11px] bg-white dark:bg-zinc-800"
        />
      </label>
      <div className="flex items-center border rounded px-1.5 py-0.5 bg-white dark:bg-zinc-800">
        <Search size={11} className="text-zinc-400" />
        <input
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
          placeholder="Search name..."
          className="ml-1 w-32 bg-transparent text-[11px] outline-none"
        />
      </div>
      <button onClick={props.onOpenSettings} className="ml-auto p-1.5 rounded border border-zinc-300 dark:border-zinc-700">
        <SlidersHorizontal size={14} />
      </button>
    </div>
  );
}
