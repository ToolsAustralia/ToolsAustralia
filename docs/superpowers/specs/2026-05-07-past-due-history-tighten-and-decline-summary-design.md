# Past-Due Charge History — Table Tightening + Decline-Code Summary

**Date:** 2026-05-07
**Owner:** DJ
**Surface:** Admin → Past-Due Charge History page + run-detail drawer
**Status:** Design approved, ready for implementation plan

## Files in scope

- `src/app/admin/component/PastDueChargeHistory.tsx`
- `src/app/admin/component/PastDueChargeHistoryDrawer.tsx`
- `src/components/admin/AttemptsBreakdown.tsx` *(new)*
- `src/services/admin/chargePastDueHistory.ts`
- `src/app/api/admin/charge-past-due/decline-summary/route.ts` *(new)*
- `src/hooks/queries/admin/useChargePastDueDeclineSummary.ts` *(new)*
- `src/services/admin/__tests__/chargePastDueHistory.test.ts`

## Problem

Two unrelated-looking issues, one shared cause: the Past-Due Charge History tables show too many numeric columns and none of them answer the question the feature was built to answer.

1. **The tables are noisy.** Manual Retries has a "Total" column summing `success + failed + skipped` amounts — a hypothetical "if everything had succeeded" number, not real revenue. Bulk Runs has 10 columns including five separate count cells (Eligible / Attempted / Succeeded / Failed / Skipped) that read as a wall of digits. The drawer Summary repeats the same five fields.
2. **The original goal is unmet.** [docs/superpowers/specs/2026-05-05-past-due-charge-history-design.md](../../superpowers/specs/2026-05-05-past-due-charge-history-design.md) §"Why now" justified this feature with: *"Operators have a vibe about how often `insufficient_funds` and other declines fire, but not a number."* Decline codes are recorded per-row and visible inside the drill-in, but never aggregated. After a month of use, an admin still cannot answer "how often does `insufficient_funds` fire?" without manually opening every run.

## Goals

- Tables show one Attempts column with stacked breakdown chips, not five separate count columns.
- Misleading "Total" amount columns are gone everywhere they appear.
- Top of the page answers two questions at a glance: *did we recover anything?* (Revenue recovered) and *how many succeeded?* (Succeeded).
- A new page-level panel answers the original "vibe → number" goal: top decline reasons across the selected date range.
- All four numeric breakdowns on the page (Bulk Runs row, Manual Retries row, Drawer Summary, Drawer per-invoice row) render through one shared component.

## Non-goals

- Changing the per-attempt "Status" / "Latest" badge logic, the bulk-recover flow, the search behaviour, or the date range picker.
- Per-run decline summary in the drawer. Page-level only — that's the cross-run trend operators need. (Per-run decline distribution can be eyeballed from the existing per-invoice list.)
- Removing the `totalAmount` field from the `UserAttemptGroup` type or the service DTO. The column goes; the underlying data stays in case a future surface wants it.
- Backfill or migration. The decline-summary aggregation runs over existing `InvoiceChargeLog` rows as-is; rows missing `declineCode` fall back to `errorCode`.
- Per-run cron / orphan-cleanup changes. None of this changes write paths.

---

## Section 1 — Shared component: `<AttemptsBreakdown />`

New file: [src/components/admin/AttemptsBreakdown.tsx](../../../src/components/admin/AttemptsBreakdown.tsx).

```ts
interface AttemptsBreakdownProps {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  eligibleHint?: number;   // shown as "X of Y eligible" — bulk runs / drawer summary only
  size: "cell" | "block";  // cell = right-aligned table cell; block = drawer dl <dd>
}
```

**Render rules:**
- Line 1 (large): `total` as a digit. If `eligibleHint` is set and differs from `total`, render `{total} of {eligibleHint} eligible` instead (smaller "of N eligible" suffix).
- Line 2 (smaller, muted): chips. Each chip only renders when its count is `> 0`.
  - `{succeeded}✓ succeeded` — emerald-700 / dark:emerald-400
  - `{failed}✗ failed` — red-700 / dark:red-400
  - `{skipped} skipped` — gray-500 / dark:neutral-400
