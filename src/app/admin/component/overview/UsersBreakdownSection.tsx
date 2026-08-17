"use client";

import React from "react";
import { Users, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Card, SectionTitle } from "@/components/admin/ui/Card";
import { BarList, type BarItem } from "@/components/admin/ui/BarList";
import { useUserMetrics } from "@/hooks/useUserMetrics";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { AGE_GROUP_ORDER } from "@/utils/metrics/age-grouping";
import { GENDER_BUCKET_ORDER } from "@/data/genders";
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

/**
 * Every block here reports an `answered` denominator alongside its bars.
 *
 * These four breakdowns are driven by OPTIONAL profile fields, so a member who never finished
 * profile setup contributes nothing to them. Showing bars without saying how many members
 * actually answered invites reading a 12-person bar as 12/927 when it is really 12/186.
 *
 * The bars are therefore scoped to members who answered, and the block states the denominator.
 * The endpoint's OTHER numbers (signup source, membership status, per-package, revenue) still
 * count every member — filtering those to "profiled" members would drop active paying customers
 * out of the active count and make this page disagree with the rest of the dashboard.
 */
type BlockData = { items: BarItem[]; excludedCount: number; grandTotal: number; answered: number };

function ageItems(data: UserMetrics["ageGroup"]): BlockData {
  const visibleLabels = AGE_GROUP_ORDER.filter((l) => l !== "Unknown");
  const items: BarItem[] = visibleLabels
    .map((label) => ({ id: label, label, value: data[label] ?? 0, color: BAR_COLOR }))
    .filter((item) => item.value > 0);
  const excludedCount = data["Unknown"] ?? 0;
  const grandTotal = items.reduce((s, i) => s + i.value, 0) + excludedCount;
  // "Unknown" here means no birthdate on record — i.e. not answered.
  return { items, excludedCount, grandTotal, answered: grandTotal - excludedCount };
}

function stateItems(data: UserMetrics["state"]): BlockData {
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
  return { items, excludedCount, grandTotal, answered: grandTotal - excludedCount };
}

function professionItems(data: UserMetrics["profession"]): BlockData {
  const items: BarItem[] = Object.entries(data)
    .filter(([name]) => name !== "Other")
    .map(([name, count]) => ({ id: name, label: name, value: count, color: BAR_COLOR }))
    .sort((a, b) => b.value - a.value);
  const excludedCount = data["Other"] ?? 0;
  const grandTotal = items.reduce((s, i) => s + i.value, 0) + excludedCount;
  // NOTE: unlike age/state, profession's excluded bucket ("Other") IS an answer — it is the
  // long-tail bucket from bucketUnmatched(). Members with no profession are dropped by the
  // service entirely, so `grandTotal` here is already the answered population.
  return { items, excludedCount, grandTotal, answered: grandTotal };
}

function genderItems(data: UserMetrics["gender"]): BlockData {
  const items: BarItem[] = GENDER_BUCKET_ORDER.filter((label) => label !== "Not set")
    .map((label) => ({ id: label, label, value: data[label] ?? 0, color: BAR_COLOR }))
    .filter((item) => item.value > 0);
  // "Not set" conflates "declined" with "never asked" — the field is optional and there is no
  // opt-out option, so it must never be presented as a gender.
  const excludedCount = data["Not set"] ?? 0;
  const grandTotal = items.reduce((s, i) => s + i.value, 0) + excludedCount;
  return { items, excludedCount, grandTotal, answered: grandTotal - excludedCount };
}

// ── sub-component ─────────────────────────────────────────────────────────────

function BreakdownBlock({
  heading,
  items,
  excludedLabel,
  excludedCount,
  grandTotal,
  answered,
  totalUsers,
  fmt,
}: {
  heading: string;
  items: BarItem[];
  excludedLabel: string;
  excludedCount: number;
  grandTotal: number;
  answered: number;
  totalUsers: number;
  fmt: (v: number) => string;
}) {
  const excludedPct = grandTotal > 0 ? ((excludedCount / grandTotal) * 100).toFixed(1) : "0.0";
  const answeredPct = totalUsers > 0 ? ((answered / totalUsers) * 100).toFixed(0) : "0";

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
        {heading}
      </p>
      {/* The denominator, stated up front — these bars cover only members who answered. */}
      <p className="mb-3 text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
        {answered.toLocaleString("en-AU")} of {totalUsers.toLocaleString("en-AU")} answered ({answeredPct}%)
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
        subtitle="Age · State · Profession · Gender"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {(() => {
            // Same definition the API's `meta.totalUsers` uses, so the denominator here matches
            // what the endpoint reports rather than being a second, subtly different total.
            const totalUsers = Object.values(data.signupSource).reduce((s, n) => s + n, 0);
            const age = ageItems(data.ageGroup);
            const state = stateItems(data.state);
            const profession = professionItems(data.profession);
            const gender = genderItems(data.gender);
            return (
              <>
                <BreakdownBlock
                  heading="Age"
                  items={age.items}
                  excludedLabel="Unknown"
                  excludedCount={age.excludedCount}
                  grandTotal={age.grandTotal}
                  answered={age.answered}
                  totalUsers={totalUsers}
                  fmt={formatNumber}
                />
                <BreakdownBlock
                  heading="State"
                  items={state.items}
                  excludedLabel="Unknown"
                  excludedCount={state.excludedCount}
                  grandTotal={state.grandTotal}
                  answered={state.answered}
                  totalUsers={totalUsers}
                  fmt={formatNumber}
                />
                <BreakdownBlock
                  heading="Profession"
                  items={profession.items}
                  excludedLabel="Other"
                  excludedCount={profession.excludedCount}
                  grandTotal={profession.grandTotal}
                  answered={profession.answered}
                  totalUsers={totalUsers}
                  fmt={formatNumber}
                />
                <BreakdownBlock
                  heading="Gender"
                  items={gender.items}
                  excludedLabel="Not set"
                  excludedCount={gender.excludedCount}
                  grandTotal={gender.grandTotal}
                  answered={gender.answered}
                  totalUsers={totalUsers}
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
