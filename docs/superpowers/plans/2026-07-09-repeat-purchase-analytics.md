# Repeat Purchase Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin "Repeat Purchases" analytics tab that measures one-time-package buyers who come back and buy again — repeat rate, time-to-return buckets, matured return-rate-by-window, and a fetchable/filterable user list — as the one-time equivalent of MRR/renewal analytics.

**Architecture:** Live aggregation over `PaymentEvent` (no snapshot/cron — verified ~240ms at production volume). A pure shaper (`summarizeRepeatPurchases`, events-in → summary/rows-out, fully unit-testable) plus thin async I/O wrappers, in `src/services/admin/repeatPurchaseAnalytics.ts`. Two thin `/api/admin/analytics/repeat-purchases` routes delegate to it. TanStack hooks feed a `RepeatPurchaseAnalytics.tsx` tab built from the existing admin UI kit. The summary read is mirrored to Norm.

**Tech Stack:** Next.js 15 App Router, Mongoose/MongoDB, Zod, TanStack Query, Tailwind, `date-fns-tz`, tsx test scripts. React 19.

## Global Constraints

- **Layering:** route handlers stay thin (parse → authorize → delegate); all business logic in `src/services/admin/`. No DB access in components. No `any` unless unavoidable.
- **Countable purchase filter (verbatim from spec §3):** `eventType: "BenefitsGranted" && packageType: "one-time"`, minus rows whose `paymentIntentId` is in the all-time `RefundProcessed` set. **No** `processedBy` filter, **no** `price > 0` filter. Excludes `upsell` / `mini-draw` / `membership` by construction.
- **Anchor = earliest countable one-time purchase per userId (all-time).** Comeback = any later countable one-time purchase. `daysToReturn` = AEST calendar-day difference (`Australia/Sydney`) between anchor and the user's **second** countable purchase.
- **Buckets (exact labels/order):** `same-day` (0), `1-7d` (1–6), `7-30d` (7–29), `30-60d` (30–59), `60-90d` (60–89), `90-180d` (90–179), `180d+` (≥180). Day boundaries use **AEST calendar days** (compute the AEST `yyyy-MM-dd` for anchor and second purchase, diff those dates), matching the production probe's `$dateDiff ... unit:"day"` semantics.
- **Return-rate-by-window (matured):** windows W ∈ {1, 7, 30, 60, 90, 180} days. `eligible(W)` = users whose anchor is ≥ W days old (as of now, AEST). `returned(W)` = eligible users whose `daysToReturn ≤ W`. `rate = returned/eligible` (0 when eligible is 0).
- **`price` is in dollars** (never cents for BenefitsGranted). Key on `packageId`, never `packageName`.
- **`becameMember` flag:** true when a `packageType: "membership"` BenefitsGranted with `data.billingReason !== "subscription_cycle"` exists with `timestamp` after the user's anchor. Flag + count only — never an exclusion.
- **Timezone:** `Australia/Sydney` everywhere dates matter. All-time lower bound = `getWebsiteLaunchDateUTC()`.
- **Permission:** reuse `pageAnalytics.view` for the tab AND both routes (no `permissions.ts` edit).
- **Naming:** feature is `repeat-purchases` / `repeatPurchase*` everywhere — tab id `repeat-purchases`, service `repeatPurchaseAnalytics.ts`, hook `useRepeatPurchaseAnalytics.ts`, component `RepeatPurchaseAnalytics.tsx`, query-key prefix `["admin", "analytics", "repeat-purchases", …]`.
- **No auto-commit:** commit steps below run only after the user has authorized commits this session; otherwise stop at the last non-commit step and report.
- **Docs (hook-enforced):** touching `src/app/api/admin/**` / `src/services/admin/**` requires a `docs/admin/` update in the same turn; touching `src/hooks/queries/**` requires `docs/client-state/`; touching Norm files requires `docs/internal-norm/norm-context.md`; the permission catalog isn't changed so no BUSINESS.md trigger — but Task 8 adds a one-line BUSINESS.md note for the new KPI surface to be safe.

---

## File Structure

- **Create** `src/types/admin/repeatPurchase.ts` — shared DTOs (summary + rows), imported by service, hooks, route, Norm schema author.
- **Create** `src/services/admin/repeatPurchaseAnalytics.ts` — pure `summarizeRepeatPurchases()` + I/O wrappers `getRepeatPurchaseSummary()` / `getRepeatPurchaseUsers()`.
- **Create** `src/services/admin/__tests__/repeatPurchaseAnalytics.test.ts` — tsx test for the pure shaper.
- **Create** `src/app/api/admin/analytics/repeat-purchases/route.ts` — summary route.
- **Create** `src/app/api/admin/analytics/repeat-purchases/users/route.ts` — paged users route.
- **Create** `src/hooks/queries/admin/useRepeatPurchaseAnalytics.ts` — `useRepeatPurchaseSummary()` + `useRepeatPurchaseUsers()`.
- **Create** `src/components/admin/RepeatPurchaseAnalytics.tsx` — the tab UI.
- **Modify** `src/app/admin/component/adminTabs.ts` — register tab in the `analytics` group.
- **Modify** `src/app/admin/component/AdminPage.tsx` — import + render + header subtitle line.
- **Modify** `src/app/admin/component/adminMobileDateToolbarSlot.ts` — add tab id to the mobile toolbar list.
- **Create** `src/lib/internal-norm/schemas/repeat-purchases.ts` — Norm Zod schema for the summary.
- **Create** `src/app/api/internal/norm/v1/analytics/repeat-purchases/route.ts` — Norm read route.
- **Modify** `src/lib/internal-norm/classification.ts` — registry entry.
- **Modify** `package.json` — `test:repeat-purchase-analytics` script.
- **Modify** docs: `docs/admin/*`, `docs/client-state/*`, `docs/internal-norm/norm-context.md`, one-line `BUSINESS.md`.

---

## Task 1: Shared DTO types

**Files:**
- Create: `src/types/admin/repeatPurchase.ts`

**Interfaces:**
- Produces: `RepeatBucketKey`, `REPEAT_BUCKET_KEYS`, `RepeatPurchaseSummary`, `RepeatPurchaseUserRow`, `RepeatPurchaseUsersResult`, `RepeatSegment`.

- [ ] **Step 1: Create the types file**

