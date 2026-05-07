# Past-Due Charge History — Table Tightening + Decline-Code Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the Past-Due Charge History admin tab (drop misleading "Total" columns, collapse Bulk Runs' five count columns into one "Attempts" cell, reduce four top cards to two) and add a new page-level decline-code summary panel that answers the original "vibe → number" goal.

**Architecture:** One new pure-function helper (`bucketDeclineCodeCounts`) lives next to the existing service helpers and is unit-tested. One new service function (`summariseDeclineCodes`) wraps a Mongo aggregation and delegates to the helper. One new route exposes it. One new TanStack Query hook reads it. One new shared `<AttemptsBreakdown />` component is reused by all four breakdown sites (Bulk Runs row, Manual Retries row, Drawer Summary, Drawer per-invoice row). Server-side aggregation is required because client-side counts would silently undercount across pagination.

**Tech Stack:** Next.js 15 App Router + Mongoose + TanStack Query + Tailwind (existing). Tests use `node:assert/strict` + standalone `tsx` scripts (no test runner) — wired into `npm run test:past-due-history`.

**Spec:** [docs/superpowers/specs/2026-05-07-past-due-history-tighten-and-decline-summary-design.md](../specs/2026-05-07-past-due-history-tighten-and-decline-summary-design.md)

---

## File map

**Create:**
- `src/components/admin/AttemptsBreakdown.tsx` — shared visual component, 4 callers
- `src/app/api/admin/charge-past-due/decline-summary/route.ts` — thin admin-auth handler
- `src/hooks/queries/admin/useChargePastDueDeclineSummary.ts` — `useQuery` hook (no pagination)

**Modify:**
- `src/services/admin/chargePastDueHistory.ts` — add `bucketDeclineCodeCounts` (pure) + `summariseDeclineCodes` (Mongo aggregation)
- `src/services/admin/__tests__/chargePastDueHistory.test.ts` — extend with bucket-function tests
- `src/app/admin/component/PastDueChargeHistory.tsx` — cards 4→2, Bulk Runs cols 10→6, Manual Retries drop Total, panel insert
- `src/app/admin/component/PastDueChargeHistoryDrawer.tsx` — Summary `dl` swap, per-invoice drop Total
- `docs/admin/api.md`, `docs/admin/backend.md`, `docs/admin/frontend.md`

**Doc-sync hook will require those three doc files to be touched** because the modified source files all live under the `admin` domain.

---

## Task 1: Pure bucketing helper + tests (TDD)

The aggregation Mongo returns is a flat list `[{_id: code, count: n}, ...]` already sorted desc. The bucketing logic (top 5 + "other", percentage rounding, empty-input guard) is pure JS and the only directly testable piece.

**Files:**
- Modify: `src/services/admin/chargePastDueHistory.ts`
- Test: `src/services/admin/__tests__/chargePastDueHistory.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/services/admin/__tests__/chargePastDueHistory.test.ts` (after the last `function test...` block, before `function run()`):

```ts
import { bucketDeclineCodeCounts } from "../chargePastDueHistory";

function testBucketEmpty() {
  const out = bucketDeclineCodeCounts([]);
  assert.deepEqual(out, { totalFailed: 0, topCodes: [] });
}

function testBucketSingleCode() {
  const out = bucketDeclineCodeCounts([{ _id: "lost_card", count: 4 }]);
  assert.equal(out.totalFailed, 4);
  assert.deepEqual(out.topCodes, [{ code: "lost_card", count: 4, pct: 100 }]);
}

function testBucketTopFiveAndOther() {
  // 7 codes, descending counts; top 5 stay, last 2 collapse into "other".
  const out = bucketDeclineCodeCounts([
    { _id: "lost_card", count: 18 },
    { _id: "insufficient_funds", count: 14 },
    { _id: "generic_decline", count: 11 },
    { _id: "do_not_honor", count: 6 },
    { _id: "stolen_card", count: 4 },
    { _id: "expired_card", count: 2 },
    { _id: "fraudulent", count: 1 },
  ]);
  assert.equal(out.totalFailed, 56);
  assert.equal(out.topCodes.length, 6);
  assert.equal(out.topCodes[0].code, "lost_card");
  assert.equal(out.topCodes[4].code, "stolen_card");
  assert.equal(out.topCodes[5].code, "other");
  assert.equal(out.topCodes[5].count, 3);
}

function testBucketExactlyFiveCodesNoOther() {
  // Five codes — no "other" row appended.
  const out = bucketDeclineCodeCounts([
    { _id: "a", count: 5 },
    { _id: "b", count: 4 },
    { _id: "c", count: 3 },
    { _id: "d", count: 2 },
    { _id: "e", count: 1 },
  ]);
  assert.equal(out.topCodes.length, 5);
  assert.ok(!out.topCodes.some((r) => r.code === "other"));
}

function testBucketPercentRounding() {
  // 3/7 ≈ 42.857 → 43; 2/7 ≈ 28.571 → 29; 2/7 → 29. Sum may be 101 — expected, no normalization.
  const out = bucketDeclineCodeCounts([
    { _id: "a", count: 3 },
    { _id: "b", count: 2 },
    { _id: "c", count: 2 },
  ]);
  assert.equal(out.totalFailed, 7);
  assert.equal(out.topCodes[0].pct, 43);
  assert.equal(out.topCodes[1].pct, 29);
  assert.equal(out.topCodes[2].pct, 29);
}

function testBucketCoercesNullIdToUnknown() {
  // The aggregation's $ifNull chain ends with the literal string "unknown", but defend
  // against future raw-null leakage so the UI never renders `null`.
  const out = bucketDeclineCodeCounts([{ _id: null as unknown as string, count: 2 }]);
  assert.equal(out.topCodes[0].code, "unknown");
}
```

