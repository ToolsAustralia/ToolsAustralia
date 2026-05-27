"use client";
import React, { useEffect, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

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

/**
 * Renders the shared filter controls used by BOTH the desktop inline row and
 * the mobile drawer. Extracted so the two layouts can never drift — adding a
 * new filter automatically appears in both.
 *
 * `layout="row"` is the existing horizontal chip row for desktop (md+).
 * `layout="stack"` arranges each filter group as a vertical section with a
 * heading, which is what fits a slide-out drawer.
 */
function FilterControls(props: Props & { layout: "row" | "stack" }) {
  const isStack = props.layout === "stack";

  // Stacked layout: each filter group is its own section with a heading
  if (isStack) {
    return (
      <div className="flex flex-col gap-5">
        <Section heading="Metric">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(METRIC_LABELS) as MetricChoice[]).map((m) => (
              <button
                key={m}
                onClick={() => props.onMetricChange(m)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${props.metric === m ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </Section>

        <Section heading="Verdict">
          <div className="flex flex-wrap gap-1.5">
            {["scale", "hold", "investigate", "cut"].map((v) => (
              <button
                key={v}
                onClick={() => props.onVerdictFilterChange(toggleInArray(props.verdictFilter, v))}
                className={`px-2 py-1 rounded-full border text-[10px] capitalize ${props.verdictFilter.includes(v) ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
              >
                {v}
              </button>
            ))}
          </div>
        </Section>

        <Section heading="Delivery">
          <button
            onClick={() => props.onLiveOnlyChange(!props.liveOnly)}
            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${props.liveOnly ? "bg-emerald-600 text-white border-emerald-600" : "border-zinc-300 dark:border-zinc-700"}`}
          >
            Live only
          </button>
          <p className="text-[10px] text-zinc-500 mt-1.5">Hide paused, archived, deleted, or in-review ad sets.</p>
        </Section>

        <Section heading="Learning">
          <div className="flex flex-wrap gap-1.5">
            {(["Active", "Learning", "LearningLimited", "Unknown"] as const).map((s) => (
              <button
                key={s}
                onClick={() => props.onLearningStatusFilterChange(toggleInArray(props.learningStatusFilter, s))}
                className={`px-2 py-1 rounded-full border text-[10px] ${props.learningStatusFilter.includes(s) ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </Section>

        <Section heading="Min spend ($)">
          <input
            type="number"
            value={props.minSpend}
            onChange={(e) => props.onMinSpendChange(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-28 px-2 py-1 border rounded text-xs bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700"
            placeholder="0"
          />
        </Section>

        <Section heading="Search">
          <div className="flex items-center border rounded px-2 py-1 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700">
            <Search size={12} className="text-zinc-400" />
            <input
              value={props.search}
              onChange={(e) => props.onSearchChange(e.target.value)}
              placeholder="Search name..."
              className="ml-1.5 w-full bg-transparent text-xs outline-none"
            />
          </div>
        </Section>
      </div>
    );
  }

  // Row layout (desktop inline) — preserved verbatim from previous version
  return (
    <div className="flex flex-wrap gap-2 items-center text-xs">
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

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">{heading}</div>
      {children}
    </div>
  );
}

function activeFilterCount(p: Props): number {
  return (
    p.verdictFilter.length +
    p.learningStatusFilter.length +
    (p.liveOnly ? 1 : 0) +
    (p.minSpend !== "" && p.minSpend !== 0 ? 1 : 0) +
    p.campaignFilter.length +
    (p.search.trim() ? 1 : 0)
  );
}

export function FacebookAdsHealthFilters(props: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const count = activeFilterCount(props);

  // Lock body scroll + close on Esc — the standard drawer/modal contract.
  // Without these the page jumps when the drawer opens (body scroll bleeds
  // through) and there's no keyboard escape hatch.
  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  return (
    <>
      {/* Mobile: compact trigger row — Filters button + active-count badge + Settings.
          Hidden on md+ where the full inline row makes sense. */}
      <div className="md:hidden flex items-center gap-2 mb-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium"
        >
          <SlidersHorizontal size={13} />
          <span>Filters</span>
          {count > 0 && (
            <span className="bg-blue-600 text-white rounded-full px-1.5 py-0.5 text-[9px] leading-none font-bold">{count}</span>
          )}
        </button>
        <div className="flex items-center border rounded px-2 py-1 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 flex-1 min-w-0">
          <Search size={12} className="text-zinc-400 shrink-0" />
          <input
            value={props.search}
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder="Search name..."
            className="ml-1.5 w-full bg-transparent text-xs outline-none"
          />
        </div>
        <button
          onClick={props.onOpenSettings}
          className="p-1.5 rounded border border-zinc-300 dark:border-zinc-700"
          aria-label="Settings"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {/* Desktop: existing full inline row, unchanged behaviour */}
      <div className="hidden md:block mb-3">
        <FilterControls {...props} layout="row" />
      </div>

      {/* Mobile drawer — slides in from right. Backdrop closes on click, body scroll
          locked while open, Esc closes. z-50 sits above sticky toolbars (z-30) and
          child sticky (z-20). */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div
            className="fixed top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-zinc-900 z-50 md:hidden shadow-2xl flex flex-col"
            role="dialog"
            aria-label="Filters"
            aria-modal="true"
          >
            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 flex items-center justify-between">
              <div className="font-semibold text-sm">
                Filters
                {count > 0 && (
                  <span className="ml-2 bg-blue-600 text-white rounded-full px-1.5 py-0.5 text-[9px] leading-none font-bold align-middle">
                    {count}
                  </span>
                )}
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 p-1"
                aria-label="Close filters"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <FilterControls {...props} layout="stack" />
            </div>
          </div>
        </>
      )}
    </>
  );
}
