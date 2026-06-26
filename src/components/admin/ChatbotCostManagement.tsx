"use client";

import React, { useState } from "react";
import {
  DollarSign,
  Zap,
  MessageSquareOff,
  AlertTriangle,
  Hash,
} from "lucide-react";
import { Card, Segmented, BarList, RevenueAreaChart } from "@/components/admin/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useChatbotCostAnalytics } from "@/hooks/queries/admin/useChatbotCostAnalytics";

// actorKind values — NOT imported from @/models/ChatAuditLog: that module is a
// Mongoose model and runtime-evaluating it in a client component crashes
// (mongoose is serverExternalPackages). Keep in sync with the actorKind enum
// in src/models/ChatAuditLog.ts.
// (used only for documentation and future filter UI; kept as a comment here)
// const ACTOR_KINDS = ["member", "anonymous"] as const;

type RangeDays = 7 | 30 | 90;

const RANGE_OPTIONS: { value: RangeDays; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return "$" + n.toFixed(2);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtPct(n: number): string {
  return n.toFixed(1) + "%";
}

function fmtMs(n: number): string {
  if (n === 0) return "—";
  if (n >= 1000) return (n / 1000).toFixed(1) + "s";
  return n + "ms";
}

export default function ChatbotCostManagement() {
  const [days, setDays] = useState<RangeDays>(30);
  const { data, isLoading, isError } = useChatbotCostAnalytics(days);

  if (isError) {
    return (
      <div className="flex items-center gap-2 p-6 text-red-600 dark:text-red-400">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="text-sm">Failed to load chatbot cost analytics.</span>
      </div>
    );
  }

  const hasData = data && data.usage.totalRequests > 0;

  // Daily cost chart data
  const chartData = data?.daily.map((r) => r.spentUsd) ?? [];
  // x-axis tick labels — MM-DD format, one per day
  const allTicks = data?.daily.map((r) => r.dayKey.slice(5)) ?? [];

  // Breakdown BarList — deflected vs LLM
  const trafficItems = data
    ? [
        {
          id: "deflected",
          label: "Deflected (FAQ / free)",
          value: data.usage.deflectedCount,
          color: "#22c55e",
          count: data.usage.deflectedCount,
          unit: "req",
        },
        {
          id: "llm",
          label: "LLM calls (paid)",
          value: data.usage.llmCount,
          color: "#f97316",
          count: data.usage.llmCount,
          unit: "req",
        },
      ]
    : [];

  // Actor breakdown
  const actorItems = data
    ? [
        {
          id: "member",
          label: "Members",
          value: data.usage.memberCount,
          color: "#6366f1",
          count: data.usage.memberCount,
          unit: "req",
        },
        {
          id: "anonymous",
          label: "Anonymous",
          value: data.usage.anonymousCount,
          color: "#94a3b8",
          count: data.usage.anonymousCount,
          unit: "req",
        },
      ]
    : [];

  return (
    <div className="space-y-6 p-1">
      {/* Range switcher */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Chatbot cost, deflection rate, and usage breakdown.
        </p>
        <Segmented<RangeDays>
          options={RANGE_OPTIONS}
          value={days}
          onChange={setDays}
        />
      </div>

      {/* Metric cards row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <MetricCard
          title="Cost today"
          value={isLoading ? "—" : fmtUsd(data?.cost.todayUsd ?? 0)}
          icon={DollarSign}
          color="yellow"
          loading={isLoading}
        />
        <MetricCard
          title="Cost (30 days)"
          value={isLoading ? "—" : fmtUsd(data?.cost.last30Usd ?? 0)}
          subtitle="rolling 30-day window"
          icon={DollarSign}
          color="yellow"
          loading={isLoading}
        />
        <MetricCard
          title="Deflection rate"
          value={isLoading ? "—" : fmtPct(data?.usage.deflectionRatePct ?? 0)}
          subtitle="answered free — no AI cost"
          icon={MessageSquareOff}
          color="emerald"
          loading={isLoading}
        />
        <MetricCard
          title="Escalations"
          value={isLoading ? "—" : String(data?.usage.escalatedCount ?? 0)}
          subtitle="handed to human support"
          icon={AlertTriangle}
          color="red"
          loading={isLoading}
        />
        <MetricCard
          title="Total tokens"
          value={
            isLoading
              ? "—"
              : fmtTokens(
                  (data?.cost.totalTokensIn ?? 0) +
                    (data?.cost.totalTokensOut ?? 0)
                )
          }
          subtitle={
            data
              ? `in: ${fmtTokens(data.cost.totalTokensIn)}  out: ${fmtTokens(data.cost.totalTokensOut)}`
              : undefined
          }
          icon={Hash}
          color="indigo"
          loading={isLoading}
        />
      </div>

      {/* No data state */}
      {!isLoading && !hasData && (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Zap className="w-8 h-8 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              No chatbot activity recorded yet.
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Data will appear here once Cobber starts handling support
              requests.
            </p>
          </div>
        </Card>
      )}

      {hasData && (
        <>
          {/* Daily cost chart */}
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-4">
              Daily spend (USD) — last {days} days
            </p>
            <RevenueAreaChart
              data={chartData}
              ticks={allTicks}
              axisLabel="USD"
              accent="#f59e0b"
              height={200}
              valueFmt={fmtUsd}
            />
          </Card>

          {/* Breakdowns row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-4">
                Request type breakdown
              </p>
              <BarList
                items={trafficItems}
                fmt={(v) => v.toLocaleString("en-AU")}
              />
              <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">
                Total:{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {data.usage.totalRequests.toLocaleString("en-AU")} requests
                </span>
                &ensp;·&ensp;avg response{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {fmtMs(data.usage.avgDurationMs)}
                </span>
              </p>
            </Card>

            <Card>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-4">
                Actor breakdown
              </p>
              <BarList
                items={actorItems}
                fmt={(v) => v.toLocaleString("en-AU")}
              />
              <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">
                LLM cost:{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {fmtUsd(data.cost.last7Usd)}
                </span>{" "}
                last 7 days ·{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {fmtUsd(data.cost.last30Usd)}
                </span>{" "}
                last 30 days
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