Then add their calls inside `run()`:

```ts
  testBucketEmpty();
  testBucketSingleCode();
  testBucketTopFiveAndOther();
  testBucketExactlyFiveCodesNoOther();
  testBucketPercentRounding();
  testBucketCoercesNullIdToUnknown();
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm run test:past-due-history
```

Expected: FAIL — `bucketDeclineCodeCounts` is not exported from `../chargePastDueHistory`. Compile error or runtime "is not a function".

- [ ] **Step 3: Implement `bucketDeclineCodeCounts`**

Append to `src/services/admin/chargePastDueHistory.ts` (after `escapeUserSearchRegex`, before `RunsFilterInput`):

```ts
export interface DeclineCodeRow {
  code: string;
  count: number;
  pct: number;
}

export interface DeclineCodeSummary {
  totalFailed: number;
  topCodes: DeclineCodeRow[];
}

interface RawDeclineBucket {
  _id: string | null;
  count: number;
}

const DECLINE_TOP_N = 5;

/**
 * Bucket a sorted-desc list of decline-code aggregation rows into the top N plus
 * a single "other" row. Pure; tested in isolation. The Mongo aggregation in
 * `summariseDeclineCodes` already sorts by count desc, so this preserves order.
 */
export function bucketDeclineCodeCounts(rows: readonly RawDeclineBucket[]): DeclineCodeSummary {
  const totalFailed = rows.reduce((sum, r) => sum + r.count, 0);
  if (totalFailed === 0) return { totalFailed: 0, topCodes: [] };

  const top = rows.slice(0, DECLINE_TOP_N).map<DeclineCodeRow>((r) => ({
    code: r._id ?? "unknown",
    count: r.count,
    pct: Math.round((r.count / totalFailed) * 100),
  }));

  const tail = rows.slice(DECLINE_TOP_N);
  if (tail.length > 0) {
    const otherCount = tail.reduce((sum, r) => sum + r.count, 0);
    top.push({
      code: "other",
      count: otherCount,
      pct: Math.round((otherCount / totalFailed) * 100),
    });
  }

  return { totalFailed, topCodes: top };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm run test:past-due-history
```

Expected: PASS, console output `chargePastDueHistory tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/services/admin/chargePastDueHistory.ts src/services/admin/__tests__/chargePastDueHistory.test.ts
git commit -m "add bucketDeclineCodeCounts pure helper + tests"
```

---

## Task 2: Service function `summariseDeclineCodes`

Wraps the Mongo aggregation and hands the raw buckets to `bucketDeclineCodeCounts`. No new tests — Mongo aggregation is integration-tested via the route's manual verification.

**Files:**
- Modify: `src/services/admin/chargePastDueHistory.ts`

- [ ] **Step 1: Add the service function**

Append to `src/services/admin/chargePastDueHistory.ts` (after `bucketDeclineCodeCounts`):

