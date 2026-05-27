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
    effectiveStatus: "ACTIVE",
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

// --- CUT tests ---
runTest("CUT?: Ryobi-style (Learning Limited 8d, $953 spend, 4 conv) returns cut", () => {
  const row = makeRow({
    name: "Ryobi - Adset A",
    learningStatusRaw: "FAIL",
    learningStatusBucket: "LearningLimited",
    daysInLearningLimited: 8,
    window: { spendCents: 95300, conversions: 4, revenueCents: 41000, linkClicks: 200, impressions: 12000 },
    last7d: { conversions: 4, spendCents: 95300, revenueCents: 41000, prev7dConversions: 6, prev7dRoas: 0.5 },
    last14dBestWeek: { conversions: 11, roas: 0.4 },
  });
  const result = computeVerdict(row, DEFAULT_SETTINGS);
  assert(result.verdict === "cut", `expected cut, got ${result.verdict}`);
});

runTest("CUT?: wrong objective (OUTCOME_ENGAGEMENT) returns cut", () => {
  const row = makeRow({
    campaignObjective: "OUTCOME_ENGAGEMENT",
    isPurchaseCapableObjective: false,
  });
  const result = computeVerdict(row, DEFAULT_SETTINGS);
  assert(result.verdict === "cut", `expected cut for non-purchase objective, got ${result.verdict}`);
});

runTest("CUT?: spend > 2x target CPA with 0 conv returns cut", () => {
  const row = makeRow({
    window: { spendCents: 20000, conversions: 0, revenueCents: 0, linkClicks: 80, impressions: 6000 },
    last7d: { conversions: 0, spendCents: 20000, revenueCents: 0, prev7dConversions: 0, prev7dRoas: 0 },
    last14dBestWeek: { conversions: 0, roas: 0 },
    learningStatusBucket: "Learning",
    learningStatusRaw: "LEARNING",
    daysInLearningLimited: 0,
  });
  const result = computeVerdict(row, DEFAULT_SETTINGS);
  assert(result.verdict === "cut", `expected cut for spend with 0 conv, got ${result.verdict}`);
});

// --- INVESTIGATE tests ---
runTest("INVESTIGATE: Bid Cap-style (was 91 conv/1.05 ROAS, now 76 conv/0.42 after +73% budget) returns investigate", () => {
  const row = makeRow({
    name: "Bid Cap - Adset D",
    learningStatusRaw: "SUCCESS",
    learningStatusBucket: "Active",
    daysInLearningLimited: 0,
    window: { spendCents: 513200, conversions: 76, revenueCents: 215500, linkClicks: 1200, impressions: 45000 },
    last7d: { conversions: 76, spendCents: 513200, revenueCents: 215500, prev7dConversions: 91, prev7dRoas: 1.05 },
    last14dBestWeek: { conversions: 91, roas: 1.05 },
    lastSignificantEdit: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    daysSinceLastSignificantEdit: 4,
    lastBudgetChangePct: 73,
    lastBudgetChangeDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
  });
  const result = computeVerdict(row, DEFAULT_SETTINGS);
  assert(result.verdict === "investigate", `expected investigate, got ${result.verdict}`);
});

runTest("INVESTIGATE: insufficient data (under 50 conv in compared weeks) does NOT fire", () => {
  const row = makeRow({
    last7d: { conversions: 20, spendCents: 20000, revenueCents: 8000, prev7dConversions: 25, prev7dRoas: 1.10 },
    last14dBestWeek: { conversions: 25, roas: 1.10 },
    lastSignificantEdit: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    daysSinceLastSignificantEdit: 4,
  });
  const result = computeVerdict(row, DEFAULT_SETTINGS);
  assert(result.verdict !== "investigate", `expected non-investigate due to data floor, got ${result.verdict}`);
});
