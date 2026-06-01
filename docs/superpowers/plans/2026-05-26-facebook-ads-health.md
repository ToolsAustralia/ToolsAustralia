# Facebook Ads Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Facebook Ads Health view to the admin's Facebook Ads tab that surfaces learning-phase status, recent edits, daily pivot data, and auditable verdicts (Scale/Hold/Investigate/Cut?) — making the team's scaling decisions evidence-based rather than reactive.

**Architecture:** New `viewMode="health"` inside the existing `FacebookAdsManagement.tsx`. All business logic lives in `src/services/facebook-ads-health/` (Facebook-specific, no shared abstraction). New thin routes under `/api/admin/facebook-ads/health/**` delegate to the services. UI in `src/components/admin/facebook-ads-health/`. Data extends `MetaAdInsightsDaily` with 5 new columns sourced from Meta's Marketing API; two new collections (`FacebookAdsHealthSnooze`, `FacebookAdsHealthSettings`) for per-user snoozes and tunable thresholds.

**Tech Stack:** Next.js 15 App Router, TypeScript, MongoDB/Mongoose, NextAuth (via existing `requirePermission`), Meta Graph Marketing API v19+, TanStack Query, Tailwind, Zod for validation. Tests are tsx scripts per repo convention.

**Reference spec:** [docs/superpowers/specs/2026-05-26-facebook-ads-health-design.md](docs/superpowers/specs/2026-05-26-facebook-ads-health-design.md)

---

## Phase 1 — Data layer

### Task 1: Extend `MetaAdInsightsDaily` with five new columns

**Files:**
- Modify: `src/models/MetaAdInsightsDaily.ts`

- [ ] **Step 1: Read current file to confirm line numbers**

Run: open `src/models/MetaAdInsightsDaily.ts` and confirm the interface and Schema definitions.

- [ ] **Step 2: Add new fields to the TypeScript interface**

In `src/models/MetaAdInsightsDaily.ts`, add these fields to `IMetaAdInsightsDaily` after `revenueCents: number;`:

```ts
  linkClicks: number;
  adsetBudgetCents: number | null;
  campaignObjective: string | null;
  learningStatus: 'LEARNING' | 'SUCCESS' | 'FAIL' | null;
  lastSignificantEdit: Date | null;
```

- [ ] **Step 3: Add matching schema fields**

After the existing `revenueCents` schema entry, add:

```ts
    linkClicks: { type: Number, required: true, default: 0 },
    adsetBudgetCents: { type: Number, default: null },
    campaignObjective: { type: String, default: null },
    learningStatus: { type: String, enum: ['LEARNING', 'SUCCESS', 'FAIL'], default: null },
    lastSignificantEdit: { type: Date, default: null },
```

- [ ] **Step 4: Add new compound index**

After the existing unique index, add:

```ts
MetaAdInsightsDailySchema.index({ adAccountId: 1, adsetId: 1, date: 1 });
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS (no new errors involving MetaAdInsightsDaily)

- [ ] **Step 6: Commit**

```bash
git add src/models/MetaAdInsightsDaily.ts
git commit -m "feat(facebook-ads-health): extend MetaAdInsightsDaily with linkClicks, budget, objective, learning fields"
```

---

### Task 2: Extend `PaymentEvent` with denormalized attribution fields

**Files:**
- Modify: `src/models/PaymentEvent.ts`

- [ ] **Step 1: Open `src/models/PaymentEvent.ts` and find the schema definition**

- [ ] **Step 2: Add three indexed string fields to the interface**

Add to `IPaymentEvent`:

```ts
  attributionAdId: string | null;
  attributionAdsetId: string | null;
  attributionCampaignId: string | null;
```

- [ ] **Step 3: Add matching schema fields with indexes**

```ts
    attributionAdId: { type: String, default: null, index: true },
    attributionAdsetId: { type: String, default: null, index: true },
    attributionCampaignId: { type: String, default: null, index: true },
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/PaymentEvent.ts
git commit -m "feat(facebook-ads-health): add denormalized attribution fields to PaymentEvent"
```

---

### Task 3: Create `FacebookAdsHealthSnooze` model

**Files:**
- Create: `src/models/FacebookAdsHealthSnooze.ts`

- [ ] **Step 1: Write the model**

```ts
import mongoose, { Document, Schema } from "mongoose";

/**
 * Per-user, per-ad snooze for the Facebook Ads Health view's "Investigate" verdict.
 * Cut? snoozes are explicitly disallowed at the service layer.
 * TTL index auto-deletes expired snoozes.
 */
export interface IFacebookAdsHealthSnooze extends Document {
  userId: mongoose.Types.ObjectId;
  adAccountId: string;
  adId: string;
  verdict: "investigate";
  snoozeUntil: Date;
  reason?: string;
  createdAt: Date;
}

const FacebookAdsHealthSnoozeSchema = new Schema<IFacebookAdsHealthSnooze>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    adAccountId: { type: String, required: true },
    adId: { type: String, required: true },
    verdict: { type: String, enum: ["investigate"], required: true },
    snoozeUntil: { type: Date, required: true },
    reason: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

