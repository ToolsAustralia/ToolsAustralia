# Renewal Rate KPI Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo rule:** This repo has a `no-auto-commit` hook. The "Commit" steps below are real, but you must have explicit user authorization (`commit`/`push`/`ship it`) before running `git commit`. If unauthorized, complete the step's staging and ask.

**Goal:** Add a draw-aligned "Renewal Rate" KPI card to the admin dashboard overview, showing what % of the members present at the start of a draw have renewed (base = active + past-due; capped ≤100%).

**Architecture:** Backend extends `MembershipAnalyticsService.getAnalyticsBundle()` with a `renewalProgress` block (denominator = `MembershipDailySnapshot` active+past-due at the period's first day; numerator = the already-computed `successfulRenewalUserCount`). The stats route surfaces it under `stats.users.renewalProgress`; a new `MetricCard` renders it, shown only when the field is present (current-draw / last-draw). A pure helper holds the rate math and is unit-tested.

**Tech Stack:** Next.js 15, MongoDB/Mongoose, TanStack Query, React, Tailwind, tsx test scripts.

**Spec:** `docs/superpowers/specs/2026-05-29-renewal-rate-metric-design.md`. Reference implementation of the math: `scripts/find-renewal-rate.ts` (`--last-draw` mode).

---

## File structure

- Create `src/utils/admin/renewalProgress.ts` — pure rate math (`summarizeRenewalProgress`). One responsibility: turn `{base, renewed, ...}` into a display-ready `RenewalProgress`.
- Create `src/utils/admin/__tests__/renewalProgress.test.ts` — tsx unit test for the helper.
- Modify `src/types/admin/membershipAnalytics.ts` — add `RenewalProgress` interface; add `renewalProgress?` to `MembershipAnalyticsBundle`.
- Modify `src/services/admin/MembershipAnalyticsService.ts` — add `getRenewalBaseAsOf()` + populate `renewalProgress` in `getAnalyticsBundle()`.
- Modify `src/app/api/admin/dashboard/stats/route.ts` — surface `renewalProgress` under `stats.users`.
- Modify `src/hooks/queries/useAdminQueries.ts` — add `renewalProgress?` to `AdminDashboardStats.users`.
- Modify `src/app/admin/component/overview/KPIMetricsGrid.tsx` — add `renewalProgress?` to the local `DashboardStats.users` interface + render the card.
- Modify `package.json` — add `test:renewal-progress` script.
- Modify `docs/admin/` and `docs/client-state/` docs (doc-sync hook requirement).

---

### Task 1: Pure rate helper + type

**Files:**
- Create: `src/utils/admin/renewalProgress.ts`
- Modify: `src/types/admin/membershipAnalytics.ts`
- Test: `src/utils/admin/__tests__/renewalProgress.test.ts`

- [ ] **Step 1: Add the `RenewalProgress` type to the shared types file**

In `src/types/admin/membershipAnalytics.ts`, add this interface above `MembershipAnalyticsBundle` (after `CancellationRevenueMetrics`):

```ts
export interface RenewalProgress {
  /** Denominator: active + past-due members at the period's first day. */
  base: number;
  /** Numerator: distinct members whose renewal payment landed in the period. */
  renewed: number;
  /** renewed / base as a 0–100 percentage (1 dp); null when base is 0 / no snapshot. */
  rate: number | null;
  /** max(0, base − renewed). Labeled "expected" while open, "did not renew" when complete. */
  remaining: number;
  /** Snapshot day actually used for the base (YYYY-MM-DD, AEST); null if none found. */
  baseAsOf: string | null;
  /** True when the period is closed (last-draw) → remaining means "did not renew". */
  isComplete: boolean;
}
```

Then extend the bundle:

```ts
export interface MembershipAnalyticsBundle extends MembershipRenewalMetrics, CancellationRevenueMetrics {
  renewalProgress?: RenewalProgress;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/utils/admin/__tests__/renewalProgress.test.ts`:

```ts
import assert from "node:assert";
import { summarizeRenewalProgress } from "@/utils/admin/renewalProgress";

function run() {
  // Normal case: 3178 of 3882 → 81.9%, 704 remaining.
  const a = summarizeRenewalProgress({ base: 3882, renewed: 3178, baseAsOf: "2026-04-29", isComplete: true });
  assert.equal(a.rate, 81.9, `rate should be 81.9, got ${a.rate}`);
  assert.equal(a.remaining, 704, `remaining should be 704, got ${a.remaining}`);
  assert.equal(a.isComplete, true);
  assert.equal(a.baseAsOf, "2026-04-29");

  // Cap at 100% even if renewed somehow exceeds base (defensive).
  const b = summarizeRenewalProgress({ base: 100, renewed: 130, baseAsOf: null, isComplete: false });
  assert.equal(b.rate, 100, `rate should cap at 100, got ${b.rate}`);
  assert.equal(b.renewed, 100, `renewed should cap at base, got ${b.renewed}`);
  assert.equal(b.remaining, 0);

  // No base (no snapshot) → rate null, remaining 0.
  const c = summarizeRenewalProgress({ base: 0, renewed: 0, baseAsOf: null, isComplete: false });
  assert.equal(c.rate, null, `rate should be null when base is 0, got ${c.rate}`);
  assert.equal(c.remaining, 0);

  // Current-draw early: 106 of 3880 → 2.7%, large remaining, not complete.
  const d = summarizeRenewalProgress({ base: 3880, renewed: 106, baseAsOf: "2026-05-27", isComplete: false });
  assert.equal(d.rate, 2.7, `rate should be 2.7, got ${d.rate}`);
  assert.equal(d.remaining, 3774);
  assert.equal(d.isComplete, false);

  console.log("✅ renewalProgress helper tests passed");
}

run();
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx src/utils/admin/__tests__/renewalProgress.test.ts`
Expected: FAIL — `Cannot find module '@/utils/admin/renewalProgress'`.

- [ ] **Step 4: Implement the helper**

Create `src/utils/admin/renewalProgress.ts`:

```ts
import type { RenewalProgress } from "@/types/admin/membershipAnalytics";

/**
 * Turn raw base/renewed counts into a display-ready renewal-progress block.
 * - rate is renewed/base as a 0–100 percentage (1 decimal place), capped at 100,
 *   and null when base is 0 (no snapshot / empty period).
 * - renewed is clamped to base when base is known, so the rate can never exceed 100%.
 */
export function summarizeRenewalProgress(input: {
  base: number;
  renewed: number;
  baseAsOf: string | null;
  isComplete: boolean;
}): RenewalProgress {
  const base = Math.max(0, Math.round(input.base));
  const renewedRaw = Math.max(0, Math.round(input.renewed));
  const renewed = base > 0 ? Math.min(renewedRaw, base) : renewedRaw;
  const rate = base > 0 ? Math.min(100, Math.round((renewed / base) * 1000) / 10) : null;
  const remaining = base > 0 ? Math.max(0, base - renewed) : 0;
  return { base, renewed, rate, remaining, baseAsOf: input.baseAsOf, isComplete: input.isComplete };
}
```

- [ ] **Step 5: Add the npm test script**

In `package.json`, add next to the other `test:*` entries:

```json
    "test:renewal-progress": "tsx src/utils/admin/__tests__/renewalProgress.test.ts",
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:renewal-progress`
Expected: PASS — prints `✅ renewalProgress helper tests passed`.

- [ ] **Step 7: Commit** (requires commit authorization — see header)

```bash
git add src/utils/admin/renewalProgress.ts src/utils/admin/__tests__/renewalProgress.test.ts src/types/admin/membershipAnalytics.ts package.json
git commit -m "feat(admin): add renewal-progress rate helper + type"
```

---

### Task 2: Snapshot base reader in the service

**Files:**
- Modify: `src/services/admin/MembershipAnalyticsService.ts`

- [ ] **Step 1: Add a private base reader method**

In `src/services/admin/MembershipAnalyticsService.ts`, add this method to the `MembershipAnalyticsService` class (e.g. just above `getMembershipByPackageSnapshot`). It sums `activeCount + pastDueCount` across the subscription packages for the period's first day, falling back to the nearest later snapshot day when the exact day was not yet snapshotted (the Apr 28→Apr 29 case):

```ts
  /**
   * Renewal base = active + past-due members as of `firstDay` (AEST), from the daily
   * snapshot. Falls back to the nearest later snapshot day if the exact day has no row.
   */
  private async getRenewalBaseAsOf(firstDay: Date): Promise<{ base: number; baseAsOf: string | null }> {
    const requestedKey = formatInTimeZone(firstDay, "Australia/Sydney", "yyyy-MM-dd");
    const select = "activeCount pastDueCount";
    let rows = await MembershipDailySnapshot.find({
      date: requestedKey,
      packageId: { $in: [...SUBSCRIPTION_PACKAGE_IDS] },
    })
      .select(select)
      .lean();
    let usedKey = requestedKey;

    if (rows.length === 0) {
      const nearest = await MembershipDailySnapshot.findOne({
        date: { $gte: requestedKey },
        packageId: { $in: [...SUBSCRIPTION_PACKAGE_IDS] },
      })
        .sort({ date: 1 })
        .select("date")
        .lean();
      if (nearest?.date) {
        usedKey = nearest.date;
        rows = await MembershipDailySnapshot.find({
          date: usedKey,
          packageId: { $in: [...SUBSCRIPTION_PACKAGE_IDS] },
        })
          .select(select)
          .lean();
      }
    }

    if (rows.length === 0) return { base: 0, baseAsOf: null };
    const base = rows.reduce((sum, r) => sum + (r.activeCount ?? 0) + (r.pastDueCount ?? 0), 0);
    return { base, baseAsOf: usedKey };
  }
```

(`formatInTimeZone`, `MembershipDailySnapshot`, and `SUBSCRIPTION_PACKAGE_IDS` are already imported at the top of this file — confirm and do not re-import.)

- [ ] **Step 2: Type-check (no test — DB method, covered by Task 1 helper + manual prod check)**

Run: `npm run type-check`
Expected: PASS (no errors).

- [ ] **Step 3: Commit** (requires authorization)

```bash
git add src/services/admin/MembershipAnalyticsService.ts
git commit -m "feat(admin): add snapshot renewal-base reader"
```

---

### Task 3: Populate `renewalProgress` in `getAnalyticsBundle`

**Files:**
- Modify: `src/services/admin/MembershipAnalyticsService.ts`

- [ ] **Step 1: Import the helper**

At the top of `src/services/admin/MembershipAnalyticsService.ts`, add:

```ts
import { summarizeRenewalProgress } from "@/utils/admin/renewalProgress";
```

- [ ] **Step 2: Compute and return `renewalProgress`**

In `getAnalyticsBundle`, find the `return { ... }` object that currently ends with `cancelledMembershipRevenueImpact,` (around line 142–150). Immediately BEFORE that `return`, insert:

```ts
    // Draw-aligned renewal progress (only meaningful for the monthly draw cohorts).
    let renewalProgress: ReturnType<typeof summarizeRenewalProgress> | undefined;
    if (dateRange === "current-draw" || dateRange === "last-draw") {
      const { base, baseAsOf } = await this.getRenewalBaseAsOf(startDate);
      renewalProgress = summarizeRenewalProgress({
        base,
        renewed: successfulRenewalUserCount,
        baseAsOf,
        isComplete: dateRange === "last-draw",
      });
    }
```

Then add `renewalProgress,` to the returned object (it is `undefined` for non-draw ranges, which is fine — the field is optional):

```ts
    return {
      expectedRenewalsInRange,
      successfulRenewalsInRange,
      successfulRenewalUserCount,
      failedRenewalInvoicesInRange,
      becamePastDueInRange: becamePastDueIds.length,
      cancellationsInRange: cancellationRows.length,
      cancelledMembershipRevenueImpact,
      renewalProgress,
    };
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Validate the live computation matches the reference script**

Run: `npm run find:renewal-rate -- --last-draw`
Expected: prints `RATE vs active+past-due base (3882) : 81.87%` (or current prod equivalent). This is the number the card must show for Last Draw. (The script is the source of truth; the service mirrors it.)

- [ ] **Step 5: Commit** (requires authorization)

```bash
git add src/services/admin/MembershipAnalyticsService.ts
git commit -m "feat(admin): compute renewalProgress in analytics bundle for draw ranges"
```

---

### Task 4: Surface `renewalProgress` in the stats route

**Files:**
- Modify: `src/app/api/admin/dashboard/stats/route.ts`

- [ ] **Step 1: Add to the response `users` block**

In `src/app/api/admin/dashboard/stats/route.ts`, find the `stats.users` object (around line 411–435). After the `cancellationImpact: { ... }` block and before the closing `}` of `users`, add:

```ts
        ...(membershipAnalytics.renewalProgress && {
          renewalProgress: membershipAnalytics.renewalProgress,
        }),
