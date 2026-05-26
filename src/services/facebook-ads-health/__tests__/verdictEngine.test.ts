import { computeVerdict } from "../verdictEngine";
import type { MetaAdInsightsRow, FacebookAdsHealthSettingsValues } from "../types";

const DEFAULT_SETTINGS: FacebookAdsHealthSettingsValues = {
  breakevenRoas: 1.0,
  targetCpaAud: 40,
  zeroConvSpendMultiplier: 2.0,
  roasDropTriggerPct: 25,
  postEditWaitHours: 72,
};

function makeRow(overrides: Partial<MetaAdInsightsRow> = {}): MetaAdInsightsRow {
  const base: MetaAdInsightsRow = {
    level: "adset",
    adAccountId: "act_test",
    id: "as_test_1",
    name: "Test Adset",
    campaignId: "c_1",
    campaignName: "Test Campaign",
    adsetId: "as_test_1",
    adsetName: "Test Adset",
    window: { spendCents: 100000, conversions: 130, revenueCents: 112000, linkClicks: 800, impressions: 40000 },
    daily: [],
    last7d: { conversions: 130, spendCents: 100000, revenueCents: 112000, prev7dConversions: 125, prev7dRoas: 1.10 },
    last14dBestWeek: { conversions: 130, roas: 1.12 },
    learningStatusRaw: "SUCCESS",
    learningStatusBucket: "Active",
    lastSignificantEdit: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    daysSinceLastSignificantEdit: 14,
    daysInLearningLimited: 0,
    lastBudgetChangePct: null,
    lastBudgetChangeDate: null,
    campaignObjective: "OUTCOME_SALES",
    isPurchaseCapableObjective: true,
    daysAtZeroInWindow: 0,
  };
  return { ...base, ...overrides };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.error(`PASS: ${name}`);
  } catch (e) {
    console.error(`FAIL: ${name}: ${(e as Error).message}`);
    process.exit(1);
  }
}

// --- SCALE tests ---
runTest("SCALE: healthy LTB-C-style adset returns scale", () => {
  const row = makeRow(); // defaults are LTB-C-shaped
  const result = computeVerdict(row, DEFAULT_SETTINGS);
  assert(result.verdict === "scale", `expected scale, got ${result.verdict}`);
});

console.error("All SCALE tests passed.");
