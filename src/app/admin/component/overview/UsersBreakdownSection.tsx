"use client";

import React from "react";
import { Users, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Card, SectionTitle } from "@/components/admin/ui/Card";
import { BarList, type BarItem } from "@/components/admin/ui/BarList";
import { useUserMetrics } from "@/hooks/useUserMetrics";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { AGE_GROUP_ORDER } from "@/utils/metrics/age-grouping";
import type { UserMetrics } from "@/types/metrics/UserMetrics";

// ── constants ────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

/** Single accent hue used across all three bar lists. */
const BAR_COLOR = "#ee0000";

// ── helpers ──────────────────────────────────────────────────────────────────

function ageItems(data: UserMetrics["ageGroup"]): { items: BarItem[]; excludedCount: number; grandTotal: number } {
  const visibleLabels = AGE_GROUP_ORDER.filter((l) => l !== "Unknown");
  const items: BarItem[] = visibleLabels
    .map((label) => ({ id: label, label, value: data[label] ?? 0, color: BAR_COLOR }))
    .filter((item) => item.value > 0);
  const excludedCount = data["Unknown"] ?? 0;
  const grandTotal = items.reduce((s, i) => s + i.value, 0) + excludedCount;
  return { items, excludedCount, grandTotal };
}

function stateItems(data: UserMetrics["state"]): { items: BarItem[]; excludedCount: number; grandTotal: number } {
  const items: BarItem[] = Object.entries(data)
    .filter(([code]) => code !== "Unknown")
    .map(([code, count]) => ({
      id: code,
      label: STATE_LABELS[code] ? `${code} — ${STATE_LABELS[code]}` : code,
      value: count,
      color: BAR_COLOR,
    }))
    .sort((a, b) => b.value - a.value);
  const excludedCount = data["Unknown"] ?? 0;
  const grandTotal = items.reduce((s, i) => s + i.value, 0) + excludedCount;
  return { items, excludedCount, grandTotal };
}

function professionItems(data: UserMetrics["profession"]): { items: BarItem[]; excludedCount: number; grandTotal: number } {
  const items: BarItem[] = Object.entries(data)
    .filter(([name]) => name !== "Other")
    .map(([name, count]) => ({ id: name, label: name, value: count, color: BAR_COLOR }))
    .sort((a, b) => b.value - a.value);
  const excludedCount = data["Other"] ?? 0;
  const grandTotal = items.reduce((s, i) => s + i.value, 0) + excludedCount;
  return { items, excludedCount, grandTotal };
}

// ── sub-component ─────────────────────────────────────────────────────────────

function BreakdownBlock({
  heading,
  items,
  excludedLabel,
  excludedCount,
  grandTotal,
  fmt,
}: {
  heading: string;
  items: BarItem[];
  excludedLabel: string;
  excludedCount: number;
  grandTotal: number;
  fmt: (v: number) => string;
}) {
  const excludedPct = grandTotal > 0 ? ((excludedCount / grandTotal) * 100).toFixed(1) : "0.0";

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
        {heading}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">No data available.</p>
      ) : (
        <BarList items={items} fmt={fmt} />
      )}
      {excludedCount > 0 && (
        <p className="mt-2.5 text-[10px] text-neutral-400 dark:text-neutral-500">
          {excludedLabel} excluded:{" "}
          <span className="font-semibold text-neutral-600 dark:text-neutral-300 tabular-nums">
            {excludedCount.toLocaleString("en-AU")}
          </span>{" "}
          ({excludedPct}% of all)
        </p>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface UsersBreakdownSectionProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function UsersBreakdownSection({ isExpanded, onToggleExpand }: UsersBreakdownSectionProps) {
  const { data, isLoading } = useUserMetrics({ enabled: isExpanded });
  const { formatNumber } = useMetricsFormatting();

  const chevron = (
    <button
      onClick={onToggleExpand}
      aria-expanded={isExpanded}
      aria-label={isExpanded ? "Collapse users breakdown" : "Expand users breakdown"}
      className="flex items-center justify-center w-7 h-7 rounded-lg text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
    >
      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
    </button>
  );

  return (
    <Card className="p-5">
      <SectionTitle
        title="Users breakdown"
        subtitle="Age · State · Profession"
        icon={Users}
        right={chevron}
      />

      {isExpanded && isLoading && (
        <div className="flex items-center justify-center py-8 text-neutral-400 dark:text-neutral-500 text-sm gap-2">
          <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
          <span>Loading breakdown…</span>
        </div>
      )}

      {isExpanded && !isLoading && data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {(() => {
            const age = ageItems(data.ageGroup);
            const state = stateItems(data.state);
            const profession = professionItems(data.profession);
            return (
              <>
                <BreakdownBlock
                  heading="Age"
                  items={age.items}
                  excludedLabel="Unknown"
                  excludedCount={age.excludedCount}
                  grandTotal={age.grandTotal}
                  fmt={formatNumber}
                />
                <BreakdownBlock
                  heading="State"
                  items={state.items}
                  excludedLabel="Unknown"
                  excludedCount={state.excludedCount}
                  grandTotal={state.grandTotal}
                  fmt={formatNumber}
                />
                <BreakdownBlock
                  heading="Profession"
                  items={profession.items}
                  excludedLabel="Other"
                  excludedCount={profession.excludedCount}
                  grandTotal={profession.grandTotal}
                  fmt={formatNumber}
                />
              </>
            );
          })()}
        </div>
      )}

      {isExpanded && !isLoading && !data && (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center py-6">
          No breakdown data available.
        </p>
      )}
    </Card>
  );
}