```

(The catch-block fallback object for `membershipAnalytics` has no `renewalProgress`, which is correct — the field stays absent on error, so the card hides.)

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit** (requires authorization)

```bash
git add src/app/api/admin/dashboard/stats/route.ts
git commit -m "feat(admin): expose renewalProgress on dashboard stats response"
```

---

### Task 5: Extend the client stats types

**Files:**
- Modify: `src/hooks/queries/useAdminQueries.ts`
- Modify: `src/app/admin/component/overview/KPIMetricsGrid.tsx`

- [ ] **Step 1: Extend the shared `AdminDashboardStats.users` type**

In `src/hooks/queries/useAdminQueries.ts`, inside `interface AdminDashboardStats` → the `users: { ... }` block (around line 72–95), add as a sibling to `cancellationImpact?`:

```ts
    renewalProgress?: {
      base: number;
      renewed: number;
      rate: number | null;
      remaining: number;
      baseAsOf: string | null;
      isComplete: boolean;
    };
```

- [ ] **Step 2: Extend the local `DashboardStats.users` type in the grid**

`KPIMetricsGrid.tsx` declares its OWN `DashboardStats` interface (around line 21–48) that types the `dashboardStats` prop. In its `users: { ... }` block, add the identical field:

```ts
    renewalProgress?: {
      base: number;
      renewed: number;
      rate: number | null;
      remaining: number;
      baseAsOf: string | null;
      isComplete: boolean;
    };
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit** (requires authorization)