```ts
export interface DeclineSummaryFilterInput {
  startDate?: Date;
  endDate?: Date;
}

/**
 * Aggregate failed `InvoiceChargeLog` rows in the given AEST-anchored date range,
 * group by decline reason (declineCode → errorCode → "unknown"), bucket into top 5
 * + "other". Caller is expected to pass dates already parsed via
 * `parseAestDayStartUtc` / `parseAestDayEndExclusiveUtc`.
 */
export async function summariseDeclineCodes(
  input: DeclineSummaryFilterInput
): Promise<DeclineCodeSummary> {
  const match: Record<string, unknown> = { status: "failed" };
  if (input.startDate || input.endDate) {
    const range: { $gte?: Date; $lt?: Date } = {};
    if (input.startDate) range.$gte = input.startDate;
    if (input.endDate) range.$lt = input.endDate;
    match.attemptedAt = range;
  }

  const rows = await InvoiceChargeLog.aggregate<RawDeclineBucket>([
    { $match: match },
    {
      $group: {
        _id: {
          $ifNull: ["$declineCode", { $ifNull: ["$errorCode", "unknown"] }],
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return bucketDeclineCodeCounts(rows);
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: no new errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/admin/chargePastDueHistory.ts
git commit -m "add summariseDeclineCodes service function"
```

---

## Task 3: GET /api/admin/charge-past-due/decline-summary route

Mirror the sibling `runs/route.ts` exactly: session check → 401, `connectDB`, parse AEST dates, delegate, return service result directly.

**Files:**
- Create: `src/app/api/admin/charge-past-due/decline-summary/route.ts`

- [ ] **Step 1: Create the route handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import {
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
  summariseDeclineCodes,
} from "@/services/admin/chargePastDueHistory";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const { searchParams } = new URL(request.url);
  const summary = await summariseDeclineCodes({
    startDate: parseAestDayStartUtc(searchParams.get("startDate")),
    endDate: parseAestDayEndExclusiveUtc(searchParams.get("endDate")),
  });

  return NextResponse.json(summary);
}
```

- [ ] **Step 2: Manual smoke test**

In a new terminal: `npm run dev`. Log in as an admin. Open `http://localhost:3000/api/admin/charge-past-due/decline-summary?startDate=2026-04-01&endDate=2026-05-07` directly in the browser.

Expected: JSON `{ totalFailed: <number>, topCodes: [{ code, count, pct }, ...] }` (or `{ totalFailed: 0, topCodes: [] }` if no failed rows in range).

If 401: log in as admin first. If 500: check server logs.

- [ ] **Step 3: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/charge-past-due/decline-summary/route.ts
git commit -m "add GET /api/admin/charge-past-due/decline-summary endpoint"
```

---

## Task 4: TanStack Query hook `useChargePastDueDeclineSummary`

Single-page (no pagination), so `useQuery` not `useInfiniteQuery`.

**Files:**
- Create: `src/hooks/queries/admin/useChargePastDueDeclineSummary.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useQuery } from "@tanstack/react-query";
import type { DeclineCodeSummary } from "@/services/admin/chargePastDueHistory";

export type { DeclineCodeSummary } from "@/services/admin/chargePastDueHistory";

export interface DeclineSummaryFilter {
  startDate?: string;
  endDate?: string;
}

export interface UseChargePastDueDeclineSummaryResult {
  data: DeclineCodeSummary | undefined;
  isLoading: boolean;
  isError: boolean;
}

function buildQueryString(filter: DeclineSummaryFilter): string {
  const params = new URLSearchParams();
  if (filter.startDate) params.set("startDate", filter.startDate);
  if (filter.endDate) params.set("endDate", filter.endDate);
  return params.toString();
}

