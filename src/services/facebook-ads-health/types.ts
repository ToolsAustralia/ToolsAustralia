/**
 * Facebook Ads Health — shared types.
 *
 * These types are Facebook-specific. Other ad platforms (TikTok, Snapchat)
 * will define their own equivalents in their own service directories.
 */

export type Verdict = "scale" | "hold" | "investigate" | "cut";
export type LearningStatusBucket = "Active" | "Learning" | "LearningLimited" | "Unknown";
// Effective status reflects whether the adset is actually delivering. Imported
// here as a string union (instead of re-exporting from adsetMetadataFetcher) to
// avoid a circular dep between this types module and the fetcher.
export type EffectiveStatusBucket =
  | "ACTIVE"
  | "PAUSED"
  | "DELETED"
  | "PENDING_REVIEW"
  | "DISAPPROVED"
  | "PREAPPROVED"
  | "PENDING_BILLING_INFO"
  | "CAMPAIGN_PAUSED"
  | "ARCHIVED"
  | "ADSET_PAUSED"
  | "IN_PROCESS"
  | "WITH_ISSUES"
  // Derived in the aggregator from end_time / budget_remaining and recent-spend
  // signals — match Meta UI's "Delivery" column for these two states.
  | "COMPLETED"
  | "ADS_INACTIVE"
  | "UNKNOWN";

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
  // Whether the adset is actually delivering. Distinct from learningStatusBucket
  // because an adset can be "Active" (out of learning) but still PAUSED.
  effectiveStatus: EffectiveStatusBucket;
  lastSignificantEdit: Date | null;
  daysSinceLastSignificantEdit: number | null;
  // Adset's creation timestamp from Meta. Used as the fallback "anchor" for
  // the learning-phase counter (and the popover's "Since…" line) when no
  // significant edit has happened — matches Meta UI behaviour for unedited
  // adsets. Also exposed to the UI so the tooltip can show "Never edited ·
  // Created (date)" instead of just omitting the line.
  createdTime: Date | null;
  // Cumulative optimization events since the last significant edit. Matches
  // the "X / 50" counter Meta Ads Manager shows in the Learning Phase Progress
  // popover. null when lastSignificantEdit isn't available. Drives the
  // computed learningStatusBucket — see insightsAggregator for the rules.
  conversionsSinceLastSignificantEdit: number | null;
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
  // Day-over-day spend increase % threshold. Flags spend cells in amber when
  // exceeded — informational ("notice this scaling event"), not a verdict
  // input. Default 20.
  spendIncreaseAlertPct: number;
}

export const PURCHASE_CAPABLE_OBJECTIVES = new Set<string>([
  "OUTCOME_SALES",
  "OUTCOME_APP_PROMOTION",
]);