```bash
git add src/hooks/queries/useAdminQueries.ts src/app/admin/component/overview/KPIMetricsGrid.tsx
git commit -m "feat(admin): add renewalProgress to dashboard stats types"
```

---

### Task 6: Render the Renewal Rate card

**Files:**
- Modify: `src/app/admin/component/overview/KPIMetricsGrid.tsx`

- [ ] **Step 1: Ensure the icon import**

`KPIMetricsGrid.tsx` imports icons from `lucide-react`. Add `RefreshCw` to that import if not already present (it matches the renewal/refresh motif used by the Revenue Breakdown renewal tile):

```ts
import { /* …existing icons…, */ RefreshCw } from "lucide-react";
```

- [ ] **Step 2: Add the card in the "Users & Performance" grid**

Find the "Users & Performance" group grid (`<div className="grid grid-cols-2 lg:grid-cols-4 ...">`, around line 355) that contains the Cancellations card (around line 408–434). Add this card as a sibling inside that grid, immediately after the Cancellations `</MetricCard>` (or its closing element). It renders ONLY when the backend supplied `renewalProgress` (i.e. current-draw / last-draw):

```tsx
{dashboardStats?.users?.renewalProgress && (
  <MetricCard
    title="Renewal Rate"
    value={
      dashboardStats.users.renewalProgress.rate != null
        ? `${dashboardStats.users.renewalProgress.rate}%`
        : "—"
    }
    icon={RefreshCw}
    color="emerald"
    subtitle={
      <span className="text-2xs sm:text-xs text-gray-500">
        {dashboardStats.users.renewalProgress.renewed.toLocaleString("en-AU")} of{" "}
        {dashboardStats.users.renewalProgress.base.toLocaleString("en-AU")} renewed
        {dashboardStats.users.renewalProgress.remaining > 0 && (
          <>
            {" · "}
            {dashboardStats.users.renewalProgress.remaining.toLocaleString("en-AU")}{" "}
            {dashboardStats.users.renewalProgress.isComplete ? "did not renew" : "expected"}
          </>
        )}
        {dashboardStats.users.renewalProgress.baseAsOf && (
          <span className="block text-gray-600">
            base as of {dashboardStats.users.renewalProgress.baseAsOf}
          </span>
        )}
      </span>
    }
    loading={false}
  />
)}
```

