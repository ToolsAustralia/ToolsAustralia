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

function baseRow(): MetaAdInsightsRow {
  return {
    level: "adset",
    adAccountId: "act_test",
    id: "as_1",
    name: "Test",
    campaignId: "c1",
    campaignName: "Test C",
    adsetId: "as_1",
    adsetName: "Test",
    window: { spendCents: 100000, conversions: 130, revenueCents: 112000, linkClicks: 800, impressions: 40000 },
    daily: [],
    last7d: { conversions: 130, spendCents: 100000, revenueCents: 112000, prev7dConversions: 125, prev7dRoas: 1.10 },
    last14dBestWeek: { conversions: 130, roas: 1.12 },
    learningStatusRaw: null,
    learningStatusBucket: "Unknown",
    effectiveStatus: "UNKNOWN",
    lastSignificantEdit: null,
    daysSinceLastSignificantEdit: null,
    daysInLearningLimited: 0,
    lastBudgetChangePct: null,
    lastBudgetChangeDate: null,
    campaignObjective: null,
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

// Missing learningStatus: Scale's "Active" check fails, but engine should NOT crash
{
  const result = computeVerdict(baseRow(), SETTINGS);
  assert(result.verdict !== "scale", "Missing learningStatus should not yield Scale");
  assert(result.verdict === "hold", `Expected hold when learning unknown, got ${result.verdict}`);
  console.error("PASS: missing learningStatus → hold");
}

// Missing lastSignificantEdit: treated as Infinity (no recent edit), allowing Scale if other checks pass
{
  const row = baseRow();
  row.learningStatusBucket = "Active";
  row.learningStatusRaw = "SUCCESS";
  // daysSinceLastSignificantEdit stays null → becomes Infinity → treated as safe (no recent edit)
  const result = computeVerdict(row, SETTINGS);
  assert(result.verdict === "scale", `Expected scale (missing edit data defaults to safe), got ${result.verdict}`);
  console.error("PASS: missing lastSignificantEdit → scale (treated as no recent edit)");
}

// Missing campaignObjective: isPurchaseCapableObjective stays true (adapter default) so no Cut?
{
  const row = baseRow();
  row.learningStatusBucket = "Active";
  row.learningStatusRaw = "SUCCESS";
  row.daysSinceLastSignificantEdit = 14;
  row.lastSignificantEdit = new Date(Date.now() - 14 * 86400000);
  row.campaignObjective = null; // unknown
  row.isPurchaseCapableObjective = true;
  const result = computeVerdict(row, SETTINGS);
  assert(result.verdict === "scale", `Expected scale when objective unknown but otherwise healthy, got ${result.verdict}`);
  console.error("PASS: missing campaignObjective → scale (unknown defaults to capable)");
}

console.error("All missing-data fallback tests passed.");