FacebookAdsHealthSnoozeSchema.index({ userId: 1, adId: 1 }, { unique: true });
FacebookAdsHealthSnoozeSchema.index({ snoozeUntil: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.FacebookAdsHealthSnooze ||
  mongoose.model<IFacebookAdsHealthSnooze>("FacebookAdsHealthSnooze", FacebookAdsHealthSnoozeSchema);
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/models/FacebookAdsHealthSnooze.ts
git commit -m "feat(facebook-ads-health): add FacebookAdsHealthSnooze model"
```

---

### Task 4: Create `FacebookAdsHealthSettings` model

**Files:**
- Create: `src/models/FacebookAdsHealthSettings.ts`

- [ ] **Step 1: Write the model**

```ts
import mongoose, { Document, Schema } from "mongoose";

/**
 * Singleton settings document for the Facebook Ads Health verdict engine.
 * One document with scope='global'. Lazy-initialised with defaults on first read.
 */
export interface IFacebookAdsHealthSettings extends Document {
  scope: "global";
  breakevenRoas: number;
  targetCpaAud: number;
  zeroConvSpendMultiplier: number;
  roasDropTriggerPct: number;
  postEditWaitHours: number;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const FacebookAdsHealthSettingsSchema = new Schema<IFacebookAdsHealthSettings>(
  {
    scope: { type: String, enum: ["global"], required: true, unique: true },
    breakevenRoas: { type: Number, required: true, default: 1.0 },
    targetCpaAud: { type: Number, required: true, default: 40 },
    zeroConvSpendMultiplier: { type: Number, required: true, default: 2.0 },
    roasDropTriggerPct: { type: Number, required: true, default: 25 },
    postEditWaitHours: { type: Number, required: true, default: 72 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export const FACEBOOK_ADS_HEALTH_SETTINGS_DEFAULTS = {
  scope: "global" as const,
  breakevenRoas: 1.0,
  targetCpaAud: 40,
  zeroConvSpendMultiplier: 2.0,
  roasDropTriggerPct: 25,
  postEditWaitHours: 72,
};

export default mongoose.models.FacebookAdsHealthSettings ||
  mongoose.model<IFacebookAdsHealthSettings>("FacebookAdsHealthSettings", FacebookAdsHealthSettingsSchema);
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`

- [ ] **Step 3: Commit**

```bash
git add src/models/FacebookAdsHealthSettings.ts
git commit -m "feat(facebook-ads-health): add FacebookAdsHealthSettings model"
```

---

## Phase 2 — Verdict engine (TDD)

### Task 5: Define types for the verdict engine

**Files:**
- Create: `src/services/facebook-ads-health/types.ts`

- [ ] **Step 1: Write the types module**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`

- [ ] **Step 3: Commit**

```bash
git add src/services/facebook-ads-health/types.ts
git commit -m "feat(facebook-ads-health): define verdict engine types"
```

---

### Task 6: Verdict engine skeleton + SCALE rule (TDD)

**Files:**
- Create: `src/services/facebook-ads-health/verdictEngine.ts`
- Create: `src/services/facebook-ads-health/__tests__/verdictEngine.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the test fixture helper and first failing test for SCALE**

Create `src/services/facebook-ads-health/__tests__/verdictEngine.test.ts`:

```ts
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
```

- [ ] **Step 2: Add the test script entry**

In `package.json`'s `scripts` block, add:

```json
"test:facebook-ads-health-verdict": "tsx src/services/facebook-ads-health/__tests__/verdictEngine.test.ts",
```

- [ ] **Step 3: Run the test — expect failure ("module not found")**

Run: `npm run test:facebook-ads-health-verdict`
Expected: FAIL with "Cannot find module '../verdictEngine'"

- [ ] **Step 4: Write the minimal verdict engine**

Create `src/services/facebook-ads-health/verdictEngine.ts`:

```ts
import type {
  MetaAdInsightsRow,
  Verdict,
  VerdictReason,
  VerdictResult,
  FacebookAdsHealthSettingsValues,
} from "./types";

const HOURS_IN_DAY = 24;

function roasOf(row: MetaAdInsightsRow): number {
  return row.last7d.spendCents > 0 ? row.last7d.revenueCents / row.last7d.spendCents : 0;
}

function effectiveCpaAud(row: MetaAdInsightsRow): number {
  if (row.last7d.conversions <= 0) return Infinity;
  return row.last7d.spendCents / 100 / row.last7d.conversions;
}

function buildScaleReasons(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): { allPass: boolean; reasons: VerdictReason[] } {
  const reasons: VerdictReason[] = [];
  const roas = roasOf(row);
  const wowRoasChangePct =
    row.last7d.prev7dRoas && row.last7d.prev7dRoas > 0
      ? ((roas - row.last7d.prev7dRoas) / row.last7d.prev7dRoas) * 100
      : 0;

  const hoursSinceEdit =
    row.daysSinceLastSignificantEdit !== null
      ? row.daysSinceLastSignificantEdit * HOURS_IN_DAY
      : Infinity;

  reasons.push({
    section: "Out of learning",
    rule: "Meta status",
    source: "meta",
    passed: row.learningStatusBucket === "Active",
    value: `${row.learningStatusBucket}${row.learningStatusRaw ? ` (${row.learningStatusRaw})` : ""}`,
  });
  reasons.push({
    section: "Out of learning",
    rule: "Conversions in last 7d",
    source: "meta",
    passed: row.last7d.conversions >= 50,
    value: `${row.last7d.conversions} (≥50 required)`,
  });
  reasons.push({
    section: "Profitable",
    rule: "ROAS in last 7d",
    source: "tunable",
    passed: roas >= settings.breakevenRoas,
    value: `${roas.toFixed(2)} (≥ ${settings.breakevenRoas.toFixed(2)} breakeven)`,
  });
  reasons.push({
    section: "Stable",
    rule: "No significant edit in last postEditWaitHours",
    source: "meta",
    passed: hoursSinceEdit >= settings.postEditWaitHours,
    value:
      row.daysSinceLastSignificantEdit !== null
        ? `last edit ${row.daysSinceLastSignificantEdit}d ago`
        : "never edited",
  });
  reasons.push({
    section: "Stable",
    rule: "ROAS week-over-week change ≥ -roasDropTriggerPct",
    source: "tunable",
    passed: wowRoasChangePct >= -settings.roasDropTriggerPct,
    value: `${wowRoasChangePct >= 0 ? "+" : ""}${wowRoasChangePct.toFixed(1)}%`,
  });

  return { allPass: reasons.every((r) => r.passed === true), reasons };
}

export function computeVerdict(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): VerdictResult {
  const scale = buildScaleReasons(row, settings);
  if (scale.allPass) {
    return {
      verdict: "scale",
      reasons: scale.reasons,
      actionText: `Raise daily budget by 20%. Re-evaluate in ${settings.postEditWaitHours} hours.`,
    };
  }

  // TODO Phase 2 follow-up tasks: Hold, Investigate, Cut
  return {
    verdict: "hold",
    reasons: scale.reasons,
    actionText: "Do nothing. Re-check in 48 hours.",
  };
}
```

- [ ] **Step 5: Run the test — expect PASS**

Run: `npm run test:facebook-ads-health-verdict`
Expected: PASS, prints `PASS: SCALE: healthy LTB-C-style adset returns scale`

- [ ] **Step 6: Commit**

```bash
git add src/services/facebook-ads-health/verdictEngine.ts src/services/facebook-ads-health/__tests__/verdictEngine.test.ts package.json
git commit -m "feat(facebook-ads-health): scaffold verdict engine with SCALE rule (TDD)"
```

---

### Task 7: Verdict engine — CUT? rules (TDD)

**Files:**
- Modify: `src/services/facebook-ads-health/verdictEngine.ts`
- Modify: `src/services/facebook-ads-health/__tests__/verdictEngine.test.ts`

- [ ] **Step 1: Add the Ryobi (Cut?) test case**

In the test file, before the final `console.error(...)`, add:

```ts
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
```

- [ ] **Step 2: Run the test — expect failures**

Run: `npm run test:facebook-ads-health-verdict`
Expected: FAIL — all three CUT cases return hold instead of cut.

- [ ] **Step 3: Add CUT? rule builder to the engine**

In `verdictEngine.ts`, before the `computeVerdict` export, add:

```ts
function buildCutReasons(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): { anyPass: boolean; reasons: VerdictReason[] } {
  const reasons: VerdictReason[] = [];
  const cpa = effectiveCpaAud(row);
  const spendAud7d = row.last7d.spendCents / 100;
  const limitedLongEnough =
    row.learningStatusBucket === "LearningLimited" && row.daysInLearningLimited >= 3;
  const limitedSpendFloor = row.window.spendCents / 100 >= 5 * settings.targetCpaAud;

  reasons.push({
    section: "Cut triggers",
    rule: "Learning Limited ≥ 3d AND window spend ≥ 5x targetCpa",
    source: "meta",
    passed: limitedLongEnough && limitedSpendFloor,
    value: `LL=${row.daysInLearningLimited}d, spend=$${(row.window.spendCents / 100).toFixed(0)} vs floor $${(5 * settings.targetCpaAud).toFixed(0)}`,
  });

  const spendVsMultiplier = spendAud7d >= settings.zeroConvSpendMultiplier * settings.targetCpaAud;
  const badCpa = row.last7d.conversions === 0 || cpa > 2 * settings.targetCpaAud;
  reasons.push({
    section: "Cut triggers",
    rule: "Spend ≥ zeroConvSpendMultiplier × targetCpa AND (0 conv OR CPA > 2x target)",
    source: "tunable",
    passed: spendVsMultiplier && badCpa,
    value:
      row.last7d.conversions === 0
        ? `spend $${spendAud7d.toFixed(0)} / 0 conv`
        : `spend $${spendAud7d.toFixed(0)} / ${row.last7d.conversions} conv = $${cpa.toFixed(0)} CPA vs target $${settings.targetCpaAud}`,
  });

  reasons.push({
    section: "Cut triggers",
    rule: "Campaign objective is purchase-capable",
    source: "meta",
    passed: !row.isPurchaseCapableObjective,
    value: row.campaignObjective ?? "(unknown)",
  });

  return { anyPass: reasons.some((r) => r.passed === true), reasons };
}
```

- [ ] **Step 4: Wire CUT? check into `computeVerdict` (before HOLD fallback)**

Replace the existing `computeVerdict` body with:

```ts
export function computeVerdict(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): VerdictResult {
  const cut = buildCutReasons(row, settings);
  if (cut.anyPass) {
    return {
      verdict: "cut",
      reasons: cut.reasons,
      actionText: `Pause this adset in Meta. Reallocate $${(row.window.spendCents / 100).toFixed(0)}/window to working adsets.`,
    };
  }

  const scale = buildScaleReasons(row, settings);
  if (scale.allPass) {
    return {
      verdict: "scale",
      reasons: scale.reasons,
      actionText: `Raise daily budget by 20%. Re-evaluate in ${settings.postEditWaitHours} hours.`,
    };
  }

  return {
    verdict: "hold",
    reasons: scale.reasons,
    actionText: "Do nothing. Re-check in 48 hours.",
  };
}
```

- [ ] **Step 5: Run the test — expect PASS for all SCALE and CUT cases**

Run: `npm run test:facebook-ads-health-verdict`
Expected: All four tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/facebook-ads-health/verdictEngine.ts src/services/facebook-ads-health/__tests__/verdictEngine.test.ts
git commit -m "feat(facebook-ads-health): add CUT? verdict rules (TDD)"
```

---

### Task 8: Verdict engine — INVESTIGATE rules (TDD)

**Files:**
- Modify: `src/services/facebook-ads-health/verdictEngine.ts`
- Modify: `src/services/facebook-ads-health/__tests__/verdictEngine.test.ts`

- [ ] **Step 1: Add the Bid Cap (Investigate) test case**

Append to the test file (before final console.error):

```ts
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
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npm run test:facebook-ads-health-verdict`
Expected: Investigate test FAILs (returns hold).

- [ ] **Step 3: Add INVESTIGATE builder and wire it**

In `verdictEngine.ts`, add this helper before `computeVerdict`:

```ts
function buildInvestigateReasons(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): { allGroupsPass: boolean; reasons: VerdictReason[] } {
  const reasons: VerdictReason[] = [];

  // Was healthy group (ALL): a 7d window in last 14d had >=50 conv AND ROAS >= breakeven
  const wasHealthyConv = row.last14dBestWeek.conversions >= 50;
  const wasHealthyRoas = row.last14dBestWeek.roas >= settings.breakevenRoas;
  reasons.push({
    section: "Was healthy",
    rule: "Best 7d window in last 14d had ≥50 conv",
    source: "meta",
    passed: wasHealthyConv,
    value: `${row.last14dBestWeek.conversions}`,
  });
  reasons.push({
    section: "Was healthy",
    rule: "Best 7d window in last 14d had ROAS ≥ breakeven",
    source: "tunable",
    passed: wasHealthyRoas,
    value: row.last14dBestWeek.roas.toFixed(2),
  });

  // Now broken group (ANY): WoW ROAS dropped > trigger AND both weeks have >=50 conv
  // OR learningStatusBucket reverted (we approximate: now Learning/Limited but had high conv last week)
  const hasComparisonData =
    row.last7d.conversions >= 50 && row.last7d.prev7dConversions >= 50 && row.last7d.prev7dRoas !== null;
  const roas7d = roasOf(row);
  let wowRoasChangePct = 0;
  if (row.last7d.prev7dRoas && row.last7d.prev7dRoas > 0) {
    wowRoasChangePct = ((roas7d - row.last7d.prev7dRoas) / row.last7d.prev7dRoas) * 100;
  }
  const wowDropped = hasComparisonData && wowRoasChangePct < -settings.roasDropTriggerPct;
  const statusReverted =
    row.learningStatusBucket !== "Active" && row.last14dBestWeek.conversions >= 50;

  reasons.push({
    section: "Now broken",
    rule: "ROAS dropped > roasDropTriggerPct WoW (with ≥50 conv in both weeks)",
    source: "tunable",
    passed: hasComparisonData ? wowDropped : "info",
    value: hasComparisonData
      ? `${wowRoasChangePct.toFixed(1)}%`
      : `insufficient data — need ≥50 conv in both weeks`,
  });
  reasons.push({
    section: "Now broken",
    rule: "Status reverted from Active",
    source: "meta",
    passed: statusReverted,
    value: row.learningStatusBucket,
  });

  // Recent edit detected (ANY): lastSignificantEdit <= 7d ago
  const recentEdit =
    row.daysSinceLastSignificantEdit !== null && row.daysSinceLastSignificantEdit <= 7;
  reasons.push({
    section: "Recent edit detected",
    rule: "lastSignificantEdit ≤ 7d ago",
    source: "meta",
    passed: recentEdit,
    value:
      row.daysSinceLastSignificantEdit !== null
        ? `${row.daysSinceLastSignificantEdit}d ago${row.lastBudgetChangePct !== null ? ` (budget ${row.lastBudgetChangePct > 0 ? "+" : ""}${row.lastBudgetChangePct}%)` : ""}`
        : "never edited",
  });

  const wasHealthyAll = wasHealthyConv && wasHealthyRoas;
  const nowBrokenAny = wowDropped || statusReverted;
  const editDetectedAny = recentEdit;
  return {
    allGroupsPass: wasHealthyAll && nowBrokenAny && editDetectedAny,
    reasons,
  };
}
```

- [ ] **Step 4: Wire INVESTIGATE into `computeVerdict` between CUT and SCALE**

Replace the body of `computeVerdict`:

```ts
export function computeVerdict(
  row: MetaAdInsightsRow,
  settings: FacebookAdsHealthSettingsValues,
): VerdictResult {
  const cut = buildCutReasons(row, settings);
  if (cut.anyPass) {
    return {
      verdict: "cut",
      reasons: cut.reasons,
      actionText: `Pause this adset in Meta. Reallocate $${(row.window.spendCents / 100).toFixed(0)}/window to working adsets.`,
    };
  }

  const investigate = buildInvestigateReasons(row, settings);
  if (investigate.allGroupsPass) {
    return {
      verdict: "investigate",
      reasons: investigate.reasons,
      actionText:
        "Open in Meta Ads Manager — review change log. Most likely fix: revert the recent edit. Do NOT pause — audience and creative were proven.",
    };
  }

  const scale = buildScaleReasons(row, settings);
  if (scale.allPass) {
    return {
      verdict: "scale",
      reasons: scale.reasons,
      actionText: `Raise daily budget by 20%. Re-evaluate in ${settings.postEditWaitHours} hours.`,
    };
  }

  return {
    verdict: "hold",
    reasons: scale.reasons,
    actionText: "Do nothing. Re-check in 48 hours.",
  };
}
```

- [ ] **Step 5: Run the test — expect all PASS**

Run: `npm run test:facebook-ads-health-verdict`
Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/facebook-ads-health/verdictEngine.ts src/services/facebook-ads-health/__tests__/verdictEngine.test.ts
git commit -m "feat(facebook-ads-health): add INVESTIGATE verdict rules with stat-confidence floor (TDD)"
```

---

### Task 9: Two-window principle test

**Files:**
- Create: `src/services/facebook-ads-health/__tests__/twoWindow.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the test**

```ts
import { computeVerdict } from "../verdictEngine";
import type { MetaAdInsightsRow, FacebookAdsHealthSettingsValues } from "../types";

const SETTINGS: FacebookAdsHealthSettingsValues = {
  breakevenRoas: 1.0,
  targetCpaAud: 40,
  zeroConvSpendMultiplier: 2.0,
  roasDropTriggerPct: 25,
  postEditWaitHours: 72,
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
    lastSignificantEdit: new Date(Date.now() - 20 * 86400000),
    daysSinceLastSignificantEdit: 20,
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
```

- [ ] **Step 2: Add test script entry to package.json**

```json
"test:facebook-ads-health-two-window": "tsx src/services/facebook-ads-health/__tests__/twoWindow.test.ts",
```

- [ ] **Step 3: Run — expect PASS**

Run: `npm run test:facebook-ads-health-two-window`
Expected: 4 PASS lines.

- [ ] **Step 4: Commit**

```bash
git add src/services/facebook-ads-health/__tests__/twoWindow.test.ts package.json
git commit -m "test(facebook-ads-health): verify learning window stays trailing-7 regardless of reporting window"
```

---

### Task 10: Missing-data fallback test

**Files:**
- Create: `src/services/facebook-ads-health/__tests__/missingData.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the test**

```ts
import { computeVerdict } from "../verdictEngine";
import type { MetaAdInsightsRow, FacebookAdsHealthSettingsValues } from "../types";

const SETTINGS: FacebookAdsHealthSettingsValues = {
  breakevenRoas: 1.0,
  targetCpaAud: 40,
  zeroConvSpendMultiplier: 2.0,
  roasDropTriggerPct: 25,
  postEditWaitHours: 72,
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

// Missing lastSignificantEdit: Scale's edit check should also fail without crashing
{
  const row = baseRow();
  row.learningStatusBucket = "Active";
  row.learningStatusRaw = "SUCCESS";
  // daysSinceLastSignificantEdit stays null
  const result = computeVerdict(row, SETTINGS);
  assert(result.verdict === "hold", `Expected hold (missing edit data), got ${result.verdict}`);
  console.error("PASS: missing lastSignificantEdit → hold (Scale's edit gate fails closed)");
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
```

- [ ] **Step 2: Add test script to package.json**

```json
"test:facebook-ads-health-missing-data": "tsx src/services/facebook-ads-health/__tests__/missingData.test.ts",
```

- [ ] **Step 3: Run — expect PASS**

Run: `npm run test:facebook-ads-health-missing-data`
Expected: 3 PASS lines.

- [ ] **Step 4: Commit**

```bash
git add src/services/facebook-ads-health/__tests__/missingData.test.ts package.json
git commit -m "test(facebook-ads-health): missing-data fallback never crashes the engine"
```

---

## Phase 3 — Data pipeline (Meta API)

### Task 11: Add `inline_link_clicks` to Meta API field list

**Files:**
- Modify: `src/lib/facebook-marketing.ts`

- [ ] **Step 1: Find the three field-list strings**

Run `grep -n "spend,impressions,clicks" src/lib/facebook-marketing.ts` — expect 3 hits (around lines 143, 377, 449).

- [ ] **Step 2: Add `inline_link_clicks` to the bulk insights field lists**

Edit the daily and account-level insight calls (lines 143 and 377) to insert `inline_link_clicks` after `clicks`. Before: `"spend,impressions,clicks,actions,..."`. After: `"spend,impressions,clicks,inline_link_clicks,actions,..."`.

**Do NOT change the hourly insights line (around line 449).** The existing comment says only on-Meta metrics work with hourly breakdown, and `inline_link_clicks` is an off-Meta link-click metric. Leave the hourly endpoint as `"spend,impressions,clicks"`. The hourly view doesn't consume link clicks anyway.

- [ ] **Step 3: Update the `processInsightData` parsing to extract link clicks**

Find the function that parses `insight.clicks` (around line 246) and add right after it:

```ts
const linkClicks = parseInt(insight.inline_link_clicks || "0", 10);
```

In the return object, add `linkClicks`. In the TS interface for the returned metrics shape, also add `linkClicks: number;`.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: type errors only if downstream code now consumes `linkClicks` — fix them in Task 13 when wiring the sync.

- [ ] **Step 5: Commit**

```bash
git add src/lib/facebook-marketing.ts
git commit -m "feat(facebook-ads-health): request inline_link_clicks from Meta Marketing API"
```

---

### Task 12: Create `adsetMetadataFetcher`

**Files:**
- Create: `src/services/facebook-ads-health/adsetMetadataFetcher.ts`

- [ ] **Step 1: Write the fetcher**

```ts
/**
 * Pulls per-adset metadata from Meta's Marketing API:
 * learning_stage_info, last_significant_edit, daily_budget, lifetime_budget,
 * and the parent campaign's objective. One paginated call per ad account.
 */

export interface AdsetMetadata {
  adsetId: string;
  campaignId: string | null;
  campaignObjective: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  learningStatus: "LEARNING" | "SUCCESS" | "FAIL" | null;
  lastSignificantEdit: Date | null;
}

type MetaAdsetApiResponse = {
  data: Array<{
    id: string;
    daily_budget?: string;
    lifetime_budget?: string;
    learning_stage_info?: { status?: string };
    last_significant_edit?: { time?: string };
    campaign?: { id?: string; objective?: string };
  }>;
  paging?: { cursors?: { after?: string }; next?: string };
};

export async function fetchAdsetMetadata(
  adAccountId: string,
  accessToken: string,
): Promise<AdsetMetadata[]> {
  const fields = [
    "id",
    "daily_budget",
    "lifetime_budget",
    "learning_stage_info",
    "last_significant_edit",
    "campaign{id,objective}",
  ].join(",");

  // Meta requires effective_status to be a JSON-encoded array, URL-encoded.
  const effectiveStatus = encodeURIComponent(JSON.stringify(["ACTIVE", "PAUSED"]));

  const results: AdsetMetadata[] = [];
  let url:
    | string
    | null = `https://graph.facebook.com/v19.0/${adAccountId}/adsets?fields=${fields}&limit=200&effective_status=${effectiveStatus}&access_token=${accessToken}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error(`fetchAdsetMetadata failed: ${res.status} ${text}`);
      throw new Error(`Meta adsets API error: ${res.status}`);
    }
    const body: MetaAdsetApiResponse = await res.json();
    for (const item of body.data || []) {
      const status = item.learning_stage_info?.status;
      results.push({
        adsetId: item.id,
        campaignId: item.campaign?.id ?? null,
        campaignObjective: item.campaign?.objective ?? null,
        dailyBudgetCents: item.daily_budget ? parseInt(item.daily_budget, 10) : null,
        lifetimeBudgetCents: item.lifetime_budget ? parseInt(item.lifetime_budget, 10) : null,
        learningStatus:
          status === "LEARNING" || status === "SUCCESS" || status === "FAIL" ? status : null,
        lastSignificantEdit: item.last_significant_edit?.time
          ? new Date(item.last_significant_edit.time)
          : null,
      });
    }
    url = body.paging?.next ?? null;
  }

  return results;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/facebook-ads-health/adsetMetadataFetcher.ts
git commit -m "feat(facebook-ads-health): fetch adset metadata (learning, edit, budget) from Meta"
```

---

### Task 13: Wire `adsetMetadataFetcher` and link-clicks into the existing sync

**Files:**
- Modify: `src/services/meta/MetaInsightsSyncService.ts` (or `runMetaSpendByUrlSync.ts` — confirm which orchestrates the cron)

- [ ] **Step 1: Read the sync orchestrator to confirm where adset rows get upserted**

Open `src/services/meta/MetaInsightsSyncService.ts` and find where `MetaAdInsightsDaily` documents are constructed for the bulk upsert.

- [ ] **Step 2: Import the fetcher and pull metadata once per ad-account per sync run**

At the top of the sync orchestrator file:

```ts
import { fetchAdsetMetadata, type AdsetMetadata } from "@/services/facebook-ads-health/adsetMetadataFetcher";
```

Before the per-ad-row loop, populate a `Map<string, AdsetMetadata>`:

```ts
const metadataList = await fetchAdsetMetadata(adAccountId, accessToken);
const metadataByAdsetId = new Map(metadataList.map((m) => [m.adsetId, m]));
```

- [ ] **Step 3: Denormalize metadata onto each per-ad row at upsert time**

When constructing each `MetaAdInsightsDaily` document, look up the adset metadata and add:

```ts
const meta = row.adsetId ? metadataByAdsetId.get(row.adsetId) : null;
const doc = {
  // ... existing fields ...
  linkClicks: row.metrics.linkClicks,
  adsetBudgetCents: meta?.dailyBudgetCents ?? meta?.lifetimeBudgetCents ?? null,
  campaignObjective: meta?.campaignObjective ?? null,
  learningStatus: meta?.learningStatus ?? null,
  lastSignificantEdit: meta?.lastSignificantEdit ?? null,
};
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`

- [ ] **Step 5: Commit**

```bash
git add src/services/meta/MetaInsightsSyncService.ts
git commit -m "feat(facebook-ads-health): denormalize adset metadata into MetaAdInsightsDaily upserts"
```

---

### Task 14: Write attribution fields onto `PaymentEvent` at create time

**Files:**
- Modify: `src/utils/payment/payment-processing.ts` (the writer that creates PaymentEvent docs)

- [ ] **Step 1: Locate the PaymentEvent constructor calls**

Run: `grep -n "new PaymentEvent\|PaymentEvent.create" src/utils/payment/payment-processing.ts`

- [ ] **Step 2: Lift attribution from Stripe metadata into the top-level fields**

Wherever the PaymentEvent doc is built, before the `.create(...)` or `new PaymentEvent(...)` call, extract attribution:

```ts
const stripeMetadata = (intent?.metadata ?? {}) as Record<string, string | undefined>;
const attribution = {
  attributionAdId: stripeMetadata.attr_ad_id ?? null,
  attributionAdsetId: stripeMetadata.attr_adset_id ?? null,
  attributionCampaignId: stripeMetadata.attr_campaign_id ?? null,
};
```

Then spread it into the doc payload:

```ts
const doc = {
  // ... existing fields ...
  ...attribution,
};
```

Apply this everywhere PaymentEvent is created. If there are multiple call sites, factor a tiny `buildAttributionFields(metadata)` helper in the same file:

```ts
function buildAttributionFields(metadata: Record<string, string | undefined>) {
  return {
    attributionAdId: metadata.attr_ad_id ?? null,
    attributionAdsetId: metadata.attr_adset_id ?? null,
    attributionCampaignId: metadata.attr_campaign_id ?? null,
  };
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`

- [ ] **Step 4: Commit**

```bash
git add src/utils/payment/payment-processing.ts
git commit -m "feat(facebook-ads-health): denormalize Stripe attribution to PaymentEvent at write time"
```

---

## Phase 4 — Services

### Task 15: Settings service

**Files:**
- Create: `src/services/facebook-ads-health/settingsService.ts`

- [ ] **Step 1: Write the service**

```ts
import FacebookAdsHealthSettings, {
  FACEBOOK_ADS_HEALTH_SETTINGS_DEFAULTS,
} from "@/models/FacebookAdsHealthSettings";
import type { FacebookAdsHealthSettingsValues } from "./types";
import StaffActivity from "@/models/StaffActivity";
import { Types } from "mongoose";

export async function getOrInitSettings(): Promise<FacebookAdsHealthSettingsValues> {
  let doc = await FacebookAdsHealthSettings.findOne({ scope: "global" });
  if (!doc) {
    doc = await FacebookAdsHealthSettings.create(FACEBOOK_ADS_HEALTH_SETTINGS_DEFAULTS);
  }
  return {
    breakevenRoas: doc.breakevenRoas,
    targetCpaAud: doc.targetCpaAud,
    zeroConvSpendMultiplier: doc.zeroConvSpendMultiplier,
    roasDropTriggerPct: doc.roasDropTriggerPct,
    postEditWaitHours: doc.postEditWaitHours,
  };
}

export interface UpdateSettingsInput {
  values: Partial<FacebookAdsHealthSettingsValues>;
  userId: Types.ObjectId | string;
  userEmail: string;
  userRoleName: string;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<FacebookAdsHealthSettingsValues> {
  const doc = await FacebookAdsHealthSettings.findOneAndUpdate(
    { scope: "global" },
    { ...input.values, updatedBy: new Types.ObjectId(input.userId.toString()), updatedAt: new Date() },
    { new: true, upsert: true },
  );
  // Audit the mutation. StaffActivity schema is strict — see src/models/StaffActivity.ts:
  // required fields are actorId, actorEmail, actorRoleName, action, method, path, status, timestamp.
  // No `metadata` field exists; record the action name plus the path for traceability.
  await StaffActivity.create({
    actorId: new Types.ObjectId(input.userId.toString()),
    actorEmail: input.userEmail,
    actorRoleName: input.userRoleName,
    action: "facebook_ads_health_settings_update",
    method: "PUT",
    path: "/api/admin/facebook-ads/health/settings",
    status: 200,
    timestamp: new Date(),
  });
  return {
    breakevenRoas: doc!.breakevenRoas,
    targetCpaAud: doc!.targetCpaAud,
    zeroConvSpendMultiplier: doc!.zeroConvSpendMultiplier,
    roasDropTriggerPct: doc!.roasDropTriggerPct,
    postEditWaitHours: doc!.postEditWaitHours,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`. The `StaffActivity.create(...)` call uses the actual field names from `src/models/StaffActivity.ts` — the schema is `strict: true` so any field-name mismatch silently drops the data, but a missing required field causes a validation error.

- [ ] **Step 3: Commit**

```bash
git add src/services/facebook-ads-health/settingsService.ts
git commit -m "feat(facebook-ads-health): settings service with lazy init and StaffActivity audit"
```

---

### Task 16: Snooze service

**Files:**
- Create: `src/services/facebook-ads-health/snoozeService.ts`

- [ ] **Step 1: Write the service**

```ts
import FacebookAdsHealthSnooze from "@/models/FacebookAdsHealthSnooze";
import { Types } from "mongoose";

const MAX_SNOOZE_HOURS = 24;
const ALLOWED_VERDICTS = new Set(["investigate"]);

export interface UpsertSnoozeInput {
  userId: Types.ObjectId | string;
  adAccountId: string;
  adId: string;
  verdict: "investigate";
  hours: number;
  reason?: string;
}

export async function upsertSnooze(input: UpsertSnoozeInput): Promise<void> {
  if (!ALLOWED_VERDICTS.has(input.verdict)) {
    throw new Error(`Snooze not allowed for verdict: ${input.verdict}`);
  }
  const hours = Math.min(Math.max(1, input.hours), MAX_SNOOZE_HOURS);
  const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
  await FacebookAdsHealthSnooze.findOneAndUpdate(
    { userId: new Types.ObjectId(input.userId.toString()), adId: input.adId },
    {
      userId: new Types.ObjectId(input.userId.toString()),
      adAccountId: input.adAccountId,
      adId: input.adId,
      verdict: input.verdict,
      snoozeUntil,
      reason: input.reason,
      createdAt: new Date(),
    },
    { upsert: true, new: true },
  );
}

export async function loadActiveSnoozes(
  userId: Types.ObjectId | string,
  adIds: string[],
): Promise<Map<string, Date>> {
  if (adIds.length === 0) return new Map();
  const docs = await FacebookAdsHealthSnooze.find({
    userId: new Types.ObjectId(userId.toString()),
    adId: { $in: adIds },
    snoozeUntil: { $gt: new Date() },
  })
    .select("adId snoozeUntil")
    .lean();
  return new Map(docs.map((d) => [d.adId, d.snoozeUntil]));
}
```

- [ ] **Step 2: Type-check** — Run: `npm run type-check`

- [ ] **Step 3: Commit**

```bash
git add src/services/facebook-ads-health/snoozeService.ts
git commit -m "feat(facebook-ads-health): snooze service (investigate-only, 24h cap)"
```

---

### Task 17: Account TRUE ROAS service (extracted)

**Files:**
- Create: `src/services/facebook-ads-health/accountTrueRoasService.ts`
- Modify: `src/app/api/admin/facebook-ads/purchase-audit/route.ts`

- [ ] **Step 1: Open the existing purchase-audit route to copy its logic**

Open `src/app/api/admin/facebook-ads/purchase-audit/route.ts`. The PaymentEvent query and Meta insights sum lives there.

- [ ] **Step 2: Create the service with an explicit date-range API**

```ts
import PaymentEvent from "@/models/PaymentEvent";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";

export interface AccountTrueRoasInput {
  startDate: Date;
  endDate: Date;
  fbSince: string; // yyyy-mm-dd
  fbUntil: string; // yyyy-mm-dd
  accessToken: string;
  adAccountId: string;
}

export interface AccountTrueRoasOutput {
  localRevenueAud: number;
  metaSpendAud: number;
  metaPurchaseRevenueAud: number | null;
  metaPurchaseConversions: number | null;
  ratioLocalOverMetaSpend: number; // TRUE ROAS proxy
  ratioMetaOverLocal: number | null; // how much Meta over- or under-attributes
  error: string | null;
}

export async function computeAccountTrueRoas(
  input: AccountTrueRoasInput,
): Promise<AccountTrueRoasOutput> {
  // Local revenue: non-renewal BenefitsGranted events
  const localEvents = await PaymentEvent.find({
    eventType: "BenefitsGranted",
    timestamp: { $gte: input.startDate, $lte: input.endDate },
    $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
  })
    .select("data.price")
    .lean();
  let localRevenueAud = 0;
  for (const ev of localEvents) {
    const p = (ev as { data?: { price?: number } }).data?.price;
    if (typeof p === "number" && Number.isFinite(p)) localRevenueAud += p;
  }

  let metaSpendAud = 0;
  let metaPurchaseRevenueAud: number | null = null;
  let metaPurchaseConversions: number | null = null;
  let error: string | null = null;

  try {
    const insights = await fetchFacebookInsights(
      input.adAccountId,
      input.accessToken,
      { since: input.fbSince, until: input.fbUntil },
      "account",
    );
    let revenueCents = 0;
    let spendCents = 0;
    let conv = 0;
    for (const row of insights) {
      revenueCents += row.metrics.revenue;
      spendCents += row.metrics.spend;
      conv += row.metrics.conversions;
    }
    metaPurchaseRevenueAud = revenueCents / 100;
    metaSpendAud = spendCents / 100;
    metaPurchaseConversions = conv;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const ratioLocalOverMetaSpend = metaSpendAud > 0 ? localRevenueAud / metaSpendAud : 0;
  const ratioMetaOverLocal =
    localRevenueAud > 0 && metaPurchaseRevenueAud !== null
      ? metaPurchaseRevenueAud / localRevenueAud
      : null;

  return {
    localRevenueAud,
    metaSpendAud,
    metaPurchaseRevenueAud,
    metaPurchaseConversions,
    ratioLocalOverMetaSpend,
    ratioMetaOverLocal,
    error,
  };
}
```

- [ ] **Step 3: Refactor `purchase-audit/route.ts` to delegate to the service**

Replace the body of the GET handler with a call to `computeAccountTrueRoas`, passing the dates it already computes. The response shape stays the same — map the service output back into the existing response keys.

- [ ] **Step 4: Type-check + run existing purchase-audit smoke test if any**

Run: `npm run type-check`

- [ ] **Step 5: Commit**

```bash
git add src/services/facebook-ads-health/accountTrueRoasService.ts src/app/api/admin/facebook-ads/purchase-audit/route.ts
git commit -m "refactor(facebook-ads-health): extract purchase-audit logic into reusable service"
```

---

### Task 18: Insights aggregator

**Files:**
- Create: `src/services/facebook-ads-health/insightsAggregator.ts`

- [ ] **Step 1: Write the aggregator**

```ts
import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import { subDays, differenceInCalendarDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { PURCHASE_CAPABLE_OBJECTIVES, type MetaAdInsightsRow, type LearningStatusBucket } from "./types";

const AEST = "Australia/Sydney";

function bucketFromRaw(raw: string | null): LearningStatusBucket {
  if (raw === "SUCCESS") return "Active";
  if (raw === "LEARNING") return "Learning";
  if (raw === "FAIL") return "LearningLimited";
  return "Unknown";
}

export interface AggregatorInput {
  adAccountId: string;
  startDate: Date; // reporting window start
  endDate: Date;   // reporting window end
  level: "campaign" | "adset" | "ad";
}

export async function aggregateInsights(input: AggregatorInput): Promise<MetaAdInsightsRow[]> {
  const fbSince = formatInTimeZone(input.startDate, AEST, "yyyy-MM-dd");
  const fbUntil = formatInTimeZone(input.endDate, AEST, "yyyy-MM-dd");

  // Trailing 7d, trailing 14d, prev 7d (for WoW comparison)
  const trailing7Start = formatInTimeZone(subDays(new Date(), 6), AEST, "yyyy-MM-dd");
  const trailing14Start = formatInTimeZone(subDays(new Date(), 13), AEST, "yyyy-MM-dd");
  const prev7Start = formatInTimeZone(subDays(new Date(), 13), AEST, "yyyy-MM-dd");
  const prev7End = formatInTimeZone(subDays(new Date(), 7), AEST, "yyyy-MM-dd");
  const todayStr = formatInTimeZone(new Date(), AEST, "yyyy-MM-dd");

  // Pull a broad slice: from min(reportingStart, trailing14Start) to today
  const earliest = fbSince < trailing14Start ? fbSince : trailing14Start;
  const rows = await MetaAdInsightsDaily.find({
    adAccountId: input.adAccountId,
    date: { $gte: earliest, $lte: todayStr },
  }).lean();

  // Group by level
  const groupKey = (r: typeof rows[number]): string => {
    if (input.level === "campaign") return r.campaignId ?? "(none)";
    if (input.level === "adset") return r.adsetId ?? "(none)";
    return r.adId;
  };

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = groupKey(r);
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  const result: MetaAdInsightsRow[] = [];
  for (const [id, groupRows] of groups) {
    const first = groupRows[0];
    if (!first) continue;
    const inWindow = groupRows.filter((r) => r.date >= fbSince && r.date <= fbUntil);
    const in7 = groupRows.filter((r) => r.date >= trailing7Start && r.date <= todayStr);
    const inPrev7 = groupRows.filter((r) => r.date >= prev7Start && r.date < prev7End);
    const in14 = groupRows.filter((r) => r.date >= trailing14Start && r.date <= todayStr);

    const sum = (arr: typeof groupRows, key: "spendCents" | "conversions" | "revenueCents" | "linkClicks" | "impressions") =>
      arr.reduce((s, r) => s + (r[key] ?? 0), 0);

    const windowTotals = {
      spendCents: sum(inWindow, "spendCents"),
      conversions: sum(inWindow, "conversions"),
      revenueCents: sum(inWindow, "revenueCents"),
      linkClicks: sum(inWindow, "linkClicks"),
      impressions: sum(inWindow, "impressions"),
    };
    const last7 = {
      spendCents: sum(in7, "spendCents"),
      conversions: sum(in7, "conversions"),
      revenueCents: sum(in7, "revenueCents"),
    };
    const prev7 = {
      spendCents: sum(inPrev7, "spendCents"),
      conversions: sum(inPrev7, "conversions"),
      revenueCents: sum(inPrev7, "revenueCents"),
    };
    const prev7Roas = prev7.spendCents > 0 ? prev7.revenueCents / prev7.spendCents : null;

    // Best 7d window in last 14d: brute-force compute every 7-day rolling window.
    // 8 windows total (i=0..7). Each window is [startStr, endStr] inclusive on
    // both ends — a true 7-day span. i=0 is the oldest window (13d ago → 7d ago),
    // i=7 is the trailing-7 window (6d ago → today).
    let last14dBestWeek = { conversions: 0, roas: 0 };
    for (let i = 0; i <= 7; i++) {
      const startStr = formatInTimeZone(subDays(new Date(), 13 - i), AEST, "yyyy-MM-dd");
      const endStr = formatInTimeZone(subDays(new Date(), 7 - i), AEST, "yyyy-MM-dd");
      const slice = groupRows.filter((r) => r.date >= startStr && r.date <= endStr);
      const c = sum(slice, "conversions");
      const s = sum(slice, "spendCents");
      const rev = sum(slice, "revenueCents");
      const roas = s > 0 ? rev / s : 0;
      if (c > last14dBestWeek.conversions) last14dBestWeek = { conversions: c, roas };
    }

    // daysAtZeroInWindow
    const daysAtZeroInWindow = inWindow.filter((r) => (r.conversions ?? 0) === 0).length;

    // daysInLearningLimited: count from most recent backwards while learningStatus stays FAIL
    let daysInLearningLimited = 0;
    const sortedDesc = [...groupRows].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const r of sortedDesc) {
      if (r.learningStatus === "FAIL") daysInLearningLimited++;
      else break;
    }

    const latest = sortedDesc[0];
    const learningStatusRaw = (latest?.learningStatus ?? null) as MetaAdInsightsRow["learningStatusRaw"];
    const lastSignificantEdit = latest?.lastSignificantEdit ?? null;
    const daysSinceLastSignificantEdit = lastSignificantEdit
      ? differenceInCalendarDays(new Date(), new Date(lastSignificantEdit))
      : null;

    // lastBudgetChangePct: find the largest day-over-day budget change within the reporting window
    let lastBudgetChangePct: number | null = null;
    let lastBudgetChangeDate: Date | null = null;
    const sortedAsc = [...inWindow].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 1; i < sortedAsc.length; i++) {
      const prev = sortedAsc[i - 1]?.adsetBudgetCents;
      const curr = sortedAsc[i]?.adsetBudgetCents;
      if (prev != null && curr != null && prev > 0 && curr !== prev) {
        const pct = ((curr - prev) / prev) * 100;
        if (lastBudgetChangePct === null || Math.abs(pct) > Math.abs(lastBudgetChangePct)) {
          lastBudgetChangePct = Math.round(pct);
          lastBudgetChangeDate = new Date(sortedAsc[i]!.date);
        }
      }
    }

    const isPurchaseCapable = first.campaignObjective
      ? PURCHASE_CAPABLE_OBJECTIVES.has(first.campaignObjective)
      : true; // unknown defaults to capable

    result.push({
      level: input.level,
      adAccountId: input.adAccountId,
      id,
      name:
        input.level === "campaign"
          ? first.campaignName ?? id
          : input.level === "adset"
            ? first.adsetName ?? id
            : first.adName ?? id,
      campaignId: first.campaignId ?? "",
      campaignName: first.campaignName ?? "",
      adsetId: first.adsetId,
      adsetName: first.adsetName,
      window: windowTotals,
      daily: inWindow.map((r) => ({
        date: r.date,
        spendCents: r.spendCents,
        conversions: r.conversions ?? 0,
        revenueCents: r.revenueCents ?? 0,
        linkClicks: r.linkClicks ?? 0,
        impressions: r.impressions ?? 0,
      })),
      last7d: {
        conversions: last7.conversions,
        spendCents: last7.spendCents,
        revenueCents: last7.revenueCents,
        prev7dConversions: prev7.conversions,
        prev7dRoas: prev7Roas,
      },
      last14dBestWeek,
      learningStatusRaw,
      learningStatusBucket: bucketFromRaw(learningStatusRaw),
      lastSignificantEdit,
      daysSinceLastSignificantEdit,
      daysInLearningLimited,
      lastBudgetChangePct,
      lastBudgetChangeDate,
      campaignObjective: first.campaignObjective ?? null,
      isPurchaseCapableObjective: isPurchaseCapable,
      daysAtZeroInWindow,
    });
  }

  return result;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`. If lean() return types don't include the new fields, add an `as any` cast at the find().lean() site (this is acceptable per repo conventions when bridging Mongoose lean docs to typed services).

- [ ] **Step 3: Commit**

```bash
git add src/services/facebook-ads-health/insightsAggregator.ts
git commit -m "feat(facebook-ads-health): aggregate per-row insights with two-window math"
```

---

## Phase 5 — API routes

### Task 19: Insights route

**Files:**
- Create: `src/app/api/admin/facebook-ads/health/insights/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { aggregateInsights } from "@/services/facebook-ads-health/insightsAggregator";
import { computeVerdict } from "@/services/facebook-ads-health/verdictEngine";
import { getOrInitSettings } from "@/services/facebook-ads-health/settingsService";
import { computeAccountTrueRoas } from "@/services/facebook-ads-health/accountTrueRoasService";
import { loadActiveSnoozes } from "@/services/facebook-ads-health/snoozeService";
import { parseISO } from "date-fns";

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  level: z.enum(["campaign", "adset", "ad"]).default("adset"),
  verdict: z.string().optional(),
  learningStatus: z.string().optional(),
  minSpend: z.coerce.number().optional(),
  campaign: z.string().optional(),
  search: z.string().optional(),
});

export async function GET(request: NextRequest) {
  // requirePermission returns { session: Session } or a NextResponse — destructure.
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  await connectDB();
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid query", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const q = parsed.data;
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID ?? "";
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN ?? "";
  if (!adAccountId || !accessToken) {
    return NextResponse.json(
      { success: false, error: "FACEBOOK_AD_ACCOUNT_ID or FACEBOOK_MARKETING_ACCESS_TOKEN not configured" },
      { status: 500 },
    );
  }

  const settings = await getOrInitSettings();
  const rows = await aggregateInsights({
    adAccountId,
    startDate: parseISO(q.startDate),
    endDate: parseISO(q.endDate),
    level: q.level,
  });

  // Apply filters
  const verdictFilter = q.verdict ? new Set(q.verdict.split(",")) : null;
  const statusFilter = q.learningStatus ? new Set(q.learningStatus.split(",")) : null;
  const campaignFilter = q.campaign ? new Set(q.campaign.split(",")) : null;

  const enriched = rows
    .map((row) => {
      const v = computeVerdict(row, settings);
      return { row, v };
    })
    .filter(({ row, v }) => {
      if (verdictFilter && !verdictFilter.has(v.verdict)) return false;
      if (statusFilter && !statusFilter.has(row.learningStatusBucket)) return false;
      if (q.minSpend !== undefined && row.window.spendCents < q.minSpend * 100) return false;
      if (campaignFilter && !campaignFilter.has(row.campaignId)) return false;
      if (q.search && !row.name.toLowerCase().includes(q.search.toLowerCase())) return false;
      return true;
    });

  const userId = session.user?.id ?? "";
  const snoozes = userId ? await loadActiveSnoozes(userId, enriched.map((e) => e.row.id)) : new Map<string, Date>();

  // Account-level TRUE ROAS for the same window
  const trueRoas = await computeAccountTrueRoas({
    startDate: parseISO(q.startDate),
    endDate: parseISO(q.endDate),
    fbSince: q.startDate,
    fbUntil: q.endDate,
    accessToken,
    adAccountId,
  });

  let investigateCount = 0;
  let cutCount = 0;
  const out = enriched.map(({ row, v }) => {
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
      last7d: { conversions: row.last7d.conversions, roas: row.last7d.spendCents > 0 ? row.last7d.revenueCents / row.last7d.spendCents : 0, prev7dRoas: row.last7d.prev7dRoas },
      lastSignificantEdit: row.lastSignificantEdit,
      lastBudgetChangePct: row.lastBudgetChangePct,
      daysAtZero: row.daysAtZeroInWindow,
      verdict: v.verdict,
      verdictReasons: v.reasons,
      actionText: v.actionText,
      metaAdsManagerUrl: `https://business.facebook.com/adsmanager/manage/adsets?act=${adAccountId.replace(/^act_/, "")}&selected_adset_ids=${row.adsetId ?? row.id}`,
      snoozedUntil: snoozes.get(row.id) ?? null,
    };
  });

  return NextResponse.json({
    success: true,
    rows: out,
    alertCount: { investigate: investigateCount, cut: cutCount },
    accountTrueRoas: {
      localRevenueAud: trueRoas.localRevenueAud,
      metaSpendAud: trueRoas.metaSpendAud,
      ratio: trueRoas.ratioLocalOverMetaSpend,
      metaPurchaseRevenueAud: trueRoas.metaPurchaseRevenueAud,
    },
  });
}
```

- [ ] **Step 2: Type-check + ad-hoc curl**

Run: `npm run type-check`. Then start dev server (`npm run dev`) and hit:

```
curl 'http://localhost:3000/api/admin/facebook-ads/health/insights?startDate=2026-05-18&endDate=2026-05-24&level=adset' -H 'Cookie: ...'
```

Expected: 200 with `{ success: true, rows: [...] }` (or 401/403 if not logged in — which still proves the route mounts).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/facebook-ads/health/insights/route.ts
git commit -m "feat(facebook-ads-health): insights API route"
```

---

### Task 20: Snooze route

**Files:**
- Create: `src/app/api/admin/facebook-ads/health/snooze/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { upsertSnooze } from "@/services/facebook-ads-health/snoozeService";

const bodySchema = z.object({
  adId: z.string().min(1),
  verdict: z.literal("investigate"),
  hours: z.number().int().min(1).max(24),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;
  await connectDB();
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid body", details: parsed.error.issues }, { status: 400 });
  }
  const userId = session.user?.id;
  if (!userId) return NextResponse.json({ success: false, error: "No user" }, { status: 401 });
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID ?? "";
  try {
    await upsertSnooze({
      userId,
      adAccountId,
      adId: parsed.data.adId,
      verdict: parsed.data.verdict,
      hours: parsed.data.hours,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown" },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run type-check
git add src/app/api/admin/facebook-ads/health/snooze/route.ts
git commit -m "feat(facebook-ads-health): snooze API route"
```

---

### Task 21: Settings route (GET + PUT)

**Files:**
- Create: `src/app/api/admin/facebook-ads/health/settings/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getOrInitSettings, updateSettings } from "@/services/facebook-ads-health/settingsService";

export async function GET() {
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;
  await connectDB();
  const settings = await getOrInitSettings();
  return NextResponse.json({ success: true, settings });
}

const putSchema = z.object({
  breakevenRoas: z.number().min(0).max(10).optional(),
  targetCpaAud: z.number().min(1).max(10000).optional(),
  zeroConvSpendMultiplier: z.number().min(0.5).max(10).optional(),
  roasDropTriggerPct: z.number().min(5).max(95).optional(),
  postEditWaitHours: z.number().int().min(1).max(168).optional(),
});

export async function PUT(request: NextRequest) {
  const guard = await requirePermission("facebookAds.edit");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;
  await connectDB();
  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid body", details: parsed.error.issues }, { status: 400 });
  }
  const userId = session.user?.id;
  const userEmail = session.user?.email ?? "";
  const userRoleName =
    session.user?.userType === "admin"
      ? "admin"
      : (session.user as { roleName?: string } | undefined)?.roleName ?? session.user?.role ?? "staff";
  if (!userId) return NextResponse.json({ success: false, error: "No user" }, { status: 401 });
  const settings = await updateSettings({ values: parsed.data, userId, userEmail, userRoleName });
  return NextResponse.json({ success: true, settings });
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run type-check
git add src/app/api/admin/facebook-ads/health/settings/route.ts
git commit -m "feat(facebook-ads-health): settings API route (GET + PUT)"
```

---

### Task 22: Vercel timeout override

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add the override above the catch-all line**

In `vercel.json` `functions` block, add before `"src/app/api/**/route.ts"`:

```json
"src/app/api/admin/facebook-ads/health/insights/route.ts": { "memory": 512, "maxDuration": 30 },
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore(facebook-ads-health): bump insights route timeout to 30s"
```

---

## Phase 6 — UI

### Task 23: TanStack Query hook

**Files:**
- Create: `src/hooks/queries/admin/useFacebookAdsHealth.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FacebookAdsHealthQueryArgs {
  startDate: string;
  endDate: string;
  level: "campaign" | "adset" | "ad";
  verdict?: string[];
  learningStatus?: string[];
  minSpend?: number;
  campaign?: string[];
  search?: string;
}

function buildUrl(args: FacebookAdsHealthQueryArgs): string {
  const p = new URLSearchParams();
  p.set("startDate", args.startDate);
  p.set("endDate", args.endDate);
  p.set("level", args.level);
  if (args.verdict?.length) p.set("verdict", args.verdict.join(","));
  if (args.learningStatus?.length) p.set("learningStatus", args.learningStatus.join(","));
  if (args.minSpend !== undefined) p.set("minSpend", String(args.minSpend));
  if (args.campaign?.length) p.set("campaign", args.campaign.join(","));
  if (args.search) p.set("search", args.search);
  return `/api/admin/facebook-ads/health/insights?${p}`;
}

export function useFacebookAdsHealth(args: FacebookAdsHealthQueryArgs) {
  return useQuery({
    queryKey: ["facebookAdsHealth", "insights", args],
    queryFn: async () => {
      const r = await fetch(buildUrl(args));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
  });
}

export function useFacebookAdsHealthSnooze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { adId: string; hours: number; reason?: string }) => {
      const r = await fetch("/api/admin/facebook-ads/health/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, verdict: "investigate" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["facebookAdsHealth", "insights"] }),
  });
}

export function useFacebookAdsHealthSettings() {
  return useQuery({
    queryKey: ["facebookAdsHealth", "settings"],
    queryFn: async () => {
      const r = await fetch("/api/admin/facebook-ads/health/settings");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useFacebookAdsHealthSettingsUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, number>) => {
      const r = await fetch("/api/admin/facebook-ads/health/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facebookAdsHealth"] });
    },
  });
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run type-check
git add src/hooks/queries/admin/useFacebookAdsHealth.ts
git commit -m "feat(facebook-ads-health): TanStack Query hooks for insights/snooze/settings"
```

---

### Task 24: Verdict tooltip component

**Files:**
- Create: `src/components/admin/facebook-ads-health/FacebookAdsHealthVerdictTooltip.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import React from "react";

interface VerdictReason {
  section: string;
  rule: string;
  source: "meta" | "tunable";
  passed: boolean | "info";
  value: string;
}

interface Props {
  verdict: "scale" | "hold" | "investigate" | "cut";
  reasons: VerdictReason[];
  actionText: string;
}

const VERDICT_META: Record<Props["verdict"], { label: string; color: string }> = {
  scale: { label: "SCALE +20%", color: "text-emerald-700 dark:text-emerald-300" },
  hold: { label: "HOLD", color: "text-amber-800 dark:text-amber-300" },
  investigate: { label: "INVESTIGATE", color: "text-blue-700 dark:text-blue-300" },
  cut: { label: "CUT?", color: "text-red-700 dark:text-red-300" },
};

export function FacebookAdsHealthVerdictTooltip({ verdict, reasons, actionText }: Props) {
  const sections = Array.from(new Set(reasons.map((r) => r.section)));
  return (
    <div className="w-[380px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl text-xs">
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
        <div className={`font-bold text-[13px] ${VERDICT_META[verdict].color}`}>{VERDICT_META[verdict].label}</div>
      </div>
      {sections.map((section) => (
        <div key={section} className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">{section}</div>
          {reasons.filter((r) => r.section === section).map((r, idx) => (
            <div key={idx} className="flex items-start gap-2 py-0.5 leading-snug">
              <span className="w-3 text-center" aria-hidden>
                {r.passed === true ? <span className="text-emerald-600">✓</span> : r.passed === false ? <span className="text-red-600">✗</span> : <span className="text-zinc-400">·</span>}
              </span>
              <div className="flex-1 text-zinc-800 dark:text-zinc-100">
                <span className="font-medium">{r.rule}:</span>{" "}
                <span className="font-semibold">{r.value}</span>
                <span className={`inline-block ml-1.5 text-[8px] font-bold px-1 py-px rounded ${r.source === "meta" ? "bg-blue-800 text-white" : "bg-zinc-500 text-white"}`}>{r.source === "meta" ? "META" : "TUNABLE"}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
      <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-b-md">
        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">What to do next</div>
        <div className="text-zinc-800 dark:text-zinc-100 leading-snug">{actionText}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/facebook-ads-health/FacebookAdsHealthVerdictTooltip.tsx
git commit -m "feat(facebook-ads-health): verdict tooltip component"
```

---

### Task 25: Pivot table component (desktop) — see follow-up tasks for mobile

**Files:**
- Create: `src/components/admin/facebook-ads-health/FacebookAdsHealthPivotTable.tsx`

- [ ] **Step 1: Write the table component**

```tsx
"use client";
import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import { FacebookAdsHealthVerdictTooltip } from "./FacebookAdsHealthVerdictTooltip";

type Metric = "spend" | "conversions" | "revenue" | "roas" | "linkClicks" | "linkCtr" | "costPerLinkClick";

interface DailyCell {
  date: string;
  spendCents: number;
  conversions: number;
  revenueCents: number;
  linkClicks: number;
  impressions: number;
  linkCtr: number;
  costPerLinkClick: number;
  roas: number;
}

export interface PivotRow {
  id: string;
  name: string;
  campaignName: string;
  adsetName?: string;
  learningStatus: "Active" | "Learning" | "LearningLimited" | "Unknown";
  daily: DailyCell[];
  window: { spendCents: number; conversions: number; revenueCents: number };
  lastBudgetChangePct: number | null;
  verdict: "scale" | "hold" | "investigate" | "cut";
  verdictReasons: Array<{ section: string; rule: string; source: "meta" | "tunable"; passed: boolean | "info"; value: string }>;
  actionText: string;
  metaAdsManagerUrl: string;
  snoozedUntil: string | null;
}

function metricValue(cell: DailyCell, metric: Metric): number {
  switch (metric) {
    case "spend": return cell.spendCents / 100;
    case "conversions": return cell.conversions;
    case "revenue": return cell.revenueCents / 100;
    case "roas": return cell.roas;
    case "linkClicks": return cell.linkClicks;
    case "linkCtr": return cell.linkCtr;
    case "costPerLinkClick": return cell.costPerLinkClick / 100;
  }
}

function heatClass(value: number, max: number): string {
  if (value === 0 && max > 0) return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300";
  if (max <= 0) return "";
  const pct = value / max;
  if (pct >= 0.85) return "bg-blue-700 text-white";
  if (pct >= 0.65) return "bg-blue-500 text-white";
  if (pct >= 0.40) return "bg-blue-300 dark:bg-blue-900 text-blue-900 dark:text-blue-100";
  if (pct >= 0.15) return "bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-100";
  return "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100";
}

function formatCell(value: number, metric: Metric): string {
  if (metric === "spend" || metric === "revenue" || metric === "costPerLinkClick") return `$${value.toFixed(0)}`;
  if (metric === "roas") return value.toFixed(2);
  if (metric === "linkCtr") return `${value.toFixed(1)}%`;
  return value.toFixed(0);
}

const STATUS_BADGE: Record<PivotRow["learningStatus"], string> = {
  Active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  Learning: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  LearningLimited: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  Unknown: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const VERDICT_CHIP: Record<PivotRow["verdict"], string> = {
  scale: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  hold: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  investigate: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  cut: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
};

interface Props {
  rows: PivotRow[];
  metric: Metric;
}

export function FacebookAdsHealthPivotTable({ rows, metric }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dates = rows[0]?.daily.map((d) => d.date) ?? [];
  const totalsByDate = dates.map((date) => {
    return rows.reduce((sum, r) => {
      const cell = r.daily.find((d) => d.date === date);
      return sum + (cell ? metricValue(cell, metric) : 0);
    }, 0);
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      <table className="w-full border-collapse text-xs min-w-[900px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-800 text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 min-w-[200px]">Adset</th>
            {dates.map((date) => (
              <th key={date} className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 min-w-[56px]">
                <div className="font-normal text-[9px] text-zinc-400">{new Date(date).toLocaleDateString("en-AU", { weekday: "short" })}</div>
                <div>{date.slice(5)}</div>
              </th>
            ))}
            <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">Total</th>
            <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">Verdict</th>
            <th className="border-b border-zinc-200 dark:border-zinc-700"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowMax = Math.max(...row.daily.map((d) => metricValue(d, metric)));
            const windowTotal =
              metric === "spend" ? row.window.spendCents / 100 :
              metric === "conversions" ? row.window.conversions :
              metric === "revenue" ? row.window.revenueCents / 100 :
              row.daily.reduce((s, d) => s + metricValue(d, metric), 0);
            return (
              <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="sticky left-0 bg-white dark:bg-zinc-900 px-3 py-2 align-top">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">{row.name}</div>
                  <div className="flex gap-1.5 items-center text-[10px] text-zinc-500 mt-0.5">
                    <span className={`px-1.5 py-px rounded-full text-[9px] font-semibold uppercase ${STATUS_BADGE[row.learningStatus]}`}>{row.learningStatus}</span>
                    <span>{row.campaignName}</span>
                  </div>
                </td>
                {row.daily.map((cell) => {
                  const v = metricValue(cell, metric);
                  return (
                    <td key={cell.date} className={`text-center font-mono font-semibold text-[11px] ${cell.conversions === 0 && metric === "conversions" ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300" : heatClass(v, rowMax)}`}>
                      {formatCell(v, metric)}
                    </td>
                  );
                })}
                <td className="text-right font-mono font-bold px-2 bg-zinc-50 dark:bg-zinc-800">{formatCell(windowTotal, metric)}</td>
                <td className="text-center px-2 relative">
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded font-semibold cursor-help ${VERDICT_CHIP[row.verdict]}`}
                    onMouseEnter={() => setHoverId(row.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    {row.verdict === "scale" ? "Scale +20%" : row.verdict === "cut" ? "Cut?" : row.verdict[0]!.toUpperCase() + row.verdict.slice(1)}
                  </span>
                  {hoverId === row.id && (
                    <div className="absolute right-0 top-full mt-1 z-50">
                      <FacebookAdsHealthVerdictTooltip verdict={row.verdict} reasons={row.verdictReasons} actionText={row.actionText} />
                    </div>
                  )}
                </td>
                <td className="px-2">
                  <a href={row.metaAdsManagerUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-blue-600">
                    <ExternalLink size={14} />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-zinc-100 dark:bg-zinc-800 font-bold">
            <td className="sticky left-0 bg-zinc-100 dark:bg-zinc-800 px-3 py-2">Totals (visible)</td>
            {totalsByDate.map((t, i) => (
              <td key={i} className="text-center font-mono text-[11px]">{formatCell(t, metric)}</td>
            ))}
            <td className="text-right font-mono px-2">{formatCell(totalsByDate.reduce((a, b) => a + b, 0), metric)}</td>
            <td></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run type-check
git add src/components/admin/facebook-ads-health/FacebookAdsHealthPivotTable.tsx
git commit -m "feat(facebook-ads-health): pivot table with heatmap cells and verdict tooltip"
```

---

### Task 26: Top bar component (TRUE ROAS card + alert banner)

**Files:**
- Create: `src/components/admin/facebook-ads-health/FacebookAdsHealthTopBar.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import React from "react";

interface Props {
  trueRoas: { localRevenueAud: number; metaSpendAud: number; ratio: number; metaPurchaseRevenueAud: number | null } | null;
  alertCount: { investigate: number; cut: number };
  onShowAlertedOnly: () => void;
}

export function FacebookAdsHealthTopBar({ trueRoas, alertCount, onShowAlertedOnly }: Props) {
  const total = alertCount.investigate + alertCount.cut;
  return (
    <div className="space-y-3 mb-4">
      {trueRoas && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Account TRUE ROAS (window)</div>
          <div className="flex items-baseline gap-3 mt-1">
            <div className="text-2xl font-bold tabular-nums">{trueRoas.ratio.toFixed(2)}</div>
            {trueRoas.metaPurchaseRevenueAud !== null && trueRoas.metaSpendAud > 0 && (
              <div className="text-xs text-zinc-500">
                Meta-reported: {(trueRoas.metaPurchaseRevenueAud / trueRoas.metaSpendAud).toFixed(2)}
                {trueRoas.localRevenueAud > 0 && (
                  <span className="ml-2">
                    Meta {((trueRoas.metaPurchaseRevenueAud / trueRoas.localRevenueAud - 1) * 100).toFixed(0)}% vs local
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">
            ${trueRoas.localRevenueAud.toFixed(0)} local revenue / ${trueRoas.metaSpendAud.toFixed(0)} Meta spend
          </div>
        </div>
      )}
      {total > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          <strong>{total} adset{total > 1 ? "s" : ""} need attention.</strong>
          <span>{alertCount.cut} Cut? · {alertCount.investigate} Investigate</span>
          <button onClick={onShowAlertedOnly} className="ml-auto text-xs underline cursor-pointer">Show only these</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/facebook-ads-health/FacebookAdsHealthTopBar.tsx
git commit -m "feat(facebook-ads-health): top bar with TRUE ROAS card + alert banner"
```

---

### Task 27: Filters component

**Files:**
- Create: `src/components/admin/facebook-ads-health/FacebookAdsHealthFilters.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import React from "react";
import { Search, SlidersHorizontal } from "lucide-react";

export type MetricChoice = "spend" | "conversions" | "revenue" | "roas" | "linkClicks" | "linkCtr" | "costPerLinkClick";

const METRIC_LABELS: Record<MetricChoice, string> = {
  spend: "Spend",
  conversions: "Conv",
  revenue: "Revenue",
  roas: "ROAS",
  linkClicks: "Link Clicks",
  linkCtr: "Link CTR",
  costPerLinkClick: "Cost/Link Click",
};

interface Props {
  metric: MetricChoice;
  onMetricChange: (m: MetricChoice) => void;
  verdictFilter: string[];
  onVerdictFilterChange: (v: string[]) => void;
  learningStatusFilter: string[];
  onLearningStatusFilterChange: (v: string[]) => void;
  minSpend: number | "";
  onMinSpendChange: (n: number | "") => void;
  campaignFilter: string[];
  campaignOptions: Array<{ id: string; name: string }>;
  onCampaignFilterChange: (v: string[]) => void;
  search: string;
  onSearchChange: (s: string) => void;
  onOpenSettings: () => void;
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

export function FacebookAdsHealthFilters(props: Props) {
  return (
    <div className="flex flex-wrap gap-2 items-center text-xs mb-3">
      <span className="text-zinc-500">Metric:</span>
      {(Object.keys(METRIC_LABELS) as MetricChoice[]).map((m) => (
        <button
          key={m}
          onClick={() => props.onMetricChange(m)}
          className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${props.metric === m ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
        >
          {METRIC_LABELS[m]}
        </button>
      ))}
      <span className="text-zinc-300 dark:text-zinc-700">|</span>
      <span className="text-zinc-500">Verdict:</span>
      {["scale", "hold", "investigate", "cut"].map((v) => (
        <button
          key={v}
          onClick={() => props.onVerdictFilterChange(toggleInArray(props.verdictFilter, v))}
          className={`px-2 py-1 rounded-full border text-[10px] ${props.verdictFilter.includes(v) ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
        >
          {v}
        </button>
      ))}
      <span className="text-zinc-300 dark:text-zinc-700">|</span>
      <span className="text-zinc-500">Status:</span>
      {["Active", "Learning", "LearningLimited"].map((s) => (
        <button
          key={s}
          onClick={() => props.onLearningStatusFilterChange(toggleInArray(props.learningStatusFilter, s))}
          className={`px-2 py-1 rounded-full border text-[10px] ${props.learningStatusFilter.includes(s) ? "bg-blue-600 text-white border-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
        >
          {s}
        </button>
      ))}
      <span className="text-zinc-300 dark:text-zinc-700">|</span>
      <label className="text-zinc-500">
        Spend ≥ $
        <input
          type="number"
          value={props.minSpend}
          onChange={(e) => props.onMinSpendChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="ml-1 w-16 px-1 py-0.5 border rounded text-[11px] bg-white dark:bg-zinc-800"
        />
      </label>
      <div className="flex items-center border rounded px-1.5 py-0.5 bg-white dark:bg-zinc-800">
        <Search size={11} className="text-zinc-400" />
        <input
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
          placeholder="Search name..."
          className="ml-1 w-32 bg-transparent text-[11px] outline-none"
        />
      </div>
      <button onClick={props.onOpenSettings} className="ml-auto p-1.5 rounded border border-zinc-300 dark:border-zinc-700">
        <SlidersHorizontal size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/facebook-ads-health/FacebookAdsHealthFilters.tsx
git commit -m "feat(facebook-ads-health): filters bar (metric, verdict, status, spend, search)"
```

---

### Task 28: Settings modal

**Files:**
- Create: `src/components/admin/facebook-ads-health/FacebookAdsHealthSettingsModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
"use client";
import React, { useState, useEffect } from "react";
import { useFacebookAdsHealthSettings, useFacebookAdsHealthSettingsUpdate } from "@/hooks/queries/admin/useFacebookAdsHealth";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FIELDS: Array<{ key: string; label: string; min: number; max: number; step: number }> = [
  { key: "breakevenRoas", label: "Breakeven ROAS", min: 0, max: 10, step: 0.05 },
  { key: "targetCpaAud", label: "Target CPA (AUD)", min: 1, max: 10000, step: 1 },
  { key: "zeroConvSpendMultiplier", label: "Zero-conv spend multiplier", min: 0.5, max: 10, step: 0.1 },
  { key: "roasDropTriggerPct", label: "ROAS-drop trigger %", min: 5, max: 95, step: 1 },
  { key: "postEditWaitHours", label: "Post-edit wait window (hours)", min: 1, max: 168, step: 1 },
];

const DEFAULTS: Record<string, number> = {
  breakevenRoas: 1.0,
  targetCpaAud: 40,
  zeroConvSpendMultiplier: 2.0,
  roasDropTriggerPct: 25,
  postEditWaitHours: 72,
};

export function FacebookAdsHealthSettingsModal({ open, onClose }: Props) {
  const { data } = useFacebookAdsHealthSettings();
  const update = useFacebookAdsHealthSettingsUpdate();
  const [form, setForm] = useState<Record<string, number>>({});

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-[420px] max-w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold mb-3">Ads Health — Tunable Thresholds</h3>
        {FIELDS.map((f) => (
          <label key={f.key} className="block mb-3 text-xs">
            <span className="block mb-1 text-zinc-600 dark:text-zinc-300">{f.label}</span>
            <input
              type="number"
              min={f.min}
              max={f.max}
              step={f.step}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
              className="w-full border rounded px-2 py-1 bg-white dark:bg-zinc-800"
            />
          </label>
        ))}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={() => setForm(DEFAULTS)} className="px-3 py-1.5 text-xs border rounded">Restore defaults</button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs border rounded">Cancel</button>
          <button
            onClick={() => update.mutate(form, { onSuccess: onClose })}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded"
            disabled={update.isPending}
          >Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/facebook-ads-health/FacebookAdsHealthSettingsModal.tsx
git commit -m "feat(facebook-ads-health): tunable settings modal"
```

---

### Task 29: View orchestrator + wire into FacebookAdsManagement

**Files:**
- Create: `src/components/admin/facebook-ads-health/FacebookAdsHealthView.tsx`
- Modify: `src/components/admin/FacebookAdsManagement.tsx`

- [ ] **Step 1: Write the orchestrator**

```tsx
"use client";
import React, { useMemo, useState } from "react";
import { useFacebookAdsHealth } from "@/hooks/queries/admin/useFacebookAdsHealth";
import { FacebookAdsHealthTopBar } from "./FacebookAdsHealthTopBar";
import { FacebookAdsHealthFilters, type MetricChoice } from "./FacebookAdsHealthFilters";
import { FacebookAdsHealthPivotTable } from "./FacebookAdsHealthPivotTable";
import { FacebookAdsHealthSettingsModal } from "./FacebookAdsHealthSettingsModal";

interface Props {
  startDate: string;
  endDate: string;
}

export function FacebookAdsHealthView({ startDate, endDate }: Props) {
  const [metric, setMetric] = useState<MetricChoice>("conversions");
  const [verdictFilter, setVerdictFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [minSpend, setMinSpend] = useState<number | "">("");
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data, isLoading, isError } = useFacebookAdsHealth({
    startDate,
    endDate,
    level: "adset",
    verdict: verdictFilter.length ? verdictFilter : undefined,
    learningStatus: statusFilter.length ? statusFilter : undefined,
    minSpend: minSpend === "" ? undefined : minSpend,
    campaign: campaignFilter.length ? campaignFilter : undefined,
    search: search || undefined,
  });

  const campaignOptions = useMemo(() => {
    const m = new Map<string, string>();
    (data?.rows ?? []).forEach((r: { campaignId: string; campaignName: string }) => m.set(r.campaignId, r.campaignName));
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [data]);

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (isError) return <div className="p-6 text-sm text-red-600">Failed to load.</div>;

  return (
    <div className="p-4">
      <FacebookAdsHealthTopBar
        trueRoas={data?.accountTrueRoas ?? null}
        alertCount={data?.alertCount ?? { investigate: 0, cut: 0 }}
        onShowAlertedOnly={() => setVerdictFilter(["cut", "investigate"])}
      />
      <FacebookAdsHealthFilters
        metric={metric}
        onMetricChange={setMetric}
        verdictFilter={verdictFilter}
        onVerdictFilterChange={setVerdictFilter}
        learningStatusFilter={statusFilter}
        onLearningStatusFilterChange={setStatusFilter}
        minSpend={minSpend}
        onMinSpendChange={setMinSpend}
        campaignFilter={campaignFilter}
        campaignOptions={campaignOptions}
        onCampaignFilterChange={setCampaignFilter}
        search={search}
        onSearchChange={setSearch}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <FacebookAdsHealthPivotTable rows={data?.rows ?? []} metric={metric} />
      <FacebookAdsHealthSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Wire into `FacebookAdsManagement.tsx`**

In `src/components/admin/FacebookAdsManagement.tsx`:

1. Import the orchestrator at top: `import { FacebookAdsHealthView } from "./facebook-ads-health/FacebookAdsHealthView";`
2. Update the `viewMode` type to include `"health"`: replace `useState<"ads" | "spend-by-url">(...)` with `useState<"ads" | "spend-by-url" | "health">(...)`.
3. Update the URL-sync code to accept `"health"` as a valid value (currently coerces legacy `"metrics"` to `"ads"` — leave that, just add `"health"` to the accepted set).
4. Add a third tab/button in whatever switcher renders `viewMode` (find the existing tab buttons that toggle between "ads" and "spend-by-url" — there's likely a `<button onClick={() => handleViewModeChange("ads")}>` somewhere; add a sibling for "health").
5. In the render block, add: `{viewMode === "health" && <FacebookAdsHealthView startDate={startDate} endDate={endDate} />}`.

- [ ] **Step 3: Start dev server + manual smoke check**

Run: `npm run dev`

Open `http://localhost:3000/admin?tab=facebook-ads&viewMode=health` (after logging in as admin). Expected: the table renders with the last few days of data.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/facebook-ads-health/FacebookAdsHealthView.tsx src/components/admin/FacebookAdsManagement.tsx
git commit -m "feat(facebook-ads-health): view orchestrator wired into FacebookAdsManagement tab"
```

---

### Task 30: Mobile card layout

**Files:**
- Create: `src/components/admin/facebook-ads-health/FacebookAdsHealthMobileCards.tsx`
- Modify: `src/components/admin/facebook-ads-health/FacebookAdsHealthView.tsx`

- [ ] **Step 1: Write the mobile cards component**

```tsx
"use client";
import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PivotRow } from "./FacebookAdsHealthPivotTable";
import { FacebookAdsHealthVerdictTooltip } from "./FacebookAdsHealthVerdictTooltip";

interface Props {
  rows: PivotRow[];
}

function classForCount(count: number, max: number): string {
  if (count === 0 && max > 0) return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300";
  if (max <= 0) return "bg-zinc-100 dark:bg-zinc-800 text-zinc-500";
  const pct = count / max;
  if (pct >= 0.7) return "bg-blue-600 text-white";
  if (pct >= 0.4) return "bg-blue-400 text-white";
  return "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100";
}

export function FacebookAdsHealthMobileCards({ rows }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const max = Math.max(...row.daily.map((d) => d.conversions));
        return (
          <div key={row.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-semibold text-sm">{row.name}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{row.campaignName} · {row.learningStatus}</div>
              </div>
              <a href={row.metaAdsManagerUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400">
                <ExternalLink size={14} />
              </a>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {row.daily.slice(-7).map((d) => (
                <div key={d.date} className={`rounded text-center py-1 text-[10px] font-mono font-semibold ${classForCount(d.conversions, max)}`}>{d.conversions}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {row.daily.slice(-7).map((d) => (
                <div key={d.date} className="text-center text-[8px] text-zinc-400 uppercase">{new Date(d.date).toLocaleDateString("en-AU", { weekday: "narrow" })}</div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
              <span><strong>{row.window.conversions}</strong> conv · Total</span>
              <button onClick={() => setOpenId(openId === row.id ? null : row.id)} className="text-[10px] underline">Why?</button>
            </div>
            {openId === row.id && (
              <div className="mt-2"><FacebookAdsHealthVerdictTooltip verdict={row.verdict} reasons={row.verdictReasons} actionText={row.actionText} /></div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire into View**

In `FacebookAdsHealthView.tsx`, replace the line `<FacebookAdsHealthPivotTable rows={data?.rows ?? []} metric={metric} />` with:

```tsx
<div className="hidden md:block">
  <FacebookAdsHealthPivotTable rows={data?.rows ?? []} metric={metric} />
</div>
<div className="md:hidden">
  <FacebookAdsHealthMobileCards rows={data?.rows ?? []} />
</div>
```

And add the import.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/facebook-ads-health/FacebookAdsHealthMobileCards.tsx src/components/admin/facebook-ads-health/FacebookAdsHealthView.tsx
git commit -m "feat(facebook-ads-health): mobile card layout"
```

---

## Phase 7 — Diagnostic + backfill scripts

### Task 31: UTM coverage diagnostic

**Files:**
- Create: `scripts/find-meta-utm-coverage.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

```ts
/**
 * Diagnostic — measures what fraction of recent MetaAdDestination rows have
 * utm_content= in their rawUrls. Tells us whether ad-level TRUE ROAS via UTM
 * tagging is viable now or whether the ads team needs to fix tagging first.
 *
 * Run: npx tsx scripts/find-meta-utm-coverage.ts
 */
import "dotenv/config";
import connectDB from "@/lib/mongodb";
import MetaAdDestination from "@/models/MetaAdDestination";

async function main() {
  await connectDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const docs = await MetaAdDestination.find({ fetchedAt: { $gte: cutoff } })
    .select("adId rawUrls")
    .lean();
  let withContent = 0;
  let withoutContent = 0;
  const examplesMissing: string[] = [];
  for (const d of docs) {
    const urls = (d as { rawUrls?: string[] }).rawUrls ?? [];
    const hasContent = urls.some((u) => u.includes("utm_content="));
    if (hasContent) withContent++;
    else {
      withoutContent++;
      if (examplesMissing.length < 5) examplesMissing.push((d as { adId: string }).adId);
    }
  }
  const total = withContent + withoutContent;
  const pct = total > 0 ? ((withContent / total) * 100).toFixed(1) : "0";
  console.error(`Meta ad UTM coverage (last 60 days):`);
  console.error(`  Total ads: ${total}`);
  console.error(`  With utm_content: ${withContent} (${pct}%)`);
  console.error(`  Without utm_content: ${withoutContent}`);
  if (examplesMissing.length) console.error(`  Examples missing: ${examplesMissing.join(", ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add npm script**

```json
"find:meta-utm-coverage": "tsx scripts/find-meta-utm-coverage.ts",
```

- [ ] **Step 3: Commit**

```bash
git add scripts/find-meta-utm-coverage.ts package.json
git commit -m "feat(facebook-ads-health): UTM coverage diagnostic script"
```

---

### Task 32: Backfill link clicks

**Files:**
- Create: `scripts/backfill-meta-link-clicks.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

```ts
/**
 * Backfills MetaAdInsightsDaily.linkClicks for historical rows by re-fetching
 * from Meta's Marketing API. Default: last 90 days. --dry-run prints planned changes.
 *
 * Run: npm run backfill:meta-link-clicks -- --dry-run
 *      npm run backfill:meta-link-clicks
 */
import "dotenv/config";
import connectDB from "@/lib/mongodb";
import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import { fetchFacebookAdInsightsDaily } from "@/lib/facebook-marketing";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const AEST = "Australia/Sydney";

async function main() {
  await connectDB();
  const dryRun = process.argv.includes("--dry-run");
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
  if (!adAccountId || !accessToken) {
    console.error("Missing FACEBOOK_AD_ACCOUNT_ID or FACEBOOK_MARKETING_ACCESS_TOKEN");
    process.exit(1);
  }
  const until = new Date();
  const since = subDays(until, 90);
  const sinceStr = formatInTimeZone(since, AEST, "yyyy-MM-dd");
  const untilStr = formatInTimeZone(until, AEST, "yyyy-MM-dd");
  const insights = await fetchFacebookAdInsightsDaily(adAccountId, accessToken, { since: sinceStr, until: untilStr });
  let updated = 0;
  for (const ins of insights) {
    const update = { linkClicks: ins.metrics.linkClicks };
    if (dryRun) {
      updated++;
      continue;
    }
    await MetaAdInsightsDaily.updateOne(
      { adAccountId, date: ins.date, adId: ins.adId },
      { $set: update },
    );
    updated++;
  }
  console.error(`${dryRun ? "[DRY-RUN] would update" : "Updated"} ${updated} MetaAdInsightsDaily rows with linkClicks.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add npm scripts**

```json
"backfill:meta-link-clicks": "tsx scripts/backfill-meta-link-clicks.ts",
"backfill:meta-link-clicks:dry": "tsx scripts/backfill-meta-link-clicks.ts --dry-run",
```

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-meta-link-clicks.ts package.json
git commit -m "feat(facebook-ads-health): backfill script for linkClicks column"
```

---

### Task 33: Backfill adset metadata

**Files:**
- Create: `scripts/backfill-meta-adset-metadata.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

```ts
/**
 * Backfills adsetBudgetCents, campaignObjective, learningStatus, lastSignificantEdit
 * onto MetaAdInsightsDaily rows from the live adset metadata snapshot. Note: this
 * fills the CURRENT state across historical rows — Meta doesn't expose
 * historical learning_stage_info.
 *
 * Run: npm run backfill:meta-adset-metadata -- --dry-run
 */
import "dotenv/config";
import connectDB from "@/lib/mongodb";
import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import { fetchAdsetMetadata } from "@/services/facebook-ads-health/adsetMetadataFetcher";

async function main() {
  await connectDB();
  const dryRun = process.argv.includes("--dry-run");
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
  if (!adAccountId || !accessToken) {
    console.error("Missing FACEBOOK_AD_ACCOUNT_ID or FACEBOOK_MARKETING_ACCESS_TOKEN");
    process.exit(1);
  }
  const metadata = await fetchAdsetMetadata(adAccountId, accessToken);
  console.error(`Fetched metadata for ${metadata.length} adsets.`);
  let updated = 0;
  for (const m of metadata) {
    const update = {
      adsetBudgetCents: m.dailyBudgetCents ?? m.lifetimeBudgetCents ?? null,
      campaignObjective: m.campaignObjective,
      learningStatus: m.learningStatus,
      lastSignificantEdit: m.lastSignificantEdit,
    };
    if (dryRun) {
      const count = await MetaAdInsightsDaily.countDocuments({ adAccountId, adsetId: m.adsetId });
      updated += count;
      continue;
    }
    const res = await MetaAdInsightsDaily.updateMany(
      { adAccountId, adsetId: m.adsetId },
      { $set: update },
    );
    updated += res.modifiedCount;
  }
  console.error(`${dryRun ? "[DRY-RUN] would update" : "Updated"} ${updated} MetaAdInsightsDaily rows.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add npm scripts**

```json
"backfill:meta-adset-metadata": "tsx scripts/backfill-meta-adset-metadata.ts",
"backfill:meta-adset-metadata:dry": "tsx scripts/backfill-meta-adset-metadata.ts --dry-run",
```

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-meta-adset-metadata.ts package.json
git commit -m "feat(facebook-ads-health): backfill script for adset metadata"
```

---

## Phase 8 — Manifest + Docs

### Task 34: Update domain manifest in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Edit the tracking domain entry**

Find the `"tracking"` domain in the manifest JSON block. Add to its `paths` array (anywhere within the list):

```
"src/services/facebook-ads-health/**",
```

- [ ] **Step 2: Edit the admin domain entry**

In the `"admin"` domain `paths` array, add:

```
"src/components/admin/facebook-ads-health/**",
"src/app/api/admin/facebook-ads/health/**",
```

- [ ] **Step 3: Bump the manifest `lastModified`**

Change `"lastModified": "2026-05-14"` (or whatever the current value is) to `"2026-05-26"`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(docs): register facebook-ads-health paths in domain manifest"
```

---

### Task 35: Update domain docs

**Files:**
- Modify: `docs/tracking/`
- Modify: `docs/admin/`
- Modify: `docs/auth/`

- [ ] **Step 1: Identify which doc files to update**

Run `ls docs/tracking/`, `ls docs/admin/`, `ls docs/auth/`. Read each domain's index/overview file (usually `README.md` or `overview.md`) to find the right section.

- [ ] **Step 2: Append a section to `docs/tracking/`**

Add to the appropriate file under `docs/tracking/`:

```md
## Facebook Ads Health

Service: `src/services/facebook-ads-health/`. Reads from `MetaAdInsightsDaily` and produces per-adset verdicts (Scale/Hold/Investigate/Cut?). The 5 new columns on `MetaAdInsightsDaily` (linkClicks, adsetBudgetCents, campaignObjective, learningStatus, lastSignificantEdit) are populated by the daily cron via `adsetMetadataFetcher`. Verdict rules and thresholds are in `verdictEngine.ts` and `FacebookAdsHealthSettings` collection (lazy-init on first read).
```

- [ ] **Step 3: Append a section to `docs/admin/`**

```md
## Facebook Ads Health view

Third `viewMode` on the Facebook Ads admin tab. Daily pivot table by adset, four verdict types with auditable tooltips, alert banner for Cut?/Investigate rows, account-level TRUE ROAS card. Read-only — all actions handed off to Meta Ads Manager via deep links. Settings (breakeven ROAS, target CPA, etc.) tunable via the gear icon; requires `facebookAds.edit` permission.
```

- [ ] **Step 4: Add a line to `docs/auth/`**

```md
- `facebookAds.edit` is required to PUT `/api/admin/facebook-ads/health/settings`. `facebookAds.view` is enough for everything else in the Ads Health view.
```

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: document facebook-ads-health across tracking, admin, auth domains"
```

---

## Self-Review (done by writer)

I checked the plan against the spec:

**Spec coverage:**
- ✓ MetaAdInsightsDaily extensions → Task 1
- ✓ PaymentEvent attribution → Task 2
- ✓ FacebookAdsHealthSnooze → Task 3
- ✓ FacebookAdsHealthSettings → Task 4
- ✓ Verdict engine types → Task 5
- ✓ Verdict engine + tests → Tasks 6, 7, 8
- ✓ Two-window principle test → Task 9
- ✓ Missing-data fallback test → Task 10
- ✓ inline_link_clicks → Task 11
- ✓ adsetMetadataFetcher → Task 12
- ✓ Cron wiring → Task 13
- ✓ PaymentEvent write-time attribution → Task 14
- ✓ Settings service → Task 15
- ✓ Snooze service → Task 16
- ✓ TRUE ROAS extraction → Task 17
- ✓ Insights aggregator → Task 18
- ✓ Three API routes → Tasks 19, 20, 21
- ✓ Vercel timeout → Task 22
- ✓ TanStack hooks → Task 23
- ✓ All UI components → Tasks 24–29
- ✓ Mobile cards → Task 30
- ✓ 3 supporting scripts → Tasks 31, 32, 33
- ✓ Manifest + docs → Tasks 34, 35

**Type consistency:** `MetaAdInsightsRow`, `FacebookAdsHealthSettingsValues`, `Verdict`, `VerdictReason`, `PivotRow`, `MetricChoice` are defined once and referenced consistently. Function names (`computeVerdict`, `aggregateInsights`, `getOrInitSettings`, `upsertSnooze`, `computeAccountTrueRoas`) are stable across tasks.

**Placeholders:** No "TBD", "implement later", or "similar to Task N" — each task has its own code blocks.

**Known constraints noted:** Vercel function timeout (Task 22), MongoDB index addition (Task 1), permissions reuse (`facebookAds.view`/`.edit`), CSP non-impact (no inline scripts), AEST timezone for date math.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-26-facebook-ads-health.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration. Required sub-skill: `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute in this session via `superpowers:executing-plans`, batched checkpoints for review.

You said earlier you want subagent-driven. Confirming — go with subagent-driven?

Before I dispatch the first subagent, the writing-plans skill defaults to "review the plan thoroughly first." You explicitly asked for a 1000x–10000x review of the plan. I'll do one more critical pass on the plan to look for: missing edge cases, incorrect file references, type mismatches across tasks, and over-eager scope.

Confirm and I'll proceed with the deep plan review, then dispatch.