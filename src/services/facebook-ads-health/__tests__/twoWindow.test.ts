import { computeVerdict } from "../verdictEngine";
import type { MetaAdInsightsRow, FacebookAdsHealthSettingsValues } from "../types";

const SETTINGS: FacebookAdsHealthSettingsValues = {
  breakevenRoas: 1.0,
  targetCpaAud: 40,
  zeroConvSpendMultiplier: 2.0,
  roasDropTriggerPct: 25,
  postEditWaitHours: 72,
  spendIncreaseAlertPct: 20,
};

function makeRow(reportingDays: number): MetaAdInsightsRow {
  const daily = Array.from({ length: reportingDays }, (_, i) => ({
    date: `2026-05-${String(18 + i).padStart(2, "0")}`,
    spendCents: 10000,
    conversions: 20,
    revenueCents: 11000,
    linkClicks: 100,
    impressions: 5000,
  }));
  return {
    level: "adset",
    adAccountId: "act_test",
    id: "as_1",
    name: "Test",
    campaignId: "c1",
    campaignName: "Test C",
    adsetId: "as_1",
    adsetName: "Test",
    window: {
      spendCents: reportingDays * 10000,
      conversions: reportingDays * 20,
      revenueCents: reportingDays * 11000,
      linkClicks: reportingDays * 100,
      impressions: reportingDays * 5000,
    },
    daily,
    // last7d ALWAYS trailing 7 — regardless of reportingDays
    last7d: { conversions: 140, spendCents: 70000, revenueCents: 77000, prev7dConversions: 130, prev7dRoas: 1.05 },
    last14dBestWeek: { conversions: 140, roas: 1.10 },
    learningStatusRaw: "SUCCESS",
    learningStatusBucket: "Active",
    effectiveStatus: "ACTIVE",
    lastSignificantEdit: new Date(Date.now() - 20 * 86400000),
    daysSinceLastSignificantEdit: 20,
    conversionsSinceLastSignificantEdit: 60,
    daysInLearningLimited: 0,
    lastBudgetChangePct: null,
    lastBudgetChangeDate: null,
    campaignObjective: "OUTCOME_SALES",
    isPurchaseCapableObjective: true,
    daysAtZeroInWindow: 0,
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

[3, 7, 14, 28].forEach((days) => {
  const result = computeVerdict(makeRow(days), SETTINGS);
  assert(
    result.verdict === "scale",
    `Reporting window ${days}d should still yield scale (learning uses fixed 7d). Got ${result.verdict}.`,
  );
  console.error(`PASS: reporting window ${days}d → scale (learning window unchanged)`);
});
