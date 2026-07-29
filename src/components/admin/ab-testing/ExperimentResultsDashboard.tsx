"use client";

import React, { useState } from "react";
import { BarChart3, Target, Award, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/utils/cn";
import { isNonConversionSentinelExperiment } from "@/lib/ab-testing/non-conversion-sentinels";

interface ExperimentResultsDashboardProps {
  experimentId: string;
  /**
   * The experiment's slug targets, so the dashboard can tell a sentinel experiment from a
   * normal one. Optional: when omitted the dashboard renders exactly as before.
   */
  slugTargets?: string[];
}

interface StatisticalResults {
  significant?: boolean;
  pValue?: number | null;
  confidence?: number | null;
  lift?: number | null;
  controlRate?: number;
  variantRate?: number;
  controlInterval?: { lower: number; upper: number } | null;
  variantInterval?: { lower: number; upper: number } | null;
  chiSquare?: number;
}

interface VariantMetrics {
  variantId: string;
  variantName?: string; // ✅ Variant name for display
  metrics: {
    pageViews: number;
    uniqueVisitors: number;
    clicks: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
    ctr: number;
    revenuePerUser: number;
  };
}

// ── New user-level, Bayesian measurement (2026-06 redesign) ──────────────────
interface BayesianVariant {
  variantId: string;
  variantName: string;
  isControl: boolean;
  exposedUsers: number;
  converters: number;
  conversionRate: number; // 0-1 posterior mean
  chanceToBeatControl: number | null; // 0-1; null for control
  credibleInterval: { lower: number; upper: number }; // 0-1
  relativeLift: number | null;
  firstPurchaseRevenue: number; // dollars (net, capped)
  revenuePerUser: number; // dollars
  recurringRevenue: number; // dollars (separate line)
}
interface BayesianSummary {
  engine: string;
  windowDays: number;
  appliedCapDollars: number | null;
  controlVariantId: string | null;
  recommendation: "ship_variant" | "keep_control" | "keep_running" | "inconclusive";
  recommendedVariantId: string | null;
  minSampleMet: boolean;
  winThreshold: number;
  variants: BayesianVariant[];
}

interface ExperimentResults {
  comparison: {
    variants: VariantMetrics[];
    totalPageViews: number;
    totalConversions: number;
    totalRevenue: number;
  };
  significance: StatisticalResults;
  winner: {
    winner: "control" | "variant" | "inconclusive";
    reason: string;
    significance: StatisticalResults;
  };
  bayesian?: BayesianSummary | null;
}

const RECOMMENDATION_META: Record<
  BayesianSummary["recommendation"],
  { label: string; cls: string }
> = {
  ship_variant: { label: "Ship the winner", cls: "bg-green-100 text-green-800" },
  keep_control: { label: "Keep control", cls: "bg-blue-100 text-blue-800" },
  keep_running: { label: "Keep running — gathering data", cls: "bg-yellow-100 text-yellow-800" },
  inconclusive: { label: "Inconclusive", cls: "bg-gray-100 text-gray-700" },
};

/**
 * Experiment Results Dashboard
 * Displays comprehensive statistical analysis and metrics for A/B testing experiments
 */
export default function ExperimentResultsDashboard({
  experimentId,
  slugTargets,
}: ExperimentResultsDashboardProps) {
  const [dateRange, _setDateRange] = useState<{ start?: Date; end?: Date }>({});

  /**
   * A sentinel experiment is excluded from purchase attribution by design, so it can NEVER
   * accrue legacy `conversion`/`purchase` events. The chi-square panel therefore divides by
   * zero and renders "N/A · 0.00% Decline vs control" in red — actively contradicting the
   * Bayesian card above it, which is the real result. Hide the guaranteed-wrong panels
   * rather than showing numbers that mean the opposite of what they appear to mean.
   */
  const isSentinelExperiment = isNonConversionSentinelExperiment(slugTargets);

  // Fetch analytics data
  const { data: analyticsData, isLoading } = useQuery<ExperimentResults>({
    queryKey: [`experiment-analytics-${experimentId}`, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.start) params.append("startDate", dateRange.start.toISOString());
      if (dateRange.end) params.append("endDate", dateRange.end.toISOString());

      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}/analytics?${params}`);
      if (!response.ok) throw new Error("Failed to fetch analytics");
      const result = await response.json();
      return result.data; // Extract data from response
    },
    enabled: !!experimentId,
  });

  // Fetch winner determination
  const { data: winnerData } = useQuery({
    queryKey: [`experiment-winner-${experimentId}`],
    queryFn: async () => {
      const response = await fetch(`/api/admin/ab-testing/experiments/${experimentId}/winner`);
      if (!response.ok) throw new Error("Failed to fetch winner");
      return response.json();
    },
    enabled: !!experimentId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center p-8 text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>No analytics data available</p>
      </div>
    );
  }

  const { comparison, significance, winner: winnerFromAnalytics, bayesian } = analyticsData || {};
  const winner = winnerFromAnalytics || winnerData?.data;
  const recommendedName =
    bayesian?.variants.find((v) => v.variantId === bayesian.recommendedVariantId)?.variantName ?? null;

  // Prepare chart data
  // ✅ FIX: Use variant names instead of "Variant 1", "Variant 2"
  /**
   * A sentinel experiment records no legacy conversion/revenue events by design, so the
   * legacy series are structurally zero and the charts render as empty axes. The numbers
   * are NOT missing though — the Bayesian card computes them from the durable assignment
   * and PaymentEvent tables. So for a sentinel, plot the Bayesian series instead of hiding
   * the charts: "which variant earns more" is the whole point of running the test.
   *
   * CTR is genuinely unavailable either way — click events are tracked against the
   * page-targeted experiment's id, never the sentinel's — so it is simply omitted rather
   * than plotted as a misleading flat zero.
   */
  const useBayesianSeries = isSentinelExperiment && (bayesian?.variants?.length ?? 0) > 0;

  /** variantId → Bayesian row, so the comparison cards can show the same user-level
   *  figures the Bayesian card computes rather than the structurally-zero legacy ones. */
  const bayesianByVariantId = new Map((bayesian?.variants ?? []).map((v) => [v.variantId, v]));

  const conversionRateData = useBayesianSeries
    ? bayesian!.variants.map((v) => ({
        name: v.variantName,
        "Conversion Rate": Number((v.conversionRate * 100).toFixed(2)),
      }))
    : comparison.variants.map((v, index) => ({
        name: v.variantName || `Variant ${index + 1}`,
        "Conversion Rate": v.metrics.conversionRate,
        "CTR": v.metrics.ctr,
      }));

  const revenueData = useBayesianSeries
    ? bayesian!.variants.map((v) => ({
        name: v.variantName,
        Revenue: Number(v.firstPurchaseRevenue.toFixed(2)),
        "Revenue per User": Number(v.revenuePerUser.toFixed(2)),
      }))
    : comparison.variants.map((v, index) => ({
        name: v.variantName || `Variant ${index + 1}`,
        Revenue: v.metrics.revenue,
        "Revenue per User": v.metrics.revenuePerUser,
      }));

  const trafficDistribution = comparison.variants.map((v, index) => ({
    name: v.variantName || `Variant ${index + 1}`,
    value: v.metrics.uniqueVisitors,
  }));

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

  return (
    <div className="space-y-6">
      {/* ── User-level Bayesian result (2026-06 measurement redesign) ── */}
      {bayesian && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-blue-600" />
              Result — user-level · Bayesian
            </h3>
            <span className={cn("px-3 py-1 rounded-full text-sm font-medium", RECOMMENDATION_META[bayesian.recommendation].cls)}>
              {bayesian.recommendation === "ship_variant" && recommendedName
                ? `Ship: ${recommendedName}`
                : RECOMMENDATION_META[bayesian.recommendation].label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Conversion = first purchase within {bayesian.windowDays} days of exposure · denominator = exposed users
            (assignment table) · renewals shown separately ·{" "}
            {bayesian.minSampleMet ? "min sample met" : "below min sample — not a call yet"}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-medium">Variant</th>
                  <th className="py-2 px-3 font-medium text-right">Exposed</th>
                  <th className="py-2 px-3 font-medium text-right">Conv.</th>
                  <th className="py-2 px-3 font-medium text-right">Conv. rate</th>
                  <th className="py-2 px-3 font-medium text-right">Chance to win</th>
                  <th className="py-2 px-3 font-medium text-right">95% CI</th>
                  <th className="py-2 px-3 font-medium text-right">1st-buy $/user</th>
                  <th className="py-2 pl-3 font-medium text-right">Recurring $</th>
                </tr>
              </thead>
              <tbody>
                {bayesian.variants.map((v) => (
                  <tr key={v.variantId} className="border-b border-gray-100">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-gray-900">{v.variantName}</span>
                      {v.isControl && <span className="ml-2 text-xs text-gray-500">(control)</span>}
                    </td>
                    <td className="py-2 px-3 text-right">{v.exposedUsers.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{v.converters.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{(v.conversionRate * 100).toFixed(2)}%</td>
                    <td className="py-2 px-3 text-right">
                      {v.chanceToBeatControl == null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span
                          className={cn(
                            "font-medium",
                            v.chanceToBeatControl >= bayesian.winThreshold
                              ? "text-green-600"
                              : v.chanceToBeatControl <= 1 - bayesian.winThreshold
                                ? "text-red-600"
                                : "text-gray-900",
                          )}
                        >
                          {(v.chanceToBeatControl * 100).toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600">
                      {(v.credibleInterval.lower * 100).toFixed(1)}–{(v.credibleInterval.upper * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right">${v.revenuePerUser.toFixed(2)}</td>
                    <td className="py-2 pl-3 text-right text-gray-600">
                      ${v.recurringRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Engine: {bayesian.engine} · win threshold {(bayesian.winThreshold * 100).toFixed(0)}%
            {bayesian.appliedCapDollars != null
              ? ` · per-user revenue capped at $${bayesian.appliedCapDollars.toFixed(0)}`
              : ""}
            . The legacy chi-square section below is being retired.
          </p>
        </div>
      )}

      {/* Sentinel experiments: explain the deliberate zeros instead of rendering a
          chi-square over data that can never exist. */}
      {isSentinelExperiment && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <span className="font-semibold">Scored on the Bayesian card above.</span> This is a
            site-wide cosmetic experiment, so it is deliberately excluded from purchase
            attribution — that is what stops it taking credit away from your page-targeted
            promo experiments. It therefore records no legacy conversion or revenue events,
            and the chi-square significance panel is hidden because it would divide by zero
            and report a decline that is not real. Engagement figures below are unaffected.
          </p>
        </div>
      )}

      {/* Statistical Significance Card */}
      {!isSentinelExperiment && (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Statistical Significance
          </h3>
          {significance.significant != null ? (
            significance.significant ? (
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Significant</span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-yellow-600">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Not Significant</span>
              </span>
            )
          ) : (
            <span className="flex items-center gap-2 text-gray-500">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Calculating...</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-neutral-400 mb-1">P-Value</p>
            <p className="text-2xl font-bold text-gray-900">
              {significance.pValue != null ? significance.pValue.toFixed(4) : "N/A"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {significance.pValue != null
                ? significance.pValue < 0.05
                  ? "Statistically significant"
                  : "Not significant"
                : "Calculating..."}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-neutral-400 mb-1">Confidence Level</p>
            <p className="text-2xl font-bold text-gray-900">
              {significance.confidence != null ? `${significance.confidence.toFixed(2)}%` : "N/A"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {significance.confidence != null
                ? significance.confidence >= 95
                  ? "High confidence"
                  : "Low confidence"
                : "Calculating..."}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-neutral-400 mb-1">Lift</p>
            <p className={cn("text-2xl font-bold", significance.lift != null && significance.lift > 0 ? "text-green-600" : "text-red-600")}>
              {significance.lift != null
                ? `${significance.lift > 0 ? "+" : ""}${significance.lift.toFixed(2)}%`
                : "N/A"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {significance.lift != null
                ? significance.lift > 0
                  ? "Improvement"
                  : "Decline"
                : "Calculating..."}{" "}
              vs control
            </p>
          </div>
        </div>

        {/* Confidence Intervals */}
        {significance.controlInterval && significance.variantInterval && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">Confidence Intervals (95%)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Control Variant</p>
                <p className="text-sm text-gray-900">
                  {significance.controlInterval.lower.toFixed(2)}% - {significance.controlInterval.upper.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Test Variant</p>
                <p className="text-sm text-gray-900">
                  {significance.variantInterval.lower.toFixed(2)}% - {significance.variantInterval.upper.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Winner Declaration — also chi-square derived, so it reports "confidence: NaN%"
          for a sentinel experiment. Suppressed for the same reason. */}
      {!isSentinelExperiment && winner && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-600" />
              Winner Determination
            </h3>
            {winner.winner !== "inconclusive" && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                {winner.winner === "variant" ? "Test Variant Wins" : "Control Wins"}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-neutral-400">{winner.reason}</p>
        </div>
      )}

      {/* Metrics Comparison */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-600" />
          Variant Comparison
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {comparison.variants.map((variant, index) => (
            <div key={variant.variantId} className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-3">{variant.variantName || `Variant ${index + 1}`}</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-neutral-400">Visitors:</span>
                  <span className="font-medium">{variant.metrics.uniqueVisitors.toLocaleString()}</span>
                </div>
                {/* Conversion + revenue come from legacy events, which a sentinel
                    experiment never accrues. Rendering the zeros here reads as "nobody
                    converted" when the Bayesian card above shows real conversions, so
                    point at the real numbers instead. */}
                {isSentinelExperiment ? (
                  /* Sentinel: the legacy event counters are structurally zero, so read the
                     same user-level figures the Bayesian card computes. Showing them here
                     means this card carries the numbers and the charts below carry the
                     shape — no cross-referencing two panels to read one result. */
                  (() => {
                    const b = bayesianByVariantId.get(variant.variantId);
                    if (!b) {
                      return (
                        <div className="text-xs text-gray-500 dark:text-neutral-400 pt-1">
                          Conversions &amp; revenue: see the Bayesian card above
                        </div>
                      );
                    }
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-neutral-400">Conversions:</span>
                          <span className="font-medium">{b.converters.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-neutral-400">Conversion Rate:</span>
                          <span className="font-medium">{(b.conversionRate * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-neutral-400">Revenue:</span>
                          <span className="font-medium">
                            ${b.firstPurchaseRevenue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-neutral-400">Revenue/User:</span>
                          <span className="font-medium">${b.revenuePerUser.toFixed(2)}</span>
                        </div>
                        {/* Recurring is renewal revenue a banner theme cannot have caused —
                            labelled and de-emphasised so it never reads as part of the result. */}
                        <div className="flex justify-between text-xs pt-1 border-t border-gray-200 dark:border-neutral-700 mt-1">
                          <span className="text-gray-400 dark:text-neutral-500">Recurring (not a conversion):</span>
                          <span className="text-gray-400 dark:text-neutral-500">
                            ${b.recurringRevenue.toLocaleString()}
                          </span>
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-neutral-400">Conversions:</span>
                      <span className="font-medium">{variant.metrics.conversions.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-neutral-400">Conversion Rate:</span>
                      <span className="font-medium">{variant.metrics.conversionRate.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-neutral-400">Revenue:</span>
                      <span className="font-medium">${variant.metrics.revenue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-neutral-400">Revenue/User:</span>
                      <span className="font-medium">${variant.metrics.revenuePerUser.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversion Rate Chart */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-3">
              {useBayesianSeries ? "Conversion Rate (user-level)" : "Conversion Rate & CTR"}
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={conversionRateData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
                <Legend />
                <Bar dataKey="Conversion Rate" fill="#3b82f6" />
                {!useBayesianSeries && <Bar dataKey="CTR" fill="#10b981" />}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue Chart */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-3">
              {useBayesianSeries ? "First-purchase revenue (user-level)" : "Revenue Metrics"}
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              {/* Two Y axes on purpose: totals run in the hundreds of dollars while
                  revenue-per-user runs around $1, so on a shared axis the per-user bars
                  scale to an invisible sliver and read as zero. Left axis = dollar totals,
                  right axis = per-user. */}
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="total" tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                <YAxis
                  yAxisId="perUser"
                  orientation="right"
                  tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                />
                <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                <Legend />
                {/* Recurring is deliberately NOT charted. It is renewal revenue from
                    members who already subscribed, so a banner theme cannot have caused
                    it — plotting it beside the real result invites reading "this arm
                    earns more" when the difference is just which arm happened to receive
                    more existing subscribers. It stays as a diagnostic column on the
                    Bayesian table above, where it belongs. */}
                <Bar yAxisId="total" dataKey="Revenue" fill="#f59e0b" />
                <Bar yAxisId="perUser" dataKey="Revenue per User" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Traffic Distribution */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-200 mb-3">Traffic Distribution</h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={trafficDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {trafficDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

