# Platform Payment Attribution — Phase 2 (Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Commits:** Honor CLAUDE.md hard-rule #1 — only commit if the user has authorized commits this session (`commit`/`ship it`). Commit steps are included but pause for authorization if not granted.
>
> **Tests:** `tsx` scripts under `src/**/__tests__/*.test.ts`, relative imports, `node:assert/strict`, end with `console.log("...passed")`. Run via `npm run test:<scope>`.
>
> **Prereq:** Phase 1 (commit `02ad0629`) must be present — this plan consumes `PaymentEvent.convertingPlatform` / `attributionConfidence` / `isRenewal` and `src/types/attribution.ts`.

**Goal:** Surface per-platform **attributed revenue** (split by confidence) and **true per-platform ROAS** (our attributed revenue ÷ that platform's ad spend) on the admin dashboard, sourced from the Phase-1 `convertingPlatform` field.

**Architecture:** Add a parallel `attributedRevenue: Map<platform, {...}>` dimension to the daily snapshot (mirroring the existing `adChannels` Map), populated by extending the one revenue aggregator to also group `BenefitsGranted` rows by `convertingPlatform`. The reader sums it across days + live-overlays today (pure sums, no recompute). The `/stats` route joins attributed revenue (keyed by `convertingPlatform`, e.g. `meta`) to ad spend (keyed by provider, e.g. `facebook`) via an explicit mapping table to compute true ROAS, mirroring the existing `facebookAds` block. The UI renders per-platform cards.

**Tech Stack:** Next.js 15, Mongoose, TypeScript, TanStack Query. Tests: `tsx`. No new deps.

**Spec:** `docs/superpowers/specs/2026-06-01-platform-payment-attribution-design.md` (§3.5).

---

## Cross-cutting invariants (read before building)

1. **Platform key = the `convertingPlatform` enum** (`meta|tiktok|snapchat|klaviyo_email|klaviyo_sms|google|direct|other`). Ad-spend providers use a *different* key (`facebook`, not `meta`). The true-ROAS join bridges them via a single mapping table `PLATFORM_TO_AD_CHANNEL_KEY` (Task 2). Platforms whose mapping is `null` (or has no spend provider — today everything except `meta`→`facebook`) get attributed-revenue only, no ROAS.
2. **Pre-feature rows have `convertingPlatform: null`.** Fold `null` → the `"direct"` platform key (and confidence `inferred_backfill`) at aggregation time so totals reconcile. Never drop them.
3. **Reconciliation:** `sum(byPlatform[*].revenue) === total`. This requires platform accumulation to run for EVERY kept row, so it must sit ABOVE the existing `if (!bucketKey) continue;` guard in `revenueAggregator.ts` (product buckets skip unclassifiable rows; platform totals must not).
4. **Confidence partitions revenue:** `byConfidence.click + byConfidence.utm_only + byConfidence.inferred_backfill === revenue` per platform. Asserted in the aggregator test.
5. **True ROAS is recomputed from SUMMED totals** (attributed revenue ÷ summed spend), never averaged per day — same invariant as the existing per-channel ROAS recompute in the reader.
6. **`AdminDashboardStats` type is duplicated** in `src/hooks/queries/useAdminQueries.ts` AND `src/app/admin/component/overview/KPIMetricsGrid.tsx` — both must be updated identically (Task 7).

---

## File Structure

**Modify:**
- `src/models/DashboardStatsDailySnapshot.ts` — new `attributedRevenue` Map field + subdoc + platform-key union; bump source version.
- `src/services/admin/dashboard-stats/snapshotSchema.ts` — `PLATFORM_TO_AD_CHANNEL_KEY` mapping.
- `src/services/admin/dashboard-stats/revenueAggregator.ts` — group by `convertingPlatform`; widen result.
- `src/services/admin/dashboard-stats/__tests__/revenueAggregator.test.ts` — platform-grouping assertions.
- `src/services/admin/dashboard-stats/DashboardStatsSnapshotWriter.ts` — persist the new Map.
- `src/services/admin/dashboard-stats/DashboardStatsSnapshotReader.ts` — sum + return the new dimension.
- `src/services/admin/dashboard-stats/__tests__/snapshotReader.test.ts` — reader summation assertion.
- `src/app/api/admin/dashboard/stats/route.ts` — top-level `attributedRevenue` response + true-ROAS join + trends.
- `src/hooks/queries/useAdminQueries.ts` + `src/app/admin/component/overview/KPIMetricsGrid.tsx` — `AdminDashboardStats` type (both copies).
- `src/app/admin/component/overview/KPIMetricsGrid.tsx` (and/or `AdvertisingBreakdownSection.tsx`) — UI render.
- `docs/admin/{api,backend,models}.md` — docs.

> **No new domain/manifest entry needed** — every file is under `src/app/admin/**`, `src/services/admin/**`, `src/models/DashboardStatsDailySnapshot.ts`, or `src/hooks/queries/**`, all already in the `admin` / `client-state` domains.

---

## Task 1: Snapshot model — `attributedRevenue` Map

**Files:** `src/models/DashboardStatsDailySnapshot.ts`

- [ ] **Step 1: Add the platform-key union + confidence type + interface** (near the `RevenueBucketKey` block, ~line 11)

```ts
export type AttributedPlatformKey =
  | "meta" | "tiktok" | "snapchat"
  | "klaviyo_email" | "klaviyo_sms"
  | "google" | "direct" | "other";

export const ATTRIBUTED_PLATFORM_KEYS: AttributedPlatformKey[] = [
  "meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms", "google", "direct", "other",
];

export type AttributionConfidenceKey = "click" | "utm_only" | "inferred_backfill";

export interface IAttributedRevenue {
  revenue: number;     // dollars, same unit as IRevenueBucket.revenue
  conversions: number; // distinct refund-excluded BenefitsGranted rows
  byConfidence: { click: number; utm_only: number; inferred_backfill: number };
}
```

- [ ] **Step 2: Add the field to `IDashboardStatsDailySnapshot`** (right after the `adChannels: Map<string, IAdChannelMetrics>;` line, ~line 46)

```ts
  attributedRevenue: Map<AttributedPlatformKey, IAttributedRevenue>;
```

- [ ] **Step 3: Add the subdoc schema** (after `AdChannelMetricsSchema`, ~line 71)

```ts
const AttributedRevenueSchema = new Schema<IAttributedRevenue>(
  {
    revenue: { type: Number, required: true, default: 0 },
    conversions: { type: Number, required: true, default: 0 },
    byConfidence: {
      click: { type: Number, required: true, default: 0 },
      utm_only: { type: Number, required: true, default: 0 },
      inferred_backfill: { type: Number, required: true, default: 0 },
    },
  },
  { _id: false }
);
```

- [ ] **Step 4: Add the Map field** to the top schema (next to `adChannels`, ~line 85)

```ts
    attributedRevenue: { type: Map, of: AttributedRevenueSchema, required: true, default: () => new Map() },
```

- [ ] **Step 5: Bump the source version** (line 3): `DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION = 2;` (so v1 snapshots lacking `attributedRevenue` are detectable; readers guard with `?? new Map()`).

- [ ] **Step 6: Type-check** — `npm run type-check` → PASS.

- [ ] **Step 7: Commit** (if authorized): `feat(admin): add attributedRevenue dimension to dashboard snapshot model`

---

## Task 2: Platform → ad-channel mapping

**Files:** `src/services/admin/dashboard-stats/snapshotSchema.ts`

- [ ] **Step 1: Add the mapping** next to `classifyRevenueBucket`

```ts
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

// Bridges the convertingPlatform enum (meta) to the ad-spend provider key (facebook)
// for the true-ROAS join. null = no ad-spend channel → attributed-revenue only, no ROAS.
export const PLATFORM_TO_AD_CHANNEL_KEY: Record<AttributedPlatformKey, string | null> = {
  meta: "facebook",
  tiktok: "tiktok",
  snapchat: "snapchat",
  google: "google",
  klaviyo_email: null,
  klaviyo_sms: null,
  direct: null,
  other: null,
};
```

- [ ] **Step 2: Type-check** → PASS. **Commit** (if authorized): `feat(admin): add platform→ad-channel mapping for true ROAS`

---

## Task 3: Aggregator — group by `convertingPlatform` (PRIME TEST TARGET)

**Files:** `src/services/admin/dashboard-stats/revenueAggregator.ts`, `src/services/admin/dashboard-stats/__tests__/revenueAggregator.test.ts`

> Read `revenueAggregator.ts` first to confirm exact line positions (the cited lines are approximate). It exports `aggregateRevenueForDay(dayStartUTC, dayEndUTC, refundedPaymentIntentIds)` returning `{ total, buckets }`.

- [ ] **Step 1: Write/extend the failing test** in `__tests__/revenueAggregator.test.ts` (mirror its existing harness — far-future 2099 AEST day, targeted `deleteMany` by PI ids). Add seed rows with `convertingPlatform` + `attributionConfidence` and assert the byPlatform output. New assertions:

```ts
// (inside the existing test harness, after seeding rows that include:
//   meta+click $10, meta+utm_only $5, tiktok+click $20,
//   a convertingPlatform:null $7 row, and a refunded meta row $99)
const res = await aggregateRevenueForDay(dayStart, dayEnd, new Set([refundedPi]));

assert.equal(res.byPlatform.meta.revenue, 15);            // 10 + 5, refunded excluded
assert.equal(res.byPlatform.meta.conversions, 2);
assert.equal(
  res.byPlatform.meta.byConfidence.click +
  res.byPlatform.meta.byConfidence.utm_only +
  res.byPlatform.meta.byConfidence.inferred_backfill,
  res.byPlatform.meta.revenue
);                                                        // confidence partitions revenue
assert.equal(res.byPlatform.meta.byConfidence.click, 10);
assert.equal(res.byPlatform.tiktok.revenue, 20);
assert.equal(res.byPlatform.direct.revenue, 7);           // null platform folds to direct
assert.equal(res.byPlatform.direct.byConfidence.inferred_backfill, 7); // null confidence → inferred_backfill
// platform-complete total reconciles (platform accum runs above the !bucketKey guard)
const sumByPlatform = Object.values(res.byPlatform).reduce((s, p) => s + p.revenue, 0);
assert.equal(sumByPlatform, res.total);
```

- [ ] **Step 2: Run to confirm it fails** — `npm run test:dashboard-stats-aggregator` (confirm the exact script name in `package.json`; if absent, add `"test:dashboard-stats-aggregator": "tsx src/services/admin/dashboard-stats/__tests__/revenueAggregator.test.ts"`). Expected: FAIL (`byPlatform` undefined).

- [ ] **Step 3: Widen the result type** (top of `revenueAggregator.ts`)

```ts
import { ATTRIBUTED_PLATFORM_KEYS, type AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

export interface DayRevenueResult {
  total: number;
  buckets: Record<RevenueBucketKey, { revenue: number; purchaseCount: number }>;
  byPlatform: Record<AttributedPlatformKey, {
    revenue: number;
    conversions: number;
    byConfidence: { click: number; utm_only: number; inferred_backfill: number };
  }>;
}

function emptyByPlatform(): DayRevenueResult["byPlatform"] {
  const out = {} as DayRevenueResult["byPlatform"];
  for (const p of ATTRIBUTED_PLATFORM_KEYS) {
    out[p] = { revenue: 0, conversions: 0, byConfidence: { click: 0, utm_only: 0, inferred_backfill: 0 } };
  }
  return out;
}
```

- [ ] **Step 4: Project the new fields + accumulate above the bucket guard.** Add `convertingPlatform: 1, attributionConfidence: 1` to the `.find(...).select/projection`. Initialize `const byPlatform = emptyByPlatform();`. Inside the per-row loop, AFTER the refund-skip (`if (refundedPaymentIntentIds.has(pid)) continue;`) and BEFORE `if (!bucketKey) continue;`:

```ts
    const platform = (ev.convertingPlatform ?? "direct") as AttributedPlatformKey;
    const conf: "click" | "utm_only" | "inferred_backfill" =
      ev.convertingPlatform == null
        ? "inferred_backfill"
        : ((ev.attributionConfidence as "click" | "utm_only" | "inferred_backfill" | null) ?? "utm_only");
    byPlatform[platform].revenue += price;
    byPlatform[platform].conversions += 1;
    byPlatform[platform].byConfidence[conf] += price;
```

Return `byPlatform` in the result object alongside `total`/`buckets`.

- [ ] **Step 5: Run to confirm pass** — `npm run test:dashboard-stats-aggregator` → PASS.

- [ ] **Step 6: Type-check** → PASS. **Commit** (if authorized): `feat(admin): aggregate revenue by convertingPlatform with confidence split`

---

## Task 4: Writer — persist the Map

**Files:** `src/services/admin/dashboard-stats/DashboardStatsSnapshotWriter.ts`

> Read `writeSnapshotForDate` first. It builds `bucketsMap`/`adChannelsMap` then `findOneAndUpdate({date}, {$set:{...}}, {upsert:true})`.

- [ ] **Step 1: Build the platform map** after `bucketsMap` is built

```ts
import { ATTRIBUTED_PLATFORM_KEYS, type AttributedPlatformKey, type IAttributedRevenue } from "@/models/DashboardStatsDailySnapshot";
// ...after the revenue aggregation result `revenue` is available:
const attributedRevenueMap = new Map<AttributedPlatformKey, IAttributedRevenue>();
for (const p of ATTRIBUTED_PLATFORM_KEYS) {
  attributedRevenueMap.set(p, revenue.byPlatform[p]);
}
```

- [ ] **Step 2: Add to `$set`** — `attributedRevenue: attributedRevenueMap,` (next to `adChannels`).

- [ ] **Step 3: Type-check** → PASS. **Commit** (if authorized): `feat(admin): write attributedRevenue map into daily snapshot`

---

## Task 5: Reader — sum across days + live overlay

**Files:** `src/services/admin/dashboard-stats/DashboardStatsSnapshotReader.ts`, `src/services/admin/dashboard-stats/__tests__/snapshotReader.test.ts`

> Read `readStatsForRange` first. It sums completed snapshot days, computes today/missing days live via `aggregateRevenueForDay`, and recomputes per-channel ROAS post-loop. Mirror the `adChannels` Map handling exactly (note its `instanceof Map ? Array.from(...) : Object.entries(...)` guard for lean docs).

- [ ] **Step 1: Widen `SnapshotReadResult`** — add:

```ts
attributedRevenue: Record<AttributedPlatformKey, {
  revenue: number;
  conversions: number;
  byConfidence: { click: number; utm_only: number; inferred_backfill: number };
}>;
```

- [ ] **Step 2: Seed an accumulator** (`emptyByPlatform()`-style, reuse the shape) beside the `adChannels` accumulator.

- [ ] **Step 3: Snapshot-day branch** — read `snap.attributedRevenue` with the same Map/Object guard as `adChannels`; for each platform add `revenue`, `conversions`, and each `byConfidence.*` (all pure sums). v1 snapshots → empty/absent Map → contributes nothing (guard with `?? new Map()`).

- [ ] **Step 4: Live/missing-day branch** — `aggregateRevenueForDay` now returns `byPlatform`; accumulate it into the same accumulator (no extra query).

- [ ] **Step 5: Return `attributedRevenue`** in the result object. (No post-loop recompute — sums are exact; true ROAS is computed in the route since it needs sibling `adChannels[].spend`.)

- [ ] **Step 6: Extend `snapshotReader.test.ts`** — assert that two seeded snapshot days' `attributedRevenue.meta.revenue` sum correctly and `byConfidence` sub-totals sum across days. Run `npm run test:dashboard-stats-reader` (confirm exact script name; mirror existing). Expected PASS.

- [ ] **Step 7: Type-check** → PASS. **Commit** (if authorized): `feat(admin): sum attributedRevenue across range in snapshot reader`

---

## Task 6: Route — `attributedRevenue` response + true-ROAS join + trends

**Files:** `src/app/api/admin/dashboard/stats/route.ts`

> Read the route first. Keep the existing `facebookAds` block UNCHANGED (backward compat). Add a NEW top-level `attributedRevenue` key (NOT nested under `revenue.breakdown` — those are product buckets). The comparison/previous-range read (`readStatsForRange` for trends) now returns `attributedRevenue` for free.

- [ ] **Step 1: Build the response object** after the `facebookAds` section, iterating `ATTRIBUTED_PLATFORM_KEYS`, joining spend via the mapping:

```ts
import { PLATFORM_TO_AD_CHANNEL_KEY } from "@/services/admin/dashboard-stats/snapshotSchema";
import { ATTRIBUTED_PLATFORM_KEYS } from "@/models/DashboardStatsDailySnapshot";

const attributedRevenue: Record<string, {
  revenue: number;
  conversions: number;
  byConfidence: { click: number; utm_only: number; inferred_backfill: number };
  adSpend?: number;
  trueRoas?: number;
  revenueTrend?: TrendData;
  trueRoasTrend?: TrendData;
}> = {};
for (const p of ATTRIBUTED_PLATFORM_KEYS) {
  const ar = snapshotRead.attributedRevenue[p];
  if (ar.revenue === 0 && ar.conversions === 0) continue; // omit empty platforms
  const adKey = PLATFORM_TO_AD_CHANNEL_KEY[p];
  const spend = adKey ? (snapshotRead.adChannels[adKey]?.spend ?? 0) : 0;
  attributedRevenue[p] = {
    revenue: ar.revenue,
    conversions: ar.conversions,
    byConfidence: ar.byConfidence,
    ...(adKey && spend > 0 ? { adSpend: spend, trueRoas: ar.revenue / spend } : {}),
  };
}
```

- [ ] **Step 2: Trends** — inside the existing `if (includeTrends && previousSnapshotRead)` block, for each platform present compute `revenueTrend = calculateTrend(ar.revenue, prev.revenue)` and (when both periods have spend) `trueRoasTrend = calculateTrend(thisTrueRoas, prevTrueRoas)`, mirroring the existing `adSpendTrend`/`roasTrend` pattern. Attach into the matching `attributedRevenue[p]` entry. Use `TrendData`/`calculateTrend` already imported in the route.

- [ ] **Step 3: Add to the response** — include `attributedRevenue` in the `stats` object beside `facebookAds`.

- [ ] **Step 4: Verify** — `npm run type-check && npm run build` → PASS. Manually hit `GET /api/admin/dashboard/stats` in dev and confirm the `attributedRevenue` key appears with `meta.trueRoas` populated when Facebook spend exists.

- [ ] **Step 5: Commit** (if authorized): `feat(admin): expose per-platform attributedRevenue + true ROAS in stats route`

---

## Task 7: UI types (BOTH duplicated copies)

**Files:** `src/hooks/queries/useAdminQueries.ts`, `src/app/admin/component/overview/KPIMetricsGrid.tsx`

- [ ] **Step 1: Add to the `AdminDashboardStats` interface in BOTH files identically** (next to `facebookAds`):

```ts
  attributedRevenue?: Record<string, {
    revenue: number;
    conversions: number;
    byConfidence: { click: number; utm_only: number; inferred_backfill: number };
    adSpend?: number;
    trueRoas?: number;
    revenueTrend?: { value: number; direction: "up" | "down" | "flat" } | null;
    trueRoasTrend?: { value: number; direction: "up" | "down" | "flat" } | null;
  }>;
```
(Match the EXACT `TrendData` shape already used by `facebookAds` in these files — read it and copy it rather than guessing the trend shape.)

- [ ] **Step 2: Type-check** → PASS. **Commit** (if authorized): `feat(admin): add attributedRevenue to AdminDashboardStats type (both copies)`

---

## Task 8: UI render — per-platform cards

**Files:** `src/app/admin/component/overview/KPIMetricsGrid.tsx` (and/or `src/app/admin/component/overview/AdvertisingBreakdownSection.tsx`)

> Read the existing Facebook spend/ROAS card rendering and mirror its component/format (currency + trend chip). Keep it lean — no new design system, reuse existing card primitives.

- [ ] **Step 1: Render a per-platform attributed-revenue section.** For each entry in `stats.attributedRevenue`, show: platform label, attributed revenue (currency), conversions, and — when `trueRoas` is present — a True ROAS figure with its trend chip. Show a small confidence breakdown (e.g. "$X click-attributed / $Y inferred") using `byConfidence`. Platforms without `trueRoas` (TikTok/Snapchat/Klaviyo/direct today) render revenue + confidence only, no ROAS.
- [ ] **Step 2: Guard for absence** — `attributedRevenue` is optional; render nothing (or an empty state) when undefined/empty so pre-deploy clients don't break.
- [ ] **Step 3: Verify** — `npm run type-check && npm run lint`. Run the app (`npm run dev`), open the admin overview, confirm the section renders with real data and the confidence split is visible.
- [ ] **Step 4: Commit** (if authorized): `feat(admin): render per-platform attributed revenue + true ROAS + confidence split`

---

## Task 9: Docs

**Files:** `docs/admin/api.md`, `docs/admin/backend.md`, `docs/admin/models.md`

- [ ] **Step 1:** `docs/admin/models.md` — document the snapshot `attributedRevenue` Map + `IAttributedRevenue` subdoc + source-version bump.
- [ ] **Step 2:** `docs/admin/backend.md` — document the aggregator platform grouping (null→direct, above the bucket guard, confidence partition) + reader summation + the `PLATFORM_TO_AD_CHANNEL_KEY` join.
- [ ] **Step 3:** `docs/admin/api.md` — document the new `attributedRevenue` response key shape (per-platform revenue/conversions/byConfidence/adSpend/trueRoas/trends) and that only platforms with a spend provider get `trueRoas`.
- [ ] **Step 4:** Run `/doc-sync` (or the hook) → confirm no `BLOCKED: Stale docs`. **Commit** (if authorized): `docs(admin): document per-platform attributed revenue + true ROAS`

---

## Out of scope (future)
- TikTok/Snapchat/Google **ad-spend** providers (their `AdChannelProvider` + Marketing-API sync) — once added to `AD_CHANNEL_PROVIDERS`, their `trueRoas` lights up automatically via the mapping with zero further change here.
- Backfilling `convertingPlatform` onto historical PaymentEvents — that is **Phase 3**.
- Distinct-payers-per-platform — `distinctUserCounts.ts` is intentionally untouched (attributed revenue uses row-count `conversions`, not distinct users).

## Self-Review
- **Spec §3.5 coverage:** snapshot `attributedRevenue` Map (Task 1) ✓; aggregator group-by-platform (Task 3) ✓; reader sum (Task 5) ✓; route per-platform + true ROAS (Task 6) ✓; UI (Tasks 7-8) ✓; confidence split end-to-end (Tasks 1,3,5,6,8) ✓.
- **Invariants encoded:** meta↔facebook mapping (Task 2), null→direct fold (Task 3), platform-accum-above-bucket-guard + reconciliation assert (Task 3), confidence partitions revenue (Task 3 test), ROAS from summed totals (Task 6), dual UI-type copies (Task 7).
- **Placeholders:** none — every step has concrete code or a read-first-then-mirror instruction with the exact pattern to copy. Line numbers flagged "approximate, confirm by reading."
- **Type consistency:** `AttributedPlatformKey`/`ATTRIBUTED_PLATFORM_KEYS`/`IAttributedRevenue` defined once in the model (Task 1), imported everywhere; `PLATFORM_TO_AD_CHANNEL_KEY` single source (Task 2); response shape identical across route (Task 6) and both UI type copies (Task 7).
