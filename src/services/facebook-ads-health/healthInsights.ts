// src/services/facebook-ads-health/healthInsights.ts
//
// Core orchestration for the Facebook Ads Health view: aggregate per-row Meta
// insights, run the verdict engine, and project to the table-row shape with the
// alert tally. Extracted from `src/app/api/admin/facebook-ads/health/insights/route.ts`
// so the admin route and the Norm projection share one code path and report
// identical numbers by construction.
//
// Operator-specific snooze state is NOT loaded here — `snoozedUntil` is left
// `null` and the admin route layers per-operator snoozes on top after calling
// this service. Norm has no snooze concept and drops the field.

import connectDB from "@/lib/mongodb";
import { aggregateInsights } from "@/services/facebook-ads-health/insightsAggregator";
import { computeVerdict } from "@/services/facebook-ads-health/verdictEngine";
import { getOrInitSettings } from "@/services/facebook-ads-health/settingsService";
import type {
  Verdict,
  LearningStatusBucket,
  EffectiveStatusBucket,
  VerdictReason,
} from "@/services/facebook-ads-health/types";

export interface HealthInsightDaily {
  date: string; // yyyy-mm-dd
  spendCents: number;
  conversions: number;
  revenueCents: number;
  linkClicks: number;
  impressions: number;
  linkCtr: number; // percent (linkClicks / impressions × 100)
  costPerLinkClick: number; // cents per link click
  roas: number; // revenueCents / spendCents; 0 when spend is 0
}

export interface HealthInsightRow {
  id: string;
  name: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  learningStatus: LearningStatusBucket;
  metaRawStatus: "LEARNING" | "SUCCESS" | "FAIL" | null;
  effectiveStatus: EffectiveStatusBucket;
  daily: HealthInsightDaily[];
  window: {
    spendCents: number;
    conversions: number;
    revenueCents: number;
    linkClicks: number;
    impressions: number;
  };
  last7d: { conversions: number; roas: number; prev7dRoas: number | null };
  lastSignificantEdit: Date | null;
  daysSinceLastSignificantEdit: number | null;
  createdTime: Date | null;
  conversionsSinceLastSignificantEdit: number | null;
  lastBudgetChangePct: number | null;
  daysAtZero: number;
  verdict: Verdict;
  verdictReasons: VerdictReason[];
  actionText: string;
  metaAdsManagerUrl: string;
  /** Operator-specific; left null here, overridden by the admin route. */
  snoozedUntil: Date | null;
}

export interface FacebookAdsHealthInsightsResult {
  rows: HealthInsightRow[];
  alertCount: { investigate: number; cut: number };
}

export async function getFacebookAdsHealthInsights(input: {
  adAccountId: string;
  accessToken: string;
  startDate: Date;
  endDate: Date;
  level: "campaign" | "adset" | "ad";
}): Promise<FacebookAdsHealthInsightsResult> {
  await connectDB();

  const settings = await getOrInitSettings();
  const aggregated = await aggregateInsights({
    adAccountId: input.adAccountId,
    startDate: input.startDate,
    endDate: input.endDate,
    level: input.level,
    accessToken: input.accessToken,
  });

  let investigateCount = 0;
  let cutCount = 0;
  const rows: HealthInsightRow[] = aggregated.map((row) => {
    const v = computeVerdict(row, settings);
    if (v.verdict === "investigate") investigateCount++;
    if (v.verdict === "cut") cutCount++;
    return {
      id: row.id,
      name: row.name,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      adsetId: row.adsetId,
      adsetName: row.adsetName,
      learningStatus: row.learningStatusBucket,
      metaRawStatus: row.learningStatusRaw,
      effectiveStatus: row.effectiveStatus,
      daily: row.daily.map((d) => ({
        date: d.date,
        spendCents: d.spendCents,
        conversions: d.conversions,
        revenueCents: d.revenueCents,
        linkClicks: d.linkClicks,
        impressions: d.impressions,
        linkCtr: d.impressions > 0 ? (d.linkClicks / d.impressions) * 100 : 0,
        costPerLinkClick: d.linkClicks > 0 ? d.spendCents / d.linkClicks : 0,
        roas: d.spendCents > 0 ? d.revenueCents / d.spendCents : 0,
      })),
      window: row.window,
      last7d: {
        conversions: row.last7d.conversions,
        roas: row.last7d.spendCents > 0 ? row.last7d.revenueCents / row.last7d.spendCents : 0,
        prev7dRoas: row.last7d.prev7dRoas,
      },
      lastSignificantEdit: row.lastSignificantEdit,
      daysSinceLastSignificantEdit: row.daysSinceLastSignificantEdit,
      createdTime: row.createdTime,
      conversionsSinceLastSignificantEdit: row.conversionsSinceLastSignificantEdit,
      lastBudgetChangePct: row.lastBudgetChangePct,
      daysAtZero: row.daysAtZeroInWindow,
      verdict: v.verdict,
      verdictReasons: v.reasons,
      actionText: v.actionText,
      metaAdsManagerUrl: `https://business.facebook.com/adsmanager/manage/adsets?act=${input.adAccountId.replace(/^act_/, "")}&selected_adset_ids=${row.adsetId ?? row.id}`,
      snoozedUntil: null,
    };
  });

  return { rows, alertCount: { investigate: investigateCount, cut: cutCount } };
}