export function useChargePastDueDeclineSummary(
  filter: DeclineSummaryFilter
): UseChargePastDueDeclineSummaryResult {
  const query = useQuery<DeclineCodeSummary>({
    queryKey: ["admin", "charge-past-due", "decline-summary", filter],
    queryFn: async () => {
      const qs = buildQueryString(filter);
      const url = qs
        ? `/api/admin/charge-past-due/decline-summary?${qs}`
        : `/api/admin/charge-past-due/decline-summary`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load decline summary (${res.status})`);
      return res.json();
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/queries/admin/useChargePastDueDeclineSummary.ts
git commit -m "add useChargePastDueDeclineSummary query hook"
```

---

## Task 5: Shared `<AttemptsBreakdown />` component

Used in 4 places — Bulk Runs row, Manual Retries row, Drawer Summary `<dd>`, Drawer per-invoice row. Two sizes: `cell` (table) and `block` (drawer dl).

**Files:**
- Create: `src/components/admin/AttemptsBreakdown.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { Fragment } from "react";

export interface AttemptsBreakdownProps {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** When provided and ≠ total, renders "X of Y eligible" on the headline line. */
  eligibleHint?: number;
  size: "cell" | "block";
}

const HEADLINE = {
  cell: "text-sm font-semibold text-gray-900 dark:text-white",
  block: "text-base font-semibold text-gray-900 dark:text-white",
};

const HINT = {
  cell: "ml-1 text-xs font-normal text-gray-500 dark:text-neutral-400",
  block: "ml-2 text-xs font-normal text-gray-500 dark:text-neutral-400",
};

const CHIPS_WRAP = {
  cell: "mt-0.5 flex flex-wrap items-center gap-x-2 text-xs",
  block: "mt-1 flex flex-wrap items-center gap-x-3 text-xs",
};

export default function AttemptsBreakdown({
  total,
  succeeded,
  failed,
  skipped,
  eligibleHint,
  size,
}: AttemptsBreakdownProps) {
  const showHint = typeof eligibleHint === "number" && eligibleHint !== total;
  const chips: { key: string; node: React.ReactNode }[] = [];
  if (succeeded > 0) {
    chips.push({
      key: "s",
      node: (
        <span className="text-emerald-700 dark:text-emerald-400">
          {succeeded}✓ succeeded
        </span>
      ),
    });
  }
  if (failed > 0) {
    chips.push({
      key: "f",
      node: (
        <span className="text-red-700 dark:text-red-400">
          {failed}✗ failed
        </span>
      ),
    });
  }
  if (skipped > 0) {
    chips.push({
      key: "k",
      node: (
        <span className="text-gray-500 dark:text-neutral-400">{skipped} skipped</span>
      ),
    });
  }

  return (
    <div className={size === "cell" ? "text-right" : ""}>
      <div className={HEADLINE[size]}>
        {total}
        {showHint && (
          <span className={HINT[size]}>of {eligibleHint} eligible</span>
        )}
      </div>
      {chips.length > 0 && (
        <div className={`${CHIPS_WRAP[size]} ${size === "cell" ? "justify-end" : ""}`}>
          {chips.map((c) => (
            <Fragment key={c.key}>{c.node}</Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AttemptsBreakdown.tsx
git commit -m "add AttemptsBreakdown shared component"
```

---

## Task 6: Top cards reduction (4 → 2)

**Files:**
- Modify: `src/app/admin/component/PastDueChargeHistory.tsx` (lines 322-352)

- [ ] **Step 1: Edit the cards block**

In `src/app/admin/component/PastDueChargeHistory.tsx`, replace the entire `{/* Summary cards */}` block (lines 322-352) with:

```tsx
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <MetricCard
          title="Succeeded"
          value={isLoading ? "—" : summary.succeeded}
          icon={CheckCircle}
          color="emerald"
          subtitle="Successful retries"
        />
        <MetricCard
          title="Revenue recovered"
          value={isLoading ? "—" : formatCents(summary.revenue)}
          icon={DollarSign}
          color="purple"
          subtitle="From bulk runs"
        />
      </div>
```

- [ ] **Step 2: Drop now-unused icon imports**

In the same file, line 7-17, remove `CreditCard` and `ListChecks` from the `lucide-react` import (they're no longer used). Keep `CheckCircle`, `DollarSign`, the rest as is.

Resulting import (final shape):

```tsx
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  DollarSign,
  RefreshCw,
  Search,
  UserCog,
} from "lucide-react";
```

- [ ] **Step 3: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean. (If unused import warnings fire on `CreditCard`/`ListChecks` your editor cached them — re-check.)

- [ ] **Step 4: Manual verify**

Run `npm run dev`, open admin → Past-Due Charge History tab. Verify only **two** cards render: Succeeded and Revenue recovered.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/component/PastDueChargeHistory.tsx
git commit -m "reduce past-due history top cards 4 to 2"
```

---

## Task 7: Decline-code summary panel

Insert between the cards and the Bulk Runs section, gated on the existing `filter` state.

**Files:**
- Modify: `src/app/admin/component/PastDueChargeHistory.tsx`

- [ ] **Step 1: Add the hook import**

In `src/app/admin/component/PastDueChargeHistory.tsx`, near the top of the imports (alongside `useChargePastDueRuns` etc.):

```tsx
import { useChargePastDueDeclineSummary } from "@/hooks/queries/admin/useChargePastDueDeclineSummary";
```

- [ ] **Step 2: Wire the query**

In the component body, after `const retriesQuery = useChargePastDueManualRetries(filter);` (around line 173), add:

```tsx
  const declineSummaryQuery = useChargePastDueDeclineSummary({
    startDate: filter.startDate,
    endDate: filter.endDate,
  });
```

- [ ] **Step 3: Insert the panel JSX**

Between the closing `</div>` of the cards block and the `{isError && (` red banner (around line 354), insert:

```tsx
      {/* Decline-code summary */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Why charges declined
          </h3>
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            Selected range
          </span>
        </div>
        <div className="p-4">
          {declineSummaryQuery.isLoading ? (
            <div className="space-y-2" aria-label="Loading decline summary">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-neutral-800"
                />
              ))}
            </div>
          ) : declineSummaryQuery.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Failed to load decline summary.
            </p>
          ) : !declineSummaryQuery.data || declineSummaryQuery.data.totalFailed === 0 ? (
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              No failed attempts in selected range.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-gray-500 dark:text-neutral-400">
                {declineSummaryQuery.data.totalFailed} failed attempts
              </p>
              <ul className="space-y-2">
                {declineSummaryQuery.data.topCodes.map((row) => (
                  <li
                    key={row.code}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="w-44 truncate font-mono text-xs text-gray-700 dark:text-neutral-300">
                      {row.code}
                    </span>
                    <span className="w-8 text-right tabular-nums text-gray-700 dark:text-neutral-300">
                      {row.count}
                    </span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-neutral-800">
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-red-500/70 dark:bg-red-500/60"
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-gray-500 dark:text-neutral-400">
                      {row.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 5: Manual verify**

Run `npm run dev`, open admin → Past-Due Charge History. Verify the panel renders below the two cards.
- With "All Time" range selected: shows top decline reasons.
- With a range that has no failures: shows "No failed attempts in selected range."
- Bar widths visually correlate with the pct values.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/component/PastDueChargeHistory.tsx
git commit -m "add decline-code summary panel to past-due history"
```

---

## Task 8: Bulk Runs table column collapse (10 → 6)

**Files:**
- Modify: `src/app/admin/component/PastDueChargeHistory.tsx` (lines 391-465)

- [ ] **Step 1: Import the new component**

Add to the import block at the top:

```tsx
import AttemptsBreakdown from "@/components/admin/AttemptsBreakdown";
```

- [ ] **Step 2: Replace the table header**

Find the `<thead>` block in the Bulk Runs section (line 391). Replace its entire `<tr>` with:

```tsx
                  <tr className="border-b border-gray-200 dark:border-neutral-700">
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Started
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Admin
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Attempts
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Revenue
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Duration
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Status
                    </th>
                  </tr>
```

- [ ] **Step 3: Replace the row body**

Find the `runsQuery.runs.map((r) => (...))` block (line 426). Replace each `<tr>`'s contents (everything between `<tr ... className="cursor-pointer ...">` and `</tr>`) with:

```tsx
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {formatDateTime(r.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {r.adminName}
                      </td>
                      <td className="px-4 py-3">
                        <AttemptsBreakdown
                          size="cell"
                          total={r.totals.attempted}
                          succeeded={r.totals.succeeded}
                          failed={r.totals.failed}
                          skipped={r.totals.skipped.total}
                          eligibleHint={r.totals.eligibleCount}
                        />
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCents(r.totals.revenueCents)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                        {formatDurationMs(r.durationMs)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <RunStatusBadge status={r.status} />
                      </td>
```

- [ ] **Step 4: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 5: Manual verify**

In `npm run dev`, navigate to the tab. Confirm Bulk Runs has 6 columns: Started, Admin, Attempts, Revenue, Duration, Status. The Attempts cell shows e.g. `43 of 47 eligible` over `31✓ succeeded   12✗ failed   4 skipped`. Click a row → drawer still opens.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/component/PastDueChargeHistory.tsx
git commit -m "collapse bulk runs table to 6 columns"
```

---

## Task 9: Manual Retries — drop Total column, swap Attempts cell

**Files:**
- Modify: `src/app/admin/component/PastDueChargeHistory.tsx` (lines 540-625)

- [ ] **Step 1: Drop the Total `<th>`**

In the Manual Retries `<thead>` block (around line 542-552), delete this single line:

```tsx
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Total</th>
```

- [ ] **Step 2: Drop the Total `<td>` from grouped parent rows**

In the `groupedRetries.map((g) => {...}`) block, find the trailing parent-row cell (around line 622-624):

```tsx
                          <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCents(g.totalAmount)}
                          </td>
```

Delete it.

- [ ] **Step 3: Replace the Attempts cell**

In the same parent row, find the existing Attempts cell (lines 611-618):

```tsx
                          <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-neutral-300">
                            {g.attempts.length}
                            <span className="ml-2 text-xs text-gray-500 dark:text-neutral-400">
                              {g.successCount > 0 && <span className="text-emerald-600">{g.successCount}✓ </span>}
                              {g.failedCount > 0 && <span className="text-red-600">{g.failedCount}✗ </span>}
                              {g.skippedCount > 0 && <span>{g.skippedCount}⏭</span>}
                            </span>
                          </td>
```

Replace with:

```tsx
                          <td className="px-4 py-3">
                            <AttemptsBreakdown
                              size="cell"
                              total={g.attempts.length}
                              succeeded={g.successCount}
                              failed={g.failedCount}
                              skipped={g.skippedCount}
                            />
                          </td>
```

- [ ] **Step 4: Update the expanded sub-row colspan**

The expanded sub-row (around line 629) currently has `<td colSpan={8}>`. After dropping Total, the parent row has 7 cells. Change to:

```tsx
                            <td colSpan={7} className="px-4 py-3">
```

- [ ] **Step 5: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 6: Manual verify**

In dev, expand a Manual Retries user row. Verify:
- Header has 7 columns (chevron, checkbox, Last attempt, Admin, User, Attempts, Latest) — no Total.
- Attempts cell stacks `12` (or whatever count) over `Nx✓ succeeded · Mx✗ failed · K skipped`.
- Expanded sub-table still spans the full row width.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/component/PastDueChargeHistory.tsx
git commit -m "manual retries: drop Total column, use AttemptsBreakdown"
```

---

## Task 10: Drawer Summary `dl` swap

**Files:**
- Modify: `src/app/admin/component/PastDueChargeHistoryDrawer.tsx` (lines 140-177)

- [ ] **Step 1: Add the import**

At the top of the file:

```tsx
import AttemptsBreakdown from "@/components/admin/AttemptsBreakdown";
```

- [ ] **Step 2: Edit the `<dl>` block**

In `src/app/admin/component/PastDueChargeHistoryDrawer.tsx`, find the `<dl>` block (line 140) and replace **the entire `<dl>...</dl>`** with:

```tsx
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500 dark:text-neutral-400">Started</dt>
                <dd className="text-gray-900 dark:text-white">
                  {formatDateTime(detailQuery.data.run.startedAt)}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Finished</dt>
                <dd className="text-gray-900 dark:text-white">
                  {detailQuery.data.run.finishedAt
                    ? formatDateTime(detailQuery.data.run.finishedAt)
                    : "(still running)"}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Duration</dt>
                <dd className="text-gray-900 dark:text-white">
                  {formatDurationMs(detailQuery.data.run.durationMs)}
                </dd>
                <dt className="text-gray-500 dark:text-neutral-400">Admin</dt>
                <dd className="text-gray-900 dark:text-white">{detailQuery.data.run.adminName}</dd>
                <dt className="text-gray-500 dark:text-neutral-400">Revenue</dt>
                <dd className="font-semibold text-gray-900 dark:text-white">
                  {formatCents(detailQuery.data.run.totals.revenueCents)}
                </dd>
                <dt className="self-start text-gray-500 dark:text-neutral-400">Attempts</dt>
                <dd>
                  <AttemptsBreakdown
                    size="block"
                    total={detailQuery.data.run.totals.attempted}
                    succeeded={detailQuery.data.run.totals.succeeded}
                    failed={detailQuery.data.run.totals.failed}
                    skipped={detailQuery.data.run.totals.skipped.total}
                    eligibleHint={detailQuery.data.run.totals.eligibleCount}
                  />
                </dd>
              </dl>
```

The Skip breakdown subsection that follows (`<div className="mt-4 border-t...">`) is untouched.

- [ ] **Step 3: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 4: Manual verify**

Click any Bulk Run row to open the drawer. Verify Summary shows Started, Finished, Duration, Admin, Revenue, Attempts. The Attempts row's `<dd>` shows the headline + chips block. Skip breakdown subsection still renders below.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/component/PastDueChargeHistoryDrawer.tsx
git commit -m "drawer summary: collapse 5 numeric rows to AttemptsBreakdown"
```

---

## Task 11: Drawer per-invoice table — drop Total, swap Attempts

**Files:**
- Modify: `src/app/admin/component/PastDueChargeHistoryDrawer.tsx` (lines 240-285)

- [ ] **Step 1: Drop the Total `<th>`**

In the per-invoice table `<thead>` (around line 240-246), delete this line:

```tsx
                      <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Total</th>
```

- [ ] **Step 2: Drop the Total `<td>`**

In the parent row map (around line 283-285), delete:

```tsx
                            <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                              {formatCents(g.totalAmount)}
                            </td>
```

- [ ] **Step 3: Replace the Attempts cell**

Find the existing Attempts cell (lines 272-279):

```tsx
                            <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-neutral-300">
                              {g.attempts.length}
                              <span className="ml-2 text-xs text-gray-500 dark:text-neutral-400">
                                {g.successCount > 0 && <span className="text-emerald-600">{g.successCount}✓ </span>}
                                {g.failedCount > 0 && <span className="text-red-600">{g.failedCount}✗ </span>}
                                {g.skippedCount > 0 && <span>{g.skippedCount}⏭</span>}
                              </span>
                            </td>
```

Replace with:

```tsx
                            <td className="px-4 py-3">
                              <AttemptsBreakdown
                                size="cell"
                                total={g.attempts.length}
                                succeeded={g.successCount}
                                failed={g.failedCount}
                                skipped={g.skippedCount}
                              />
                            </td>
```

- [ ] **Step 4: Update expanded sub-row `colSpan`**

The expanded inner-table row currently has `<td colSpan={5}>`. After dropping Total, the parent row has 4 cells. Change to:

```tsx
                              <td colSpan={4} className="px-4 py-3">
```

- [ ] **Step 5: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 6: Manual verify**

In the drawer, expand a user row. Header shows 4 columns (chevron, User, Attempts, Latest) — no Total. Expanded inner table fills the row width. Attempts cell uses the stacked layout.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/component/PastDueChargeHistoryDrawer.tsx
git commit -m "drawer per-invoice: drop Total column, use AttemptsBreakdown"
```

---

## Task 12: Doc updates (admin domain)

The doc-sync hook (`.claude/hooks/doc-sync.mjs`) blocks at `Stop` if `src/app/admin/**`, `src/services/admin/**`, or `src/components/admin/**` were edited without matching `docs/admin/` updates. Touch all three files.

**Files:**
- Modify: `docs/admin/api.md`
- Modify: `docs/admin/backend.md`
- Modify: `docs/admin/frontend.md`

- [ ] **Step 1: Document the new endpoint in `docs/admin/api.md`**

Find the existing section that lists `GET /api/admin/charge-past-due/runs` and `GET /api/admin/charge-past-due/manual-retries`. Add a sibling entry below them:

```markdown
### `GET /api/admin/charge-past-due/decline-summary`

Aggregates failed `InvoiceChargeLog` rows in the given AEST date range, grouped by decline reason (preferring `declineCode`, falling back to `errorCode`, finally `"unknown"`). Returns the top 5 reasons plus a single `"other"` row for the long tail.

**Query:** `startDate?=YYYY-MM-DD`, `endDate?=YYYY-MM-DD` (AEST calendar dates; end is exclusive).

**Auth:** admin (`session.user.role === "admin"`); 401 otherwise.

**Response:**

```json
{
  "totalFailed": 52,
  "topCodes": [
    { "code": "lost_card", "count": 18, "pct": 35 },
    { "code": "insufficient_funds", "count": 14, "pct": 27 },
    { "code": "other", "count": 3, "pct": 5 }
  ]
}
```

Empty range → `{ "totalFailed": 0, "topCodes": [] }`.
```

- [ ] **Step 2: Document the service in `docs/admin/backend.md`**

Find the section describing `chargePastDueHistory.ts` (look for `listChargeRuns` / `listManualRetries` references). Add a sibling subsection:

```markdown
### `summariseDeclineCodes(filter)` — page-level decline reasons

Wraps a single `InvoiceChargeLog.aggregate` over `status: "failed"` rows in the given AEST-anchored range, groups by `declineCode → errorCode → "unknown"`, sorts desc, then delegates to the pure helper `bucketDeclineCodeCounts` for top-5-plus-other bucketing.

`bucketDeclineCodeCounts` is exported separately and unit-tested in `chargePastDueHistory.test.ts`. The aggregation itself is verified manually against staging data.
```

- [ ] **Step 3: Document the UI in `docs/admin/frontend.md`**

Find the section about Past-Due Charge History (page or drawer). Add or extend:

```markdown
### Decline-code summary panel

`PastDueChargeHistory.tsx` renders a "Why charges declined" panel between the top cards and the Bulk Runs section. Powered by `useChargePastDueDeclineSummary`, scoped to the current date filter. Each row shows the code, count, a proportional bar, and percent. Loading state = 5 skeleton bars; empty state = single "No failed attempts in selected range." line.

### Top cards (reduced)

Two cards only: **Succeeded** (count) and **Revenue recovered** (currency). Both aggregate Bulk Runs only — Manual Retries deliberately don't roll up here. Subtitle on Revenue recovered says "From bulk runs" to make this scope explicit.

### Shared `AttemptsBreakdown` component

`src/components/admin/AttemptsBreakdown.tsx` is the single source of stacked count-plus-chips rendering. Used in four places:

- Bulk Runs row (size `cell`, with `eligibleHint`)
- Manual Retries grouped row (size `cell`, no hint)
- Drawer Summary `<dd>` (size `block`, with `eligibleHint`)
- Drawer per-invoice grouped row (size `cell`, no hint)

If any of those four breakdowns drift visually, fix the component — don't fork.
```

- [ ] **Step 4: Bump `lastVerified` for the admin domain**

The doc-sync hook auto-bumps `lastVerified` on the manifest entry when docs are touched. If it doesn't, hand-edit `c:/Codes/ToolsAustralia/CLAUDE.md` and `c:/Codes/ToolsAustralia/.worktrees/past-due-charges/CLAUDE.md` admin-domain `lastVerified` to `2026-05-07`.

- [ ] **Step 5: Run doc-sync sanity check**

```bash
npm run lint
```

Plus invoke the doc-sync skill if available, or trust the Stop hook to block if anything is amiss.

- [ ] **Step 6: Commit**

```bash
git add docs/admin/api.md docs/admin/backend.md docs/admin/frontend.md CLAUDE.md
git commit -m "docs(admin): decline summary endpoint, AttemptsBreakdown, reduced cards"
```

---

## Task 13: End-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Run full type-check and lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 2: Run the test suite**

```bash
npm run test:past-due-history
```

Expected: `chargePastDueHistory tests passed`.

- [ ] **Step 3: Manual end-to-end on the page**

Run `npm run dev`. Log in as admin, navigate to Past-Due Charge History tab.

Verify in order:
- [ ] Two cards on top: Succeeded + Revenue recovered. No Bulk runs / Invoices attempted cards.
- [ ] Decline panel below the cards. With a wide date range that includes failures, top reasons render with bars summing to ~100%.
- [ ] Decline panel updates when you change the date range (Today / All Time / custom).
- [ ] Bulk Runs table has 6 columns: Started, Admin, Attempts, Revenue, Duration, Status.
- [ ] Bulk Runs Attempts cell shows e.g. `43 of 47 eligible` over chips.
- [ ] Click any Bulk Run → drawer opens, Summary shows Started/Finished/Duration/Admin/Revenue + Attempts block. Skip breakdown subsection still present.
- [ ] Drawer per-invoice table has 4 columns (chevron, User, Attempts, Latest) — no Total. Expand a row → inner table fills row width.
- [ ] Manual Retries table has 7 columns (chevron, checkbox, Last attempt, Admin, User, Attempts, Latest) — no Total. Expand a user → inner per-attempt table fills row width.

- [ ] **Step 4: Mobile / narrow check**

Resize browser to mobile width. Verify the cards collapse to a single column, panel text doesn't overflow, and tables still scroll horizontally without layout breakage.

- [ ] **Step 5: Final commit if anything was tweaked during verification**

If steps 1-4 surfaced any tweak, fix and:

```bash
git add <files>
git commit -m "verification fixups"
```

If clean — no commit needed.

---

## Self-review summary

- ✅ All spec sections (1-8) map to tasks 1-12; verification covers task 13.
- ✅ No placeholders. Every code step contains complete code.
- ✅ Type consistency: `DeclineCodeSummary` / `DeclineCodeRow` defined once in service, re-exported through hook, consumed in panel JSX.
- ✅ `bucketDeclineCodeCounts` signature matches between Task 1 (declaration), Task 2 (caller), and tests.
- ✅ `AttemptsBreakdown` props (`total`, `succeeded`, `failed`, `skipped`, `eligibleHint`, `size`) are identical across Tasks 5, 8, 9, 10, 11.
- ✅ Domain Manifest impact handled in Task 12 (no new domain needed).
- ✅ No-auto-commit rule respected: every commit step is documented but execution skill defers to user authorization.
