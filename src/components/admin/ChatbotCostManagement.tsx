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
  Power,
  Bot,
} from "lucide-react";
import {
  Card,
  Segmented,
  Donut,
  type DonutSegment,
  RevenueAreaChart,
  ProgressBar,
} from "@/components/admin/ui";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import { useChatbotCostAnalytics } from "@/hooks/queries/admin/useChatbotCostAnalytics";
import {
  useSetChatProvider,
  useChatbotSettings,
  useSetChatKillSwitch,
  type ChatProvider,
} from "@/hooks/queries/admin/useChatbotSettings";

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

// Provider toggle labels — kept here (presentation only); the canonical model IDs
// live in src/lib/support-chat/provider.ts.
const PROVIDER_OPTIONS: { value: ChatProvider; label: string }[] = [
  { value: "anthropic", label: "Claude Haiku" },
  { value: "google", label: "Gemini Flash-Lite" },
];

type Availability = "live" | "paused";

const AVAILABILITY_OPTIONS: { value: Availability; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
];

/**
 * A breakdown card: donut on the left, a labelled legend (count + %) on the right.
 * Replaces the old horizontal BarList — same data, clearer share-of-total read.
 */
function DonutBreakdown({
  title,
  segments,
  total,
  footer,
}: {
  title: string;
  segments: DonutSegment[];
  total: number;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-4">
        {title}
      </p>
      <div className="flex items-center gap-5">
        <Donut
          segments={segments}
          size={148}
          centerLabel={total.toLocaleString("en-AU")}
          centerSub="requests"
        />
        <ul className="flex-1 min-w-0 space-y-2.5">
          {segments.map((s) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
            return (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-neutral-600 dark:text-neutral-300 truncate">
                  {s.label}
                </span>
                <span className="ml-auto tabular-nums font-semibold text-neutral-800 dark:text-neutral-100">
                  {s.value.toLocaleString("en-AU")}
                </span>
                <span className="tabular-nums text-xs text-neutral-400 dark:text-neutral-500 w-9 text-right">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {footer && <div className="mt-4">{footer}</div>}
    </Card>
  );
}

export default function ChatbotCostManagement() {
  const [days, setDays] = useState<RangeDays>(30);
  const { data, isLoading, isError } = useChatbotCostAnalytics(days);
  const setProvider = useSetChatProvider();

  // Cobber availability (pause) — DB-backed admin toggle, OR'd with the env
  // break-glass. When paused: bubble hidden site-wide + generative path blocked.
  const { data: settings, isLoading: settingsLoading } = useChatbotSettings();
  const setKill = useSetChatKillSwitch();
  const envForced = settings?.killSwitchEnvForced ?? false;
  const effectivePaused = envForced || (settings?.killSwitch ?? false);
  const displayedAvailability: Availability =
    setKill.isPending && setKill.variables !== undefined
      ? setKill.variables
        ? "paused"
        : "live"
      : effectivePaused
        ? "paused"
        : "live";

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

  // Breakdown donut segments — deflected (free) vs LLM (paid)
  const trafficSegments: DonutSegment[] = data
    ? [
        {
          id: "deflected",
          label: "Deflected (FAQ / free)",
          value: data.usage.deflectedCount,
          color: "#22c55e",
          count: data.usage.deflectedCount,
        },
        {
          id: "llm",
          label: "LLM calls (paid)",
          value: data.usage.llmCount,
          color: "#f97316",
          count: data.usage.llmCount,
        },
      ]
    : [];

  // Actor breakdown segments
  const actorSegments: DonutSegment[] = data
    ? [
        {
          id: "member",
          label: "Members",
          value: data.usage.memberCount,
          color: "#6366f1",
          count: data.usage.memberCount,
        },
        {
          id: "anonymous",
          label: "Anonymous",
          value: data.usage.anonymousCount,
          color: "#94a3b8",
          count: data.usage.anonymousCount,
        },
      ]
    : [];

  // ── Derived values ─────────────────────────────────────────────────────────

  const config = data?.config;
  const cost = data?.cost;
  const usage = data?.usage;

  // Active provider — show the value we're switching TO while the PATCH is in
  // flight (optimistic), otherwise the server truth from config.
  const activeProvider: ChatProvider = config?.activeProvider ?? "anthropic";
  const displayedProvider: ChatProvider =
    setProvider.isPending && setProvider.variables
      ? setProvider.variables
      : activeProvider;

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

      {/* ── Cobber availability (pause) ──────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <Power className="w-3.5 h-3.5 shrink-0" />
              Cobber availability
              {effectivePaused && (
                <span className="ml-1 inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 text-[10px] font-bold">
                  Paused
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500 max-w-prose">
              Paused hides the chat bubble across the site and stops all AI
              answers. Free FAQ replies and the daily budget are unaffected.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {setKill.isPending && (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                Updating…
              </span>
            )}
            <div
              className={
                setKill.isPending || settingsLoading || envForced
                  ? "pointer-events-none opacity-60"
                  : ""
              }
            >
              <Segmented<Availability>
                options={AVAILABILITY_OPTIONS}
                value={displayedAvailability}
                onChange={(v) => {
                  const nextPaused = v === "paused";
                  if (nextPaused !== effectivePaused) setKill.mutate(nextPaused);
                }}
                size="sm"
              />
            </div>
          </div>
        </div>
        {envForced && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Forced off by the{" "}
            <code className="font-mono">CHAT_KILL_SWITCH</code> env override —
            clear it in your host env to use this toggle.
          </p>
        )}
        {setKill.isError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Couldn’t update Cobber’s availability. Please try again.
          </p>
        )}
      </Card>

      {/* ── Budget status panel ──────────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Budget status — today
          </p>
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

      {/* ── AI model provider toggle ─────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <Bot className="w-3.5 h-3.5 shrink-0" />
              AI model provider
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              Switches the live model for new chats. Deflected FAQ answers stay
              free on either provider.
              {config && (
                <>
                  {" "}
                  Current model:{" "}
                  <span className="font-medium text-neutral-600 dark:text-neutral-300">
                    {config.model}
                  </span>
                  .
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {setProvider.isPending && (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                Switching…
              </span>
            )}
            <div
              className={
                setProvider.isPending || isLoading
                  ? "pointer-events-none opacity-60"
                  : ""
              }
            >
              <Segmented<ChatProvider>
                options={PROVIDER_OPTIONS}
                value={displayedProvider}
                onChange={(v) => {
                  if (v !== activeProvider) setProvider.mutate(v);
                }}
                size="sm"
              />
            </div>
          </div>
        </div>
        {setProvider.isError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Couldn’t switch provider. Please try again.
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
        <Card className="p-4">
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
          <Card className="p-4">
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
            <DonutBreakdown
              title="Request type breakdown"
              segments={trafficSegments}
              total={data.usage.totalRequests}
              footer={
                <>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
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
                  {/* Unit economics */}
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
                </>
              }
            />

            <DonutBreakdown
              title="Actor breakdown"
              segments={actorSegments}
              total={data.usage.totalRequests}
            />
          </div>

          {/* ── Config strip ──────────────────────────────────────────────────── */}
          {config && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800">
              <Settings className="w-3.5 h-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
              <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                Daily budget:{" "}
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
