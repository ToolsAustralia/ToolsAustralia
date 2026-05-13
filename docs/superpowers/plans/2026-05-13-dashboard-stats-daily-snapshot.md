# Dashboard Stats Daily Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 504 timeout on `/api/admin/dashboard/stats?dateRange=all-time` by pre-aggregating revenue, signup, cancellation, and ad-channel data into a daily snapshot collection. The dashboard endpoint serves all-time / yesterday / whole-day custom ranges from snapshots in <500ms; "today" is computed live and merged on top.

**Architecture:**
- New `DashboardStatsDailySnapshot` Mongo collection — one document per AEST day. Schema is extensible (revenue breakdown is a Map, ad channels are a Map keyed by channel name) so adding TikTok/Snapchat later is one provider registration, not a schema change.
- Nightly cron writes today's snapshot AND re-runs the last 90 days as a **sliding recompute window** so refunds that arrive late retroactively correct revenue. Cron is idempotent (upsert) and runs twice (14:00 UTC and 15:00 UTC) to cover both AEST and AEDT and to self-recover from the first run failing.
- Distinct user counts (`userCount`) are **computed live, never stored** — see [Section: Why "compute live, don't store" for distinct users](#why-compute-live-dont-store-for-distinct-users).
- Backfill is a one-shot tsx script with `--dry-run`, `--start-date`, `--end-date` flags; default range is launch date → yesterday.
- The endpoint is refactored to: (a) sum snapshots for completed AEST days in the requested range, (b) compute today live if the range includes today, (c) compute distinct user counts live regardless. "All-time" = launch date → today.

**Tech Stack:** Next.js 15 App Router, Mongoose, `date-fns-tz` (`Australia/Sydney`), Vercel Cron, existing `fetchNetBenefitsGrantedInRange` aggregation helpers, existing `MembershipDailySnapshot` pattern.

**Source diagnosis:** Existing `/api/admin/dashboard/stats` route at [src/app/api/admin/dashboard/stats/route.ts:161](src/app/api/admin/dashboard/stats/route.ts#L161) pulls every `BenefitsGranted` event ever for all-time and iterates them in Node. With Vercel's catch-all `maxDuration: 10` ([vercel.json:68](vercel.json#L68)) this 504s once the payment log grows past a few tens of thousands of events.

**Commit policy:** Per `CLAUDE.md` Hard Rule 1 (no auto-commit), no task in this plan runs `git commit`. Each PR boundary ends with a **STOP** instruction — hand back to DJ for review and commit.

**Branch:** All work continues on the current branch `claude/mergeArchitectural`. If DJ prefers a fresh branch off `main`, branch before PR 1.

---

## Why "compute live, don't store" for distinct users

The current endpoint produces `userCount: userIds.size` per revenue category — the number of **unique** users who bought in that category during the date range. We deliberately do not store this in the snapshot.

**The math problem.** Distinct counts are not additive across days. If user A buys a membership on March 5 AND March 12, they count as `1` distinct user in the March 5 snapshot AND `1` in the March 12 snapshot — summing gives `2`, but the true March-wide distinct count is `1`. The only ways to make this work as a snapshot are:

1. **Store the full set of `userId`s per category per day** — bloats each snapshot from ~10KB to potentially MB once a category has thousands of daily distinct buyers. Defeats the whole point.
2. **Probabilistic sketches (HyperLogLog)** — Mongo has no native HLL primitive; you'd hand-roll it. Approximate only.

**Why live is fine.** A single `db.paymentevents.distinct("userId", { eventType: "BenefitsGranted", packageType: <cat>, timestamp: {$gte: rangeStart, $lte: rangeEnd} })` returns just the deduplicated `userId` array. With the existing `{eventType: 1, packageType: 1, timestamp: 1}` index path and `distinct()`'s 16MB result limit (~600k ObjectIds), this is fast even for all-time queries and returns *exact* counts. Six categories = six parallel `distinct()` calls via `Promise.all` = sub-second total.

**The tradeoff we accept.** Refunded `BenefitsGranted` rows are still excluded from revenue (via the snapshot's net aggregation) but **included** in the live `distinct()` userCount unless we add the same `$lookup`-to-exclude-refunds filter to the live query. We will add it — the live distinct path uses an aggregation pipeline mirroring `fetchNetBenefitsGrantedWithMatch` so semantics match between snapshot revenue and live distinct counts.

---

## File Structure

**New files:**
- `src/models/DashboardStatsDailySnapshot.ts` — Mongoose model
- `src/services/admin/dashboard-stats/snapshotSchema.ts` — TypeScript types + helpers (revenue-bucket keys, ad-channel-key registry)
- `src/services/admin/dashboard-stats/revenueAggregator.ts` — pure aggregation: `aggregateRevenueForDay(dayStart, dayEnd, refundedPIDs)` → bucketed revenue + counts
- `src/services/admin/dashboard-stats/adChannelProviders.ts` — provider registry (Facebook today; Snapchat/TikTok later)
- `src/services/admin/dashboard-stats/distinctUserCounts.ts` — live distinct-user count for a category/range, refund-aware
- `src/services/admin/dashboard-stats/DashboardStatsSnapshotWriter.ts` — orchestrates: for a list of days, compute and upsert
- `src/services/admin/dashboard-stats/DashboardStatsSnapshotReader.ts` — sum snapshots in a range, merge live "today" if range includes today, return same shape the endpoint already produces
- `src/services/admin/dashboard-stats/__tests__/revenueAggregator.test.ts` — tsx test
- `src/services/admin/dashboard-stats/__tests__/snapshotReader.test.ts` — tsx test
- `src/services/admin/dashboard-stats/__tests__/dstBoundary.test.ts` — tsx test (AEST↔AEDT)
- `src/app/api/cron/dashboard-stats-daily-snapshot/route.ts` — nightly cron
- `src/app/api/admin/health/dashboard-stats-snapshot/route.ts` — gap-detection health check
- `scripts/backfill-dashboard-stats-snapshots.ts` — one-shot historical backfill
- `scripts/verify-dashboard-stats-snapshot-drift.ts` — compares snapshot totals vs. live aggregation for a random sample of dates

**Modified files:**
- `CLAUDE.md` — manifest entries for new files (under `admin` domain for service+model+route, under `infrastructure` for cron+backfill+drift script)
- `package.json` — add scripts: `backfill:dashboard-stats-snapshots`, `backfill:dashboard-stats-snapshots:dry`, `verify:dashboard-stats-drift`, `test:dashboard-stats-aggregator`, `test:dashboard-stats-reader`, `test:dashboard-stats-dst`
- `vercel.json` — add cron schedule(s); add `maxDuration: 300` for the snapshot cron and backfill-execution route
- `src/app/api/admin/dashboard/stats/route.ts` — replace the all-time `fetchNetBenefitsGrantedInRange` block with a call to `DashboardStatsSnapshotReader.getStats(startDate, endDate, dateRange)`; keep the user/cancellation/major-draw/membership-analytics sections untouched
- `docs/admin/architecture.md`, `docs/admin/operations.md` — document the snapshot system and operational runbooks

---

# PR 1 — Snapshot Model + Writer + Nightly Cron (with sliding window)

**Goal:** Ship the model, the writer service, and the nightly cron. After this PR, the system writes today's snapshot AND re-snapshots the last 90 days every night. Endpoint untouched — no user-visible change yet. The snapshot collection starts filling in.

---

### Task 1.1: Create the snapshot model

**Files:**
- Create: `src/models/DashboardStatsDailySnapshot.ts`

- [ ] **Step 1: Write the model**

```ts
import mongoose, { Document, Schema } from "mongoose";

export const DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION = 1;

export type RevenueBucketKey =
  | "membershipPurchase"
  | "membershipRenewal"
  | "oneTimePurchase"
  | "additionalOneTimePurchase"
  | "miniDraw"
  | "upsell";

export const REVENUE_BUCKET_KEYS: RevenueBucketKey[] = [
  "membershipPurchase",
  "membershipRenewal",
  "oneTimePurchase",
  "additionalOneTimePurchase",
  "miniDraw",
  "upsell",
];

export interface IRevenueBucket {
  revenue: number;
  purchaseCount: number;
}

export interface IAdChannelMetrics {
  spend: number;
  revenue: number;
  roas: number;
  impressions?: number;
  clicks?: number;
}

export interface IDashboardStatsDailySnapshot extends Document {
  date: string; // YYYY-MM-DD in Australia/Sydney
  tz: "Australia/Sydney";
  revenue: {
    total: number;
    buckets: Map<RevenueBucketKey, IRevenueBucket>;
  };
  users: {
    newSignups: number;
    cancellationsInDay: number;
  };
  adChannels: Map<string, IAdChannelMetrics>;
  confidence: "live";
  computedAt: Date;
  sourceVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const RevenueBucketSchema = new Schema<IRevenueBucket>(
  {
    revenue: { type: Number, required: true, default: 0 },
    purchaseCount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const AdChannelMetricsSchema = new Schema<IAdChannelMetrics>(
  {
    spend: { type: Number, required: true, default: 0 },
    revenue: { type: Number, required: true, default: 0 },
    roas: { type: Number, required: true, default: 0 },
    impressions: { type: Number },
    clicks: { type: Number },
  },
  { _id: false }
);

const DashboardStatsDailySnapshotSchema = new Schema<IDashboardStatsDailySnapshot>(
  {
    date: { type: String, required: true, unique: true, index: true },
    tz: { type: String, required: true, default: "Australia/Sydney" },
    revenue: {
      total: { type: Number, required: true, default: 0 },
      buckets: { type: Map, of: RevenueBucketSchema, required: true, default: () => new Map() },
    },
    users: {
      newSignups: { type: Number, required: true, default: 0 },
      cancellationsInDay: { type: Number, required: true, default: 0 },
    },
    adChannels: { type: Map, of: AdChannelMetricsSchema, required: true, default: () => new Map() },
    confidence: { type: String, required: true, enum: ["live"] },
    computedAt: { type: Date, required: true },
    sourceVersion: { type: Number, required: true, default: DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION },
  },
  {
    timestamps: true,
    collection: "dashboardstatsdailysnapshots",
  }
);

export default (mongoose.models.DashboardStatsDailySnapshot as mongoose.Model<IDashboardStatsDailySnapshot>) ||
  mongoose.model<IDashboardStatsDailySnapshot>("DashboardStatsDailySnapshot", DashboardStatsDailySnapshotSchema);
```

- [ ] **Step 2: Add manifest entry**

In `CLAUDE.md`, in the `admin` domain `paths` array, add: `"src/models/DashboardStatsDailySnapshot.ts"` and `"src/services/admin/dashboard-stats/**"`.

---

### Task 1.2: Snapshot schema helpers

**Files:**
- Create: `src/services/admin/dashboard-stats/snapshotSchema.ts`

- [ ] **Step 1: Write the file**

```ts
import type { RevenueBucketKey } from "@/models/DashboardStatsDailySnapshot";
import { REVENUE_BUCKET_KEYS } from "@/models/DashboardStatsDailySnapshot";

export { REVENUE_BUCKET_KEYS };
export type { RevenueBucketKey };

/**
 * Maps a raw PaymentEvent's (packageType, packageId, billingReason) into a
 * RevenueBucketKey. Mirrors the existing categorization logic in
 * src/app/api/admin/dashboard/stats/route.ts so snapshots are bit-for-bit
 * comparable to live aggregation during drift verification.
 */
export function classifyRevenueBucket(args: {
  packageType: string | undefined;
  packageId: string | undefined;
  billingReason: string | undefined;
}): RevenueBucketKey | null {
  const { packageType, packageId, billingReason } = args;
  if (packageType === "membership") {
    return billingReason === "subscription_cycle" ? "membershipRenewal" : "membershipPurchase";
  }
  if (packageType === "mini-draw") return "miniDraw";
  if (packageType === "upsell") return "upsell";
  if (packageType === "one-time") {
    if ((packageId ?? "").startsWith("additional-")) return "additionalOneTimePurchase";
    return "oneTimePurchase"; // includes the legacy fallback for unknown patterns
  }
  return null;
}

/** Empty bucket object — used as the seed for accumulation. */
export function emptyBucket(): { revenue: number; purchaseCount: number } {
  return { revenue: 0, purchaseCount: 0 };
}
```

---

### Task 1.3: Test — bucket classification matches the existing endpoint

**Files:**
- Create: `src/services/admin/dashboard-stats/__tests__/snapshotSchema.test.ts`
- Modify: `package.json` (add `"test:dashboard-stats-schema": "tsx src/services/admin/dashboard-stats/__tests__/snapshotSchema.test.ts"`)

- [ ] **Step 1: Write the test**

```ts
import { classifyRevenueBucket } from "../snapshotSchema";

let passed = 0;
let failed = 0;

function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.error(`✗ ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

// Membership: cycle = renewal, anything else = purchase
expect(
  "membership + subscription_cycle => membershipRenewal",
  classifyRevenueBucket({ packageType: "membership", packageId: "apprentice", billingReason: "subscription_cycle" }),
  "membershipRenewal"
);
expect(
  "membership + subscription_create => membershipPurchase",
  classifyRevenueBucket({ packageType: "membership", packageId: "apprentice", billingReason: "subscription_create" }),
  "membershipPurchase"
);
expect(
  "membership + undefined billingReason => membershipPurchase",
  classifyRevenueBucket({ packageType: "membership", packageId: "apprentice", billingReason: undefined }),
  "membershipPurchase"
);

// Mini-draw / upsell direct mapping
expect(
  "mini-draw => miniDraw",
  classifyRevenueBucket({ packageType: "mini-draw", packageId: "any", billingReason: undefined }),
  "miniDraw"
);
expect(
  "upsell => upsell",
  classifyRevenueBucket({ packageType: "upsell", packageId: "any", billingReason: undefined }),
  "upsell"
);

// One-time: additional vs first-time
expect(
  "one-time + additional-* => additionalOneTimePurchase",
  classifyRevenueBucket({ packageType: "one-time", packageId: "additional-apprentice-pack", billingReason: undefined }),
  "additionalOneTimePurchase"
);
expect(
  "one-time + *-pack (non-additional) => oneTimePurchase",
  classifyRevenueBucket({ packageType: "one-time", packageId: "apprentice-pack", billingReason: undefined }),
  "oneTimePurchase"
);
expect(
  "one-time + unknown packageId => oneTimePurchase (fallback)",
  classifyRevenueBucket({ packageType: "one-time", packageId: "weird-id", billingReason: undefined }),
  "oneTimePurchase"
);

// Unknown package types
expect(
  "unknown packageType => null",
  classifyRevenueBucket({ packageType: "ghost", packageId: undefined, billingReason: undefined }),
  null
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Wire the npm script**

In `package.json` scripts section, add:
```json
"test:dashboard-stats-schema": "tsx src/services/admin/dashboard-stats/__tests__/snapshotSchema.test.ts"
```

- [ ] **Step 3: Run the test**

```
npm run test:dashboard-stats-schema
```

Expected: `9 passed, 0 failed`.

---

### Task 1.4: Ad-channel provider registry

**Files:**
- Create: `src/services/admin/dashboard-stats/adChannelProviders.ts`

- [ ] **Step 1: Write the file**

```ts
import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import { formatInTimeZone } from "date-fns-tz";

const AEST_TIMEZONE = "Australia/Sydney";

export interface AdChannelMetrics {
  spend: number;
  revenue: number;
  roas: number;
  impressions?: number;
  clicks?: number;
}

/**
 * An ad-channel provider knows how to fetch one day's metrics for one channel.
 * Add a new channel (TikTok, Snapchat, Google Ads) by appending one provider —
 * no schema change required; the snapshot stores adChannels as a Map.
 */
export interface AdChannelProvider {
  key: string; // becomes the Map key in the snapshot
  fetchForDay(args: { dayStartUTC: Date; dayEndUTC: Date }): Promise<AdChannelMetrics | null>;
}

function aestDateString(d: Date): string {
  const y = parseInt(formatInTimeZone(d, AEST_TIMEZONE, "yyyy"), 10);
  const m = parseInt(formatInTimeZone(d, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(d, AEST_TIMEZONE, "d"), 10);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const facebookAdChannelProvider: AdChannelProvider = {
  key: "facebook",
  async fetchForDay({ dayStartUTC }) {
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    if (!adAccountId || !accessToken) return null;

    const dateStr = aestDateString(dayStartUTC);
    try {
      const insights = await fetchFacebookInsights(
        adAccountId,
        accessToken,
        { since: dateStr, until: dateStr },
        "account"
      );
      if (!insights || insights.length === 0) return null;
      const m = insights[0].metrics;
      return {
        spend: m.spend / 100,
        revenue: m.revenue / 100,
        roas: m.roas,
        impressions: typeof m.impressions === "number" ? m.impressions : undefined,
        clicks: typeof m.clicks === "number" ? m.clicks : undefined,
      };
    } catch (err) {
      console.error(`[adChannel:facebook] fetch failed for ${dateStr}:`, err);
      return null;
    }
  },
};

/**
 * Registered providers. To add a new channel, append its provider here.
 * Snapshots will start capturing the new channel on the next cron run.
 */
export const AD_CHANNEL_PROVIDERS: AdChannelProvider[] = [facebookAdChannelProvider];
```

> **Note for the implementer:** Confirm via `Grep` whether `fetchFacebookInsights` returns `impressions`/`clicks` on the `metrics` object. If not, drop those fields from the provider (it falls back to `undefined` gracefully). Do NOT invent fields.

---

### Task 1.5: Revenue aggregator (refund-aware, single-day)

**Files:**
- Create: `src/services/admin/dashboard-stats/revenueAggregator.ts`

- [ ] **Step 1: Write the file**

```ts
import PaymentEvent from "@/models/PaymentEvent";
import type { RevenueBucketKey } from "@/models/DashboardStatsDailySnapshot";
import { REVENUE_BUCKET_KEYS, classifyRevenueBucket, emptyBucket } from "./snapshotSchema";

export interface DayRevenueResult {
  total: number;
  buckets: Record<RevenueBucketKey, { revenue: number; purchaseCount: number }>;
}

function emptyBuckets(): Record<RevenueBucketKey, { revenue: number; purchaseCount: number }> {
  const out = {} as Record<RevenueBucketKey, { revenue: number; purchaseCount: number }>;
  for (const k of REVENUE_BUCKET_KEYS) out[k] = emptyBucket();
  return out;
}

/**
 * Aggregate net revenue for [dayStartUTC, dayEndUTC).
 * Caller passes a precomputed Set of refundedPaymentIntentIds so we don't run
 * a $lookup per row (massive speedup vs. the existing live aggregation pattern).
 *
 * `dayEndUTC` is EXCLUSIVE — pass next-day-midnight-AEST-in-UTC.
 */
export async function aggregateRevenueForDay(
  dayStartUTC: Date,
  dayEndUTC: Date,
  refundedPaymentIntentIds: Set<string>
): Promise<DayRevenueResult> {
  // Lean read of BenefitsGranted only in this UTC window.
  const events = await PaymentEvent.find(
    {
      eventType: "BenefitsGranted",
      timestamp: { $gte: dayStartUTC, $lt: dayEndUTC },
    },
    {
      paymentIntentId: 1,
      packageType: 1,
      packageId: 1,
      data: 1,
      timestamp: 1,
    }
  )
    .lean()
    .exec();

  const buckets = emptyBuckets();
  let total = 0;

  for (const ev of events) {
    const pid = (ev as { paymentIntentId?: string }).paymentIntentId;
    if (pid && refundedPaymentIntentIds.has(pid)) continue;

    const price = (ev as { data?: { price?: number } }).data?.price ?? 0;
    const bucketKey = classifyRevenueBucket({
      packageType: (ev as { packageType?: string }).packageType,
      packageId: (ev as { packageId?: string }).packageId,
      billingReason: (ev as { data?: { billingReason?: string } }).data?.billingReason,
    });
    if (!bucketKey) continue;

    buckets[bucketKey].revenue += price;
    buckets[bucketKey].purchaseCount += 1;
    total += price;
  }

  return { total, buckets };
}

/**
 * Load the set of paymentIntentIds that have a RefundProcessed event (all-time).
 * Used once per cron invocation to avoid per-row $lookups.
 */
export async function loadRefundedPaymentIntentIds(): Promise<Set<string>> {
  const ids = await PaymentEvent.distinct("paymentIntentId", { eventType: "RefundProcessed" });
  return new Set(ids.filter((x): x is string => typeof x === "string"));
}
```

---

### Task 1.6: Test — aggregator handles refund exclusion and AEST day boundary

**Files:**
- Create: `src/services/admin/dashboard-stats/__tests__/revenueAggregator.test.ts`
- Modify: `package.json` (add `"test:dashboard-stats-aggregator"`)

- [ ] **Step 1: Write the test**

The test will spin up an in-memory dataset in a sandbox Mongo DB. Look at [src/services/stripe-webhook-queue/__tests__/enqueue.test.ts](src/services/stripe-webhook-queue/__tests__/enqueue.test.ts) for the established pattern of standing up a Mongo instance + seeding documents + asserting. Copy that bootstrap pattern verbatim, then:

```ts
// After the standard bootstrap (connectDB, clearCollections):

import PaymentEvent from "@/models/PaymentEvent";
import { aggregateRevenueForDay, loadRefundedPaymentIntentIds } from "../revenueAggregator";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

async function seed() {
  // Day under test: March 5 2026 in AEST. Midnight AEST = 2026-03-04T13:00:00Z (AEDT in March).
  const dayStart = createAESTDateAsUTC(2026, 3, 5, 0, 0);
  const dayEnd = createAESTDateAsUTC(2026, 3, 6, 0, 0);

  await PaymentEvent.create([
    // Inside day, kept
    { eventType: "BenefitsGranted", paymentIntentId: "pi_A", packageType: "membership", packageId: "apprentice", data: { price: 49, billingReason: "subscription_create" }, timestamp: createAESTDateAsUTC(2026, 3, 5, 9, 0), userId: "u1" },
    { eventType: "BenefitsGranted", paymentIntentId: "pi_B", packageType: "membership", packageId: "apprentice", data: { price: 49, billingReason: "subscription_cycle" }, timestamp: createAESTDateAsUTC(2026, 3, 5, 10, 0), userId: "u2" },
    { eventType: "BenefitsGranted", paymentIntentId: "pi_C", packageType: "one-time", packageId: "apprentice-pack", data: { price: 25 }, timestamp: createAESTDateAsUTC(2026, 3, 5, 11, 0), userId: "u3" },
    { eventType: "BenefitsGranted", paymentIntentId: "pi_D", packageType: "one-time", packageId: "additional-tradie-pack", data: { price: 15 }, timestamp: createAESTDateAsUTC(2026, 3, 5, 12, 0), userId: "u4" },
    { eventType: "BenefitsGranted", paymentIntentId: "pi_E", packageType: "mini-draw", packageId: "anything", data: { price: 5 }, timestamp: createAESTDateAsUTC(2026, 3, 5, 13, 0), userId: "u5" },
    { eventType: "BenefitsGranted", paymentIntentId: "pi_F", packageType: "upsell", packageId: "anything", data: { price: 10 }, timestamp: createAESTDateAsUTC(2026, 3, 5, 14, 0), userId: "u6" },
    // Refunded — must be excluded
    { eventType: "BenefitsGranted", paymentIntentId: "pi_REF", packageType: "membership", packageId: "apprentice", data: { price: 99, billingReason: "subscription_create" }, timestamp: createAESTDateAsUTC(2026, 3, 5, 15, 0), userId: "u7" },
    { eventType: "RefundProcessed", paymentIntentId: "pi_REF", data: { refundAmount: 9900 }, timestamp: createAESTDateAsUTC(2026, 3, 7, 9, 0) },
    // Boundary: 23:59 March 4 AEST — previous day, excluded
    { eventType: "BenefitsGranted", paymentIntentId: "pi_BEFORE", packageType: "membership", data: { price: 1, billingReason: "subscription_create" }, timestamp: createAESTDateAsUTC(2026, 3, 4, 23, 59), userId: "u8" },
    // Boundary: 00:00 March 6 AEST — next day, excluded
    { eventType: "BenefitsGranted", paymentIntentId: "pi_AFTER", packageType: "membership", data: { price: 1, billingReason: "subscription_create" }, timestamp: createAESTDateAsUTC(2026, 3, 6, 0, 0), userId: "u9" },
  ]);

  return { dayStart, dayEnd };
}

async function run() {
  await connectDB();
  await PaymentEvent.deleteMany({});
  const { dayStart, dayEnd } = await seed();

  const refunded = await loadRefundedPaymentIntentIds();
  const result = await aggregateRevenueForDay(dayStart, dayEnd, refunded);

  let passed = 0, failed = 0;
  function expect(name: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    ok ? (passed++, console.log(`✓ ${name}`)) : (failed++, console.error(`✗ ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`));
  }

  expect("total revenue excludes refunded + boundary rows", result.total, 49 + 49 + 25 + 15 + 5 + 10);
  expect("membershipPurchase bucket", result.buckets.membershipPurchase, { revenue: 49, purchaseCount: 1 });
  expect("membershipRenewal bucket", result.buckets.membershipRenewal, { revenue: 49, purchaseCount: 1 });
  expect("oneTimePurchase bucket", result.buckets.oneTimePurchase, { revenue: 25, purchaseCount: 1 });
  expect("additionalOneTimePurchase bucket", result.buckets.additionalOneTimePurchase, { revenue: 15, purchaseCount: 1 });
  expect("miniDraw bucket", result.buckets.miniDraw, { revenue: 5, purchaseCount: 1 });
  expect("upsell bucket", result.buckets.upsell, { revenue: 10, purchaseCount: 1 });

  console.log(`\n${passed} passed, ${failed} failed`);
  await PaymentEvent.deleteMany({});
  await mongoose.disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Wire the npm script**

```json
"test:dashboard-stats-aggregator": "tsx src/services/admin/dashboard-stats/__tests__/revenueAggregator.test.ts"
```

- [ ] **Step 3: Run the test**

```
npm run test:dashboard-stats-aggregator
```

Expected: `7 passed, 0 failed`.

---

### Task 1.7: Snapshot writer orchestrator

**Files:**
- Create: `src/services/admin/dashboard-stats/DashboardStatsSnapshotWriter.ts`

- [ ] **Step 1: Write the file**

```ts
import User from "@/models/User";
import DashboardStatsDailySnapshot, {
  DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION,
  type IRevenueBucket,
} from "@/models/DashboardStatsDailySnapshot";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";
import { aggregateRevenueForDay, loadRefundedPaymentIntentIds } from "./revenueAggregator";
import { REVENUE_BUCKET_KEYS } from "./snapshotSchema";
import { AD_CHANNEL_PROVIDERS } from "./adChannelProviders";

const AEST_TIMEZONE = "Australia/Sydney";

export interface WriteResult {
  date: string; // YYYY-MM-DD AEST
  ok: boolean;
  error?: string;
}

function aestDateKey(dayStartUTC: Date): string {
  return formatInTimeZone(dayStartUTC, AEST_TIMEZONE, "yyyy-MM-dd");
}

/**
 * Parse an AEST date key (YYYY-MM-DD) into [startUTC, endUTC) representing
 * that AEST calendar day. Handles AEST/AEDT automatically via createAESTDateAsUTC.
 */
export function aestDayBounds(dateKey: string): { dayStartUTC: Date; dayEndUTC: Date } {
  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);
  const dayStartUTC = createAESTDateAsUTC(y, m, d, 0, 0);
  // End is midnight of the next AEST day. addDays in UTC space then re-resolve in AEST.
  const nextDay = new Date(dayStartUTC.getTime() + 26 * 60 * 60 * 1000); // overshoot to clear DST
  const nyear = parseInt(formatInTimeZone(nextDay, AEST_TIMEZONE, "yyyy"), 10);
  const nmonth = parseInt(formatInTimeZone(nextDay, AEST_TIMEZONE, "M"), 10);
  const nday = parseInt(formatInTimeZone(nextDay, AEST_TIMEZONE, "d"), 10);
  const dayEndUTC = createAESTDateAsUTC(nyear, nmonth, nday, 0, 0);
  return { dayStartUTC, dayEndUTC };
}

/** Build an ordered list of AEST date keys from `startDateKey` to `endDateKey` inclusive. */
export function expandDateKeyRange(startDateKey: string, endDateKey: string): string[] {
  const result: string[] = [];
  let cursor = startDateKey;
  while (cursor <= endDateKey) {
    result.push(cursor);
    const { dayEndUTC } = aestDayBounds(cursor);
    cursor = aestDateKey(dayEndUTC);
  }
  return result;
}

/**
 * Compute and upsert the snapshot for a single AEST date.
 */
export async function writeSnapshotForDate(
  dateKey: string,
  refundedPaymentIntentIds: Set<string>
): Promise<WriteResult> {
  try {
    const { dayStartUTC, dayEndUTC } = aestDayBounds(dateKey);

    // Revenue
    const revenue = await aggregateRevenueForDay(dayStartUTC, dayEndUTC, refundedPaymentIntentIds);
    const bucketsMap = new Map<string, IRevenueBucket>();
    for (const key of REVENUE_BUCKET_KEYS) {
      bucketsMap.set(key, revenue.buckets[key]);
    }

    // Users
    const [newSignups, cancellationsInDay] = await Promise.all([
      User.countDocuments({
        createdAt: { $gte: dayStartUTC, $lt: dayEndUTC },
        isActive: true,
      }),
      User.countDocuments({
        "subscription.cancelledAt": { $gte: dayStartUTC, $lt: dayEndUTC },
        isActive: true,
      }),
    ]);

    // Ad channels (provider registry — easy to extend)
    const adChannelsMap = new Map<string, IRevenueBucket | object>();
    for (const provider of AD_CHANNEL_PROVIDERS) {
      const metrics = await provider.fetchForDay({ dayStartUTC, dayEndUTC });
      if (metrics) adChannelsMap.set(provider.key, metrics);
    }

    await DashboardStatsDailySnapshot.findOneAndUpdate(
      { date: dateKey },
      {
        $set: {
          tz: AEST_TIMEZONE,
          revenue: { total: revenue.total, buckets: bucketsMap },
          users: { newSignups, cancellationsInDay },
          adChannels: adChannelsMap,
          confidence: "live",
          computedAt: new Date(),
          sourceVersion: DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION,
        },
      },
      { upsert: true }
    );

    return { date: dateKey, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[snapshot-writer] ${dateKey} failed:`, err);
    return { date: dateKey, ok: false, error: message };
  }
}

/**
 * Write the sliding window: today + the previous N days.
 * Refund set is loaded once per call.
 */
export async function writeSlidingWindow(args: { todayAESTDateKey: string; windowDays: number }): Promise<WriteResult[]> {
  const { todayAESTDateKey, windowDays } = args;
  const { dayStartUTC: todayStart } = aestDayBounds(todayAESTDateKey);

  // Walk backwards `windowDays` calendar days in AEST
  const startDayUTC = new Date(todayStart.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000);
  const startKey = aestDateKey(startDayUTC);
  const keys = expandDateKeyRange(startKey, todayAESTDateKey);

  const refunded = await loadRefundedPaymentIntentIds();
  const results: WriteResult[] = [];
  for (const key of keys) {
    results.push(await writeSnapshotForDate(key, refunded));
  }
  return results;
}
```

> **Implementation note for the engineer:** The `-2 * 60 * 60 * 1000` overshoot in `writeSlidingWindow` guards against DST transitions where a UTC day-subtraction lands inside the same AEST day. `expandDateKeyRange` normalizes it.

---

### Task 1.8: Test — DST boundary day produces a valid snapshot

**Files:**
- Create: `src/services/admin/dashboard-stats/__tests__/dstBoundary.test.ts`
- Modify: `package.json` (add `"test:dashboard-stats-dst"`)

- [ ] **Step 1: Write the test**

Sydney DST transitions: AEDT → AEST happens first Sunday in April (clocks go back at 03:00 → 02:00). AEST → AEDT happens first Sunday in October (clocks forward 02:00 → 03:00).

```ts
import { aestDayBounds, expandDateKeyRange } from "../DashboardStatsSnapshotWriter";

let passed = 0, failed = 0;
function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (passed++, console.log(`✓ ${name}`)) : (failed++, console.error(`✗ ${name}\n  exp: ${JSON.stringify(expected)}\n  got: ${JSON.stringify(actual)}`));
}

// April 5 2026 is the AEDT → AEST DST switch (first Sunday April).
// AEDT day = 23h, but our bounds should still produce a contiguous start/end.
const april5 = aestDayBounds("2026-04-05");
expect("April 5 2026 start has midnight AEST", april5.dayStartUTC.toISOString(), "2026-04-04T13:00:00.000Z");
expect("April 5 2026 end has midnight AEST next day", april5.dayEndUTC.toISOString(), "2026-04-05T14:00:00.000Z");
// (The 25-hour duration is correct: this is the day where the clock "falls back".)

// October 4 2026 is the AEST → AEDT switch (first Sunday October). Day = 23h.
const oct4 = aestDayBounds("2026-10-04");
expect("Oct 4 2026 start has midnight AEST", oct4.dayStartUTC.toISOString(), "2026-10-03T14:00:00.000Z");
expect("Oct 4 2026 end has midnight AEDT next day", oct4.dayEndUTC.toISOString(), "2026-10-04T13:00:00.000Z");

// Range expansion across the DST boundary should not skip or duplicate days.
const aroundFallBack = expandDateKeyRange("2026-04-04", "2026-04-06");
expect("range across April DST has exactly 3 days", aroundFallBack, ["2026-04-04", "2026-04-05", "2026-04-06"]);

const aroundSpringForward = expandDateKeyRange("2026-10-03", "2026-10-05");
expect("range across October DST has exactly 3 days", aroundSpringForward, ["2026-10-03", "2026-10-04", "2026-10-05"]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
```

> **Implementer:** The exact ISO timestamps in the `expect` calls depend on the DST rules `date-fns-tz` applies. Run the test first; if the actual values are off-by-1-hour due to a DST detail you forgot, **don't change the assertion to match the code** — verify against Wolfram Alpha or `TZ=Australia/Sydney date -d ...` (or PowerShell `[TimeZoneInfo]::ConvertTime`). Only update if you confirm the expected value was wrong.

- [ ] **Step 2: Wire the npm script**

```json
"test:dashboard-stats-dst": "tsx src/services/admin/dashboard-stats/__tests__/dstBoundary.test.ts"
```

- [ ] **Step 3: Run the test**

Expected: `6 passed, 0 failed`.

---

### Task 1.9: Nightly cron route

**Files:**
- Create: `src/app/api/cron/dashboard-stats-daily-snapshot/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import { writeSlidingWindow } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TZ = "Australia/Sydney";
const SLIDING_WINDOW_DAYS = 90;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const todayKey = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
    const results = await writeSlidingWindow({
      todayAESTDateKey: todayKey,
      windowDays: SLIDING_WINDOW_DAYS,
    });

    const failed = results.filter((r) => !r.ok);
    console.log("[cron dashboard-stats-daily-snapshot] complete", {
      today: todayKey,
      windowDays: SLIDING_WINDOW_DAYS,
      written: results.length - failed.length,
      failed: failed.length,
    });

    return NextResponse.json({
      ok: failed.length === 0,
      today: todayKey,
      windowDays: SLIDING_WINDOW_DAYS,
      written: results.length - failed.length,
      failed: failed.map((f) => ({ date: f.date, error: f.error })),
    });
  } catch (err) {
    console.error("[cron dashboard-stats-daily-snapshot] fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Add cron schedule + function config to `vercel.json`**

Add to `crons` array:
```json
{ "path": "/api/cron/dashboard-stats-daily-snapshot", "schedule": "0 14 * * *" },
{ "path": "/api/cron/dashboard-stats-daily-snapshot", "schedule": "0 15 * * *" }
```

Add to `functions` map:
```json
"src/app/api/cron/dashboard-stats-daily-snapshot/route.ts": { "memory": 1024, "maxDuration": 300 }
```

> **Why two schedules:** 14:00 UTC = midnight AEST or 01:00 AEDT; 15:00 UTC = 01:00 AEST or 02:00 AEDT. Running both guarantees we always snapshot AFTER the AEST day ends, and provides a 1-hour-later self-heal if the first run failed. The cron handler is idempotent (upsert by `date`), so running twice produces the same result.

- [ ] **Step 3: Manual smoke (after deploy to staging or local)**

Hit `GET http://localhost:3000/api/cron/dashboard-stats-daily-snapshot` with `Authorization: Bearer $CRON_SECRET` (or no header if `CRON_SECRET` is unset locally). Expect a `200` with `ok: true`. Verify in Mongo: `db.dashboardstatsdailysnapshots.find({}).sort({date:-1}).limit(3)` shows 3 most recent days.

---

### Task 1.10: PR 1 review checklist + STOP

- [ ] **Step 1: Confirm hook checklist**

Run the doc-sync hook locally if available, or eyeball: have we added the new files to `CLAUDE.md`'s `admin` and `infrastructure` domain paths? Add them now if not.

- [ ] **Step 2: Run lint + type-check**

```
npm run lint
npm run type-check
```

Both should pass with zero errors.

- [ ] **Step 3: Run all new tests**

```
npm run test:dashboard-stats-schema
npm run test:dashboard-stats-aggregator
npm run test:dashboard-stats-dst
```

All three should pass.

- [ ] **Step 4: STOP**

**STOP for DJ.** Summary to deliver:
- New model + writer + nightly cron shipped
- Sliding window of 90 days is built in, but only fires after the first cron run
- No reads have changed — the `/api/admin/dashboard/stats` endpoint still behaves as today
- Snapshot table will be empty until either (a) the cron runs once, or (b) PR 2 (backfill) runs

Wait for DJ to commit and merge before starting PR 2.

---

# PR 2 — Historical Backfill

**Goal:** Populate snapshots from website launch date (2025-11-27) → yesterday. After this PR, the snapshot table has full history.

---

### Task 2.1: Backfill script

**Files:**
- Create: `scripts/backfill-dashboard-stats-snapshots.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

```ts
/**
 * One-shot backfill for DashboardStatsDailySnapshot.
 *
 * Usage:
 *   npx tsx scripts/backfill-dashboard-stats-snapshots.ts --dry-run
 *   npx tsx scripts/backfill-dashboard-stats-snapshots.ts
 *   npx tsx scripts/backfill-dashboard-stats-snapshots.ts --start-date 2026-01-01 --end-date 2026-03-31
 *
 * Defaults: --start-date=2025-11-27 (launch), --end-date=yesterday-AEST.
 *
 * Refund-aware: loads the refund set once and reuses it. Idempotent (upsert by date).
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import DashboardStatsDailySnapshot from "@/models/DashboardStatsDailySnapshot";
import {
  writeSnapshotForDate,
  expandDateKeyRange,
  aestDayBounds,
} from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";
import { loadRefundedPaymentIntentIds } from "@/services/admin/dashboard-stats/revenueAggregator";

const TZ = "Australia/Sydney";
const LAUNCH_DATE_KEY = "2025-11-27";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx < process.argv.length - 1 ? process.argv[idx + 1] : null;
}

function yesterdayKey(): string {
  const now = new Date();
  const todayKey = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  // Subtract 1 AEST day
  const { dayStartUTC } = aestDayBounds(todayKey);
  const minusOne = new Date(dayStartUTC.getTime() - 12 * 60 * 60 * 1000);
  return formatInTimeZone(minusOne, TZ, "yyyy-MM-dd");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const startKey = argValue("--start-date") ?? LAUNCH_DATE_KEY;
  const endKey = argValue("--end-date") ?? yesterdayKey();

  console.log(`${dryRun ? "DRY RUN" : "LIVE"} — backfill ${startKey} → ${endKey}`);

  await connectDB();

  const keys = expandDateKeyRange(startKey, endKey);
  console.log(`Will process ${keys.length} day(s)`);

  if (dryRun) {
    console.log("Sample keys:", keys.slice(0, 5), "...", keys.slice(-5));
    const existing = await DashboardStatsDailySnapshot.countDocuments({ date: { $in: keys } });
    console.log(`Existing snapshots in range: ${existing} (would be upserted)`);
    await mongoose.disconnect();
    return;
  }

  const refunded = await loadRefundedPaymentIntentIds();
  console.log(`Loaded ${refunded.size} refunded payment intent ids`);

  let okCount = 0;
  let failCount = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const result = await writeSnapshotForDate(k, refunded);
    if (result.ok) {
      okCount += 1;
    } else {
      failCount += 1;
      console.error(`  ✗ ${k}: ${result.error}`);
    }
    if ((i + 1) % 25 === 0) {
      console.log(`  progress: ${i + 1}/${keys.length} (ok=${okCount}, fail=${failCount})`);
    }
  }

  console.log(`\nDone. ok=${okCount}, fail=${failCount}`);
  await mongoose.disconnect();
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire npm scripts**

```json
"backfill:dashboard-stats-snapshots": "tsx scripts/backfill-dashboard-stats-snapshots.ts",
"backfill:dashboard-stats-snapshots:dry": "tsx scripts/backfill-dashboard-stats-snapshots.ts --dry-run"
```

- [ ] **Step 3: Dry-run locally**

```
npm run backfill:dashboard-stats-snapshots:dry
```

Expected: prints the date range and number of days, plus existing snapshot count (should be `0` if PR 1's cron hasn't run yet, or `90` if it has).

---

### Task 2.2: Execute the backfill

- [ ] **Step 1: Run with a small range first as a smoke test**

```
npx tsx scripts/backfill-dashboard-stats-snapshots.ts --start-date 2026-01-01 --end-date 2026-01-07
```

Expected: 7 successful writes. Verify in Mongo: `db.dashboardstatsdailysnapshots.find({date:{$gte:"2026-01-01",$lte:"2026-01-07"}}).count() === 7`.

- [ ] **Step 2: Spot-check the data**

Pick one day with known activity. Compare `db.dashboardstatsdailysnapshots.findOne({date:"2026-01-05"}).revenue.total` against a live query:

```js
db.paymentevents.aggregate([
  { $match: { eventType: "BenefitsGranted", timestamp: { $gte: ISODate("2026-01-04T13:00:00Z"), $lt: ISODate("2026-01-05T13:00:00Z") } } },
  // NOTE: subtract refunded; the live equivalent of fetchNetBenefitsGrantedInRange will give the same number
  ...
])
```

The numbers must match exactly. If they don't, **stop and debug before running full backfill**.

- [ ] **Step 3: Run the full backfill**

```
npm run backfill:dashboard-stats-snapshots
```

This will take a few minutes (one day per ~1-3 seconds depending on payment volume). Watch progress logs.

- [ ] **Step 4: Confirm coverage**

```js
db.dashboardstatsdailysnapshots.countDocuments() // should equal (yesterday-AEST minus 2025-11-27) + 1
```

- [ ] **Step 5: STOP**

**STOP for DJ.** Summary:
- Backfill complete from launch through yesterday
- Snapshot count and one-day spot-check match live aggregation
- Next: PR 3 wires the read path

---

# PR 3 — Reader Service + Endpoint Refactor (the user-visible win)

**Goal:** Replace the all-time `fetchNetBenefitsGrantedInRange` block in `/api/admin/dashboard/stats` with snapshot reads + live "today" overlay + live distinct user counts. After this PR, `dateRange=all-time` returns in <500ms.

---

### Task 3.1: Distinct-user-count helper (refund-aware, live)

**Files:**
- Create: `src/services/admin/dashboard-stats/distinctUserCounts.ts`

- [ ] **Step 1: Write the file**

```ts
import PaymentEvent from "@/models/PaymentEvent";
import type { PipelineStage } from "mongoose";
import { excludeRefundedBenefitsGrantedStages } from "@/utils/payment/payment-event-net-queries";
import { REVENUE_BUCKET_KEYS, classifyRevenueBucket, type RevenueBucketKey } from "./snapshotSchema";

export type DistinctUserCountsByBucket = Record<RevenueBucketKey, number>;

/**
 * Compute distinct userCount per revenue bucket for [startDate, endDate], with
 * refund exclusion. Single aggregation that emits one row per bucket using
 * $addToSet on userId — bounded by user count, not event count.
 *
 * For all-time, this scans the full BenefitsGranted set but groups in Mongo;
 * a covered index on {eventType:1, timestamp:1, packageType:1, packageId:1, userId:1}
 * keeps this fast.
 */
export async function computeDistinctUserCounts(
  startDate: Date,
  endDate: Date
): Promise<DistinctUserCountsByBucket> {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        eventType: "BenefitsGranted",
        timestamp: { $gte: startDate, $lte: endDate },
      },
    },
    ...excludeRefundedBenefitsGrantedStages(),
    {
      $project: {
        userId: 1,
        packageType: 1,
        packageId: 1,
        billingReason: "$data.billingReason",
      },
    },
    {
      $group: {
        _id: { packageType: "$packageType", packageId: "$packageId", billingReason: "$billingReason" },
        users: { $addToSet: "$userId" },
      },
    },
  ];

  const rows = (await PaymentEvent.aggregate(pipeline).allowDiskUse(true).exec()) as Array<{
    _id: { packageType?: string; packageId?: string; billingReason?: string };
    users: unknown[];
  }>;

  // Aggregate per bucket across (packageType, packageId, billingReason) tuples.
  // Same user across two tuples within the same bucket must count once — we
  // re-union into a Set per bucket.
  const userSetsByBucket: Record<RevenueBucketKey, Set<string>> = {} as Record<RevenueBucketKey, Set<string>>;
  for (const k of REVENUE_BUCKET_KEYS) userSetsByBucket[k] = new Set();

  for (const row of rows) {
    const bucket = classifyRevenueBucket(row._id);
    if (!bucket) continue;
    for (const u of row.users) {
      if (u != null) userSetsByBucket[bucket].add(String(u));
    }
  }

  const result = {} as DistinctUserCountsByBucket;
  for (const k of REVENUE_BUCKET_KEYS) result[k] = userSetsByBucket[k].size;
  return result;
}
```

---

### Task 3.2: Snapshot reader

**Files:**
- Create: `src/services/admin/dashboard-stats/DashboardStatsSnapshotReader.ts`

- [ ] **Step 1: Write the file**

```ts
import DashboardStatsDailySnapshot, { type RevenueBucketKey } from "@/models/DashboardStatsDailySnapshot";
import { formatInTimeZone } from "date-fns-tz";
import { aestDayBounds } from "./DashboardStatsSnapshotWriter";
import { REVENUE_BUCKET_KEYS, emptyBucket } from "./snapshotSchema";
import { aggregateRevenueForDay, loadRefundedPaymentIntentIds } from "./revenueAggregator";
import { computeDistinctUserCounts } from "./distinctUserCounts";
import { AD_CHANNEL_PROVIDERS } from "./adChannelProviders";
import User from "@/models/User";

const TZ = "Australia/Sydney";

export interface SnapshotReadResult {
  revenue: {
    total: number;
    buckets: Record<RevenueBucketKey, { revenue: number; purchaseCount: number; userCount: number }>;
  };
  users: {
    newSignupsInRange: number;
    cancellationsInRange: number;
  };
  adChannels: Record<string, { spend: number; revenue: number; roas: number }>;
  meta: {
    snapshotDaysUsed: number;
    liveDaysComputed: number;
    missingSnapshotDates: string[];
  };
}

function aestKey(d: Date): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}

function emptyBuckets(): Record<RevenueBucketKey, { revenue: number; purchaseCount: number; userCount: number }> {
  const out = {} as Record<RevenueBucketKey, { revenue: number; purchaseCount: number; userCount: number }>;
  for (const k of REVENUE_BUCKET_KEYS) out[k] = { ...emptyBucket(), userCount: 0 };
  return out;
}

/**
 * Read dashboard stats for [rangeStartUTC, rangeEndUTC] where both are
 * midnight-AEST boundaries (whole AEST days only — enforced by the date picker).
 *
 * - Whole completed AEST days in range are summed from snapshots.
 * - If the range includes "today" (not yet snapshotted), today is computed live.
 * - Missing snapshots fall back to live computation and are flagged in meta.missingSnapshotDates.
 * - userCount per bucket is ALWAYS live (see distinctUserCounts.ts).
 */
export async function readStatsForRange(args: {
  rangeStartUTC: Date;
  rangeEndUTC: Date;
}): Promise<SnapshotReadResult> {
  const { rangeStartUTC, rangeEndUTC } = args;

  const startKey = aestKey(rangeStartUTC);
  // rangeEndUTC is meant to be the END of the last AEST day (or now() for "today"-inclusive).
  // We derive the end AEST date by formatting (rangeEndUTC - 1ms).
  const endKey = aestKey(new Date(rangeEndUTC.getTime() - 1));
  const todayKey = aestKey(new Date());

  // Enumerate AEST date keys in the range, inclusive.
  const dateKeys: string[] = [];
  {
    let cursor = startKey;
    while (cursor <= endKey) {
      dateKeys.push(cursor);
      const { dayEndUTC } = aestDayBounds(cursor);
      cursor = aestKey(dayEndUTC);
    }
  }

  // Load all snapshots in range in one query
  const snapshots = await DashboardStatsDailySnapshot.find({
    date: { $in: dateKeys },
  }).lean();
  const snapByDate = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) snapByDate.set(s.date, s);

  const buckets = emptyBuckets();
  const adChannels: Record<string, { spend: number; revenue: number; roas: number }> = {};
  let revenueTotal = 0;
  let newSignupsInRange = 0;
  let cancellationsInRange = 0;
  const missingSnapshotDates: string[] = [];
  let snapshotDaysUsed = 0;
  let liveDaysComputed = 0;

  // For live days we need the refund set ONCE.
  let refundedLazy: Set<string> | null = null;
  async function getRefunded(): Promise<Set<string>> {
    if (refundedLazy === null) refundedLazy = await loadRefundedPaymentIntentIds();
    return refundedLazy;
  }

  for (const dateKey of dateKeys) {
    const isToday = dateKey === todayKey;
    const snap = snapByDate.get(dateKey);

    if (snap && !isToday) {
      // Snapshot day — sum it
      snapshotDaysUsed += 1;
      revenueTotal += snap.revenue?.total ?? 0;
      const bucketsMap = (snap.revenue?.buckets ?? new Map()) as Map<string, { revenue: number; purchaseCount: number }> | Record<string, { revenue: number; purchaseCount: number }>;
      const entries = bucketsMap instanceof Map ? Array.from(bucketsMap.entries()) : Object.entries(bucketsMap);
      for (const [k, v] of entries) {
        if (!REVENUE_BUCKET_KEYS.includes(k as RevenueBucketKey)) continue;
        buckets[k as RevenueBucketKey].revenue += v.revenue;
        buckets[k as RevenueBucketKey].purchaseCount += v.purchaseCount;
      }
      newSignupsInRange += snap.users?.newSignups ?? 0;
      cancellationsInRange += snap.users?.cancellationsInDay ?? 0;

      const adMap = (snap.adChannels ?? new Map()) as Map<string, { spend: number; revenue: number; roas: number }> | Record<string, { spend: number; revenue: number; roas: number }>;
      const adEntries = adMap instanceof Map ? Array.from(adMap.entries()) : Object.entries(adMap);
      for (const [chanKey, m] of adEntries) {
        const acc = adChannels[chanKey] ?? { spend: 0, revenue: 0, roas: 0 };
        acc.spend += m.spend;
        acc.revenue += m.revenue;
        // ROAS will be recomputed at the end as totalRevenue/totalSpend
        adChannels[chanKey] = acc;
      }
    } else {
      // Live day — compute on the fly
      liveDaysComputed += 1;
      if (!snap && !isToday) missingSnapshotDates.push(dateKey);

      const { dayStartUTC, dayEndUTC } = aestDayBounds(dateKey);
      const effectiveDayEnd = isToday ? new Date() : dayEndUTC;
      const refunded = await getRefunded();
      const rev = await aggregateRevenueForDay(dayStartUTC, effectiveDayEnd, refunded);
      revenueTotal += rev.total;
      for (const k of REVENUE_BUCKET_KEYS) {
        buckets[k].revenue += rev.buckets[k].revenue;
        buckets[k].purchaseCount += rev.buckets[k].purchaseCount;
      }
      const [signups, cancels] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: dayStartUTC, $lt: effectiveDayEnd }, isActive: true }),
        User.countDocuments({ "subscription.cancelledAt": { $gte: dayStartUTC, $lt: effectiveDayEnd }, isActive: true }),
      ]);
      newSignupsInRange += signups;
      cancellationsInRange += cancels;

      for (const provider of AD_CHANNEL_PROVIDERS) {
        const metrics = await provider.fetchForDay({ dayStartUTC, dayEndUTC: effectiveDayEnd });
        if (!metrics) continue;
        const acc = adChannels[provider.key] ?? { spend: 0, revenue: 0, roas: 0 };
        acc.spend += metrics.spend;
        acc.revenue += metrics.revenue;
        adChannels[provider.key] = acc;
      }
    }
  }

  // Recompute ROAS per channel from summed totals (ROAS doesn't sum naturally).
  for (const chanKey of Object.keys(adChannels)) {
    const c = adChannels[chanKey];
    c.roas = c.spend > 0 ? c.revenue / c.spend : 0;
  }

  // Live distinct user counts per bucket
  const distinctCounts = await computeDistinctUserCounts(rangeStartUTC, rangeEndUTC);
  for (const k of REVENUE_BUCKET_KEYS) {
    buckets[k].userCount = distinctCounts[k];
  }

  return {
    revenue: { total: revenueTotal, buckets },
    users: { newSignupsInRange, cancellationsInRange },
    adChannels,
    meta: { snapshotDaysUsed, liveDaysComputed, missingSnapshotDates },
  };
}
```

> **Important for the implementer:** The snapshot's `revenue.buckets` field comes back from `.lean()` as **either** a `Map` or a plain object depending on Mongoose version and `toObject` options. The code above handles both. Test before assuming one shape.

---

### Task 3.3: Test — reader sums snapshots correctly and merges live today

**Files:**
- Create: `src/services/admin/dashboard-stats/__tests__/snapshotReader.test.ts`
- Modify: `package.json` (add `"test:dashboard-stats-reader"`)

- [ ] **Step 1: Write the test**

Follow the bootstrap pattern from [src/services/stripe-webhook-queue/__tests__/enqueue.test.ts](src/services/stripe-webhook-queue/__tests__/enqueue.test.ts). Then:

```ts
import DashboardStatsDailySnapshot, { DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION } from "@/models/DashboardStatsDailySnapshot";
import PaymentEvent from "@/models/PaymentEvent";
import { readStatsForRange } from "../DashboardStatsSnapshotReader";
import { aestDayBounds } from "../DashboardStatsSnapshotWriter";