```ts
// src/types/admin/repeatPurchase.ts

/** First→second purchase gap buckets, in display order. */
export const REPEAT_BUCKET_KEYS = [
  "same-day",
  "1-7d",
  "7-30d",
  "30-60d",
  "60-90d",
  "90-180d",
  "180d+",
] as const;
export type RepeatBucketKey = (typeof REPEAT_BUCKET_KEYS)[number];

/** Return-rate-by-window day thresholds. */
export const REPEAT_WINDOW_DAYS = [1, 7, 30, 60, 90, 180] as const;
export type RepeatWindowDays = (typeof REPEAT_WINDOW_DAYS)[number];

export interface RepeatBucketCount {
  bucket: RepeatBucketKey;
  users: number;
  /** Share of repeat buyers, 0–100 (0 when there are no repeat buyers). */
  sharePct: number;
}

export interface RepeatWindowRate {
  windowDays: RepeatWindowDays;
  eligible: number;
  returned: number;
  /** returned / eligible, 0–1 (0 when eligible is 0). */
  rate: number;
}

export interface RepeatPurchaseSummary {
  /** Distinct users with ≥1 countable one-time purchase in the cohort window. */
  oneTimeBuyers: number;
  /** Distinct users with ≥2 countable one-time purchases. */
  repeatBuyers: number;
  /** repeatBuyers / oneTimeBuyers, 0–1 (0 when no buyers). */
  repeatRate: number;
  /** Median daysToReturn across repeat buyers; null when there are none. */
  medianDaysToReturn: number | null;
  /** Sum of price (dollars) of 2nd-and-later countable purchases. */
  repeatRevenue: number;
  /** Repeat buyers whose becameMember flag is true. */
  becameMembers: number;
  /** Total countable one-time purchases (for context). */
  totalPurchases: number;
  buckets: RepeatBucketCount[];
  windows: RepeatWindowRate[];
}

export type RepeatSegment = "all" | "returned" | "not-returned";

export interface RepeatPurchaseUserRow {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  /** ISO string of the anchor (first countable) purchase. */
  firstPurchaseAt: string;
  firstPackageId: string;
  firstPackageName?: string;
  /** ISO of the second countable purchase; absent when the user hasn't returned. */
  secondPurchaseAt?: string;
  secondPackageId?: string;
  secondPackageName?: string;
  /** AEST calendar days anchor→second; absent when not returned. */
  daysToReturn?: number;
  bucket?: RepeatBucketKey;
  /** Countable one-time purchase count (all-time, refund-netted). */
  purchaseCount: number;
  /** Net one-time spend (dollars). */
  totalSpent: number;
  becameMember: boolean;
}

export interface RepeatPurchaseUsersResult {
  rows: RepeatPurchaseUserRow[];
  totalCount: number;
  page: number;
  limit: number;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (no consumers yet; file compiles standalone).

---

## Task 2: Pure shaper + failing test

The pure function is the heart of the feature. It takes already-loaded, refund-netted one-time events (plus a set of "became member after date X" markers) and produces the full summary and per-user rollups. No I/O, no Mongo, no `Date.now()` inside — `now` is passed in.

**Files:**
- Create: `src/services/admin/repeatPurchaseAnalytics.ts` (pure part only in this task)
- Test: `src/services/admin/__tests__/repeatPurchaseAnalytics.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: types from Task 1.
- Produces:
  - `interface RepeatPurchaseInputEvent { userId: string; packageId: string; packageName?: string; price: number; /** AEST day key yyyy-MM-dd */ dayKey: string; /** ms epoch for ordering + ISO */ ts: number; }`
  - `function summarizeRepeatPurchases(events: RepeatPurchaseInputEvent[], opts: { nowMs: number; membershipConversionByUser: Map<string, number>; /** aest day-diff helper */ diffAestDays: (fromDayKey: string, toDayKey: string) => number; nowDayKey: string; }): { summary: RepeatPurchaseSummary; users: RepeatPurchaseUserRow[] }`
  - `function bucketForDays(days: number): RepeatBucketKey`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/admin/__tests__/repeatPurchaseAnalytics.test.ts
import assert from "node:assert/strict";
import {
  summarizeRepeatPurchases,
  bucketForDays,
  type RepeatPurchaseInputEvent,
} from "../repeatPurchaseAnalytics";

// Deterministic AEST day-diff for tests: treat dayKey as a plain calendar date.
function diffAestDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

// day key + ts from a plain yyyy-mm-dd (midnight UTC stands in for AEST here).
function ev(userId: string, day: string, packageId: string, price: number): RepeatPurchaseInputEvent {
  const [y, m, d] = day.split("-").map(Number);
  return { userId, packageId, packageName: packageId, price, dayKey: day, ts: Date.UTC(y, m - 1, d) };
}

const NOW_DAY = "2026-07-09";
const NOW_MS = Date.UTC(2026, 6, 9);