NOTE on `loading`: mirror the sibling cards in this same grid — if the Cancellations `MetricCard` uses a `loading={statsLoading}`-style prop, use that exact variable here instead of `loading={false}`. Match the neighbour; do not invent a new loading flag.

- [ ] **Step 3: Lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 4: Visual check in the running app**

Run the app (`npm run dev`), open the admin dashboard overview, select **Last Draw** → a "Renewal Rate" card appears reading ~`81.9%` with subtitle `3,178 of 3,882 renewed · 704 did not renew · base as of 2026-04-29`. Select **Current Draw** → card shows the in-progress %, subtitle `… expected`. Select **Today** / **All Time** → card is absent.

- [ ] **Step 5: Commit** (requires authorization)

```bash
git add src/app/admin/component/overview/KPIMetricsGrid.tsx
git commit -m "feat(admin): render Renewal Rate KPI card on draw filters"
```

---

### Task 7: Docs (doc-sync hook requirement)

**Files:**
- Modify: a doc under `docs/admin/` (the domain covering `src/services/admin/**`, `src/app/admin/**`, `src/app/api/admin/**`, `src/utils/admin/**`)
- Modify: a doc under `docs/client-state/` (covers `src/hooks/queries/**`)

- [ ] **Step 1: Document the metric in `docs/admin/`**