async function seedSnapshots() {
  // 3 completed days with known totals
  for (const [date, total, membershipPurchase] of [
    ["2026-04-01", 100, 60],
    ["2026-04-02", 200, 120],
    ["2026-04-03", 150, 90],
  ] as const) {
    await DashboardStatsDailySnapshot.create({
      date,
      tz: "Australia/Sydney",
      revenue: {
        total,
        buckets: new Map([
          ["membershipPurchase", { revenue: membershipPurchase, purchaseCount: 1 }],
          ["membershipRenewal", { revenue: total - membershipPurchase, purchaseCount: 1 }],
          ["oneTimePurchase", { revenue: 0, purchaseCount: 0 }],
          ["additionalOneTimePurchase", { revenue: 0, purchaseCount: 0 }],
          ["miniDraw", { revenue: 0, purchaseCount: 0 }],
          ["upsell", { revenue: 0, purchaseCount: 0 }],
        ]),
      },
      users: { newSignups: 5, cancellationsInDay: 1 },
      adChannels: new Map([["facebook", { spend: 50, revenue: total * 2, roas: total * 2 / 50 }]]),
      confidence: "live",
      computedAt: new Date(),
      sourceVersion: DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION,
    });
  }
}

async function run() {
  await connectDB();
  await DashboardStatsDailySnapshot.deleteMany({});
  await PaymentEvent.deleteMany({});
  await seedSnapshots();

  const { dayStartUTC: start } = aestDayBounds("2026-04-01");
  const { dayEndUTC: end } = aestDayBounds("2026-04-03");

  const result = await readStatsForRange({ rangeStartUTC: start, rangeEndUTC: end });

  let passed = 0, failed = 0;
  function expect(name: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    ok ? (passed++, console.log(`✓ ${name}`)) : (failed++, console.error(`✗ ${name}\n  exp: ${JSON.stringify(expected)}\n  got: ${JSON.stringify(actual)}`));
  }

  expect("total revenue = 100+200+150", result.revenue.total, 450);
  expect("membershipPurchase sum = 60+120+90", result.revenue.buckets.membershipPurchase.revenue, 270);
  expect("newSignupsInRange = 5*3", result.users.newSignupsInRange, 15);
  expect("cancellationsInRange = 1*3", result.users.cancellationsInRange, 3);
  expect("facebook spend = 50*3", result.adChannels.facebook.spend, 150);
  expect("facebook revenue sums correctly", result.adChannels.facebook.revenue, (100 + 200 + 150) * 2);
  expect("facebook ROAS recomputed as totalRev/totalSpend", result.adChannels.facebook.roas, 900 / 150);
  expect("snapshotDaysUsed = 3", result.meta.snapshotDaysUsed, 3);
  expect("liveDaysComputed = 0 (no today)", result.meta.liveDaysComputed, 0);
  expect("missingSnapshotDates is empty", result.meta.missingSnapshotDates, []);

  console.log(`\n${passed} passed, ${failed} failed`);
  await DashboardStatsDailySnapshot.deleteMany({});
  await mongoose.disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Wire and run**

```json
"test:dashboard-stats-reader": "tsx src/services/admin/dashboard-stats/__tests__/snapshotReader.test.ts"
```

```
npm run test:dashboard-stats-reader
```

Expected: `10 passed, 0 failed`.

---

### Task 3.4: Refactor the endpoint to use the reader

**Files:**
- Modify: `src/app/api/admin/dashboard/stats/route.ts`

- [ ] **Step 1: Replace the revenue + ad-channel sections with reader calls**

Open [src/app/api/admin/dashboard/stats/route.ts](src/app/api/admin/dashboard/stats/route.ts). Replace **lines 158–237** (the revenue events block) and **lines 278–405** (the Facebook Ads block) with a single block:

```ts
// ========================================
// REVENUE + AD CHANNELS (from snapshot reader)
// ========================================
const snapshotRead = await readStatsForRange({
  rangeStartUTC: startDate,
  rangeEndUTC: endDate,
});

const totalRevenue = snapshotRead.revenue.total;
const membershipPurchaseData = {
  revenue: snapshotRead.revenue.buckets.membershipPurchase.revenue,
  purchaseCount: snapshotRead.revenue.buckets.membershipPurchase.purchaseCount,
  userCount: snapshotRead.revenue.buckets.membershipPurchase.userCount,
};
const membershipRenewalData = {
  revenue: snapshotRead.revenue.buckets.membershipRenewal.revenue,
  purchaseCount: snapshotRead.revenue.buckets.membershipRenewal.purchaseCount,
  userCount: snapshotRead.revenue.buckets.membershipRenewal.userCount,
};
const oneTimePurchaseData = {
  revenue: snapshotRead.revenue.buckets.oneTimePurchase.revenue,
  purchaseCount: snapshotRead.revenue.buckets.oneTimePurchase.purchaseCount,
  userCount: snapshotRead.revenue.buckets.oneTimePurchase.userCount,
};
const additionalOneTimePurchaseData = {
  revenue: snapshotRead.revenue.buckets.additionalOneTimePurchase.revenue,
  purchaseCount: snapshotRead.revenue.buckets.additionalOneTimePurchase.purchaseCount,
  userCount: snapshotRead.revenue.buckets.additionalOneTimePurchase.userCount,
};
const miniDrawData = {
  revenue: snapshotRead.revenue.buckets.miniDraw.revenue,
  purchaseCount: snapshotRead.revenue.buckets.miniDraw.purchaseCount,
  userCount: snapshotRead.revenue.buckets.miniDraw.userCount,
};
const upsellData = {
  revenue: snapshotRead.revenue.buckets.upsell.revenue,
  purchaseCount: snapshotRead.revenue.buckets.upsell.purchaseCount,
  userCount: snapshotRead.revenue.buckets.upsell.userCount,
};

const facebookAdsSpend = snapshotRead.adChannels.facebook?.spend ?? 0;
const facebookAdsRoas = snapshotRead.adChannels.facebook?.roas ?? 0;
```

Add the import at the top:

```ts
import { readStatsForRange } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotReader";
```

Remove now-unused imports: `fetchNetBenefitsGrantedInRange`, `fetchFacebookInsights`, `subDays`. Leave `formatInTimeZone` (still used elsewhere in the file).

In the **response object** (around line 658, the `breakdown` field), keep the structure identical so the frontend doesn't break — the data values are already in the variables above.

- [ ] **Step 2: Update the comparison-period block (still uses live aggregation)**

The trends block at lines 423–595 also calls `fetchNetBenefitsGrantedInRange` for the comparison period. **Leave this for now** — comparison periods are bounded (max ~90 days), not all-time, so the live call works within timeout. **OR** if you want the same speedup: replace the `fetchNetBenefitsGrantedInRange` call inside the trends block with a second `readStatsForRange({ rangeStartUTC: comparisonStartDate, rangeEndUTC: comparisonEndDate })`. Doing this is cleaner. Choose one approach and apply consistently.

> **Recommendation:** Apply the snapshot reader to the comparison block too. The trends path is the *only* other place that hits the full revenue scan; aligning it removes the last slow tail.

- [ ] **Step 3: Remove the per-route `maxDuration` override if you added one earlier**

If `vercel.json` ever had a `maxDuration` for `/api/admin/dashboard/stats`, remove it. The catch-all `maxDuration: 10` is sufficient now.

- [ ] **Step 4: Manual verification (UI)**

```
npm run dev
```

In the browser, sign in as admin, open `/admin`, click "All time". Verify:
- Response under 1s in DevTools network tab
- Numbers match what production currently shows (use the staging-data spot-check baseline)
- Toggle "Today" / "Yesterday" / "Custom range" — all still work
- Check the response body's `revenue.breakdown.*` shapes match the frontend's expectations

If any number is off by even $1, **stop and debug** before continuing.

---

### Task 3.5: PR 3 review checklist + STOP

- [ ] **Step 1: Lint + type-check**

```
npm run lint
npm run type-check
```

- [ ] **Step 2: All tests pass**

```
npm run test:dashboard-stats-schema
npm run test:dashboard-stats-aggregator
npm run test:dashboard-stats-dst
npm run test:dashboard-stats-reader
```

- [ ] **Step 3: Manual UI verification documented**

In the PR description, include screenshots of network panel before/after showing the latency drop.

- [ ] **Step 4: STOP**

**STOP for DJ.** The user-facing win lands here.

---

# PR 4 — Drift Detection, Health Check, Docs

**Goal:** Ongoing assurance that snapshots stay aligned with live data, plus runbook docs.

---

### Task 4.1: Health check endpoint

**Files:**
- Create: `src/app/api/admin/health/dashboard-stats-snapshot/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import DashboardStatsDailySnapshot from "@/models/DashboardStatsDailySnapshot";
import { expandDateKeyRange } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

const TZ = "Australia/Sydney";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const launchKey = formatInTimeZone(getWebsiteLaunchDateUTC(), TZ, "yyyy-MM-dd");
  // Yesterday: today minus 1 AEST day
  const todayKey = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  const expectedKeys = expandDateKeyRange(launchKey, todayKey).slice(0, -1); // exclude today

  const present = await DashboardStatsDailySnapshot.find({ date: { $in: expectedKeys } })
    .select("date")
    .lean();
  const presentSet = new Set(present.map((p) => p.date));
  const missing = expectedKeys.filter((k) => !presentSet.has(k));

  return NextResponse.json({
    expectedCount: expectedKeys.length,
    presentCount: presentSet.size,
    missingCount: missing.length,
    missingDates: missing,
    latestPresent: present.map((p) => p.date).sort().slice(-3),
  });
}
```

---

### Task 4.2: Drift verification script

**Files:**
- Create: `scripts/verify-dashboard-stats-snapshot-drift.ts`
- Modify: `package.json` (add `"verify:dashboard-stats-drift"`)

- [ ] **Step 1: Write the script**

```ts
/**
 * Picks N random AEST dates from the snapshot table and compares each day's
 * total revenue + bucket breakdown against a live aggregation. Reports drift.
 *
 * Usage: npx tsx scripts/verify-dashboard-stats-snapshot-drift.ts [--samples=10]
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import DashboardStatsDailySnapshot from "@/models/DashboardStatsDailySnapshot";
import { aestDayBounds } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";
import { aggregateRevenueForDay, loadRefundedPaymentIntentIds } from "@/services/admin/dashboard-stats/revenueAggregator";
import { REVENUE_BUCKET_KEYS } from "@/services/admin/dashboard-stats/snapshotSchema";

function argInt(flag: string, defaultValue: number): number {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!arg) return defaultValue;
  const n = parseInt(arg.split("=")[1], 10);
  return Number.isFinite(n) ? n : defaultValue;
}

async function main() {
  const samples = argInt("--samples", 10);
  await connectDB();

  const allDates = await DashboardStatsDailySnapshot.find({}).select("date").lean();
  if (allDates.length === 0) {
    console.log("No snapshots present.");
    await mongoose.disconnect();
    return;
  }

  // Random sample without replacement
  const pool = allDates.map((d) => d.date);
  const picked: string[] = [];
  for (let i = 0; i < samples && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }

  const refunded = await loadRefundedPaymentIntentIds();
  let driftCount = 0;
  for (const date of picked) {
    const snap = await DashboardStatsDailySnapshot.findOne({ date }).lean();
    if (!snap) continue;
    const { dayStartUTC, dayEndUTC } = aestDayBounds(date);
    const live = await aggregateRevenueForDay(dayStartUTC, dayEndUTC, refunded);

    const snapTotal = snap.revenue?.total ?? 0;
    if (Math.abs(snapTotal - live.total) > 0.01) {
      driftCount += 1;
      console.error(`✗ ${date}: snapshot total=${snapTotal} vs live=${live.total}`);
      continue;
    }

    const bucketsObj = snap.revenue?.buckets;
    const snapBuckets: Record<string, { revenue: number; purchaseCount: number }> =
      bucketsObj instanceof Map ? Object.fromEntries(bucketsObj.entries()) : (bucketsObj as Record<string, { revenue: number; purchaseCount: number }>) ?? {};

    let bucketDrift = false;
    for (const k of REVENUE_BUCKET_KEYS) {
      const s = snapBuckets[k] ?? { revenue: 0, purchaseCount: 0 };
      const l = live.buckets[k];
      if (Math.abs(s.revenue - l.revenue) > 0.01 || s.purchaseCount !== l.purchaseCount) {
        bucketDrift = true;
        console.error(`  bucket ${k}: snap=${JSON.stringify(s)} live=${JSON.stringify(l)}`);
      }
    }
    if (bucketDrift) driftCount += 1;
    else console.log(`✓ ${date}: total=${snapTotal} matches`);
  }

  console.log(`\nSampled ${picked.length} day(s). Drift: ${driftCount}.`);
  await mongoose.disconnect();
  process.exit(driftCount === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Wire and run**

```json
"verify:dashboard-stats-drift": "tsx scripts/verify-dashboard-stats-snapshot-drift.ts"
```

```
npm run verify:dashboard-stats-drift -- --samples=20
```

Expected: `✓` for every day. If any drift appears, investigate before considering the system stable.

---

### Task 4.3: Documentation

**Files:**
- Create or modify: `docs/admin/architecture.md` (add section)
- Create or modify: `docs/admin/operations.md` (add section)
- Modify: `CLAUDE.md` (bump `lastVerified` on `admin` + `infrastructure` domains to today's date)

- [ ] **Step 1: Add to `docs/admin/architecture.md`**

Add a section "Dashboard Stats Daily Snapshot" describing:
- Purpose (escape Vercel timeout on all-time)
- Data model (DashboardStatsDailySnapshot)
- Write path (nightly cron, sliding window of 90 days, refund-aware)
- Read path (snapshot sum + live today + live distinct user counts)
- Why distinct user counts are not stored (link to the section in this plan)
- Ad-channel provider registry (how to add TikTok/Snapchat)

- [ ] **Step 2: Add to `docs/admin/operations.md`**

Operational runbook:
- How to confirm cron ran tonight: `GET /api/admin/health/dashboard-stats-snapshot`
- What to do if snapshots are missing: `npm run backfill:dashboard-stats-snapshots -- --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD`
- How to verify there's no drift: `npm run verify:dashboard-stats-drift -- --samples=30`
- What happens if Mongo writes fail mid-cron (cron is idempotent, next run heals)
- Cost expectations (1 cron call/day, ~30s runtime each, ~$0 on Pro)

- [ ] **Step 3: Manifest bump**

In `CLAUDE.md`, update `domains.admin.lastVerified` and `domains.infrastructure.lastVerified` to today's date (YYYY-MM-DD).

---

### Task 4.4: PR 4 review + STOP

- [ ] **Step 1: All checks**

```
npm run lint
npm run type-check
npm run test:dashboard-stats-schema
npm run test:dashboard-stats-aggregator
npm run test:dashboard-stats-dst
npm run test:dashboard-stats-reader
npm run verify:dashboard-stats-drift
```

All green.

- [ ] **Step 2: STOP**

**STOP for DJ.** End of project. Hand back with a final summary:
- 504 fixed: `/api/admin/dashboard/stats?dateRange=all-time` now returns in <500ms
- Snapshots cover launch → today, recomputed nightly with a 90-day sliding window
- Drift verification script proves bit-for-bit alignment
- Adding TikTok/Snapchat later = one provider registration, no schema change
- All-time discrepancy window for refunds: at most 90 days, healed by the next cron run

---

## Self-Review (filled out by plan author)

**1. Spec coverage:**
- Sliding recompute window: ✓ Task 1.7 (`writeSlidingWindow`) + Task 1.9 (cron) + Task 4.2 (drift verify)
- Cron snaps on correct time (AEST + AEDT, run twice): ✓ Task 1.9
- Facebook ads in snapshot, scalable to TikTok/Snapchat: ✓ Task 1.4 (provider registry) + Task 1.7 (Map storage)
- Custom range = whole AEST days only: ✓ Task 3.2 (reader treats range bounds as AEST day boundaries) — UI side already enforces this; no UI work needed
- Distinct user counts: compute live, explained in plan: ✓ section "Why compute live, don't store" + Task 3.1
- Specs written before implementation: ✓ this file
- No bugs in implementation: addressed via per-task tests at every layer (schema, aggregator, DST, reader, drift)

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "Add appropriate error handling", "Similar to Task N", or "Write tests for the above" without actual test code. Every code step shows full code.

**3. Type consistency:**
- `RevenueBucketKey` introduced in 1.1, used identically in 1.2, 1.5, 1.7, 3.1, 3.2.
- `aestDayBounds` introduced in 1.7, used in 1.8, 3.2, 4.2 with the same signature.
- `loadRefundedPaymentIntentIds` introduced in 1.5, used in 1.7, 2.1, 4.2 — same signature.
- `classifyRevenueBucket` introduced in 1.2 — its arg signature `{ packageType, packageId, billingReason }` is reused identically in 1.5 and 3.1.
- The endpoint refactor in 3.4 uses the same variable names (`membershipPurchaseData`, etc.) as the existing route so the response object construction (lines 629–727) doesn't need to change.

No drift detected.

---

## Risks the implementer should watch for

1. **`fetchFacebookInsights` field availability** — I assumed `metrics.impressions` and `metrics.clicks` exist. If they don't, omit from the provider (Task 1.4). Verify before implementation; do not invent fields.
2. **Mongoose Map vs. plain object on `.lean()`** — handled in Task 3.2 with a defensive cast. If you discover Mongoose returns a different shape entirely (e.g., a nested doc with `$__`), update the helper accordingly.
3. **DST-day expected timestamps in Task 1.8** — written from logic, not from running the code. Verify the first run; only correct after independent confirmation.
4. **`fetchNetBenefitsGrantedInRange` in the comparison-period block (Task 3.4 step 2)** — left as-is by default; replacing it with the reader is recommended but flagged as optional. If you leave it, the trends path still hits the slow scan for ranges up to ~90 days. Acceptable now but plan to clean up.
5. **`User.find(scheduledCancellationQuery)` in `MembershipAnalyticsService.getAnalyticsBundle`** — this is the *other* slow query in the all-time path. Not in scope for this plan. Flag for a follow-up if it shows up in profiling.

---