function run(events: RepeatPurchaseInputEvent[], members: Array<[string, number]> = []) {
  return summarizeRepeatPurchases(events, {
    nowMs: NOW_MS,
    nowDayKey: NOW_DAY,
    membershipConversionByUser: new Map(members),
    diffAestDays,
  });
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// --- bucketForDays boundaries ---
check("bucketForDays boundaries", () => {
  assert.equal(bucketForDays(0), "same-day");
  assert.equal(bucketForDays(1), "1-7d");
  assert.equal(bucketForDays(6), "1-7d");
  assert.equal(bucketForDays(7), "7-30d");
  assert.equal(bucketForDays(29), "7-30d");
  assert.equal(bucketForDays(30), "30-60d");
  assert.equal(bucketForDays(59), "30-60d");
  assert.equal(bucketForDays(60), "60-90d");
  assert.equal(bucketForDays(89), "60-90d");
  assert.equal(bucketForDays(90), "90-180d");
  assert.equal(bucketForDays(179), "90-180d");
  assert.equal(bucketForDays(180), "180d+");
  assert.equal(bucketForDays(999), "180d+");
});

// --- single-purchase user is a buyer, not a repeat buyer ---
check("single purchase counts as buyer only", () => {
  const { summary } = run([ev("u1", "2026-01-01", "tradie-pack", 50)]);
  assert.equal(summary.oneTimeBuyers, 1);
  assert.equal(summary.repeatBuyers, 0);
  assert.equal(summary.repeatRate, 0);
  assert.equal(summary.totalPurchases, 1);
  assert.equal(summary.repeatRevenue, 0);
});

// --- two purchases: repeat buyer, daysToReturn from anchor→second, repeatRevenue = 2nd+ only ---
check("repeat buyer gap + revenue", () => {
  const { summary, users } = run([
    ev("u1", "2026-01-01", "tradie-pack", 50),
    ev("u1", "2026-01-20", "additional-tradie-pack", 25),
  ]);
  assert.equal(summary.repeatBuyers, 1);
  assert.equal(summary.repeatRate, 1);
  assert.equal(summary.repeatRevenue, 25); // only the 2nd purchase
  const u = users.find((r) => r.userId === "u1")!;
  assert.equal(u.daysToReturn, 19);
  assert.equal(u.bucket, "7-30d");
  assert.equal(u.purchaseCount, 2);
  assert.equal(u.totalSpent, 75);
  assert.equal(u.firstPackageId, "tradie-pack");
  assert.equal(u.secondPackageId, "additional-tradie-pack");
});

// --- same-day second purchase → same-day bucket, not dropped ---
check("same-day repeat counts", () => {
  const { summary, users } = run([
    ev("u1", "2026-02-02", "boss-pack", 250),
    ev("u1", "2026-02-02", "additional-tradie-pack", 25),
  ]);
  assert.equal(summary.repeatBuyers, 1);
  assert.equal(users[0].daysToReturn, 0);
  assert.equal(users[0].bucket, "same-day");
});

// --- events arrive out of order: anchor is still the earliest ---
check("anchor is earliest regardless of input order", () => {
  const { users } = run([
    ev("u1", "2026-03-10", "foreman-pack", 100),
    ev("u1", "2026-03-01", "tradie-pack", 50),
  ]);
  const u = users[0];
  assert.equal(u.firstPurchaseAt, new Date(Date.UTC(2026, 2, 1)).toISOString());
  assert.equal(u.daysToReturn, 9);
});

// --- becameMember flag when membership conversion is AFTER anchor ---
check("becameMember flag set when conversion after anchor", () => {
  const anchorMs = Date.UTC(2026, 0, 1);
  const { summary, users } = run(
    [ev("u1", "2026-01-01", "apprentice-pack", 25), ev("u1", "2026-03-01", "foreman-pack", 100)],
    [["u1", anchorMs + 86_400_000]] // converted one day after anchor
  );
  assert.equal(summary.becameMembers, 1);
  assert.equal(users[0].becameMember, true);
});

// --- membership conversion BEFORE anchor does NOT flag ---
check("membership before anchor does not flag", () => {
  const anchorMs = Date.UTC(2026, 0, 1);
  const { summary } = run(
    [ev("u1", "2026-01-01", "apprentice-pack", 25), ev("u1", "2026-03-01", "foreman-pack", 100)],
    [["u1", anchorMs - 86_400_000]]
  );
  assert.equal(summary.becameMembers, 0);
});

// --- buckets + shares + median ---
check("buckets, shares, median across users", () => {
  // 3 repeat buyers with gaps 0, 10, 40 days; 1 single-purchase buyer
  const { summary } = run([
    ev("a", "2026-01-01", "tradie-pack", 50), ev("a", "2026-01-01", "tradie-pack", 50), // 0d
    ev("b", "2026-01-01", "tradie-pack", 50), ev("b", "2026-01-11", "tradie-pack", 50), // 10d
    ev("c", "2026-01-01", "tradie-pack", 50), ev("c", "2026-02-10", "tradie-pack", 50), // 40d
    ev("d", "2026-01-01", "tradie-pack", 50), // single
  ]);
  assert.equal(summary.oneTimeBuyers, 4);
  assert.equal(summary.repeatBuyers, 3);
  const same = summary.buckets.find((x) => x.bucket === "same-day")!;
  const seven = summary.buckets.find((x) => x.bucket === "7-30d")!;
  const thirty = summary.buckets.find((x) => x.bucket === "30-60d")!;
  assert.equal(same.users, 1);
  assert.equal(seven.users, 1);
  assert.equal(thirty.users, 1);
  assert.equal(same.sharePct, Math.round((1 / 3) * 1000) / 10);
  assert.equal(summary.medianDaysToReturn, 10); // middle of [0,10,40]
});

// --- windows: matured denominators ---
check("window rates use matured denominators", () => {
  // u1 anchored 200d ago, returned in 5d (mature for all windows, returned within 7/30/…)
  // u2 anchored 3d ago, not returned yet (only eligible for the 1d window)
  const { summary } = run([
    ev("u1", "2025-12-21", "tradie-pack", 50), ev("u1", "2025-12-26", "tradie-pack", 50), // 200d ago, gap 5
    ev("u2", "2026-07-06", "tradie-pack", 50), // 3d ago, single
  ]);
  const w1 = summary.windows.find((w) => w.windowDays === 1)!;
  const w7 = summary.windows.find((w) => w.windowDays === 7)!;
  const w180 = summary.windows.find((w) => w.windowDays === 180)!;
  // 1-day window: both anchors ≥1 day old → eligible 2; u1 returned in 5d (>1) → returned 0
  assert.equal(w1.eligible, 2);
  assert.equal(w1.returned, 0);
  // 7-day window: u2 anchor only 3d old → NOT eligible; u1 eligible + returned in 5d
  assert.equal(w7.eligible, 1);
  assert.equal(w7.returned, 1);
  assert.equal(w7.rate, 1);
  // 180-day window: only u1 eligible, returned
  assert.equal(w180.eligible, 1);
  assert.equal(w180.returned, 1);
});

console.log(`\n${passed} checks passed`);
```

- [ ] **Step 2: Add the npm test script**

In `package.json`, add alongside the other `test:*` entries:

```json
"test:repeat-purchase-analytics": "tsx src/services/admin/__tests__/repeatPurchaseAnalytics.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:repeat-purchase-analytics`
Expected: FAIL — cannot find module `../repeatPurchaseAnalytics` / `summarizeRepeatPurchases is not a function`.

- [ ] **Step 4: Write the pure shaper**

```ts
// src/services/admin/repeatPurchaseAnalytics.ts  (pure part)
import {
  REPEAT_BUCKET_KEYS,
  REPEAT_WINDOW_DAYS,
  type RepeatBucketKey,
  type RepeatPurchaseSummary,
  type RepeatPurchaseUserRow,
} from "@/types/admin/repeatPurchase";

/** One refund-netted, countable one-time purchase, pre-projected for the shaper. */
export interface RepeatPurchaseInputEvent {
  userId: string;
  packageId: string;
  packageName?: string;
  /** Dollars. */
  price: number;
  /** AEST calendar day key, yyyy-MM-dd. */
  dayKey: string;
  /** Epoch ms of the purchase timestamp — for ordering and ISO output. */
  ts: number;
}

export function bucketForDays(days: number): RepeatBucketKey {
  if (days <= 0) return "same-day";
  if (days < 7) return "1-7d";
  if (days < 30) return "7-30d";
  if (days < 60) return "30-60d";
  if (days < 90) return "60-90d";
  if (days < 180) return "90-180d";
  return "180d+";
}

interface UserAccum {
  userId: string;
  purchases: RepeatPurchaseInputEvent[]; // sorted ascending by ts
  totalSpent: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarizeRepeatPurchases(
  events: RepeatPurchaseInputEvent[],
  opts: {
    nowMs: number;
    nowDayKey: string;
    /** userId → epoch ms of earliest NEW-membership conversion (billingReason !== subscription_cycle). */
    membershipConversionByUser: Map<string, number>;
    /** AEST calendar-day difference between two yyyy-MM-dd keys (to − from). */
    diffAestDays: (fromDayKey: string, toDayKey: string) => number;
  }
): { summary: RepeatPurchaseSummary; users: RepeatPurchaseUserRow[] } {
  const { membershipConversionByUser, diffAestDays, nowDayKey } = opts;

  // Group by user, ascending by ts.
  const byUser = new Map<string, UserAccum>();
  for (const e of events) {
    let acc = byUser.get(e.userId);
    if (!acc) {
      acc = { userId: e.userId, purchases: [], totalSpent: 0 };
      byUser.set(e.userId, acc);
    }
    acc.purchases.push(e);
    acc.totalSpent += e.price;
  }
  for (const acc of byUser.values()) acc.purchases.sort((a, b) => a.ts - b.ts);

  const users: RepeatPurchaseUserRow[] = [];
  const gapDays: number[] = [];
  let repeatBuyers = 0;
  let repeatRevenue = 0;
  let becameMembers = 0;
  let totalPurchases = 0;

  const bucketUsers = Object.fromEntries(REPEAT_BUCKET_KEYS.map((k) => [k, 0])) as Record<RepeatBucketKey, number>;

  for (const acc of byUser.values()) {
    const anchor = acc.purchases[0];
    const second = acc.purchases[1];
    totalPurchases += acc.purchases.length;

    const conv = membershipConversionByUser.get(acc.userId);
    const becameMember = conv != null && conv > anchor.ts;
    if (becameMember) becameMembers++;

    let daysToReturn: number | undefined;
    let bucket: RepeatBucketKey | undefined;
    if (second) {
      repeatBuyers++;
      daysToReturn = Math.max(0, diffAestDays(anchor.dayKey, second.dayKey));
      bucket = bucketForDays(daysToReturn);
      bucketUsers[bucket]++;
      gapDays.push(daysToReturn);
      // repeatRevenue = every purchase after the anchor.
      for (let i = 1; i < acc.purchases.length; i++) repeatRevenue += acc.purchases[i].price;
    }

    users.push({
      userId: acc.userId,
      firstPurchaseAt: new Date(anchor.ts).toISOString(),
      firstPackageId: anchor.packageId,
      firstPackageName: anchor.packageName,
      secondPurchaseAt: second ? new Date(second.ts).toISOString() : undefined,
      secondPackageId: second?.packageId,
      secondPackageName: second?.packageName,
      daysToReturn,
      bucket,
      purchaseCount: acc.purchases.length,
      totalSpent: Math.round(acc.totalSpent * 100) / 100,
      becameMember,
    });
  }

  const oneTimeBuyers = byUser.size;

  // Windows — matured denominators.
  const windows = REPEAT_WINDOW_DAYS.map((windowDays) => {
    let eligible = 0;
    let returned = 0;
    for (const acc of byUser.values()) {
      const anchorAgeDays = diffAestDays(acc.purchases[0].dayKey, nowDayKey);
      if (anchorAgeDays < windowDays) continue; // not matured for this window
      eligible++;
      const second = acc.purchases[1];
      if (second) {
        const gap = Math.max(0, diffAestDays(acc.purchases[0].dayKey, second.dayKey));
        if (gap <= windowDays) returned++;
      }
    }
    return { windowDays, eligible, returned, rate: eligible ? returned / eligible : 0 };
  });

  const buckets = REPEAT_BUCKET_KEYS.map((bucket) => ({
    bucket,
    users: bucketUsers[bucket],
    sharePct: repeatBuyers ? Math.round((bucketUsers[bucket] / repeatBuyers) * 1000) / 10 : 0,
  }));

  const summary: RepeatPurchaseSummary = {
    oneTimeBuyers,
    repeatBuyers,
    repeatRate: oneTimeBuyers ? repeatBuyers / oneTimeBuyers : 0,
    medianDaysToReturn: median(gapDays),
    repeatRevenue: Math.round(repeatRevenue * 100) / 100,
    becameMembers,
    totalPurchases,
    buckets,
    windows,
  };

  return { summary, users };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:repeat-purchase-analytics`
Expected: PASS — all checks pass, prints "N checks passed".

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 7: Commit** *(only if commits authorized)*

```bash
git add src/types/admin/repeatPurchase.ts src/services/admin/repeatPurchaseAnalytics.ts src/services/admin/__tests__/repeatPurchaseAnalytics.test.ts package.json
git commit -m "feat(admin): repeat-purchase analytics pure shaper + tests"
```

---

## Task 3: Service I/O wrappers (Mongo aggregation)

Add the two async functions that load data and call the shaper. This is the only place that touches Mongo.

**Files:**
- Modify: `src/services/admin/repeatPurchaseAnalytics.ts` (append I/O wrappers)

**Interfaces:**
- Consumes: `summarizeRepeatPurchases`, `RepeatPurchaseInputEvent` (Task 2); `loadRefundedPaymentIntentIds` from `@/services/admin/dashboard-stats/revenueAggregator`; `formatInTimeZone` from `date-fns-tz`; `PaymentEvent` model; `User` model; `getWebsiteLaunchDateUTC` from `@/utils/common/timezone`.
- Produces:
  - `interface RepeatPurchaseRange { startDate?: Date; endDate?: Date }` (cohort window on anchor date; UTC bounds, endDate exclusive)
  - `async function getRepeatPurchaseSummary(range: RepeatPurchaseRange): Promise<RepeatPurchaseSummary>`
  - `async function getRepeatPurchaseUsers(params: { segment: RepeatSegment; bucket?: RepeatBucketKey; page?: number; limit?: number; startDate?: Date; endDate?: Date }): Promise<RepeatPurchaseUsersResult>`
  - internal `async function loadCohort(range): Promise<{ summary; users }>` shared by both.

- [ ] **Step 1: Append the I/O wrappers**

```ts
// src/services/admin/repeatPurchaseAnalytics.ts  (append below the pure part)
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";
import { loadRefundedPaymentIntentIds } from "@/services/admin/dashboard-stats/revenueAggregator";
import type {
  RepeatBucketKey,
  RepeatPurchaseSummary,
  RepeatPurchaseUserRow,
  RepeatPurchaseUsersResult,
  RepeatSegment,
} from "@/types/admin/repeatPurchase";

const AEST = "Australia/Sydney";

/** Cohort window bounds (UTC); filters on the user's ANCHOR (first) purchase date. endDate exclusive. */
export interface RepeatPurchaseRange {
  startDate?: Date;
  endDate?: Date;
}

/** AEST calendar-day difference between two yyyy-MM-dd keys (to − from). */
function diffAestDays(fromDayKey: string, toDayKey: string): number {
  const [fy, fm, fd] = fromDayKey.split("-").map(Number);
  const [ty, tm, td] = toDayKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

interface LeanEvent {
  userId?: unknown;
  packageId?: string;
  packageName?: string;
  paymentIntentId?: string;
  timestamp?: Date;
  data?: { price?: number; billingReason?: string };
}

/** Load + shape the full cohort once; both public functions reuse this. */
async function loadCohort(
  range: RepeatPurchaseRange
): Promise<{ summary: RepeatPurchaseSummary; users: RepeatPurchaseUserRow[] }> {
  await connectDB();

  const refunded = await loadRefundedPaymentIntentIds();

  // All one-time BenefitsGranted, all-time (anchor detection needs full history;
  // the cohort window is applied AFTER anchor is known). ~3k docs at prod scale.
  const rows = (await PaymentEvent.find(
    { eventType: "BenefitsGranted", packageType: "one-time" },
    { userId: 1, packageId: 1, packageName: 1, paymentIntentId: 1, timestamp: 1, "data.price": 1 }
  )
    .lean()
    .exec()) as unknown as LeanEvent[];

  const events = rows
    .filter((r) => !(r.paymentIntentId && refunded.has(r.paymentIntentId)))
    .filter((r) => r.userId && r.timestamp)
    .map((r) => {
      const ts = new Date(r.timestamp as Date).getTime();
      return {
        userId: String(r.userId),
        packageId: r.packageId ?? "",
        packageName: r.packageName,
        price: r.data?.price ?? 0,
        dayKey: formatInTimeZone(r.timestamp as Date, AEST, "yyyy-MM-dd"),
        ts,
      };
    });

  // New-membership conversions (billingReason !== subscription_cycle): userId → earliest ts.
  const membershipRows = (await PaymentEvent.find(
    { eventType: "BenefitsGranted", packageType: "membership" },
    { userId: 1, timestamp: 1, "data.billingReason": 1 }
  )
    .lean()
    .exec()) as unknown as LeanEvent[];
  const membershipConversionByUser = new Map<string, number>();
  for (const m of membershipRows) {
    if (!m.userId || !m.timestamp) continue;
    if (m.data?.billingReason === "subscription_cycle") continue; // renewals never count
    const uid = String(m.userId);
    const ts = new Date(m.timestamp).getTime();
    const prev = membershipConversionByUser.get(uid);
    if (prev == null || ts < prev) membershipConversionByUser.set(uid, ts);
  }

  const now = new Date();
  const { summary, users } = summarizeRepeatPurchases(events, {
    nowMs: now.getTime(),
    nowDayKey: formatInTimeZone(now, AEST, "yyyy-MM-dd"),
    membershipConversionByUser,
    diffAestDays,
  });

  // Cohort window filter on anchor (firstPurchaseAt), applied AFTER anchor is fixed.
  if (!range.startDate && !range.endDate) return { summary, users };

  const startMs = range.startDate ? range.startDate.getTime() : -Infinity;
  const endMs = range.endDate ? range.endDate.getTime() : Infinity; // exclusive
  const filtered = users.filter((u) => {
    const t = new Date(u.firstPurchaseAt).getTime();
    return t >= startMs && t < endMs;
  });

  // Recompute the summary over the filtered cohort by re-running the shaper on
  // just those users' events — cheap, and keeps every derived figure consistent.
  const keep = new Set(filtered.map((u) => u.userId));
  const filteredEvents = events.filter((e) => keep.has(e.userId));
  const reshaped = summarizeRepeatPurchases(filteredEvents, {
    nowMs: now.getTime(),
    nowDayKey: formatInTimeZone(now, AEST, "yyyy-MM-dd"),
    membershipConversionByUser,
    diffAestDays,
  });
  return { summary: reshaped.summary, users: reshaped.users };
}

export async function getRepeatPurchaseSummary(
  range: RepeatPurchaseRange
): Promise<RepeatPurchaseSummary> {
  const { summary } = await loadCohort(range);
  return summary;
}

export async function getRepeatPurchaseUsers(params: {
  segment: RepeatSegment;
  bucket?: RepeatBucketKey;
  page?: number;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
}): Promise<RepeatPurchaseUsersResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));

  const { users } = await loadCohort({ startDate: params.startDate, endDate: params.endDate });

  let filtered = users;
  if (params.segment === "returned") filtered = filtered.filter((u) => !!u.secondPurchaseAt);
  else if (params.segment === "not-returned") filtered = filtered.filter((u) => !u.secondPurchaseAt);
  if (params.bucket) filtered = filtered.filter((u) => u.bucket === params.bucket);

  // Default sort: most-recent anchor first (actionable "who just entered the cohort").
  filtered = [...filtered].sort(
    (a, b) => new Date(b.firstPurchaseAt).getTime() - new Date(a.firstPurchaseAt).getTime()
  );

  const totalCount = filtered.length;
  const pageRows = filtered.slice((page - 1) * limit, page * limit);

  // Hydrate PII for just the page (admin UI is allowed full PII; see cancellation-flow precedent).
  const ids = pageRows.map((r) => r.userId);
  const profiles = ids.length
    ? await User.find({ _id: { $in: ids } }).select({ firstName: 1, lastName: 1, email: 1 }).lean()
    : [];
  const pmap = new Map(profiles.map((p) => [String(p._id), p]));
  const rows = pageRows.map((r) => {
    const p = pmap.get(r.userId);
    return { ...r, firstName: p?.firstName ?? undefined, lastName: p?.lastName ?? undefined, email: p?.email ?? undefined };
  });

  return { rows, totalCount, page, limit };
}
```

- [ ] **Step 2: Re-run the shaper test (unchanged, guards no regression)**

Run: `npm run test:repeat-purchase-analytics`
Expected: PASS.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit** *(only if commits authorized)*

```bash
git add src/services/admin/repeatPurchaseAnalytics.ts
git commit -m "feat(admin): repeat-purchase service I/O wrappers (live aggregation)"
```

---

## Task 4: API routes

Two thin handlers. Cohort window parsed AEST→UTC exactly like the cancellation-flow route (`fromZonedTime` + `addDays` for the exclusive upper bound).

**Files:**
- Create: `src/app/api/admin/analytics/repeat-purchases/route.ts`
- Create: `src/app/api/admin/analytics/repeat-purchases/users/route.ts`

**Interfaces:**
- Consumes: `getRepeatPurchaseSummary`, `getRepeatPurchaseUsers` (Task 3); `REPEAT_BUCKET_KEYS` (Task 1); `requirePermission`.
- Produces: `GET /api/admin/analytics/repeat-purchases` → `{ success, data: RepeatPurchaseSummary }`; `GET .../users` → `{ success, data: RepeatPurchaseUsersResult }`.

- [ ] **Step 1: Summary route**

```ts
// src/app/api/admin/analytics/repeat-purchases/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getRepeatPurchaseSummary } from "@/services/admin/repeatPurchaseAnalytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AEST = "Australia/Sydney";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
});

/**
 * GET /api/admin/analytics/repeat-purchases
 * Summary metrics for one-time-package repeat buyers (reconversion). Optional
 * ?startDate&endDate (AEST-inclusive) filters the cohort by first-purchase date.
 */
export async function GET(request: NextRequest) {
  const guard = await requirePermission("pageAnalytics.view");
  if (guard instanceof NextResponse) return guard;

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Invalid query parameters", details: e instanceof z.ZodError ? e.issues : "Validation failed" },
      { status: 400 }
    );
  }

  try {
    const startDate = q.startDate ? fromZonedTime(`${q.startDate}T00:00:00`, AEST) : undefined;
    const endDate = q.endDate ? addDays(fromZonedTime(`${q.endDate}T00:00:00`, AEST), 1) : undefined; // exclusive
    const data = await getRepeatPurchaseSummary({ startDate, endDate });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    console.error("❌ [repeat-purchases] summary failed:", e);
    return NextResponse.json(
      { success: false, error: "Failed to compute repeat-purchase analytics", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Users route**

```ts
// src/app/api/admin/analytics/repeat-purchases/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getRepeatPurchaseUsers } from "@/services/admin/repeatPurchaseAnalytics";
import { REPEAT_BUCKET_KEYS } from "@/types/admin/repeatPurchase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AEST = "Australia/Sydney";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  segment: z.enum(["all", "returned", "not-returned"]).optional().default("all"),
  bucket: z.enum(REPEAT_BUCKET_KEYS as unknown as [string, ...string[]]).optional(),
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * GET /api/admin/analytics/repeat-purchases/users
 * Paged, filterable cohort list. Powers the Users table drill-down.
 */
export async function GET(request: NextRequest) {
  const guard = await requirePermission("pageAnalytics.view");
  if (guard instanceof NextResponse) return guard;

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Invalid query parameters", details: e instanceof z.ZodError ? e.issues : "Validation failed" },
      { status: 400 }
    );
  }

  try {
    const startDate = q.startDate ? fromZonedTime(`${q.startDate}T00:00:00`, AEST) : undefined;
    const endDate = q.endDate ? addDays(fromZonedTime(`${q.endDate}T00:00:00`, AEST), 1) : undefined;
    const data = await getRepeatPurchaseUsers({
      segment: q.segment,
      bucket: q.bucket as (typeof REPEAT_BUCKET_KEYS)[number] | undefined,
      page: q.page,
      limit: q.limit,
      startDate,
      endDate,
    });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (e) {
    console.error("❌ [repeat-purchases/users] failed:", e);
    return NextResponse.json(
      { success: false, error: "Failed to load repeat-purchase users", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS (no errors in the new route files).

- [ ] **Step 4: Commit** *(only if commits authorized)*

```bash
git add src/app/api/admin/analytics/repeat-purchases
git commit -m "feat(admin): repeat-purchase analytics API routes"
```

---

## Task 5: TanStack query hooks

**Files:**
- Create: `src/hooks/queries/admin/useRepeatPurchaseAnalytics.ts`

**Interfaces:**
- Consumes: types from Task 1; the two routes from Task 4.
- Produces: `useRepeatPurchaseSummary(filter)`, `useRepeatPurchaseUsers(filter, options?)`.

- [ ] **Step 1: Create the hooks**

```ts
// src/hooks/queries/admin/useRepeatPurchaseAnalytics.ts
import { useQuery } from "@tanstack/react-query";
import type {
  RepeatPurchaseSummary,
  RepeatPurchaseUsersResult,
  RepeatBucketKey,
  RepeatSegment,
} from "@/types/admin/repeatPurchase";

export interface RepeatPurchaseFilter {
  /** AEST yyyy-MM-dd (inclusive). */
  startDate?: string;
  endDate?: string;
}

export function useRepeatPurchaseSummary(filter: RepeatPurchaseFilter = {}) {
  return useQuery<RepeatPurchaseSummary>({
    queryKey: ["admin", "analytics", "repeat-purchases", "summary", filter],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter.startDate) params.set("startDate", filter.startDate);
      if (filter.endDate) params.set("endDate", filter.endDate);
      const qs = params.toString();
      const res = await fetch(`/api/admin/analytics/repeat-purchases${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Failed to load repeat-purchase summary (${res.status})`);
      const json = (await res.json()) as { success: boolean; data: RepeatPurchaseSummary; error?: string };
      if (!json.success) throw new Error(json.error ?? "Request failed");
      return json.data;
    },
  });
}

export interface RepeatPurchaseUsersFilter extends RepeatPurchaseFilter {
  segment: RepeatSegment;
  bucket?: RepeatBucketKey;
  page?: number;
  limit?: number;
}

export function useRepeatPurchaseUsers(
  filter: RepeatPurchaseUsersFilter,
  options: { enabled?: boolean } = {}
) {
  return useQuery<RepeatPurchaseUsersResult>({
    queryKey: ["admin", "analytics", "repeat-purchases", "users", filter],
    enabled: options.enabled ?? true,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({ segment: filter.segment });
      if (filter.bucket) params.set("bucket", filter.bucket);
      if (filter.startDate) params.set("startDate", filter.startDate);
      if (filter.endDate) params.set("endDate", filter.endDate);
      if (filter.page) params.set("page", String(filter.page));
      if (filter.limit) params.set("limit", String(filter.limit));
      const res = await fetch(`/api/admin/analytics/repeat-purchases/users?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load repeat-purchase users (${res.status})`);
      const json = (await res.json()) as { success: boolean; data: RepeatPurchaseUsersResult; error?: string };
      if (!json.success) throw new Error(json.error ?? "Request failed");
      return json.data;
    },
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit** *(only if commits authorized)*

```bash
git add src/hooks/queries/admin/useRepeatPurchaseAnalytics.ts
git commit -m "feat(admin): repeat-purchase analytics query hooks"
```

---

## Task 6: Tab UI component

Mirrors `AllPlatformsManagement.tsx` structure. Uses the `@/components/admin/ui` kit (`MetricCard`, `Card`, `SectionTitle`, `BarList`, `DataTable`, `Segmented`) + `AdminDateRangeToolbar` + `useAdminDateFilter` + `ClickableUserDisplay`. Default range `all-time` (cohort metric). Includes loading/empty/error states.

**Files:**
- Create: `src/components/admin/RepeatPurchaseAnalytics.tsx`

**Interfaces:**
- Consumes: hooks (Task 5); types (Task 1); `useAdminDateFilter`, `AdminDateRangeToolbar`, UI kit, `ClickableUserDisplay`.
- Produces: default-exported `RepeatPurchaseAnalytics` component.

- [ ] **Step 1: Create the component**

```tsx
// src/components/admin/RepeatPurchaseAnalytics.tsx
"use client";

import { useMemo, useState } from "react";
import { Users, Repeat, TrendingUp, Clock, DollarSign, Star, BarChart3 } from "lucide-react";
import { Card, SectionTitle, MetricCard, BarList, DataTable, Segmented, type Column } from "@/components/admin/ui";
import { AdminDateRangeToolbar } from "@/components/admin/AdminDateRangeToolbar";
import { useAdminDateFilter } from "@/hooks/useAdminDateFilter";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import {
  useRepeatPurchaseSummary,
  useRepeatPurchaseUsers,
} from "@/hooks/queries/admin/useRepeatPurchaseAnalytics";
import type { RepeatBucketKey, RepeatSegment, RepeatPurchaseUserRow } from "@/types/admin/repeatPurchase";

const BUCKET_LABEL: Record<RepeatBucketKey, string> = {
  "same-day": "Same day",
  "1-7d": "1–7 days",
  "7-30d": "7–30 days",
  "30-60d": "30–60 days",
  "60-90d": "60–90 days",
  "90-180d": "90–180 days",
  "180d+": "180+ days",
};
const WINDOW_LABEL: Record<number, string> = { 1: "1 day", 7: "1 week", 30: "1 month", 60: "2 months", 90: "3 months", 180: "6 months" };
const ACCENT = "#ee0000";
const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—");

const USER_COLUMNS: Column[] = [
  { key: "user", label: "User", sortable: false },
  { key: "first", label: "First purchase", sortable: false },
  { key: "next", label: "Next purchase", sortable: false },
  { key: "days", label: "Days to return", align: "right" },
  { key: "count", label: "One-time buys", align: "right" },
  { key: "spent", label: "Total spent", align: "right" },
  { key: "member", label: "Member?", align: "right", sortable: false },
];

export default function RepeatPurchaseAnalytics() {
  const df = useAdminDateFilter("all-time");
  const dateReady =
    (df.dateRange !== "current-draw" && df.dateRange !== "last-draw") || (!!df.startDate && !!df.endDate);
  const range = { startDate: df.startDate || undefined, endDate: df.endDate || undefined };

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useRepeatPurchaseSummary(range);

  const [segment, setSegment] = useState<RepeatSegment>("all");
  const [bucket, setBucket] = useState<RepeatBucketKey | null>(null);
  const {
    data: usersData,
    isLoading: usersLoading,
    isError: usersError,
  } = useRepeatPurchaseUsers(
    { segment, bucket: bucket ?? undefined, ...range },
    { enabled: dateReady }
  );

  const bucketItems = useMemo(
    () =>
      (summary?.buckets ?? []).map((b) => ({
        id: b.bucket,
        label: BUCKET_LABEL[b.bucket],
        value: b.users,
        color: ACCENT,
        count: Math.round(b.sharePct * 10) / 10,
        unit: "%",
      })),
    [summary]
  );

  const rows = useMemo(
    () => (usersData?.rows ?? []).map((r) => ({ ...r, id: r.userId })),
    [usersData]
  );

  const renderCell = (key: string, row: RepeatPurchaseUserRow & { id: string }) => {
    switch (key) {
      case "user":
        return (
          <ClickableUserDisplay
            userId={row.userId}
            displayText={`${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email || "Unknown"}
            subtext={row.email}
            className="text-sm font-medium"
          />
        );
      case "first":
        return (
          <div className="flex flex-col">
            <span className="text-sm text-neutral-800 dark:text-neutral-200">{fmtDate(row.firstPurchaseAt)}</span>
            <span className="text-2xs text-neutral-400">{row.firstPackageName ?? row.firstPackageId}</span>
          </div>
        );
      case "next":
        return row.secondPurchaseAt ? (
          <div className="flex flex-col">
            <span className="text-sm text-neutral-800 dark:text-neutral-200">{fmtDate(row.secondPurchaseAt)}</span>
            <span className="text-2xs text-neutral-400">{row.secondPackageName ?? row.secondPackageId}</span>
          </div>
        ) : (
          <span className="text-neutral-400">—</span>
        );
      case "days":
        return row.daysToReturn == null ? (
          <span className="text-neutral-400 text-xs">Not yet</span>
        ) : row.daysToReturn === 0 ? (
          <span className="inline-flex rounded-full bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 px-2 py-0.5 text-2xs font-semibold">Same day</span>
        ) : (
          <span className="num tabular-nums">{row.daysToReturn}</span>
        );
      case "count":
        return <span className="num tabular-nums">{row.purchaseCount}</span>;
      case "spent":
        return <span className="num tabular-nums font-semibold">{money(row.totalSpent)}</span>;
      case "member":
        return row.becameMember ? (
          <span className="inline-flex rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 px-2 py-0.5 text-2xs font-semibold">Member</span>
        ) : (
          <span className="text-neutral-400">—</span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end empty:hidden">
        <AdminDateRangeToolbar filter={df} />
      </div>

      {summaryError ? (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          Couldn’t load repeat-purchase analytics. Try widening the date range or refreshing.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard title="One-time buyers" value={(summary?.oneTimeBuyers ?? 0).toLocaleString("en-AU")} sub="distinct, in range" icon={Users} tone="slate" loading={summaryLoading} />
          <MetricCard title="Repeat buyers" value={(summary?.repeatBuyers ?? 0).toLocaleString("en-AU")} sub="bought ≥ 2 times" icon={Repeat} tone="red" loading={summaryLoading} />
          <MetricCard title="Repeat rate" value={summary ? `${(summary.repeatRate * 100).toFixed(1)}%` : "—"} sub="repeat / all buyers" icon={TrendingUp} tone="emerald" loading={summaryLoading} />
          <MetricCard title="Median days to return" value={summary?.medianDaysToReturn == null ? "—" : String(summary.medianDaysToReturn)} sub="2nd purchase" icon={Clock} tone="violet" loading={summaryLoading} />
          <MetricCard title="Repeat revenue" value={money(summary?.repeatRevenue ?? 0)} sub="2nd+ purchases" icon={DollarSign} tone="amber" loading={summaryLoading} />
          <MetricCard title="Became members" value={(summary?.becameMembers ?? 0).toLocaleString("en-AU")} sub="after 1st one-time" icon={Star} tone="indigo" loading={summaryLoading} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <SectionTitle title="Time to second purchase" subtitle={`Gap between 1st and 2nd one-time purchase · ${(summary?.repeatBuyers ?? 0).toLocaleString("en-AU")} repeat buyers`} icon={BarChart3} />
          {summaryLoading ? (
            <div className="space-y-3">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-4 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />)}</div>
          ) : (summary?.repeatBuyers ?? 0) === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">No repeat buyers in this range yet.</p>
          ) : (
            <BarList items={bucketItems} fmt={(v) => v.toLocaleString("en-AU")} fmtCount={(n) => String(n)} />
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Return rate by window" subtitle="Matured denominators — only buyers old enough to have had the chance" icon={TrendingUp} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-2xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="py-2 px-2 text-left font-semibold">Within</th>
                  <th className="py-2 px-2 text-right font-semibold">Eligible</th>
                  <th className="py-2 px-2 text-right font-semibold">Returned</th>
                  <th className="py-2 px-2 text-right font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.windows ?? []).map((w) => (
                  <tr key={w.windowDays} className="border-b border-neutral-100 dark:border-neutral-800/60">
                    <td className="py-2.5 px-2 text-neutral-800 dark:text-neutral-200">{WINDOW_LABEL[w.windowDays]}</td>
                    <td className="py-2.5 px-2 text-right num tabular-nums">{w.eligible.toLocaleString("en-AU")}</td>
                    <td className="py-2.5 px-2 text-right num tabular-nums">{w.returned.toLocaleString("en-AU")}</td>
                    <td className="py-2.5 px-2 text-right num tabular-nums font-semibold">{(w.rate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-neutral-400 leading-snug mt-3">
            “Eligible” shrinks for longer windows because a recent buyer hasn’t yet had, say, 6 months to return — so we never show one flat long-window rate on a young dataset.
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Users"
          subtitle="The fetchable cohort — click a name to open the full profile"
          icon={Users}
          right={<span className="text-2xs text-neutral-400">{usersData ? `${usersData.totalCount.toLocaleString("en-AU")} users` : ""}</span>}
        />
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Segmented
            size="sm"
            value={segment}
            onChange={(v) => { setSegment(v as RepeatSegment); if (v === "not-returned") setBucket(null); }}
            options={[{ value: "all", label: "All" }, { value: "returned", label: "Returned" }, { value: "not-returned", label: "Not yet returned" }]}
          />
          <div className="flex flex-wrap gap-1.5 ml-auto">
            {(["same-day", "1-7d", "7-30d", "30-60d", "60-90d", "90-180d", "180d+"] as RepeatBucketKey[]).map((b) => (
              <button
                key={b}
                type="button"
                disabled={segment === "not-returned"}
                onClick={() => setBucket((cur) => (cur === b ? null : b))}
                className={`text-2xs font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  bucket === b
                    ? "border-red-500 text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400"
                    : "border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300"
                }`}
              >
                {BUCKET_LABEL[b]}
              </button>
            ))}
          </div>
        </div>

        {usersError ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">Couldn’t load users.</p>
        ) : usersLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 py-8 text-center">No users match this filter.</p>
        ) : (
          <DataTable columns={USER_COLUMNS} rows={rows} renderCell={(k, r) => renderCell(k, r as RepeatPurchaseUserRow & { id: string })} />
        )}
      </Card>

      <p className="text-2xs text-neutral-400 leading-snug">
        A countable purchase = <strong>one-time BenefitsGranted</strong>, refunded purchases excluded. <strong>Upsells and mini-draws are excluded</strong> (an upsell fires minutes after the base purchase; mini-draws are a separate product). Days counted in <strong>AEST</strong>. Identity is per account — the same person on two emails counts as two users. Cohort date filter applies to the <strong>first</strong>-purchase date.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS. If `Column` isn't exported from the ui barrel, import it from `@/components/admin/ui/DataTable` instead (it is exported there as `export type Column`).

- [ ] **Step 3: Commit** *(only if commits authorized)*

```bash
git add src/components/admin/RepeatPurchaseAnalytics.tsx
git commit -m "feat(admin): repeat-purchase analytics tab UI"
```

---

## Task 7: Register the tab (sidebar + render + mobile toolbar)

**Files:**
- Modify: `src/app/admin/component/adminTabs.ts`
- Modify: `src/app/admin/component/AdminPage.tsx`
- Modify: `src/app/admin/component/adminMobileDateToolbarSlot.ts`

**Interfaces:**
- Consumes: `RepeatPurchaseAnalytics` (Task 6).

- [ ] **Step 1: Add the tab to the analytics group**

In `src/app/admin/component/adminTabs.ts`, add `Repeat` to the lucide import list (line ~28, alphabetical with the others) and add this tab object to the `analytics` group's `tabs` array (after `cancellation-flow`, before `ab-testing`):

```ts
{ id: "repeat-purchases", label: "Repeat Purchases", icon: Repeat, requires: "pageAnalytics.view" },
```

- [ ] **Step 2: Import + render in AdminPage**

In `src/app/admin/component/AdminPage.tsx`, add the import near the other tab component imports (e.g. after the `CancellationFlowAnalytics` import at line ~31):

```ts
import RepeatPurchaseAnalytics from "@/components/admin/RepeatPurchaseAnalytics";
```

Add the header subtitle line inside the subtitle block (after the `cancellation-flow` line, ~line 174):

```tsx
{selectedTab === "repeat-purchases" && "One-time buyers who came back — repeat rate, time-to-return, and the fetchable cohort"}
```

Add the render line in the content area (after the `cancellation-flow` render, ~line 260):

```tsx
{selectedTab === "repeat-purchases" && <RepeatPurchaseAnalytics />}
```

- [ ] **Step 3: Register the mobile date toolbar slot**

In `src/app/admin/component/adminMobileDateToolbarSlot.ts`, add `"repeat-purchases"` to the `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` array.

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 5: Verify in the running app**

Run: `npm run dev`, sign in as an admin, open `/admin/repeat-purchases`. Confirm: tab appears under Analytics; KPIs populate (2,349 buyers / 396 repeat / 16.9% at all-time — matches the production probe); bucket chart shows 7–30d as the tallest; Users table filters by segment + bucket; clicking a user opens the User Detail modal; toggle light/dark via the header toggle; the date dropdown appears in the mobile header (narrow viewport).
Expected: all pass. Stop the dev server when done.

- [ ] **Step 6: Commit** *(only if commits authorized)*

```bash
git add src/app/admin/component/adminTabs.ts src/app/admin/component/AdminPage.tsx src/app/admin/component/adminMobileDateToolbarSlot.ts
git commit -m "feat(admin): register Repeat Purchases tab"
```

---

## Task 8: Norm mirror (summary endpoint) + docs

Mirror the **summary** read to Norm (aggregate counts only — no PII, so no projection concerns). The users list is NOT mirrored (it carries PII; flag to owner as deferred).

**Files:**
- Create: `src/lib/internal-norm/schemas/repeat-purchases.ts`
- Create: `src/app/api/internal/norm/v1/analytics/repeat-purchases/route.ts`
- Modify: `src/lib/internal-norm/classification.ts`
- Modify: `docs/internal-norm/norm-context.md`
- Modify: `docs/admin/*` (backend.md + api.md), `docs/client-state/*`, one-line `BUSINESS.md`
- Modify: `src/generated/normToolsManifest.json` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `getRepeatPurchaseSummary` (Task 3); `withNorm`.

- [ ] **Step 1: Norm Zod schema**

```ts
// src/lib/internal-norm/schemas/repeat-purchases.ts
import { z } from "zod";

/**
 * Norm projection of the one-time-package repeat-purchase summary.
 * Aggregate counts only — no PII. Mirrors RepeatPurchaseSummary in
 * src/types/admin/repeatPurchase.ts (per-user rows are intentionally NOT exposed).
 */
export const NormRepeatPurchaseSummarySchema = z.object({
  oneTimeBuyers: z.number(),
  repeatBuyers: z.number(),
  repeatRate: z.number(),
  medianDaysToReturn: z.number().nullable(),
  repeatRevenue: z.number(),
  becameMembers: z.number(),
  totalPurchases: z.number(),
  buckets: z.array(z.object({ bucket: z.string(), users: z.number(), sharePct: z.number() })),
  windows: z.array(z.object({ windowDays: z.number(), eligible: z.number(), returned: z.number(), rate: z.number() })),
});
```

- [ ] **Step 2: Norm route**

Parameterless all-time mirror (matches mer-by-draw's self-contained style; keeps schema/route simplest and avoids any request-shape mismatch — the date-filtered cohort stays an admin-UI concern):

```ts
// src/app/api/internal/norm/v1/analytics/repeat-purchases/route.ts
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormRepeatPurchaseSummarySchema } from "@/lib/internal-norm/schemas/repeat-purchases";
import { getRepeatPurchaseSummary } from "@/services/admin/repeatPurchaseAnalytics";

/**
 * GET /v1/analytics/repeat-purchases
 * One-time-package repeat-purchase (reconversion) summary — all-time. Wraps the same
 * service the admin Repeat Purchases tab uses, so figures match by construction.
 * Aggregate counts only — no PII.
 */
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "analytics.repeat-purchases",
    requiredPermission: "pageAnalytics.view",
    responseSchema: NormRepeatPurchaseSummarySchema,
    perEndpointPerMinute: 10,
  },
  async (ctx) => {
    const data = await getRepeatPurchaseSummary({});
    return ctx.ok(data);
  }
);
```

Note: confirm the `withNorm` `ctx.ok(...)` call shape against the mer-by-draw route (`src/app/api/internal/norm/v1/analytics/mer-by-draw/route.ts`) — it wraps the payload object directly. `getRepeatPurchaseSummary({})` returns the all-time summary object matching `NormRepeatPurchaseSummarySchema` field-for-field.

- [ ] **Step 3: Registry entry**

In `src/lib/internal-norm/classification.ts`, import the schema near the other analytics schema imports:

```ts
import { NormRepeatPurchaseSummarySchema } from "@/lib/internal-norm/schemas/repeat-purchases";
```

Add the entry in the Analytics section (after `analytics.mer-by-draw`, ~line 547):

```ts
"analytics.repeat-purchases": {
  tier: "read",
  requiredPermission: "pageAnalytics.view",
  path: "/v1/analytics/repeat-purchases",
  method: "GET",
  summary: "One-time-package repeat-purchase (reconversion) summary: distinct one-time buyers, repeat buyers, repeat rate, median days to return, repeat revenue, became-members count, first→second gap buckets, and matured return-rate-by-window. Aggregate counts only, no PII. Excludes upsells, mini-draws, membership renewals; refunded purchases netted out.",
  rateLimit: { perMinute: 10 },
  responseSchema: NormRepeatPurchaseSummarySchema,
},
```

- [ ] **Step 4: Rebuild the Norm manifest**

Run: `npm run build:norm-manifest`
Expected: succeeds; `src/generated/normToolsManifest.json` now contains `analytics.repeat-purchases`.

- [ ] **Step 5: Norm smoke test**

Run: `npm run norm:smoke`
Expected: PASS — no schema↔output mismatch for the new endpoint.

- [ ] **Step 6: Update docs**

- `docs/internal-norm/norm-context.md`: add a line describing the new `analytics.repeat-purchases` read (mirror the mer-by-draw entry's style).
- `docs/admin/backend.md` + `docs/admin/api.md`: document the service (`getRepeatPurchaseSummary` / `getRepeatPurchaseUsers`) and the two routes, plus the metric definitions from Global Constraints.
- `docs/admin/frontend.md`: note the new tab component + where it registers.
- `docs/client-state/*` (the hooks doc): add `useRepeatPurchaseSummary` / `useRepeatPurchaseUsers` and their query keys.
- `BUSINESS.md`: one line under the analytics/KPI section noting the new Repeat Purchases admin surface (one-time reconversion analytics). This isn't a business-rule change, but the KPI surface is worth recording and clears any doc-sync ambiguity.

- [ ] **Step 7: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit** *(only if commits authorized)*

```bash
git add src/lib/internal-norm/schemas/repeat-purchases.ts src/app/api/internal/norm/v1/analytics/repeat-purchases src/lib/internal-norm/classification.ts src/generated/normToolsManifest.json docs/ BUSINESS.md
git commit -m "feat(norm): mirror repeat-purchase summary + docs"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full gate**

Run: `npm run type-check && npm run lint && npm run test:repeat-purchase-analytics && npm run norm:smoke`
Expected: all PASS.

- [ ] **Step 2: Cross-check against production**

With `npm run dev`, at all-time range confirm the headline numbers reconcile with the probe: One-time buyers **2,349**, Repeat buyers **396**, Repeat rate **16.9%**, and the bucket counts (same-day 78, 1–7d 59, 7–30d 141, 30–60d 64, 60–90d 30, 90–180d 23, 180d+ 1). Small drift is acceptable only if explained by refund-netting (≤11 users) or the membership-conversion flag; large drift means a definition bug — stop and diagnose.

- [ ] **Step 3: Doc-sync gate**

Ensure the Stop hook passes (docs touched for every `src/` domain edited). If it blocks, address the named docs before finishing.

---

## Self-Review

**Spec coverage:**
- §3 metric definitions → Task 2 (pure shaper) + Global Constraints. ✓
- §4 live aggregation, no snapshot → Task 3 (single lean find + JS accumulation). ✓
- §5 naming → Global Constraints + used consistently. ✓
- §6a service → Tasks 2–3. §6b routes → Task 4. §6c hooks → Task 5. §6d UI → Task 6. §6e registration → Task 7. §6f test → Task 2. §6g Norm → Task 8. §6h docs → Task 8. ✓
- §7 out-of-scope (Klaviyo, CSV, snapshots) → not built. ✓
- §8 error handling → route try/catch + UI error/empty/loading states. ✓
- §9 verification → Task 9. ✓

**Placeholder scan:** No TBD/TODO in code steps; the one flagged uncertainty (`resolveNormDateRange` shape in Task 8 Step 2) has an explicit fallback (parameterless all-time mirror) so the task is never blocked. ✓

**Type consistency:** `summarizeRepeatPurchases`, `bucketForDays`, `RepeatPurchaseInputEvent`, `getRepeatPurchaseSummary`, `getRepeatPurchaseUsers`, `RepeatPurchaseSummary`, `RepeatPurchaseUserRow`, `RepeatPurchaseUsersResult`, `RepeatBucketKey`, `RepeatSegment`, `REPEAT_BUCKET_KEYS`, `REPEAT_WINDOW_DAYS` — names identical across Tasks 1–8. Query-key prefix `["admin","analytics","repeat-purchases",…]` consistent. Permission `pageAnalytics.view` consistent across both admin routes + Norm entry. ✓