- `size="cell"`: stacked, right-aligned, fits in a table `<td>`. Uses `text-sm` (line 1), `text-xs` (line 2).
- `size="block"`: same content, no alignment constraints, line 1 in `text-base font-semibold`. Used inside a `<dd>`.

**Empty case:** `total === 0` renders just `0` with no chips. No "no attempts" placeholder.

**Used by four call sites:**
- Bulk Runs row → `cell`, with `eligibleHint`
- Manual Retries grouped row → `cell`, no `eligibleHint`
- Drawer Summary `<dd>` → `block`, with `eligibleHint`
- Drawer per-invoice grouped row → `cell`, no `eligibleHint`

---

## Section 2 — Top cards reduction

[src/app/admin/component/PastDueChargeHistory.tsx:322-352](../../../src/app/admin/component/PastDueChargeHistory.tsx#L322-L352).

- Grid changes from `grid-cols-2 lg:grid-cols-4` to `grid-cols-1 sm:grid-cols-2`.
- Drop the `Bulk runs` and `Invoices attempted` `<MetricCard>`.
- Keep `Succeeded` (`summary.succeeded`, subtitle "Successful retries") and `Revenue recovered` (`formatCents(summary.revenue)`, subtitle "From bulk runs").
- The `summary` `useMemo` continues to compute all four fields; only the unused renders are removed. The `attempted` / `runs` fields stay because they remain useful for downstream debug/Inspect, and trimming the memo is unrelated cleanup.

Subtitle on `Revenue recovered` continues to say "From bulk runs" — manual retries aren't aggregated into the cards, and that's intentional (manual retries are bottom-of-page detail, not top-of-page KPI).

---

## Section 3 — Decline-code summary panel

### 3a. Service

Extend [src/services/admin/chargePastDueHistory.ts](../../../src/services/admin/chargePastDueHistory.ts) with one new exported function:

```ts
export interface DeclineCodeSummary {
  totalFailed: number;
  topCodes: Array<{ code: string; count: number; pct: number }>;
}

export async function summariseDeclineCodes(filter: {
  startDate?: string;
  endDate?: string;
}): Promise<DeclineCodeSummary>;
```

Behaviour:
- Parse `startDate` / `endDate` with the existing exported helpers `parseAestDayStartUtc` and `parseAestDayEndExclusiveUtc` (zoned start, exclusive `$lt` end). If no dates supplied, no time filter — use whatever exists in `InvoiceChargeLog`.
- Aggregate `InvoiceChargeLog`:
  ```js
  [
    { $match: { status: "failed", attemptedAt: { $gte: start, $lt: end } } },
    { $group: { _id: { $ifNull: ["$declineCode", { $ifNull: ["$errorCode", "unknown"] }] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]
  ```
- Bucket: keep the top 5 codes; sum the remainder into a single `"other"` row.
- `totalFailed` is `sum(counts)` before bucketing.
- `pct = round(count / totalFailed * 100)`. If `totalFailed === 0`, return `{ totalFailed: 0, topCodes: [] }`.

### 3b. Route

New file: [src/app/api/admin/charge-past-due/decline-summary/route.ts](../../../src/app/api/admin/charge-past-due/decline-summary/route.ts).

Thin handler matching the sibling route shape ([runs/route.ts](../../../src/app/api/admin/charge-past-due/runs/route.ts)): `getServerSession(authOptions)` + `session.user.role === "admin"` check returning 401 otherwise, `await connectDB()`, parse `startDate` / `endDate` from `searchParams` via the helpers above, delegate to `summariseDeclineCodes`, return the `DeclineCodeSummary` directly (sibling routes return the service result directly without wrapping).

### 3c. Hook

New file: [src/hooks/queries/admin/useChargePastDueDeclineSummary.ts](../../../src/hooks/queries/admin/useChargePastDueDeclineSummary.ts).

Same filter shape as `useChargePastDueRuns` (date range only — `userSearch` is irrelevant here).

```ts
useChargePastDueDeclineSummary(filter: { startDate?: string; endDate?: string }): {
  data: DeclineCodeSummary | undefined;
  isLoading: boolean;
  isError: boolean;
};
```

Cache key: `["admin", "charge-past-due", "decline-summary", filter]`.

### 3d. UI panel

New section in `PastDueChargeHistory.tsx`, rendered between the cards and the Bulk Runs section.

```
┌─ Why charges declined ─────────────────── (selected range) ─┐
│ 52 failed attempts                                          │
│                                                             │
│ lost_card             18  ████████████ 35%                  │
│ insufficient_funds    14  █████████ 27%                     │
│ generic_decline       11  ███████ 21%                       │
│ do_not_honor           6  ████ 12%                          │
│ other                  3  ██ 5%                             │
└─────────────────────────────────────────────────────────────┘
```

Implementation notes:
- Each row is a flex layout: code label (mono, gray-700/neutral-300), count (right-aligned numeric), bar (`<div style={{ width: `${pct}%` }} class="h-2 bg-red-500/70 rounded" />`), `pct%` text.
- Skeleton state during `isLoading`: 5 placeholder rows.
- Empty state (`totalFailed === 0`): a single muted line "No failed attempts in selected range." Panel still renders so the absence of data is itself informative.
- Header text on the right says "(selected range)" so an admin viewing "Today" understands the scope.

The hook reads from the same `filter` (`startDate`, `endDate`) as `useChargePastDueRuns`, so changing the date range refetches all three queries together.

---

## Section 4 — Bulk Runs table

[src/app/admin/component/PastDueChargeHistory.tsx:391-423](../../../src/app/admin/component/PastDueChargeHistory.tsx#L391-L423) (header) and `:425-465` (rows).

**Final header (6 columns):** Started, Admin, Attempts (right-aligned), Revenue (right-aligned), Duration, Status.

**Removed columns:** Eligible, Attempted, Succeeded, Failed, Skipped — all five collapse into one Attempts cell.

**Attempts cell:**
```tsx
<td className="px-4 py-3 text-right">
  <AttemptsBreakdown
    size="cell"
    total={r.totals.attempted}
    succeeded={r.totals.succeeded}
    failed={r.totals.failed}
    skipped={r.totals.skipped.total}
    eligibleHint={r.totals.eligibleCount}
  />
</td>
```

Row click → drawer behaviour unchanged.

---

## Section 5 — Manual Retries table

[src/app/admin/component/PastDueChargeHistory.tsx:540-625](../../../src/app/admin/component/PastDueChargeHistory.tsx#L540-L625).

**Header changes:**
- Drop the `<th>Total</th>` (line 551).

**Row changes:**
- Drop the trailing `<td>{formatCents(g.totalAmount)}</td>` (lines 622-624).
- Replace the existing Attempts cell (lines 611-618) with:

```tsx
<td className="px-4 py-3 text-right">
  <AttemptsBreakdown
    size="cell"
    total={g.attempts.length}
    succeeded={g.successCount}
    failed={g.failedCount}
    skipped={g.skippedCount}
  />
</td>
```

**`UserAttemptGroup.totalAmount`** stays on the type — unused at this surface but cheap to keep, and removing it is unrelated scope.

The expanded sub-rows are unchanged. The "showing X loaded" caveat for paginated retries (already documented inside the existing component) still applies — loaded-only counts; unchanged.

---

## Section 6 — Drawer Summary section

[src/app/admin/component/PastDueChargeHistoryDrawer.tsx:140-177](../../../src/app/admin/component/PastDueChargeHistoryDrawer.tsx#L140-L177).

**Drop:** the four `<dt>/<dd>` pairs for Eligible / Attempted / Succeeded / Failed.

**Insert** (after the Admin row, before Skip breakdown):

```tsx
<dt className="text-gray-500 dark:text-neutral-400">Attempts</dt>
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
```

**Keep:** Started, Finished, Duration, Admin, Revenue rows. Skip breakdown subsection at the bottom is unchanged — it answers a different question (*why* skipped) than Attempts (how many).

---

## Section 7 — Drawer per-invoice attempts table

[src/app/admin/component/PastDueChargeHistoryDrawer.tsx:240-285](../../../src/app/admin/component/PastDueChargeHistoryDrawer.tsx#L240-L285).

**Header changes:**
- Drop the `<th>Total</th>` (line 245).

**Row changes:**
- Drop the trailing `<td>{formatCents(g.totalAmount)}</td>` (lines 283-285).
- Swap the Attempts cell (lines 272-279) to use `<AttemptsBreakdown size="cell" total={g.attempts.length} succeeded={g.successCount} failed={g.failedCount} skipped={g.skippedCount} />`.

Expanded sub-row table (Invoice / Status / Amount / Error) is unchanged.

---

## Section 8 — Tests

Extend [src/services/admin/__tests__/chargePastDueHistory.test.ts](../../../src/services/admin/__tests__/chargePastDueHistory.test.ts) with cases for `summariseDeclineCodes`:

1. `respects AEST date range` — feeds rows around the AEST/UTC boundary; asserts inclusion uses the same `$gte` / `$lt` semantics as `buildRunsFilter`.
2. `bucket overflow` — feeds 7 distinct decline codes with descending counts; asserts top 5 returned individually plus one `"other"` row aggregating the tail.
3. `ignores non-failed rows` — succeeded/skipped rows in the date range must not contribute to `totalFailed`.
4. `falls back to errorCode when declineCode missing` — row with `declineCode: undefined`, `errorCode: "card_declined"` must group under `"card_declined"`.
5. `groups missing-everything as "unknown"` — row with neither `declineCode` nor `errorCode` groups under `"unknown"` (chosen explicitly so the UI shows something rather than `null`).
6. `empty result` — no failed rows in range returns `{ totalFailed: 0, topCodes: [] }`.

The grouping/UI changes are presentation-only; manual verification suffices per repo convention.

---

## Cross-cutting concerns

### Performance
- `summariseDeclineCodes` is one indexed aggregation per panel render (cached via React Query). The existing `attemptedAt` index on `InvoiceChargeLog` covers the `$match`. Adding an index on `declineCode` is unnecessary — the `$group` runs after `$match` filtering on a small set.
- `<AttemptsBreakdown />` is a pure component with no state; rendering 50+ instances per page is trivial.

### Existing data
- Pre-`declineCode`-deploy rows still have `errorCode` only. The `$ifNull` chain in the aggregation surfaces them under their generic code (e.g. `card_declined`), which is the same fallback the per-row UI already uses.

### Domain Manifest
No new domain. All paths are already covered:
- `src/app/api/admin/charge-past-due/decline-summary/**` ⊂ `src/app/api/admin/**` (admin domain).
- `src/components/admin/AttemptsBreakdown.tsx` ⊂ `src/components/admin/**` (admin domain).
- `src/services/admin/chargePastDueHistory.ts` already listed in admin domain.
- `src/hooks/queries/admin/useChargePastDueDeclineSummary.ts` ⊂ `src/hooks/queries/**` (client-state domain).

### Documentation impact
- `docs/admin/api.md` — document `GET /api/admin/charge-past-due/decline-summary`.
- `docs/admin/backend.md` — describe `summariseDeclineCodes` service signature and AEST handling.
- `docs/admin/frontend.md` — describe the decline panel + the shared `AttemptsBreakdown` component, with note that all four breakdown sites consume it.
- `docs/client-state/` — only if the new hook needs documentation alongside its siblings (existing query-hook docs vary by file).

### Risks
- **Misleading top decline-code when most failures are `card_declined` generic**: existing rows without `decline_code` collapse into `card_declined`, which is the generic Stripe bucket. The fallback chain `declineCode ?? errorCode ?? "unknown"` is the right ordering — once new rows accumulate (post-2026-05-06 deploy), the panel surfaces real reasons. Documented in the panel header (no extra UI).
- **Manual retries cards stay invisible**: the cards still aggregate bulk runs only. This is consistent with the existing behaviour (the kept cards' subtitles already say "From bulk runs"). If admins want a manual-retries headline metric later, that's a follow-up; out of scope here.

## Out of scope (deferred)

- Per-run decline distribution inside the drawer.
- Time-series view of decline-code frequency.
- Adding manual-retries stats to the top cards.
- Removing `totalAmount` from `UserAttemptGroup` and `RunDetailRow` DTOs.
- A "Recover all failed for this code" bulk action.
