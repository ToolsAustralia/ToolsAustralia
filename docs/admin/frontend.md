# Admin — Frontend

## Pages

- `src/app/admin/page.tsx` — entry
- `src/app/admin/layout.tsx` — admin layout (sidebar, header)
- `src/app/admin/[tab]/` — tabbed feature views
- `src/app/admin/component/` — likely subroute for component-driven views

## Components

[src/components/admin/](../../src/components/admin/):
- `UserDetailModal.tsx` — user detail / edit (Subscription tab is here, with Cancel button)
- `ChargePastDueModal.tsx` — bulk past-due retry
- `BlockedTransactionsManagement.tsx` — blocked-card / Stripe allowlist admin UI. Default decline-reason filter is `recoverable_only` (hides fraud signals + permanent-issue codes like `expired_card` / `incorrect_cvc`). Eligibility badges: auto-eligible / already-allowlisted / fraud-signal / permanent-issue / not-member. The "Allowlist with override" button bypasses every filter (records `manual_admin_override`). When the backing Stripe scan hits its 2000-PI safety cap (busy accounts on wide date ranges), an amber "Results may be incomplete" banner appears above the filters, citing the `scanned` count from the response. Service contract documented in [billing-stripe/architecture.md](../billing-stripe/architecture.md#service-inventory--allowlistservice); scan cap and timeout context in [billing-stripe/gotchas.md](../billing-stripe/gotchas.md#blocked-cards-route-paginates-every-pi).
- (other admin-specific components)

> _TODO: enumerate full component list._

## User Metrics view (Admin > Users) — refactored 2026-05-04

[src/components/admin/metrics/UserMetricsView.tsx](../../src/components/admin/metrics/UserMetricsView.tsx) is now **all-time only**. It calls `useUserMetrics()` with no arguments — there is no date filter, month selector, custom-date modal, comparison-mode toggle, or major-draw selector inside this view. The Chart vs Table view-mode toggle is preserved (persisted in `?metricsViewMode=`).

The view header has been reduced to just the right-aligned `ViewSwitcher`; the previous "User Metrics" / "All-time snapshot" title block has been removed. Stat cards (Total Users / Active Memberships / Total Revenue / Average Order Value) still render below the switcher.

`ViewSwitcher` ([src/components/admin/metrics/shared/ViewSwitcher.tsx](../../src/components/admin/metrics/shared/ViewSwitcher.tsx)) only exposes `"table" | "chart"` — the third `side-by-side` ("Compare") mode was removed; no callers used it.

### Chart mode

Renders three charts stacked vertically:
- [`MembershipPackageBreakdown.tsx`](../../src/components/admin/metrics/users/MembershipPackageBreakdown.tsx) — Recharts stacked bar chart (active / pastDue / cancelled per package), sorted by total descending. Counterpart to `MembershipPackageBreakdownTable` used in table mode.
- [`AgeBreakdown.tsx`](../../src/components/admin/metrics/users/AgeBreakdown.tsx) — Recharts grouped bar chart, chronological order. Two bars per group: **Users** (red) and **Purchased** (emerald). Receives both `data={aggregateData.ageGroup}` and `purchasedData={aggregateData.ageGroupPurchased}`. Tooltip shows users + percentage of total, purchased + conversion percentage.
- [`ProfessionBreakdown.tsx`](../../src/components/admin/metrics/users/ProfessionBreakdown.tsx) — bar cap is now **20** (lifted from 10). Safe because the service pre-buckets via `bucketUnmatched`, capping the dataset around 17 entries.

### Table mode

Renders three tables:
- [`MembershipPackageBreakdownTable.tsx`](../../src/components/admin/metrics/users/MembershipPackageBreakdownTable.tsx) — see column meanings below.
- [`AgeBreakdownTable.tsx`](../../src/components/admin/metrics/users/AgeBreakdownTable.tsx) — chronological row order with a totals row. Columns: `Age Group`, `Users`, **`Purchased`** (raw count), **`Conversion`** (purchased / users %), `% of Total`. Receives the same `purchasedData` prop as the chart.
- [`ProfessionBreakdownTable.tsx`](../../src/components/admin/metrics/users/ProfessionBreakdownTable.tsx) — sorted descending by count, includes a rank column.

### `MembershipPackageBreakdownTable` columns

One row per subscription-type membership package, plus a grand-total row. Columns: `Package`, `Total`, `Active`, `Past Due`, `Cancelled`, `Active %`, `Past Due %`.

| Column | Meaning |
|---|---|
| Active | Currently subscribed (paying / `subscription.status === "active"` and no scheduled cancel). |
| Past Due | Payment failure, no scheduled cancel — Stripe `subscription.status === "past_due"`. |
| Cancelled | Scheduled cancel-at-period-end **OR** legacy cancelled (cancelled-with-`endDate`). |

The classification ladder mirrors the flat `membershipStatus` aggregation in `UserMetricsService` (cancelled-with-`endDate` → `past_due` → `active` → legacy-cancelled), so per-package totals always reconcile with the standing `membershipStatus` rollup.

A synthetic **"Other / Unknown"** row appears only when a classified subscription's `packageId` doesn't match any known subscription package — typically legacy `ObjectId` values stored in the `Mixed`-typed field, deleted packages, or one-time `packageId`s in the subscription slot. The row stays hidden when its total is zero. If it appears with a non-zero count, it's a data-cleanup signal — but the per-package totals still reconcile with the flat `membershipStatus` rollup.

### Removed (this refactor) — components left on disk for potential reuse

The following components are **no longer referenced** by `UserMetricsView` but were not deleted: `SignupSourceChart.tsx`, `MembershipLifecycleChart.tsx`, `DailyUserMetricsTable.tsx`, `ComparisonModeToggle.tsx`, `MajorDrawSelector.tsx`, `MetricsDateFilter.tsx`, `CustomDateRangeModal.tsx`. If you reintroduce date-scoped or comparison views, prefer reviving these over rebuilding.

## UsersManagement header (Admin > Users) — 2026-05-04

[src/components/admin/UsersManagement.tsx](../../src/components/admin/UsersManagement.tsx) drives the Users / Metrics segmented control via URL param `?viewMode=users|metrics` and `handleViewModeChange()`. Header layout:

- **Desktop (`sm+`)** — keeps the existing `users | metrics` segmented pill toggle on the right.
- **Desktop (`sm+`)** — `KlaviyoSyncButton` is wrapped in `<div className="hidden sm:block">` so it only shows on tablet and up.
- **Mobile (`sm:hidden`)** — a new compact button replaces the Klaviyo sync button. It calls `handleViewModeChange(viewMode === "metrics" ? "users" : "metrics")` (toggle to the inverse) and renders a `Users` icon + "Users" label when currently in metrics, or a `BarChart3` icon + "Metrics" label otherwise.

`Charge Past Due` and `Export` buttons remain visible on both breakpoints.

## DashboardOverview — Users Breakdown section — 2026-05-04

[src/app/admin/component/overview/DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx) renders a new collapsible `UsersBreakdownSection` immediately after `KPIMetricsGrid` (i.e. underneath the "Users & Performance" group inside the grid) and before `RevenueOverview`.

- State: `isUsersBreakdownExpanded` — local `useState(false)`, toggled via the section's own chevron.
- Component: [src/app/admin/component/overview/UsersBreakdownSection.tsx](../../src/app/admin/component/overview/UsersBreakdownSection.tsx) — wraps a `DashboardSection` (`title="Users Breakdown"`, `subtitle="Age groups and professions across all users"`, `collapsible`).
- Data: calls `useUserMetrics({ enabled: isExpanded })` so the all-time aggregation only fetches when the section is opened.
- Body when loaded: `<AgeBreakdownTable data={data.ageGroup} purchasedData={data.ageGroupPurchased} />` followed by `<ProfessionBreakdownTable data={data.profession} />` — the same components used in the metrics tab's table mode.
- Loading shows a spinner row; when `data` is null after load, a "No breakdown data available." placeholder renders.

## Hooks

| Hook | Purpose |
|---|---|
| `useAdminMobileDateToolbarSlot()` | Admin-specific date toolbar mobile UX |
| (admin queries via `useAdminQueries.ts`) | TanStack Query hooks for admin data |

## Theme

Admin uses [AdminThemeContext](../theme/architecture.md#three-contexts) — separate from member theme.
