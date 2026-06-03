# Renewal Rate redesign + overview polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo rule — NO COMMITS:** A `no-auto-commit` hook blocks `git commit`. The user authorized *implementation* ("implement subagent driven"), NOT commits. Implementers must NOT run `git add`/`git commit`/`git push`. Leave changes in the working tree; the controller holds all commits until the user types `commit`/`ship it`. Skip every "Commit" step.

**Goal:** Redesign the admin Renewal Rate KPI card (cycle-anchored headline + filter-driven slice), rename Membership Revenue → MRR, add a user count to Upcoming Renewals, move Advertising above Revenue Breakdown, and shrink KPI cards on mobile.

**Architecture:** Backend makes `renewalProgress` always-on and anchored to the *current billing cycle* (day after the last completed draw → now), independent of the selected date filter. The card's headline reads that; a second "slice" line reuses the existing per-range `membershipRenewals` metrics. UI changes are confined to `KpiGrid.tsx`, `MetricCard.tsx`, `UpcomingRenewalsCard.tsx`, and the section order in `DashboardOverview.tsx`.

**Tech Stack:** Next.js 15, MongoDB/Mongoose, TanStack Query, React, Tailwind, tsx scripts.

**Spec:** `docs/superpowers/specs/2026-06-02-renewal-rate-card-and-overview-polish-design.md`. Validation oracle: `scripts/find-renewal-rate.ts`.

---

## File structure

- `src/components/admin/ui/MetricCard.tsx` — shared KPI tile. Add optional `valueAside`; shrink mobile sizing. (Task 1)
- `src/services/admin/MembershipAnalyticsService.ts` — add `getCurrentCycleRenewalProgress()`; make `renewalProgress` always-on. (Task 2)
- `scripts/find-renewal-rate.ts` — add a `--current-cycle` oracle mode mirroring the new service method. (Task 2)
- `src/app/admin/component/overview/sections/KpiGrid.tsx` — rewrite Renewal Rate tile (headline + slice); rename Membership Revenue → MRR. (Task 3)
- `src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx` — show user count. (Task 4)
- `src/app/admin/component/overview/DashboardOverview.tsx` — reorder sections. (Task 5)
- `docs/admin/*`, `docs/infrastructure/patterns.md` — doc-sync. (Task 6)

No client-type change needed: `AdminDashboardStats.users.renewalProgress` and `.membershipRenewals.{succeededDistinctMembers,becamePastDueInRange}` already exist (`useAdminQueries.ts:85-102`).

---

### Task 1: MetricCard — mobile sizing + optional `valueAside`

**Files:**
- Modify: `src/components/admin/ui/MetricCard.tsx`

- [ ] **Step 1: Add the `valueAside` prop to the signature**

In `src/components/admin/ui/MetricCard.tsx`, the function currently destructures:
```tsx
export function MetricCard({
  title, value, sub, icon: Icon, tone = "red", trend, invert = false, onClick, active = false, loading = false,
}: {
  title: string; value: string; sub?: string; icon: ElementType; tone?: Tone;
  trend?: number | null; invert?: boolean; onClick?: () => void; active?: boolean; loading?: boolean;
}) {
```
Replace with (adds `valueAside`):
```tsx
export function MetricCard({
  title, value, valueAside, sub, icon: Icon, tone = "red", trend, invert = false, onClick, active = false, loading = false,
}: {
  title: string; value: string; valueAside?: string; sub?: string; icon: ElementType; tone?: Tone;
  trend?: number | null; invert?: boolean; onClick?: () => void; active?: boolean; loading?: boolean;
}) {
```

- [ ] **Step 2: Shrink the icon container + glyph (mobile only)**

Replace this block:
```tsx
        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
        </div>
```
with:
```tsx
        <div className={`shrink-0 w-7 h-7 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
          <Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={2} />
        </div>
