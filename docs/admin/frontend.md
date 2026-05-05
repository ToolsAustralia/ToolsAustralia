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
- `BlockedTransactionsManagement.tsx` — blocked-card / Stripe allowlist admin UI. Mongo-backed: reads via `useBlockedCards(filter)` (cursor-paginated against the persisted `BlockedTransaction` collection), so initial load is sub-100ms. Hook returns `{ rows, total, hasMore, isLoading, isFetching, isFetchingNextPage, fetchNextPage, refetch, error }`. The table card shows a "Showing X of Y" counter and a "Load more" button at the bottom (single instance for desktop + mobile, spinner when `isFetchingNextPage`). Query errors surface in an amber banner above the filters card. Default decline-reason filter is `recoverable_only` (hides fraud signals + permanent-issue codes like `expired_card` / `incorrect_cvc`). Eligibility badges: auto-eligible / already-allowlisted / fraud-signal / permanent-issue / not-member. The "Allowlist with override" button bypasses every filter (records `manual_admin_override`). The dataset uses the narrower `outcome.type === "blocked"` filter (matches Stripe Dashboard's "Blocked" pill). Service contract documented in [billing-stripe/architecture.md](../billing-stripe/architecture.md#service-inventory--allowlistservice). The Filters card shows a single **Date range** button instead of separate From/To `<input type="date">` fields — clicking it opens [`CustomDateRangeModal`](../../src/components/admin/CustomDateRangeModal.tsx) (the calendar picker shared with the rest of admin); on apply it sets `filter.dateFrom` / `filter.dateTo`. The button label uses `formatDateRangeLabel()` to render `Apr 5 – May 5, 2026` style ranges. The Filters grid is `lg:grid-cols-3` (date / member status / decline reason).
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

## Past-due charge history tab (`/admin/past-due-history`)

### Components

- [src/app/admin/component/PastDueChargeHistory.tsx](../../src/app/admin/component/PastDueChargeHistory.tsx) — top-level page component. UI mirrors the rest of admin: page-title row with a `DateRangeToggle` on desktop (portaled into `useAdminMobileDateToolbarSlot()` on mobile), four `MetricCard`s (Bulk runs / Invoices attempted / Succeeded / Revenue recovered) summarising the runs in the selected range, then two stacked card tables — **Bulk Runs** (from `GET /api/admin/charge-past-due/runs`) and **Manual Retries** (from `GET /api/admin/charge-past-due/manual-retries`) — both wrapped in the standard `bg-white dark:bg-neutral-900 rounded-xl shadow-sm border` shell with header row + count. Run/retry status badges use the same emerald/red/amber palette as `BlockedTransactionsManagement`. The "Custom Range" preset opens [`CustomDateRangeModal`](../../src/components/admin/CustomDateRangeModal.tsx); presets `today`/`yesterday`/`current-draw`/`last-draw`/`all-time` are wired the same way as `PromoAnalyticsManagement` (AEST timezone via `formatInTimeZone`, `getWebsiteLaunchDateUTC()` for `all-time`, draw dates from `useCurrentAndLastDrawDates`). Default range is **Last 30 days** (initial state: `dateRange: "custom"` with `startDate = subDays(today, 29)` and `endDate = today`). Clicking a bulk-run row opens `PastDueChargeHistoryDrawer`.
- [src/app/admin/component/PastDueChargeHistoryDrawer.tsx](../../src/app/admin/component/PastDueChargeHistoryDrawer.tsx) — slide-in drawer for a single run. Fetches `GET /api/admin/charge-past-due/runs/[runId]` via `useChargePastDueRunDetail` and displays a status-badged Summary card (started / finished / duration / admin / eligible / attempted / succeeded / failed / revenue) with a Skip-breakdown subsection, plus a Per-invoice attempts card-table. Uses the admin neutral palette (`dark:bg-neutral-900`, `dark:border-neutral-800`) and the same `RunStatusBadge` / `RetryStatusBadge` colours as the parent page.

Both components import `formatDurationMs` from [src/utils/admin/chargePastDueFormat.ts](../../src/utils/admin/chargePastDueFormat.ts) — a Mongoose-free pure formatter. Importing it from `services/admin/chargePastDueHistory.ts` would transitively pull `mongoose` into the client bundle and crash hydration on `mongoose.models[...]`.

### Hooks

Three TanStack Query hooks under `src/hooks/queries/admin/`:

| Hook | Endpoint | Shape |
|---|---|---|
| `useChargePastDueRuns(filter)` | `GET /api/admin/charge-past-due/runs` | `useInfiniteQuery` — offset paging, page size 50. Returns `{ runs, total, hasMore, isLoading, isFetching, isFetchingNextPage, isError, fetchNextPage }`. |
| `useChargePastDueRunDetail(runId)` | `GET /api/admin/charge-past-due/runs/[runId]` | `useQuery` — single run + all its `InvoiceChargeLog` rows. |
| `useChargePastDueManualRetries(filter)` | `GET /api/admin/charge-past-due/manual-retries` | `useInfiniteQuery` — offset paging, page size 50. Returns `{ rows, total, hasMore, isLoading, isFetching, isFetchingNextPage, isError, fetchNextPage }`. |

All three are admin-only. Query keys are prefixed `["admin", "charge-past-due", ...]`. The two `useInfiniteQuery` hooks key on the full `filter` object so changing date range (or any other filter field) resets paging from offset 0. `getNextPageParam` returns `loaded < total ? loaded : undefined`. The Bulk Runs and Manual Retries cards each render a "Load more" button at the bottom (matching `BlockedTransactionsManagement`'s pattern); the table header shows `Showing X of Y`. Summary `MetricCard`s aggregate across **loaded** pages only — clicking "Load more" updates them.

## Hooks

| Hook | Purpose |
|---|---|
| `useAdminMobileDateToolbarSlot()` | Admin-specific date toolbar mobile UX |
| (admin queries via `useAdminQueries.ts`) | TanStack Query hooks for admin data |

## Theme

Admin uses [AdminThemeContext](../theme/architecture.md#three-contexts) — separate from member theme.
