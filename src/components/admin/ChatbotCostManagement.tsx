"use client";

import React, { useState } from "react";
import {
  DollarSign,
  Zap,
  MessageSquareOff,
  AlertTriangle,
  Hash,
  TrendingDown,
  Settings,
  ShieldOff,
} from "lucide-react";
import {
  Card,
  Segmented,
  BarList,
  RevenueAreaChart,
  ProgressBar,
} from "@/components/admin/ui";
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

  // ── Derived values ─────────────────────────────────────────────────────────

  const config = data?.config;
  const cost = data?.cost;
  const usage = data?.usage;

  // Budget status
  const budgetPct =
    config && cost
      ? config.dailyBudgetUsd > 0
        ? (cost.todayUsd / config.dailyBudgetUsd) * 100
        : 0
      : 0;

  // Projected monthly spend: prefer last-7-day rate if days >= 7, else last-30
  const projectedMonthlyUsd =
    cost
      ? days >= 7
        ? (cost.last7Usd / 7) * 30
        : cost.last30Usd
      : null;

  // Unit economics
  const llmCount = usage?.llmCount ?? 0;
  const last30Usd = cost?.last30Usd ?? 0;
  const avgCostPerLlmAnswer = llmCount > 0 ? last30Usd / llmCount : 0;

  const deflectedCount = usage?.deflectedCount ?? 0;
  const estSaved = deflectedCount * avgCostPerLlmAnswer;

  const conversationsCount = usage?.conversationsCount ?? 0;
  const costPerConversation =
    conversationsCount > 0 ? last30Usd / conversationsCount : 0;

  // Actor pct for footer
  const totalRequests = usage?.totalRequests ?? 0;
  const memberPct =
    totalRequests > 0
      ? Math.round(((usage?.memberCount ?? 0) / totalRequests) * 100)
      : 0;
  const anonPct = totalRequests > 0 ? 100 - memberPct : 0;

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

      {/* ── Budget status panel ──────────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Budget status — today
          </p>
          {config?.killSwitch && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2.5 py-1 text-xs font-semibold">
              <ShieldOff className="w-3.5 h-3.5" />
              KILL SWITCH ON — generative bot disabled
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-2 mb-1.5">
          <span className="text-sm text-neutral-700 dark:text-neutral-200 font-medium">
            {isLoading ? "—" : fmtUsd(cost?.todayUsd ?? 0)}
            <span className="text-neutral-400 dark:text-neutral-500 font-normal">
              {" "}
              / {isLoading ? "…" : fmtUsd(config?.dailyBudgetUsd ?? 0)} daily
              cap
            </span>
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
            {isLoading ? "—" : fmtPct(budgetPct)} used
          </span>
        </div>
        <ProgressBar pct={isLoading ? 0 : budgetPct} />
        {projectedMonthlyUsd !== null && !isLoading && (
          <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
            Projected{" "}
            <span className="font-semibold text-neutral-700 dark:text-neutral-200">
              {fmtUsd(projectedMonthlyUsd)}
            </span>
            /mo at current rate
          </p>
        )}
      </Card>

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
          {/* ── Saved by deflection card ───────────────────────────────────── */}
          <MetricCard
            title="Saved by deflection"
            value={
              isLoading
                ? "—"
                : llmCount > 0
                  ? `~${fmtUsd(estSaved)}`
                  : "$0.00"
            }
            subtitle="est. vs answering everything with AI (last 30 days)"
            icon={TrendingDown}
            color="emerald"
            loading={isLoading}
          />

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
                {conversationsCount > 0 && (
                  <>
                    &ensp;·&ensp;
                    <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                      {conversationsCount.toLocaleString("en-AU")}
                    </span>{" "}
                    conversations
                  </>
                )}
                &ensp;·&ensp;avg response{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {fmtMs(data.usage.avgDurationMs)}
                </span>
              </p>
              {/* Unit economics footer */}
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                Cost / AI answer:{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {llmCount > 0 ? fmtUsd(avgCostPerLlmAnswer) : "—"}
                </span>
                {conversationsCount > 0 && (
                  <>
                    &ensp;·&ensp;Cost / conversation:{" "}
                    <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                      {fmtUsd(costPerConversation)}
                    </span>
                  </>
                )}
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
                Members:{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {memberPct}%
                </span>
                &ensp;·&ensp;Anonymous:{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {anonPct}%
                </span>{" "}
                of requests
              </p>
            </Card>
          </div>

          {/* ── Config strip ──────────────────────────────────────────────────── */}
          {config && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800">
              <Settings className="w-3.5 h-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
              <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                Model:{" "}
                <span className="font-medium text-neutral-600 dark:text-neutral-300">
                  {config.model}
                </span>
                &ensp;·&ensp;Daily budget:{" "}
                <span className="font-medium text-neutral-600 dark:text-neutral-300">
                  {fmtUsd(config.dailyBudgetUsd)}
                </span>
                &ensp;·&ensp;Limit:{" "}
                <span className="font-medium text-neutral-600 dark:text-neutral-300">
                  {config.generativeLimitMax} AI answers /{" "}
                  {config.generativeLimitWindowSeconds / 60} min per user
                </span>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
