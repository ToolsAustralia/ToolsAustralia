/**
 * Facebook Ads Health — shared types.
 *
 * These types are Facebook-specific. Other ad platforms (TikTok, Snapchat)
 * will define their own equivalents in their own service directories.
 */

export type Verdict = "scale" | "hold" | "investigate" | "cut";
export type LearningStatusBucket = "Active" | "Learning" | "LearningLimited" | "Unknown";

/**
 * Aggregated row passed to computeVerdict. Built from MetaAdInsightsDaily by the
 * insightsAggregator service. Always includes both windows (reporting + trailing 7d).
 */
export interface MetaAdInsightsRow {
  level: "campaign" | "adset" | "ad";
  adAccountId: string;
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  adsetId?: string;
  adsetName?: string;
  // Reporting-window totals
  window: {
    spendCents: number;
    conversions: number;
    revenueCents: number;
    linkClicks: number;
    impressions: number;
  };
  // Daily breakdown across reporting window (length = window day count)
  daily: Array<{
    date: string; // yyyy-mm-dd
    spendCents: number;
    conversions: number;
    revenueCents: number;
    linkClicks: number;
    impressions: number;
  }>;
  // Trailing-7d (always trailing 7 from "now", independent of reporting window)
  last7d: {
    conversions: number;
    spendCents: number;
    revenueCents: number;
    prev7dConversions: number;
    prev7dRoas: number | null;
  };
  // 14d window summary used by Investigate's "was healthy" group
  last14dBestWeek: {
    conversions: number;
    roas: number;
  };
  // Meta-sourced fields
  learningStatusRaw: "LEARNING" | "SUCCESS" | "FAIL" | null;
  learningStatusBucket: LearningStatusBucket;
  lastSignificantEdit: Date | null;
  daysSinceLastSignificantEdit: number | null;
  daysInLearningLimited: number; // computed by aggregator
  lastBudgetChangePct: number | null; // from snapshots over reporting window
  lastBudgetChangeDate: Date | null;
  campaignObjective: string | null;
  isPurchaseCapableObjective: boolean; // adapter answers this; default true for Facebook unless objective is in excluded list
  // Counts for diagnostics
  daysAtZeroInWindow: number;
}

export interface VerdictReason {
  section: string;
  rule: string;
  source: "meta" | "tunable";
  passed: boolean | "info";
  value: string;
}

export interface VerdictResult {
  verdict: Verdict;
  reasons: VerdictReason[];
  actionText: string;
  suggestedNextBudgetCents?: number | null;
}

export interface FacebookAdsHealthSettingsValues {
  breakevenRoas: number;
  targetCpaAud: number;
  zeroConvSpendMultiplier: number;
  roasDropTriggerPct: number;
  postEditWaitHours: number;
}

export const PURCHASE_CAPABLE_OBJECTIVES = new Set<string>([
  "OUTCOME_SALES",
  "OUTCOME_APP_PROMOTION",
]);