Add a short section to the relevant admin analytics doc (e.g. `docs/admin/metrics-analytics.md` or the overview doc — pick the file that already documents the dashboard stats) describing: Renewal Rate = renewed (`successfulRenewalUserCount`) ÷ (active + past-due at the period's first day, from `MembershipDailySnapshot`); shown only for current-draw/last-draw; capped ≤100%; remaining labeled "expected" (open) / "did not renew" (complete). Link the spec `docs/superpowers/specs/2026-05-29-renewal-rate-metric-design.md` and the reference script `scripts/find-renewal-rate.ts`.

- [ ] **Step 2: Note the new field in `docs/client-state/`**

In the doc covering the admin query hooks, note that `AdminDashboardStats.users.renewalProgress` is optional and only present for draw ranges.

- [ ] **Step 3: Run the doc-sync audit**

Run: `npm run doc-sync` (or trigger the Stop hook by finishing). Expected: no `BLOCKED: Stale docs` for the touched domains.

- [ ] **Step 4: Commit** (requires authorization)

```bash
git add docs/admin/ docs/client-state/
git commit -m "docs(admin): document Renewal Rate metric"
```

---

### Task 8: Definition of done

- [ ] **Step 1: Full verification pass**

```bash
npm run test:renewal-progress
npm run lint
npm run type-check
npm run find:renewal-rate -- --last-draw
```
Expected: helper test passes; lint/type-check clean; script prints the Last Draw rate matching the card.

- [ ] **Step 2: Confirm hidden on non-draw filters** — Today/Yesterday/All Time show no Renewal Rate card; Current Draw and Last Draw show it.

---

## Self-review notes (author)

- **Spec coverage:** base = active+past-due first day (Task 2) ✓; numerator = succeeded distinct members (Task 3, reuses `successfulRenewalUserCount`) ✓; cap ≤100% (Task 1) ✓; per-filter visibility current/last draw only (Task 3 gate + Task 6 render guard) ✓; snapshot-missing fallback to nearest day (Task 2) ✓; "expected" vs "did not renew" via `isComplete` (Task 6) ✓; out-of-scope items (recovered status, backfill, MRR-weight, per-package) untouched ✓.
- **Dropped from spec deliberately (lean):** "Last 30 Days" filter (not a real toggle option) and the Statuses-card "as-of-first-day" repurpose (the new card carries its own base instead). Both noted to the user.
- **Type consistency:** `renewalProgress` shape is identical in `RenewalProgress` (Task 1), `AdminDashboardStats.users` (Task 5.1), and `KPIMetricsGrid` local `DashboardStats.users` (Task 5.2) — base/renewed/rate/remaining/baseAsOf/isComplete.
- **Known-unknown:** the exact `loading` variable name in `KPIMetricsGrid`'s Users grid — Task 6.2 instructs mirroring the sibling Cancellations card rather than guessing.