```

- [ ] **Step 3: Shrink the card padding (mobile only)**

In the root `<button>` className string, change `p-4 sm:p-[18px]` to `p-3 sm:p-[18px]`. The full current className starts:
```tsx
      className={`group relative text-left w-full rounded-2xl border bg-white dark:bg-neutral-900 transition-all p-4 sm:p-[18px] ${
```
Change only `p-4` → `p-3` (leave the rest identical).

- [ ] **Step 4: Shrink the value text (mobile) + render `valueAside` inline**

Replace this block:
```tsx
          <div className="mt-1">
            <p className="font-display font-extrabold text-2xl sm:text-[27px] leading-none text-neutral-900 dark:text-white num whitespace-nowrap">{value}</p>
          </div>
```
with:
```tsx
          <div className="mt-1 flex items-baseline gap-1.5 min-w-0">
            <p className="font-display font-extrabold text-lg sm:text-[27px] leading-none text-neutral-900 dark:text-white num whitespace-nowrap">{value}</p>
            {valueAside && (
              <span className="text-2xs sm:text-xs font-semibold text-neutral-400 dark:text-neutral-500 num truncate">{valueAside}</span>
            )}
          </div>
```

- [ ] **Step 5: Type-check + lint**

Run: `npm run type-check` → no NEW errors in `MetricCard.tsx` (pre-existing `.webp` errors in unrelated files are OK).
Run: `npx eslint src/components/admin/ui/MetricCard.tsx` → exit 0.

- [ ] **Step 6: Self-review** — confirm desktop (`sm:`) sizing is byte-for-byte unchanged (only mobile defaults reduced), and `valueAside` is optional (existing call sites unaffected).

---

### Task 2: Backend — cycle-anchored `renewalProgress` + script oracle

**Files:**
- Modify: `src/services/admin/MembershipAnalyticsService.ts`
- Modify: `scripts/find-renewal-rate.ts`

- [ ] **Step 1: Add imports to the service**

In `src/services/admin/MembershipAnalyticsService.ts`, the imports already include `formatInTimeZone`, `MembershipDailySnapshot`, `MembershipRenewalCycle`, `summarizeRenewalProgress`. Add two more at the top (after the existing model imports):
```tsx
import MajorDraw from "@/models/MajorDraw";
import { aestDayBounds } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";
```

- [ ] **Step 2: Add the `getCurrentCycleRenewalProgress` method**

In the `MembershipAnalyticsService` class, add this method directly above the existing `private async getRenewalBaseAsOf(` method:
```tsx
  /**
   * Current-cycle renewal progress, independent of the dashboard's selected date range.
   * Cycle = day after the last completed draw closed (AEST) → now. Headline of the
   * Renewal Rate card. Numerator = distinct members whose renewal payment landed in the
   * cycle; denominator = active + past-due at cycle start (snapshot). Capped <=100%.
   */
  private async getCurrentCycleRenewalProgress(): Promise<ReturnType<typeof summarizeRenewalProgress>> {
    const lastDraw = await MajorDraw.findOne({ status: "completed" })
      .sort({ drawDate: -1 })
      .select("drawDate")
      .lean<{ drawDate?: Date }>();
    if (!lastDraw?.drawDate) {
      return summarizeRenewalProgress({ base: 0, renewed: 0, baseAsOf: null, isComplete: false });
    }
    const lastDrawKey = formatInTimeZone(lastDraw.drawDate, "Australia/Sydney", "yyyy-MM-dd");
    // dayEndUTC of the draw's close day = midnight AEST of the NEXT day = cycle start (DST-safe).
    const cycleStart = aestDayBounds(lastDrawKey).dayEndUTC;
    const now = new Date();

    const { base, baseAsOf } = await this.getRenewalBaseAsOf(cycleStart);

    const renewedRows = await MembershipRenewalCycle.find({
      billingReason: "subscription_cycle",
      status: { $in: ["succeeded", "recovered"] },
      succeededAt: { $gte: cycleStart, $lt: now },
    })
      .select("userId")
      .lean<Array<{ userId: { toString(): string } }>>();
    const renewed = new Set(renewedRows.map((r) => String(r.userId))).size;

    return summarizeRenewalProgress({ base, renewed, baseAsOf, isComplete: false });
  }
```

- [ ] **Step 3: Make `renewalProgress` always-on in `getAnalyticsBundle`**

Find this block (currently ~line 153-163):
```tsx
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
Replace it entirely with:
```tsx
    // Renewal Rate headline: always the CURRENT billing cycle, independent of the
    // selected date range. (The card's per-range "slice" uses the range-scoped
    // successfulRenewalUserCount / becamePastDueInRange already on this bundle.)
    const renewalProgress = await this.getCurrentCycleRenewalProgress();
```
The `return { ... renewalProgress }` line already includes `renewalProgress` — leave it. (`successfulRenewalUserCount`, `startDate`, `dateRange` remain used elsewhere; do not remove them.)

- [ ] **Step 4: Type-check**

Run: `npm run type-check` → no NEW errors in `MembershipAnalyticsService.ts`.

- [ ] **Step 5: Add a `--current-cycle` oracle mode to the validation script**

In `scripts/find-renewal-rate.ts`, find the `main()` dispatch where other modes are handled (it checks `process.argv.includes("--coverage")`, `--draw`, `--last-draw`). Add a new branch BEFORE the default range logic, mirroring the existing `--last-draw` block's structure:
```ts
  if (process.argv.includes("--current-cycle")) {
    await currentCycleReport();
    await mongoose.disconnect();
    return;
  }
```
Then add this function near `lastDrawReport` (reuses the same helpers/imports already in the file — `MajorDraw`, `aestDayBounds`, `MembershipDailySnapshot`, `MembershipRenewalCycle`, `formatInTimeZone`, `pct`, `AEST`, `SUBSCRIPTION_PACKAGE_IDS`):
```ts
/** Oracle for MembershipAnalyticsService.getCurrentCycleRenewalProgress(). */
async function currentCycleReport() {
  // NOTE: this script declares SUBSCRIPTION_PACKAGE_IDS as a LOCAL const inside each
  // report fn (not module-scoped), so declare it here too, matching the sibling pattern.
  const SUBSCRIPTION_PACKAGE_IDS = ["tradie-subscription", "foreman-subscription", "boss-subscription"];
  const lastDraw = await MajorDraw.findOne({ status: "completed" }).sort({ drawDate: -1 }).select("drawDate name").lean<{ drawDate?: Date; name?: string }>();
  if (!lastDraw?.drawDate) { console.log("No completed draw."); return; }
  const lastDrawKey = formatInTimeZone(lastDraw.drawDate, AEST, "yyyy-MM-dd");
  const cycleStart = aestDayBounds(lastDrawKey).dayEndUTC;
  const now = new Date();

  // Base = active + past-due at cycle start (nearest-later-day fallback), like the service.
  const cycleStartKey = formatInTimeZone(cycleStart, AEST, "yyyy-MM-dd");
  let baseSnaps = await MembershipDailySnapshot.find({ date: cycleStartKey, packageId: { $in: SUBSCRIPTION_PACKAGE_IDS } }).select("activeCount pastDueCount").lean<Array<{ activeCount: number; pastDueCount: number }>>();
  let baseDateUsed = cycleStartKey;
  if (baseSnaps.length === 0) {
    const nearest = await MembershipDailySnapshot.findOne({ date: { $gte: cycleStartKey }, packageId: { $in: SUBSCRIPTION_PACKAGE_IDS } }).sort({ date: 1 }).select("date").lean<{ date?: string }>();
    if (nearest?.date) {
      baseDateUsed = nearest.date;
      baseSnaps = await MembershipDailySnapshot.find({ date: nearest.date, packageId: { $in: SUBSCRIPTION_PACKAGE_IDS } }).select("activeCount pastDueCount").lean<Array<{ activeCount: number; pastDueCount: number }>>();
    }
  }
  const base = baseSnaps.reduce((s, r) => s + (r.activeCount ?? 0) + (r.pastDueCount ?? 0), 0);

  const paid = await MembershipRenewalCycle.find({ billingReason: "subscription_cycle", status: { $in: ["succeeded", "recovered"] }, succeededAt: { $gte: cycleStart, $lt: now } }).select("userId").lean<Array<{ userId: { toString(): string } }>>();
  const renewed = new Set(paid.map((c) => String(c.userId))).size;

  console.log("=".repeat(72));
  console.log(`CURRENT CYCLE RENEWAL PROGRESS — base after "${lastDraw.name ?? "?"}"`);
  console.log(`Cycle start (AEST) : ${cycleStartKey}   base snapshot used: ${baseDateUsed}`);
  console.log(`Base (active+pastdue): ${base}`);
  console.log(`Renewed so far      : ${renewed}`);
  console.log(`RATE                : ${pct(renewed, base)}   [${renewed}/${base}]`);
  console.log("=".repeat(72));
}
```
(If `MajorDraw` or `aestDayBounds` are not yet imported in the script, add `import MajorDraw from "@/models/MajorDraw";` and `import { aestDayBounds } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";` — check the existing import block first; `--last-draw`/`--draw` already use them, so they are present.)

- [ ] **Step 6: Run the oracle against prod**

Run: `npm run find:renewal-rate -- --current-cycle`
Expected: prints a sane current-cycle line — base ≈ current active+past-due (~3,800-3,900), renewed = a small number this early in June (June has ~104 succeeded cycles per coverage), rate = renewed/base. Confirms the service method's exact logic. Record the printed `[renewed/base]` — that is what the card headline must show.

- [ ] **Step 7: Self-review** — confirm the service method and the script oracle use identical window math (`aestDayBounds(lastDrawKey).dayEndUTC`), identical base query (active+pastdue + nearest-day fallback), and identical numerator (distinct `userId`, `succeededAt` in `[cycleStart, now)`).

---

### Task 3: KpiGrid — Renewal Rate card (headline + slice) + MRR relabel

**Files:**
- Modify: `src/app/admin/component/overview/sections/KpiGrid.tsx`

- [ ] **Step 1: Replace the renewal computation block**

In `src/app/admin/component/overview/sections/KpiGrid.tsx`, replace this block (currently ~line 208-228):
```tsx
  // ---- Renewal Rate (always shown — today's progressive rate of total expected) ----
  // Prefer renewalProgress (renewed / base for the cycle); fall back to the period
  // renewal counts so the tile always renders a meaningful "% renewed so far".
  const rp = users?.renewalProgress;
  const mr = users?.membershipRenewals;
  const renewalRate: number | null =
    rp?.rate != null
      ? rp.rate
      : mr && mr.expectedInRange > 0
        ? (mr.succeededInRange / mr.expectedInRange) * 100
        : null;
  const renewalRenewed = rp?.renewed ?? mr?.succeededInRange ?? 0;
  const renewalBase = rp?.base ?? mr?.expectedInRange ?? 0;
  const renewalSub =
    renewalBase > 0
      ? `${renewalRenewed.toLocaleString("en-AU")} of ${renewalBase.toLocaleString("en-AU")} renewed${
          rp?.remaining && rp.remaining > 0
            ? ` · ${rp.remaining.toLocaleString("en-AU")} ${rp.isComplete ? "did not renew" : "expected"}`
            : ""
        }`
      : "No renewals expected this period";
```
with:
```tsx
  // ---- Renewal Rate ----
  // Headline = current billing-cycle progress (renewed / base), always cycle-anchored
  // regardless of the selected filter. Slice = renewed vs past-due for the SELECTED range.
  const rp = users?.renewalProgress;
  const mr = users?.membershipRenewals;
  const renewalRate: number | null = rp?.rate ?? null;
  const renewalCountAside =
    rp && rp.base > 0
      ? `${rp.renewed.toLocaleString("en-AU")}/${rp.base.toLocaleString("en-AU")} renewed`
      : undefined;
  const renewalSliceLabel =
    dateRange === "today"
      ? "Today"
      : dateRange === "yesterday"
        ? "Yesterday"
        : dateRange === "current-draw"
          ? "Current draw"
          : dateRange === "last-draw"
            ? "Last draw"
            : dateRange === "all-time"
              ? "All-time"
              : "Range";
  const renewalSub = `${renewalSliceLabel}: ${(mr?.succeededDistinctMembers ?? 0).toLocaleString("en-AU")} renewed · ${(mr?.becamePastDueInRange ?? 0).toLocaleString("en-AU")} past due`;
```

- [ ] **Step 2: Update the Renewal Rate MetricCard render**

Replace this block (currently ~line 331-338):
```tsx
          <MetricCard
            title="Renewal Rate"
            value={renewalRate != null ? `${renewalRate.toFixed(1)}%` : "—"}
            sub={renewalSub}
            icon={RefreshCw}
            tone="emerald"
            loading={showStatsSkeleton}
          />
```
with:
```tsx
          <MetricCard
            title="Renewal Rate"
            value={renewalRate != null ? `${renewalRate.toFixed(1)}%` : "—"}
            valueAside={renewalCountAside}
            sub={renewalSub}
            icon={RefreshCw}
            tone="emerald"
            loading={showStatsSkeleton}
          />
```

- [ ] **Step 3: Rename Membership Revenue → MRR**

In the Revenue group, find the Membership Revenue tile (currently ~line 248-256):
```tsx
          <KpiCard
            title="Membership Revenue"
            value={moneyWhole(Math.round(summary?.totalActiveRevenue ?? 0))}
```
Change `title="Membership Revenue"` to `title="MRR"`. Leave everything else (value, sub, breakdown) unchanged.

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check` → no NEW errors in `KpiGrid.tsx`.
Run: `npx eslint src/app/admin/component/overview/sections/KpiGrid.tsx` → exit 0. (If lint flags an unused var because `mr` fields changed, ensure no leftover references to `mr.expectedInRange`/`mr.succeededInRange` remain — they were removed in Step 1.)

- [ ] **Step 5: Self-review** — confirm: headline uses ONLY `rp` (no `mr` fallback); slice uses ONLY `mr.succeededDistinctMembers` + `mr.becamePastDueInRange`; "still expected" and standing past-due lines are gone.

---

### Task 4: Upcoming Renewals — show user count

**Files:**
- Modify: `src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx`

- [ ] **Step 1: Read the `total` field and add it to the subtitle**

In `src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx`, find:
```tsx
  const renewals = data?.renewals ?? [];
  const totalRevenue = data?.totalRevenue ?? 0;
  const rangeLabel = selectedRange === 0 ? "today" : "by the 27th";
```
Replace with:
```tsx
  const renewals = data?.renewals ?? [];
  const totalRevenue = data?.totalRevenue ?? 0;
  const totalMembers = data?.total ?? 0;
  const rangeLabel = selectedRange === 0 ? "today" : "by the 27th";
```
Then find the `SectionTitle` subtitle:
```tsx
        subtitle={`${formatCurrency(totalRevenue)} expected · ${rangeLabel}`}
```
Replace with:
```tsx
        subtitle={`${formatCurrency(totalRevenue)} · ${totalMembers.toLocaleString("en-AU")} members · ${rangeLabel}`}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check` → no NEW errors. (`UpcomingRenewalsData.total` already exists in the hook type, so no type change needed.)
Run: `npx eslint src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx` → exit 0.

- [ ] **Step 3: Self-review** — confirm `data?.total` is the field name in `UpcomingRenewalsData` (`useAdminQueries.ts` `{ renewals, total, page, limit, totalRevenue }`).

---

### Task 5: Layout reorder — Advertising above, Revenue Breakdown below

**Files:**
- Modify: `src/app/admin/component/overview/DashboardOverview.tsx`

- [ ] **Step 1: Move Advertising up; split the shared row**

In `src/app/admin/component/overview/DashboardOverview.tsx`, the current structure (lines ~203-237) is: `<KpiGrid/>` → charts row → a 2-col grid holding `<RevenueBreakdownCard/>` + `<AdvertisingPlatformCard/>`.

Replace this block:
```tsx
      {/* New KPI grid (redesign Phase 2) — replaces the old KPIMetricsGrid */}
      <KpiGrid
        stats={dashboardStats}
        membership={membershipByPackageData}
        dateRange={dateRange}
        statsLoading={statsLoading}
        membershipLoading={membershipLoading}
      />

      {/* Charts row (redesign Phase 3) — revenue area chart + membership donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
        <div className="lg:col-span-2 min-w-0">
          <RevenueChartCard />
        </div>
        <div className="lg:col-span-1 min-w-0">
          <MembershipCard
            data={membershipByPackageData}
            loading={membershipLoading}
            onUserClick={openUserModal}
          />
        </div>
      </div>

      {/* Revenue breakdown + advertising by platform (redesign Phase 4, row 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
        <RevenueBreakdownCard
          stats={dashboardStats}
          loading={statsLoading}
          dateRange={dateRange}
          startDate={customStartDate || undefined}
          endDate={customEndDate || undefined}
          onUserClick={openUserModal}
        />
        <AdvertisingPlatformCard stats={dashboardStats} loading={statsLoading} />
      </div>
```
with:
```tsx
      {/* New KPI grid (redesign Phase 2) — replaces the old KPIMetricsGrid */}
      <KpiGrid
        stats={dashboardStats}
        membership={membershipByPackageData}
        dateRange={dateRange}
        statsLoading={statsLoading}
        membershipLoading={membershipLoading}
      />

      {/* Advertising by platform — moved directly under the KPI grid */}
      <AdvertisingPlatformCard stats={dashboardStats} loading={statsLoading} />

      {/* Charts row (redesign Phase 3) — revenue area chart + membership donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
        <div className="lg:col-span-2 min-w-0">
          <RevenueChartCard />
        </div>
        <div className="lg:col-span-1 min-w-0">
          <MembershipCard
            data={membershipByPackageData}
            loading={membershipLoading}
            onUserClick={openUserModal}
          />
        </div>
      </div>

      {/* Revenue breakdown — full width, below the charts */}
      <RevenueBreakdownCard
        stats={dashboardStats}
        loading={statsLoading}
        dateRange={dateRange}
        startDate={customStartDate || undefined}
        endDate={customEndDate || undefined}
        onUserClick={openUserModal}
      />
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check` → no NEW errors in `DashboardOverview.tsx`.
Run: `npx eslint src/app/admin/component/overview/DashboardOverview.tsx` → exit 0.

- [ ] **Step 3: Self-review** — confirm new top-to-bottom order is: KpiGrid → Advertising → Charts → Revenue Breakdown → PrizePerformance → [TopDraws | UpcomingRenewals] → [Activity | QuickActions] → UsersBreakdown. Confirm `AdvertisingPlatformCard` and `RevenueBreakdownCard` are still imported (they are; only their position changed).

---

### Task 6: Docs + doc-sync

**Files:**
- Modify: `docs/admin/frontend.md`
- Modify: `docs/admin/backend.md`
- Modify: `docs/infrastructure/patterns.md`

- [ ] **Step 1: Update `docs/admin/frontend.md`**

In the section documenting the Renewal Rate card / KpiGrid, update to describe: the headline is the **current billing cycle** (renewed/base, cycle = day after last completed draw → now), **filter-independent**, shown as `{rate}% · {renewed}/{base} renewed` via `MetricCard`'s new `valueAside`. The sub-line is a **filter-driven slice**: `{rangeLabel}: {renewed} renewed · {pastDue} past due` from `membershipRenewals.succeededDistinctMembers` / `becamePastDueInRange`. Note Membership Revenue tile renamed to **MRR**, Upcoming Renewals now shows a member count, and `MetricCard` gained an optional `valueAside` + reduced mobile sizing.

- [ ] **Step 2: Update `docs/admin/backend.md`**

Update the `MembershipAnalyticsService` entry: `renewalProgress` is now **always populated** (every request) by `getCurrentCycleRenewalProgress()`, anchored to the current cycle (last completed `MajorDraw.drawDate` + 1 day, AEST, via `aestDayBounds`), independent of `dateRange`. Numerator = distinct `userId` from `MembershipRenewalCycle` (`succeeded`/`recovered`, `succeededAt` in cycle); denominator = `getRenewalBaseAsOf(cycleStart)` (active + past-due, nearest-day fallback). The per-range slice metrics (`succeededDistinctMembers`, `becamePastDueInRange`) are unchanged.

- [ ] **Step 3: Update `docs/infrastructure/patterns.md`**

In the `find:renewal-rate` entry, add the new `--current-cycle` mode (oracle for the card headline: current-cycle renewed/base) alongside the existing `--coverage` / `--draw` / `--last-draw` modes.

- [ ] **Step 4: Confirm doc-sync passes**

The doc-sync Stop hook maps changed files to domains: service + KpiGrid + MetricCard + UpcomingRenewalsCard + DashboardOverview → `admin` (docs updated in Steps 1-2); `scripts/find-renewal-rate.ts` → `infrastructure` (Step 3). Confirm `docs/admin/` and `docs/infrastructure/` were both touched so the hook does not block.

---

### Task 7: Definition of done

- [ ] **Step 1: Full verification pass**

```bash
npm run test:renewal-progress
npm run lint
npm run type-check
npm run find:renewal-rate -- --current-cycle
```
Expected: existing helper test passes; lint clean; type-check shows only the pre-existing `.webp` errors; the oracle prints the current-cycle rate the card should display.

- [ ] **Step 2: Visual check (`npm run dev`, admin overview)**
  - Renewal Rate card: headline `{rate}% {renewed}/{base} renewed`; sub-line changes with the date filter (`Today: X renewed · Y past due`, `Last draw: …`, etc.); headline % stays the same across filters.
  - MRR tile shows the former Membership Revenue value under the new label.
  - Upcoming Renewals shows `$… · N members · …`.
  - Section order: Advertising sits directly under the KPI grid; Revenue Breakdown is below the charts.
  - On a narrow viewport, KPI numbers/icons are visibly smaller and nothing overflows.

---

## Self-review (author)

**Spec coverage:** Renewal headline cycle-anchored + filter-independent (Task 2 service, Task 3 render) ✓; one-row `% · renewed/base` (Task 1 `valueAside`, Task 3) ✓; slice = renewed + past due, filter-driven label (Task 3) ✓; "still expected" + standing past-due removed (Task 3 Step 1 replaces the block) ✓; MRR relabel (Task 3 Step 3) ✓; Upcoming Renewals member count (Task 4) ✓; layout Advertising-up (Task 5) ✓; mobile KPI sizing (Task 1) ✓; docs (Task 6) ✓.

**Placeholder scan:** none — every code step shows full before/after.

**Type consistency:** `valueAside?: string` defined in Task 1, consumed in Task 3. Slice fields `succeededDistinctMembers` / `becamePastDueInRange` match `AdminDashboardStats.users.membershipRenewals` (`useAdminQueries.ts:88,90`). `renewalProgress` shape unchanged (still `RenewalProgress`); only its population timing changed, so no client-type edit needed. `UpcomingRenewalsData.total` already in the hook type.

**No-commit compliance:** every task ends at type-check/lint/self-review; no "Commit" steps; header forbids git mutations.

**Known latitude:** Task 5 renders Advertising + Revenue Breakdown full-width (per the approved layout option); if they look sparse, that's a follow-up tweak, not a correctness issue.
