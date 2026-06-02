# Admin — Frontend

## Pages

- `src/app/admin/page.tsx` — entry. Auth guard uses `usePermissions().isStaff` (Task 12, 2026-05-20). The legacy `useEffect` redirect and `session.user?.role !== "admin"` early-return have been removed; the component now checks `isLoading` / `isStaff` directly and calls `router.push("/")` when not staff. The admin layout's server-side guard (Task 14) is the primary gating mechanism; this is belt-and-suspenders for the client render.
- `src/app/admin/layout.tsx` — admin layout (sidebar, header)
- `src/app/admin/[tab]/` — tabbed feature views
- `src/app/admin/component/` — likely subroute for component-driven views

## Components

[src/components/admin/](../../src/components/admin/):
- `UserDetailModal.tsx` — user detail / edit (Subscription tab is here, with Cancel button)
- `ChargePastDueModal.tsx` — bulk past-due retry
- `BlockedTransactionsManagement.tsx` — blocked-card / Stripe allowlist admin UI. Mongo-backed: reads via `useBlockedCards(filter)` (cursor-paginated against the persisted `BlockedTransaction` collection). Hook returns `{ rows, total, hasMore, isLoading, isFetching, isFetchingNextPage, fetchNextPage, refetch, error }`. The table card shows a "Showing X of Y" counter and a "Load more" button at the bottom. Query errors surface in an amber banner above the filters card. Eligibility badges: auto-eligible / already-allowlisted / fraud-signal / permanent-issue / not-member. The "Allowlist with override" button bypasses every filter (records `manual_admin_override`). The dataset uses the narrower `outcome.type === "blocked"` filter (matches Stripe Dashboard's "Blocked" pill). Service contract: [billing-stripe/architecture.md](../billing-stripe/architecture.md#service-inventory--allowlistservice).
  - **Filters (2026-05-07)**: date range matches `/admin/past-due-history` exactly — `DateRangeToggle` chips (Today / Yesterday / Current Draw / Last Draw / All Time / Custom) with `useAdminMobileDateToolbarSlot()` portaling on mobile, draw-aware presets via `useCurrentAndLastDrawDates()`, custom range via `CustomDateRangeModal` with `useMajorDrawsForDateRange()` highlighting. Plus an **email substring search** (debounced 300ms, server-side regex), an **eligibility multi-select** (auto-eligible / already-allowlisted / fraud-signal / permanent-issue / skipped — not member), and a **decline-code multi-select** grouped by Recoverable / Fraud signals / Permanent issues / Other (options from [src/utils/billing/declineCodeLabels.ts](../../src/utils/billing/declineCodeLabels.ts)).
  - **Metric cards**: Total blocked (current filters) · Auto-eligible · Skipped — filter · **Total on allowlist** (all-time, all active fingerprints, driven by `useAllowlistStats()` against `GET /api/admin/allowlist/stats`).
  - **Email column** is clickable via `ClickableUserDisplay` — opens the same `UserDetailModal` the users + past-due-history tabs use. `BlockedRow.userId` is resolved server-side in `listBlocked` (joins `User` by `stripeCustomerId` then `customerEmail`); guests render as plain text.
  - **Eligibility verdict** is computed by the shared mapper [src/utils/admin/blockedTransactionEligibility.ts](../../src/utils/admin/blockedTransactionEligibility.ts) so the post-join filter and the in-row badge can never disagree.
  - **MultiSelectFilter** popover component lives at [src/components/admin/MultiSelectFilter.tsx](../../src/components/admin/MultiSelectFilter.tsx) and powers both the eligibility and decline-code multi-selects.
- `PromoPurchaseEntriesPreview.tsx` — read-only preview table rendered inside `AdminPromoToggle`. Accepts a `PromoMultiplierSnapshot` (`{ membershipPackages, oneTimePackages, miniPackages }`) and renders three collapsible sections (Membership / One-Time + Additional / Mini) showing base → multiplied entry counts per package. The Mini section appends a note that mini upsells are immune to the multiplier. Data is computed purely from static package data via `src/utils/admin/promo-purchase-entries-preview.ts` — no API calls.
- (other admin-specific components)

> _TODO: enumerate full component list._

## Error Reports view (Admin > Error Reports) — 2026-05-11

[src/components/admin/ErrorReportsManagement.tsx](../../src/components/admin/ErrorReportsManagement.tsx) is the unified triage UI. Reports come from `GET /api/admin/error-reports` (see [error-reporting/api.md](../error-reporting/api.md) for query-param contract).

**Header** — page title + subtitle only. Action buttons (Show Analytics / CSV Page / JSON Page / Refresh) were removed 2026-05-11 — analytics view, CSV/JSON export, and manual refresh are intentionally unsupported here. The query refetches automatically on filter change and after bulk mutations.

**Triage cards (top row)** — Needs Attention / Critical Unresolved / New Last 24h / Repeated Errors / Affected Users. The first three are buttons that apply a triage filter (status/severity/dateRange) and show an `aria-pressed` active state with red ring when their linked filter is currently applied. Repeated Errors / Affected Users are non-interactive stat displays (they previously toggled the now-removed analytics view). Grid is `grid-cols-2 lg:grid-cols-3 xl:grid-cols-5` — pairs cleanly on mobile, three-up on tablet, five-up on wide.

**Filter bar (grouped 2026-05-11)** — full-width search input + mobile Filters toggle on top, then three labelled sections inside the collapsible:
- **Categorise** — `Status / Category / Severity / Source` dropdowns.
- **Where & who** — `User email / API endpoint / Page URL` text inputs (all debounced 350ms).
- **When** — `Start date / End date`.

The **API endpoint** input filters on `apiEndpoint` (the route that failed). The **Page URL** input filters on `route` OR `currentUrl` (the page the user was on). These are intentionally separate — see [error-reporting/gotchas.md#page-url-vs-api-endpoint](../error-reporting/gotchas.md#page-url-vs-api-endpoint). The "Clear All Filters" button appears below when any filter is active.

**Desktop table columns** — checkbox / Error (with secondary "Auto-logged · {pageUrl}" line) / Category / Severity / Status / User / API / Date / Actions (right-aligned). The API column shows `{httpMethod}` in a small chip + `apiEndpoint`; an em-dash placeholder renders when no API was involved. Page URL is rendered inline under the error message instead of in its own column to keep the table from growing too wide.

**Status column (list view, 2026-05-25)** — the "Status" column in the list table and mobile card row now shows the **HTTP status code** instead of the workflow-status badge (e.g. `HTTP 409`). The badge is color-coded: 5xx → red, 4xx → amber, none → `—` (desktop) / "No status" (mobile). The column header is plain (non-sortable). The **workflow status** (new / investigating / resolved / dismissed) is preserved in the detail modal and the Status filter — it has not been removed from the codebase.

**Mobile cards (sm:hidden)** — error message + auto-logged/timestamp metadata at top, badges row (severity / category / HTTP status), then a `<dl>` with explicit `User / API / Page` rows. Full-width red "View Investigation" CTA at the bottom with adequate touch target.

**Detail modal (ErrorReportDetailModal)** — slide-up bottom-sheet on mobile (`items-end` + `rounded-t-2xl`), centred dialog on `sm+`. The info section is a 4-up grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) of User / API / Page / Environment panels — split from the previous combined Route+API panel. Diagnostic "Copy Context" string includes both API and Page on separate lines.

**Long-content panels in the modal (Stack Trace + Console Logs / Notes)** must use `min-w-0` on the grid item, `overflow-x-hidden` (or `overflow: auto`) on the scroll container, and `whitespace-pre-wrap break-all` on the inner text. Without these, long JSON / URL payloads in `consoleErrors[].message` blow out the grid column and burst the modal on small screens.

**Note: `ErrorReportsAnalytics` component was deleted 2026-05-11.** The server still returns `analytics` in the response payload (the API contract is unchanged), but the client no longer consumes or renders it. If you reintroduce an analytics view, the data is already on the response — restore an `analytics` field on the `ErrorReportsResponse` type and render it.

## User Metrics view (Admin > Users) — refactored 2026-05-04

[src/components/admin/metrics/UserMetricsView.tsx](../../src/components/admin/metrics/UserMetricsView.tsx) is now **all-time only**. It calls `useUserMetrics()` with no arguments — there is no date filter, month selector, custom-date modal, comparison-mode toggle, or major-draw selector inside this view. The Chart vs Table view-mode toggle is preserved (persisted in `?metricsViewMode=`).

The view header has been reduced to just the right-aligned `ViewSwitcher`; the previous "User Metrics" / "All-time snapshot" title block has been removed. Stat cards (Total Users / Active Memberships / Total Revenue / Average Order Value) still render below the switcher.

`ViewSwitcher` ([src/components/admin/metrics/shared/ViewSwitcher.tsx](../../src/components/admin/metrics/shared/ViewSwitcher.tsx)) only exposes `"table" | "chart"` — the third `side-by-side` ("Compare") mode was removed; no callers used it.

### Chart mode

Renders four charts stacked vertically:
- [`MembershipPackageBreakdown.tsx`](../../src/components/admin/metrics/users/MembershipPackageBreakdown.tsx) — Recharts stacked bar chart (active / pastDue / cancelled per package), sorted by total descending. Counterpart to `MembershipPackageBreakdownTable` used in table mode.
- [`AgeBreakdown.tsx`](../../src/components/admin/metrics/users/AgeBreakdown.tsx) — Recharts bar chart, chronological order. Single **Users** series (red). The **"Unknown"** age bucket is split out and rendered as a small header note (count + % of all) instead of a bar, so the dominant unknown segment does not flatten the visible age cohorts.
- [`StateBreakdown.tsx`](../../src/components/admin/metrics/users/StateBreakdown.tsx) — Recharts single-series bar chart for AU state/territory codes, sorted descending by user count. The synthetic `"Unknown"` bucket (users with no `state` value) is excluded from the bars and surfaced as a header note. Data comes from `aggregateData.state` (see `UserMetrics["state"]`).
- [`ProfessionBreakdown.tsx`](../../src/components/admin/metrics/users/ProfessionBreakdown.tsx) — bar cap is **20** (the service pre-buckets via `bucketUnmatched`, capping the dataset around 17). The aggregated `"Other"` bucket is excluded from the bars and shown as a header note for the same anti-domination reason as `Unknown` above.

### Table mode

Renders four tables:
- [`MembershipPackageBreakdownTable.tsx`](../../src/components/admin/metrics/users/MembershipPackageBreakdownTable.tsx) — see column meanings below.
- [`AgeBreakdownTable.tsx`](../../src/components/admin/metrics/users/AgeBreakdownTable.tsx) — chronological row order with a totals row. Columns: `Age`, `Users`, `%`. The **`Unknown`** row is omitted from the body and shown as a header note (`Unknown excluded: N (X% of all)`); the totals row reflects only the visible rows so percentages sum to 100%.
- [`StateBreakdownTable.tsx`](../../src/components/admin/metrics/users/StateBreakdownTable.tsx) — sorted descending by user count, with rank column and friendly long-form state names alongside the code. Same `Unknown` exclusion/header-note pattern as the age table.
- [`ProfessionBreakdownTable.tsx`](../../src/components/admin/metrics/users/ProfessionBreakdownTable.tsx) — sorted descending by count, includes a rank column. The aggregated `"Other"` bucket is excluded from the body and surfaced as a header note.

All four breakdown components accept an optional `bare` prop (defaults `false`). When `bare={true}` the outer card wrapper (rounded-xl + shadow + border + padding) is dropped so the table can sit flush inside an already-card-shaped container. `UserMetricsView` leaves it false (each table keeps its own card per the toggle design); `UsersBreakdownSection` (dashboard overview) passes `bare` so the inner cards don't double up inside its `DashboardSection` shell — rows are separated by `divide-y` instead.

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

## KPIMetricsGrid — Renewal Rate card (2026-05-29)

[src/app/admin/component/overview/KPIMetricsGrid.tsx](../../src/app/admin/component/overview/KPIMetricsGrid.tsx) renders a **Renewal Rate** card in the "Users & Performance" group. The card is only shown when the active date filter is `current-draw` or `last-draw` and `stats.users.renewalProgress` is present in the dashboard stats response.

- **Metric displayed:** `renewalRate` as a percentage (e.g. "74%"), with a sub-line showing `renewed / base` counts.
- **Remaining members** are labeled "Expected to renew" (`current-draw`) or "Did not renew" (`last-draw`).
- When `snapshotMissing: true` the card renders an amber note that the base was estimated from the nearest available snapshot.
- For other date filters the card is hidden entirely — renewal rate is only meaningful for a full draw period.

Data flows from `AdminDashboardStats.users.renewalProgress` (`RenewalProgress | undefined`). See [backend.md](./backend.md#renewal-rate-kpi-2026-05-29) for service-layer and API details.

## Overview redesign — KpiGrid + DateRangeDropdown (Phase 2, 2026-06-01)

Part of the admin Overview reskin (plan `docs/superpowers/plans/2026-06-01-admin-overview-redesign.md`). Presentation now uses the kit primitives in [src/components/admin/ui/](../../src/components/admin/ui/) (`MetricCard`, `TrendPill`, `Popover`, etc. — documented in [shared-ui](../shared-ui/)).

- **[src/app/admin/component/overview/sections/KpiGrid.tsx](../../src/app/admin/component/overview/sections/KpiGrid.tsx)** — replaces the old `KPIMetricsGrid` at the top of `DashboardOverview`. Pure presentation: receives `stats` (`AdminDashboardStats`), `membership` (`MembershipByPackageData`) and `dateRange` as props (fetched in `DashboardOverview`, not here). Renders two labelled groups:
  - **Revenue** (`grid grid-cols-2 lg:grid-cols-4`): Revenue (emerald, clickable), Membership Revenue (red, clickable), Ad Spend (blue), ROAS (green).
  - **Users & Performance** (`grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5`): Total Users (indigo), New Signups (blue), Conversion (violet), Cancellations (red, `invert`), Renewal Rate (emerald, only rendered when `users.renewalProgress` is present).
  - Data/formatting/trend logic is ported verbatim from the old `KPIMetricsGrid`: money tiles use whole-dollar `$n.toLocaleString("en-AU")`, ROAS `toFixed(2)+"x"`, Conversion `toFixed(1)+"%"`. Trend is converted from the `{ value, direction }` `TrendData` into a **signed numeric %** (`direction === "down" ? -value : value`, `null` when absent) and handed to the kit's `TrendPill`, which applies the good/bad colouring itself. Cancellations passes `invert` (not a pre-inverted value) so a drop reads green.
  - Only Revenue + Membership tiles are clickable. Each clickable tile (`KpiCard`) owns a `useRef` anchor + `open` state and passes `active={open}` to `MetricCard`; the `Popover` anchors to that ref. The popover shows a header (title + value + `TrendPill`) and a breakdown list (colour dot + label + `fmtCompact(value)`): Revenue → top-4 of `revenue.breakdown` (normalised number|object); Membership → tiers from `membership.packages` (`packageName`, `activeRevenue`, dot colour from `brand-tier` hex by package-id substring). **No per-KPI sparkline** — the dashboard-stats hook returns no spark series, so the sparkline panel is omitted (not fabricated).

- **[src/components/admin/overview/DateRangeDropdown.tsx](../../src/components/admin/overview/DateRangeDropdown.tsx)** — clean dropdown replacing the old chip-bar `DateRangeToggle` inside `OverviewToolbar`. Reuses the existing `DateRange` type and the toolbar prop contract (`selectedRange`, `onRangeChange`, `onCustomClick`, `displayDate`). Ranges: Today / Yesterday / Current Draw / Last Draw / All Time, plus a "Custom range…" row that calls `onCustomClick` (opens the existing `CustomDateRangeModal`). Anchored via the kit `Popover`. The shared `src/components/admin/DateRangeToggle.tsx` is unchanged (still used elsewhere).

- **[OverviewToolbar.tsx](../../src/app/admin/component/overview/OverviewToolbar.tsx)** now renders `DateRangeDropdown` in its shared `inner` block, so both `placement="page"` (desktop sticky) and `placement="layout"` (mobile portal) pick it up.

- **[DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx)** wrapper is now `space-y-5 md:space-y-6`; `KpiGrid` renders at the top. The remaining legacy breakdown sections (`RevenueBreakdownSection`, `RenewalsDashboardSection`, `AdvertisingBreakdownSection`) are temporarily rendered directly below it (extracted from being `KPIMetricsGrid` children) so the page keeps working until later phases replace them. The dead `handleRevenue*` toggles, `statsError`, and the unused users-performance toggle state were removed.

## Overview redesign — charts row: revenue area chart + membership donut (Phase 3, 2026-06-01)

The charts row renders immediately after `KpiGrid` inside `DashboardOverview` as a `grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6` (revenue card `lg:col-span-2 min-w-0`, membership card `lg:col-span-1 min-w-0`). Both cards are pure presentation over existing hooks and use the kit primitives in [src/components/admin/ui/](../../src/components/admin/ui/).

- **[src/app/admin/component/overview/sections/tierColors.ts](../../src/app/admin/component/overview/sections/tierColors.ts)** — shared `tierColorByPackageId(packageId)` helper returning the `brand-tier` hex (tradie `#00c2ed` / foreman `#ffd200` / boss `#ee0000`, neutral-slate fallback) by package-id substring (spec D4). Extracted from `KpiGrid`'s former local `tierColor`; now consumed by both `KpiGrid` (membership-breakdown popover dots) and `MembershipCard` (donut segments + legend dots).

- **[src/app/admin/component/overview/sections/RevenueChartCard.tsx](../../src/app/admin/component/overview/sections/RevenueChartCard.tsx)** — wraps the kit `RevenueAreaChart` in a `Card p-5` with a `SectionTitle` ("Revenue overview" / "Hover the line for exact daily figures" / `LineChart` icon) and a "Tracking up/down" `Badge` (`success`/`danger` by `last >= first`). Calls `useRevenueBreakdown(period, …)` with `period = dateRange === "all-time" ? "months" : "days"`. **The series is intentionally decoupled from the single-day KPI range** so it never renders a degenerate 1-point chart: the `days` window mirrors the legacy `RevenueOverview` days-view windowing — the current AEST month capped at `getWebsiteLaunchDateUTC()` (start) and now (end) — and `months` filters `chartData` to the current AEST year. `data = points.map(p => p.total)`, `ticks` = up to ~7 evenly-sampled `p.date` labels, `axisLabel = period === "months" ? "Month" : "Day"`, `accent="#ee0000"`, `valueFmt={fmtCompact}`. Renders an empty-state row when fewer than 2 points are available. **Replaces** the deleted `src/components/admin/RevenueOverview.tsx`.

- **[src/app/admin/component/overview/sections/MembershipCard.tsx](../../src/app/admin/component/overview/sections/MembershipCard.tsx)** — `Card p-5 h-full` with a `SectionTitle` ("Active memberships" / "Live distribution by tier" / `Crown` icon). Props: `{ data: MembershipByPackageData | undefined }` (the `useMembershipByPackage` result, passed down from `DashboardOverview` — also reused by `KpiGrid`). Builds donut `segments` from `data.packages[]` (`value`/`count` = `activeCount`, colour from `tierColorByPackageId`); donut centre = total active count / "active", swapping to the hovered tier on hover. Legend rows (`space-y-2.5 mt-4`): colour dot, `packageName` + `$price/mo` (price from `getPackageById(packageId)?.price` in static [src/data/membershipPackages.ts](../../src/data/membershipPackages.ts) — omitted if not found), `activeCount`, then `fmtCompact(activeRevenue)` right-aligned. Past-due / Paused tiles (`grid grid-cols-2 gap-2 mt-4 pt-4 border-t`): **Past due** = `data.summary.totalPastDueCount` (live, red); **Paused** = static "Coming soon" (amber, muted — no `paused` field exists anywhere). **Replaces** the legacy `MembershipBreakdownSection` (its import/render were removed from `DashboardOverview`; the file remains on disk for Phase 5 cleanup).

## Overview redesign — revenue breakdown + advertising + prize performance (Phase 4, 2026-06-01)

Rows 3 + 3b of the admin Overview reskin. Row 3 is a `grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6` pairing `RevenueBreakdownCard` + `AdvertisingPlatformCard`; row 3b is the full-width `PrizePerformanceCard`. All three render inside `DashboardOverview` immediately after the Phase 3 charts row and use the kit primitives in [src/components/admin/ui/](../../src/components/admin/ui/).

- **[src/app/admin/component/overview/sections/RevenueBreakdownCard.tsx](../../src/app/admin/component/overview/sections/RevenueBreakdownCard.tsx)** — `Card p-5 h-full` with `SectionTitle` ("Revenue breakdown" / `${fmtCompact(total)} across 6 sources` / `BarChart3` icon) over the kit `BarList`. Props: `{ stats: AdminDashboardStats | undefined }` (the `useAdminDashboardStats` result, passed down from `DashboardOverview`). Builds 6 `BarItem`s from `stats.revenue.breakdown`, normalising each entry the same way the legacy `RevenueBreakdownSection.getRevenueData` did (`number | { revenue, purchaseCount, userCount, trend? }`). Labels / colours / units: Membership New (`#f97316`, subscriptions), Membership Renewal (`#eab308`, renewals), One-Time First (`#3b82f6`, purchases), One-Time Add'l (`#6366f1`, purchases), Mini Draws (`#a855f7`, entries), Upsells (`#ec4899`, purchases). `value` = revenue, `count` = `purchaseCount`. `BarList` gets `fmt={fmtCompact}` + `fmtCount={formatNumber}`. **Replaces** the legacy `RevenueBreakdownSection` (6-up `MetricCard` grid + `RevenueDetailModal`); the redesign drops the per-source detail modal. The legacy file stays on disk for Phase 5 cleanup.

- **[src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx](../../src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx)** — `Card p-5 h-full` with `SectionTitle` ("Advertising" / "Spend & return by platform" / `TrendingUp` icon). Props: `{ stats: AdminDashboardStats | undefined }`. Header `right` shows the blended ROAS (= Facebook ROAS, the only live platform) as `{fbRoas.toFixed(2)}x`. Renders a kit `DataTable` with cols Platform (left) / Spend (right) / ROAS (right). Rows: Facebook Ads = LIVE (`stats.facebookAds?.spend` / `.roas`, falling back to 0 when the optional `facebookAds` block is absent); TikTok Ads + Snapchat Ads = `comingSoon: true`. Rows carry a `comingSoon` flag and numeric `spend`/`roas` placeholders (0) so the table row type is uniform — `renderCell` decides display: coming-soon rows show a muted "Coming soon" in Spend and `—` in ROAS; the FB row shows `fmtCompact(spend)` (semibold) and `roas.toFixed(2)x` (emerald if ≥3 else amber). Platform cell = `w-2.5 h-2.5 rounded-sm` swatch (FB `#1877f2`, TikTok `#000000`, Snapchat `#eab308`) + name. **Replaces** the legacy platform-level slice of the advertising section.

- **[src/app/admin/component/overview/sections/PrizePerformanceCard.tsx](../../src/app/admin/component/overview/sections/PrizePerformanceCard.tsx)** — `Card p-5` (full width) with `SectionTitle` ("Prize performance" / "Spend & return by prize" / `Trophy` icon). Props: `{ dateRange: DateRange; startDate?: string; endDate?: string }`. **Data logic ported verbatim from the legacy `AdvertisingBreakdownSection`**: derives the AEST (`Australia/Sydney`) calendar-day `startDate`/`endDate` window the same way (today/yesterday → that AEST day; all-time → launch→today; custom → passed dates), calls `useSpendByUrlAnalytics(startDate, endDate)`, then groups/sums the returned `rows` per promotion brand (Ryobi / Milwaukee / Dewalt / Makita) by canonical-URL `/promotions/<slug>` match, with `roas = revenue / spend`, filtering to brands with any spend/revenue/conversions. Renders a kit `DataTable` (Prize left / ROAS / Spend / Revenue / Conversions right): ROAS emerald if ≥3 else amber (`toFixed(2)x`); Spend/Revenue via `fmtCompact`; Conversions via `formatNumber`; Prize cell shows the brand `.webp` logo (`next/image`, `object-contain`, optional `logoScale`) + name. **The redesign drops the "Sync from Meta" button** (sync buttons removed site-wide in the reskin). **The row-click `PrizePerformanceAdsModal` detail drill-down is omitted for now** — re-adding it on row click is a noted follow-up. Loading / error / empty states render inline. **Replaces** the prize-level slice of the legacy `AdvertisingBreakdownSection`; the legacy file stays on disk for Phase 5 cleanup.

- **[DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx)** now renders rows 3 + 3b after the charts row and **no longer imports or renders** `RevenueBreakdownSection` or `AdvertisingBreakdownSection`. The now-unused `isRevenueBreakdownExpanded` / `setIsRevenueBreakdownExpanded` state, the `isAdvertisingBreakdownExpanded` state, the `revenueBreakdownShown` derived flag, the `collapseRevenueGroup` helper, and the `useAdminUserModal()` / `openUserModal` dependency (only consumed by the old breakdown section's `onUserClick`) were all pruned. `RenewalsDashboardSection`, `UsersBreakdownSection`, `QuickActionsPanel`, `RecentActivityFeed` still render (Phase 5 replaces them).

## Overview redesign — rows 4 + 5: top draws / renewals / activity / quick actions (Phase 5a, 2026-06-01)

Final content rows of the admin Overview reskin. Row 4 is a `grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6` pairing `TopDrawsCard` (`lg:col-span-2`) + `UpcomingRenewalsCard` (`lg:col-span-1`); row 5 pairs `ActivityCard` (`lg:col-span-2`) + `QuickActionsCard` (`lg:col-span-1`). `UsersBreakdownSection` is moved to be the **last** content row (after row 5, before `CustomDateRangeModal`). All four cards use the kit primitives in [src/components/admin/ui/](../../src/components/admin/ui/).

- **[src/app/admin/component/overview/sections/TopDrawsCard.tsx](../../src/app/admin/component/overview/sections/TopDrawsCard.tsx)** — `Card p-5 h-full` + `SectionTitle` ("Top mini draws" / "By entries this period" / `Trophy` icon). No props. Body is a centered "Coming soon" empty state (the per-draw entry-ranking data source does not exist yet).

- **[src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx](../../src/app/admin/component/overview/sections/UpcomingRenewalsCard.tsx)** — `Card p-5 h-full` + `SectionTitle` ("Upcoming renewals" / `${formatCurrency(totalRevenue)} expected · next 3 days` / `RefreshCw` icon; `formatCurrency` from `useMetricsFormatting`). No props. Calls `useUpcomingRenewals(3, 1, 5)` (range = next 3 days, page 1, limit 5) → `{ renewals[], total, totalRevenue }`. List rows (`space-y-2`): a `w-9 h-9` neutral-slate (`#64748b`) avatar with initials from `customerName`/`customerEmail` (the `UpcomingRenewalItem` type exposes no tier/package field, so no `tierColorByPackageId` tint applies), middle column = name + `renewalDateFormatted`, right = `amountFormatted`. **The name preserves the legacy click-to-open-user-modal UX by reusing [`ClickableUserDisplay`](../../src/components/admin/ClickableUserDisplay.tsx)** (`displayText` + `userId={r.userId ?? null}`), which wraps `useAdminUserModal().openUserModal(userId)` and falls back to plain text for guests — the same component the legacy `UpcomingRenewalsSection` used. Empty state renders when no renewals. **Replaces** the legacy `RenewalsDashboardSection` "Upcoming schedule" tab (the period-performance tab is dropped).

- **[src/app/admin/component/overview/sections/ActivityCard.tsx](../../src/app/admin/component/overview/sections/ActivityCard.tsx)** — `Card p-5 h-full` + `SectionTitle` ("Recent activity" / "Live event stream" / `Activity` icon, with a "View all" → `/admin/activity-log` button + `ArrowRight` icon in `right`). No props. **Ports the legacy `RecentActivityFeed` data + behavior verbatim**: `useActivityLogInfinite(15)` (90-day window source, not the capped preview API), `IntersectionObserver` infinite scroll on a `ref` sentinel, mini-draw link-ification of the `action` (splits on `"` and links the quoted name to `/mini-draws/<miniDrawId>` when `miniDrawId` is present), and the clickable user via `ClickableUserDisplay` (same `useAdminUserModal` modal). Restyled to the timeline: scroll region `max-h-[360px] overflow-y-auto admin-scrollbar pr-1` → `space-y-0`; each item = marker column (`StatusDot` colored by the **emitted `status` field** — `success`/`info`/`warning`/`error`, never branching on `type` — plus a `w-px` connector line for non-last items) + body (`action` + `user · time` meta). **Replaces** `RecentActivityFeed`.

- **[src/app/admin/component/overview/sections/QuickActionsCard.tsx](../../src/app/admin/component/overview/sections/QuickActionsCard.tsx)** — `Card p-5 h-full` + `SectionTitle` ("Quick actions" / "Common admin tasks" / `Zap` icon) over a `grid grid-cols-2 sm:grid-cols-3 gap-2.5` of tone-chipped buttons. Props: `{ onRefreshStats: () => void }`. **Ports the two wired actions from the legacy `QuickActionsPanel`**: **Create Major Draw** opens [`AdminMajorDrawModal`](../../src/components/modals/AdminMajorDrawModal/index.tsx) (`onSuccess → onRefreshStats`); **Export Participants** opens an inline export modal that fetches `/api/admin/major-draw/export?format=csv|excel` and triggers a blob download. **Add Product** and **Send Broadcast** are rendered as `disabled` buttons with a muted "Coming soon" line (they are stubs today — Add Product only console.logged, Send Broadcast had no handler — and are intentionally not wired). Tone chips: Create Major Draw red, Export Participants emerald, Add Product blue, Send Broadcast violet. **Replaces** `QuickActionsPanel` (the legacy `AdminProductModal` wiring is dropped along with the dead `handleCreateProduct`).

- **[DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx)** now renders rows 4 + 5 and **no longer imports or renders** `RenewalsDashboardSection`, `QuickActionsPanel`, or `RecentActivityFeed`. `UsersBreakdownSection` is moved to be the last content row. The now-unused `isUpcomingRenewalsExpanded` / `setIsUpcomingRenewalsExpanded` state and the `statsLoading` destructure (only consumed by the removed `RenewalsDashboardSection`) were pruned.

## Overview redesign — dead-code cleanup (Phase 5b, 2026-06-02)

After the reskin, the legacy Overview sections and their now-orphaned siblings were **deleted** (each verified to have no remaining live importer). The "remains on disk for cleanup" notes in the Phase 3/4/5a sections above are superseded by this step. Removed files:

- Replaced Overview sections: `KPIMetricsGrid.tsx`, `RevenueBreakdownSection.tsx`, `MembershipBreakdownSection.tsx`, `AdvertisingBreakdownSection.tsx`, `RenewalsDashboardSection.tsx`, `UpcomingRenewalsSection.tsx`, `MembershipRenewalPeriodStats.tsx`, `RecentActivityFeed.tsx`, `QuickActionsPanel.tsx` (all under `src/app/admin/component/overview/`).
- Orphan-dead component-level files reachable only through the unused barrel: `src/app/admin/component/MembershipStats.tsx` (hardcoded mock), `AdminStatsCard.tsx`, `RecentOrders.tsx`, `TopProducts.tsx`, and the dead barrel `src/app/admin/component/index.ts` itself (zero importers — the components it re-exported that are still live, e.g. `AdminPage`, are imported by direct path).
- Earlier in the reskin, `src/components/admin/RevenueOverview.tsx` was deleted (replaced by `RevenueChartCard`).

**Kept** (still in use): `overview/DashboardOverview.tsx`, `overview/OverviewToolbar.tsx`, `overview/DashboardSection.tsx` (used by `UsersBreakdownSection`), `overview/UsersBreakdownSection.tsx`, and all `overview/sections/*` redesign cards. The `my-account` `RecentOrders.tsx` (a different, live file) was untouched. Detail modals the deleted sections used (`RevenueDetailModal`, `MembershipByPackageDetailModal`, `PrizePerformanceAdsModal`) were left in place — they live under `src/components/admin/` and are out of scope for the Overview reskin.

## DashboardOverview — Users Breakdown section — 2026-05-04

[src/app/admin/component/overview/DashboardOverview.tsx](../../src/app/admin/component/overview/DashboardOverview.tsx) renders a new collapsible `UsersBreakdownSection` (the legacy `RevenueOverview` chart that previously followed it was removed in the Phase 3 redesign and replaced by `RevenueChartCard` in the charts row — see above).

- State: `isUsersBreakdownExpanded` — local `useState(false)`, toggled via the section's own chevron.
- Component: [src/app/admin/component/overview/UsersBreakdownSection.tsx](../../src/app/admin/component/overview/UsersBreakdownSection.tsx) — wraps a `DashboardSection` (`title="Users Breakdown"`, `subtitle="Age groups, professions and state across all users"`, `collapsible`).
- Data: calls `useUserMetrics({ enabled: isExpanded })` so the all-time aggregation only fetches when the section is opened.
- Body when loaded: a `divide-y` stack rendering `<AgeBreakdownTable bare … />`, `<StateBreakdownTable bare … />`, `<ProfessionBreakdownTable bare … />` — the same components used in the metrics tab's table mode, with `bare` passed so the inner card chrome is suppressed inside the parent `DashboardSection`. Rows separated by horizontal dividers instead of nested cards.
- Loading shows a spinner row; when `data` is null after load, a "No breakdown data available." placeholder renders.

## Past-due charge history tab (`/admin/past-due-history`)

### Components

- [src/app/admin/component/PastDueChargeHistory.tsx](../../src/app/admin/component/PastDueChargeHistory.tsx) — top-level page component. UI mirrors the rest of admin: page-title row with a `DateRangeToggle` on desktop (portaled into `useAdminMobileDateToolbarSlot()` on mobile), four `MetricCard`s (Bulk runs / Invoices attempted / Succeeded / Revenue recovered) summarising the runs in the selected range, then two stacked card tables — **Bulk Runs** (from `GET /api/admin/charge-past-due/runs`) and **Manual Retries** (from `GET /api/admin/charge-past-due/manual-retries`) — both wrapped in the standard `bg-white dark:bg-neutral-900 rounded-xl shadow-sm border` shell with header row + count. Run/retry status badges use the same emerald/red/amber palette as `BlockedTransactionsManagement`. The "Custom Range" preset opens [`CustomDateRangeModal`](../../src/components/admin/CustomDateRangeModal.tsx); presets `today`/`yesterday`/`current-draw`/`last-draw`/`all-time` are wired the same way as `PromoAnalyticsManagement` (AEST timezone via `formatInTimeZone`, `getWebsiteLaunchDateUTC()` for `all-time`, draw dates from `useCurrentAndLastDrawDates`). Default range is **Last 30 days** (initial state: `dateRange: "custom"` with `startDate = subDays(today, 29)` and `endDate = today`). Clicking a bulk-run row opens `PastDueChargeHistoryDrawer`.

  **Manual Retries — grouped-by-user UX.** Rows are no longer flat; they're collapsed into one row per user via `groupChargeAttemptsByUser` from [src/utils/admin/groupChargeAttemptsByUser.ts](../../src/utils/admin/groupChargeAttemptsByUser.ts). The summary row shows last-attempt time, admin label, user (rendered with `<ClickableUserDisplay>` so clicking the email opens `UserDetailModal`), attempt count + per-status breakdown (`N✓ N✗ N⏭`), latest-status badge, and total amount. A chevron toggles a nested table with per-attempt rows (When / Invoice / Status / Amount / Error / Action). Stranded-error rows still expose the `Recover` button + checkbox; the group-row checkbox toggles all stranded attempts for that user (supports `indeterminate` state).

  **Server-side user search.** A debounced `<input type="search">` next to the bulk-recover button drives a `userSearch` query param sent to `GET /api/admin/charge-past-due/manual-retries`. `useDebounce(input, 300)` smooths typing; the `filter` memo is keyed on the debounced value so changing the search resets pagination from offset 0. The Bulk Runs query receives the same `filter` object but the API ignores `userSearch`.

  **"Loaded attempts only" hint.** When the manual-retries query has more pages, a small line `"Per-user counts reflect loaded attempts only. Click \"Load more\" to widen the view."` renders above the Load-more button — per-user totals only aggregate over the currently-fetched pages, not the unbounded server-side total.

  **Error column precedence.** Both per-attempt error cells render `r.declineCode ?? r.errorCode ?? r.errorMessage ?? ""` so the most specific Stripe signal wins (e.g. `do_not_honor` over the generic `card_declined` bucket).

- [src/app/admin/component/PastDueChargeHistoryDrawer.tsx](../../src/app/admin/component/PastDueChargeHistoryDrawer.tsx) — slide-in drawer for a single run. Fetches `GET /api/admin/charge-past-due/runs/[runId]` via `useChargePastDueRunDetail` and displays a status-badged Summary card (started / finished / duration / admin / eligible / attempted / succeeded / failed / revenue) with a Skip-breakdown subsection, plus a Per-invoice attempts card-table. Uses the admin neutral palette (`dark:bg-neutral-900`, `dark:border-neutral-800`) and the same `RunStatusBadge` / `RetryStatusBadge` colours as the parent page.

  **Per-invoice attempts — grouped-by-user UX.** Same `groupChargeAttemptsByUser` grouping as the parent page, with a chevron-driven collapsible per-user row. Rows are augmented with the run's `adminName` (one admin per run, so the DTO doesn't carry it per-row) before grouping. A **client-side** email search input (no debounce, no API call) filters `groupedAttempts` by `userEmail.includes(query.toLowerCase())` — search is local because the entire run's row set is already in memory. Header shows `{groupedAttempts.length} users` instead of a row count. User emails render via `<ClickableUserDisplay>`.

  **Status filter chips.** Next to the email search the header renders three multi-select toggle chips — `Succeeded` / `Failed` / `Skipped` (emerald/red/amber, matching `RetryStatusBadge`; dimmed when off) — backed by `activeStatuses: Set<AttemptStatus>` initialised to all three. The filter uses **"any matching attempt"** semantics: after grouping, a user is kept if any of their attempts has a status in the active set (checked via the group's `successCount` / `failedCount` / `skippedCount`, so a mixed user can match more than one chip). It composes with the email search via AND. The filter only narrows the *user list* — once a user is shown, their expanded per-invoice rows are NOT filtered, so bulk-recover selection logic is unaffected. An empty set is treated as "no filter" (shows all users) rather than blanking the list; when all chips are off the count line appends ` (no status filter)`.

  **Dropped "When" column.** All attempts in a single run share approximately the same time, so the per-attempt table inside the expanded row no longer renders a When column — only Invoice / Status / Amount / Error. The Error cell uses the same `declineCode ?? errorCode ?? errorMessage` precedence as the parent page.

  **Multi-select bulk recovery (Phase 3).** The "Per-invoice attempts" section supports multi-select on stranded `failed` rows (matched via `isStrandedError`). The header's "Recover selected (N)" button opens `BulkRecoverInvoicesModal`, which POSTs to `/api/admin/invoices/recover-past-due` in batches of 10 — same path the manual-retries section uses. On completion the drawer's run-detail query is invalidated so row statuses refresh in place. Per-row checkboxes are enabled only when the row's `status === "failed"`, the error matches `isStrandedError(errorMessage, errorCode)`, AND the group has a `userId`; otherwise they're disabled with a `title` tooltip explaining why. Each checkbox carries `aria-label="Select invoice <id> for bulk recover"`.

Both components import `formatDurationMs` and `isStrandedError` from [src/utils/admin/chargePastDueFormat.ts](../../src/utils/admin/chargePastDueFormat.ts) — Mongoose-free pure helpers. Importing them from `services/admin/chargePastDueHistory.ts` would transitively pull `mongoose` into the client bundle and crash hydration on `mongoose.models[...]`. `isStrandedError` was hoisted out of a local copy in `PastDueChargeHistory.tsx` (Phase 3) so the drawer and the manual-retries table share one matcher.

### Hooks

Three TanStack Query hooks under `src/hooks/queries/admin/`:

| Hook | Endpoint | Shape |
|---|---|---|
| `useChargePastDueRuns(filter)` | `GET /api/admin/charge-past-due/runs` | `useInfiniteQuery` — offset paging, page size 50. Returns `{ runs, total, hasMore, isLoading, isFetching, isFetchingNextPage, isError, fetchNextPage }`. |
| `useChargePastDueRunDetail(runId)` | `GET /api/admin/charge-past-due/runs/[runId]` | `useQuery` — single run + all its `InvoiceChargeLog` rows. |
| `useChargePastDueManualRetries(filter)` | `GET /api/admin/charge-past-due/manual-retries` | `useInfiniteQuery` — offset paging, page size 50. Returns `{ rows, total, hasMore, isLoading, isFetching, isFetchingNextPage, isError, fetchNextPage }`. |

All three are admin-only. Query keys are prefixed `["admin", "charge-past-due", ...]`. The two `useInfiniteQuery` hooks key on the full `filter` object so changing date range (or any other filter field) resets paging from offset 0. `getNextPageParam` returns `loaded < total ? loaded : undefined`. The Bulk Runs and Manual Retries cards each render a "Load more" button at the bottom (matching `BlockedTransactionsManagement`'s pattern); the table header shows `Showing X of Y`. Summary `MetricCard`s aggregate across **loaded** pages only — clicking "Load more" updates them.

### Decline-code summary panel

`PastDueChargeHistory.tsx` renders a "Why charges declined" panel between the top cards and the Bulk Runs section. Powered by `useChargePastDueDeclineSummary`, scoped to the current date filter. Each row shows the code, count, a proportional bar, and percent. Loading state = 5 skeleton bars; empty state = single "No failed attempts in selected range." line.

### Top cards (reduced)

Two cards only: **Succeeded** (count) and **Revenue recovered** (currency). Both aggregate Bulk Runs only — Manual Retries deliberately don't roll up here. Subtitle on Revenue recovered says "From bulk runs" to make this scope explicit.

### Shared `AttemptsBreakdown` component

`src/components/admin/AttemptsBreakdown.tsx` is the single source of stacked count-plus-chips rendering. Used in four places:

- Bulk Runs row (size `cell`, with `eligibleHint`)
- Manual Retries grouped row (size `cell`, no hint)
- Drawer Summary `<dd>` (size `block`, with `eligibleHint`)
- Drawer per-invoice section, per-user grouped row (size `cell`, no hint) — the inner per-attempt table is unchanged

If any of those four breakdowns drift visually, fix the component — don't fork.

## Force Charge fallback in ChargePastDueUserModal

[`ChargePastDueUserModal.tsx`](../../src/components/admin/ChargePastDueUserModal.tsx) includes a Force Charge fallback path for the case where the standard preview returns `eligibleCount: 0` (no chargeable open invoices found by the normal past-due filter). This happens when the user is still `past_due` in the DB but their current subscription cycle invoice is a held draft under `pause_collection` — which the normal filter excludes.

**UI flow:**

1. Preview loads and shows `eligibleCount: 0`.
2. An amber warning panel appears: "No chargeable invoice on this user's current subscription" with a **Switch to Force Charge** button.
3. Clicking the button enters `forceChargeMode`. The normal "Confirm charge (0)" button in the footer is replaced with an amber **Force Charge** button.
4. A confirmation input requires the admin to type `FORCE CHARGE` exactly (uppercase) before the button enables.
5. On submit, POSTs to `POST /api/admin/users/[id]/force-charge` with `{ confirmation: "FORCE CHARGE" }`.
6. Success shows a green panel with the charged invoice ID, payment status, and amount. Failure shows a red panel with the error message and optional `reason` code.

**State variables added:** `forceChargeMode`, `forceConfirmation`, `forceProcessing`, `forceResult`. All are reset in `handleClose`.

**Color scheme:** amber (`bg-amber-600`) distinguishes Force Charge from the standard red (`bg-red-600`) charge path. Light/dark parity is maintained throughout.

## Force Charge UI (user self-serve)

[`RenewalFailedModal.tsx`](../../src/components/modals/RenewalFailedModal.tsx) — when the existing `pay-failed-invoice` flow returns an error matching "no payable invoice" or similar phrases (matched by `isNoPayableInvoiceError(error)`), the modal renders a "Pay overdue amount" CTA that calls `POST /api/stripe/force-charge-overdue`.

**UI flow:**
1. User sees the renewal-failed modal and clicks "Resolve Payment Issue".
2. The `pay-failed-invoice` mutation returns an error whose message contains "no payable invoice" (or related phrases).
3. The amber "Pay overdue amount" button appears below the error box.
4. On click, the button shows "Paying overdue amount…" while the request runs.
5. On success, a green panel confirms "Payment received. Your subscription is now up to date."
6. On failure, a red panel shows the error message from the API (or a generic contact-support message).

**State variables added:** `forceChargeProcessing`, `forceChargeResult`. Both are reset when the modal opens.

## Stranded invoice recovery UI

The recovery action is exposed in three places:

- **Trigger A** — `Manual Retries (per-user)` table in [`PastDueChargeHistory.tsx`](../../src/app/admin/component/PastDueChargeHistory.tsx). Rows whose error matches `/no longer be paid|no longer payable/i` get a `Recover` button in the Action column (per-row) **and** a checkbox in a new Select column. When one or more stranded rows are checked, a **Recover Selected (N)** button appears in the Manual Retries section header — clicking it opens `BulkRecoverInvoicesModal`.
- **Trigger D** — auto-fallback in [`ChargePastDueUserModal.tsx`](../../src/components/admin/ChargePastDueUserModal.tsx). When a single-user retry returns a stranded-error row, that row gets an inline `Recover` button alongside the error text.

Per-row recovery opens [`RecoverInvoiceModal.tsx`](../../src/components/admin/RecoverInvoiceModal.tsx), which:

- On open, immediately fires `GET /api/admin/users/[userId]/recover-past-due-invoice?invoiceId=…` (the pre-flight eligibility check) and shows "Checking eligibility…" while it runs.
  - If ineligible: shows a red-bordered panel with the blocking reason and message; the Recover button is hidden (only Cancel is shown). The admin cannot proceed without dismissing.
  - If eligible: shows the recovery sequence in plain English, the RECOVER confirmation input, and the Recover button.
- Requires the admin to type `RECOVER` exactly before submitting.
- POSTs to `/api/admin/users/[userId]/recover-past-due-invoice` with `{ confirmation: "RECOVER", originalInvoiceId }`.
- Displays the per-step result (new invoice id, charge status, amount).

The modal is intentionally narrower than `ChargePastDueUserModal` — by the time the admin opens it they have already seen the failed row, so there's no preview step.

### Bulk stranded-invoice recovery

[`BulkRecoverInvoicesModal.tsx`](../../src/components/admin/BulkRecoverInvoicesModal.tsx) handles N-row recovery in one operation:

- Accepts `items: BulkRecoverItem[]` (userId, userEmail, originalInvoiceId, amount).
- Shows a warning panel listing all selected invoices (scrollable preview table).
- Requires the admin to type `RECOVER ALL` (uppercase, exact) before enabling the Recover button.
- POSTs to `POST /api/admin/invoices/recover-past-due` with `{ confirmation: "RECOVER ALL", items }`.
- Shows a spinner while the server processes rows sequentially (300ms delay between rows; request holds open until all rows complete).
- On completion shows a 3-column summary card (Total / Succeeded / Failed). Each summary card is a filter toggle — clicking one filters the results table below to that subset.
- Results table: original invoice ID (truncated), outcome label, detail (error string or reason).
- On successful completion, calls `onCompleted()` which clears the checkbox selection in `PastDueChargeHistory`.
- Hard cap: 50 items per call (enforced by Zod on the server and implicitly by the checkbox UX which only shows on stranded rows in the current view).

**Selection state in `PastDueChargeHistory`:**

- `selectedRows: Set<string>` — keys are `${userId}-${invoiceId}`.
- `strandedRows` memo — filters `retriesQuery.rows` to those that pass `isStrandedError()` and have a `userId`.
- `selectedItems` memo — maps `strandedRows` entries whose key is in `selectedRows` to `BulkRecoverItem[]`.
- Checkboxes only render for stranded rows; all other rows have an empty cell.

### Light/dark mode parity

The footer uses explicit paired classes throughout:
- **Cancel button**: `bg-gray-200 hover:bg-gray-300 text-gray-800` (light) / `dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-100` (dark)
- **Recover button**: `bg-amber-600 hover:bg-amber-700 text-white` — amber works in both modes, dark overrides repeat the same values for explicitness.
- Footer background: `bg-gray-50 dark:bg-neutral-950/80`

Success (green) and error (red) panels use `{color}-50` light backgrounds with `{color}-800`/`{color}-900` text in light mode for sufficient contrast, and `{color}-950/25` dark backgrounds with `{color}-200`/`{color}-300` text in dark mode.

## Upsell Multiplier panel (PromoManagement > Upsell Multipliers tab — 2026-05-14)

[src/components/admin/UpsellMultiplierPanel.tsx](../../src/components/admin/UpsellMultiplierPanel.tsx) — editable form for the singleton `UpsellMultiplierConfig` document. Mounted as the `"upsell-multipliers"` tab inside `PromoManagement`.

**Shell features:**
- Three `<select>` controls (Membership / One-Time / Additional) whose options come from `PROMO_MULTIPLIERS`.
- Draft state — changes are held in `useState` until the admin clicks Save, letting the preview update instantly without persisting.
- Save calls `PUT /api/admin/upsell-multipliers` via `useUpsellMultipliersMutation()`; Cancel resets draft to the last-saved values.
- Active-promo banner reads `useAdminActivePromos()` and shows the current multiplier for each of the three promo types (membership-packages / one-time-packages / mini-packages). Renders "no active promo" when none are active.

**Preview component** ([src/components/admin/UpsellMultiplierPanel.preview.tsx](../../src/components/admin/UpsellMultiplierPanel.preview.tsx)):
- Accepts `{ membership, oneTime, additional }` props and renders four responsive tables: Membership / One-Time / Additional / Mini.
- Per-row entry count = `multiplier × base`, where `base` is resolved via `getPackageById(record.baseTemplatePackageId)` (subscription → `entriesPerMonth`, one-time → `totalEntries`).
- Mini table is static (no knob) — annotated "fixed 1:1 entries"; uses the hard-coded `MINI_ROWS` constant matching the `MINI_TIERS` in `upsellPackages.ts`.

**TanStack Query hooks** ([src/hooks/queries/admin/useUpsellMultipliers.ts](../../src/hooks/queries/admin/useUpsellMultipliers.ts)):
- `useUpsellMultipliersQuery()` — `useQuery` against `GET /api/admin/upsell-multipliers`. Query key: `["admin", "upsell-multipliers"]`. Uses `apiGet` from `@/lib/queries` for consistent auth + error handling.
- `useUpsellMultipliersMutation()` — `useMutation` + `apiPut`; invalidates the query key on success.

## Hooks

| Hook | Purpose |
|---|---|
| `useAdminMobileDateToolbarSlot()` | Admin-specific date toolbar mobile UX |
| `useUpsellMultipliersQuery()` | GET singleton upsell multiplier config |
| `useUpsellMultipliersMutation()` | PUT updated multiplier triple, invalidates query |
| (admin queries via `useAdminQueries.ts`) | TanStack Query hooks for admin data |

## Theme

Admin uses [AdminThemeContext](../theme/architecture.md#three-contexts) — separate from member theme.

## A/B variant editor — membership section theme

`VariantConfigEditor` has a "Membership Section Theme" section with a
**Force light mode on the membership section** checkbox bound to
`config.membershipTheme.forceLight`. The site-wide membership dark-mode test
has shipped (light won — see [shared-ui/frontend.md](../shared-ui/frontend.md))
and `MembershipSection` no longer reads this field, but the checkbox stays in
the editor for future revival.

## A/B variant editor — per-slug hero image map

`VariantConfigEditor` also exposes a **Per-slug hero overrides** editor inside
the Hero Configuration section, backed by the `PerSlugImageMapEditor`
subcomponent in the same file. It manages
`config.hero.imageSrcBySlug: Record<slug, { desktop?, mobile? }>` — one variant
can carry per-page hero creatives so a single experiment covers multiple
landing slugs.

Each row's **Desktop** and **Mobile** path inputs are independently optional.
Leaving Desktop blank keeps desktop visitors on the theme-aware default landing
image while mobile visitors see the override — this is the mobile-only A/B test
shape. The editor strips empty strings before saving so the persisted config
carries only meaningful overrides. Slug keys MUST match the experiment's
`slugTargets` exactly; empty rows or rows with both paths blank are rejected
by `VariantConfigService.validateVariantConfig`.

## A/B experiment edit (Pencil icon in list)

`ABTestingManagement.tsx` row actions include a **Pencil (Edit)** button shown
only when (a) the viewer has `abTesting.edit` permission and (b) the experiment
status is `draft` or `paused`. Clicking it opens `ExperimentFormModal` in **edit
mode** — same component as Create, but the `experiment` prop pre-populates the
form, the title becomes "Edit A/B Testing Experiment", and submit calls
`useUpdateExperiment()` → `PATCH /api/admin/ab-testing/experiments/[id]`.

Locked statuses (`active`, `ended`) intentionally hide the Edit button — both
the server (`ExperimentService.canEditExperiment`) and the API
(`updateExperimentSchema`) refuse edits to locked experiments anyway. Variants
are still edited from the experiment detail view's variant section, not from
this modal.

## Cancellation Flow Analytics view (Admin > Analytics > Cancellation Flow) — Task 18

[src/components/admin/CancellationFlowAnalytics.tsx](../../src/components/admin/CancellationFlowAnalytics.tsx) is a **read-only** panel mounted as the `cancellation-flow` tab in the Analytics sidebar group (`AdminSidebar` group `analytics`, rendered by `AdminPage` on `selectedTab === "cancellation-flow"`). No mutations, no charts library. Styled with the standard analytics primitives — `MetricCard` for top stats, `bg-white … rounded-lg sm:rounded-xl shadow-sm … border` section wrappers, `bg-gray-50` table heads, `font-mono tabular-nums` numeric cells — to keep visual parity with `PromoAnalyticsManagement` and the rest of the Analytics group.

**Date filter.** The tab is registered in `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` ([adminMobileDateToolbarSlot.ts](../../src/app/admin/component/adminMobileDateToolbarSlot.ts)) so it gets the shared mobile date strip under the admin header. Component owns `dateRange` / `startDate` / `endDate` state synced with URL params (same pattern as `PromoAnalyticsManagement`); default range is **today**. `current-draw` / `last-draw` hydrate from `useCurrentAndLastDrawDates`; `custom` opens `CustomDateRangeModal`. The component sends AEST `yyyy-MM-dd` values via the hook; the route handler converts them to UTC bounds (`startDate` → start of day AEST, `endDate` → start of next AEST day for the exclusive upper bound).

Sections: three top cards (Triggered / Save rate / Saved); funnel with four CSS bars (Reached offer → Accepted → Cancelled → Abandoned; the "Reached reason" step is omitted because it is always equal to Triggered); a **Reason × outcome** table (count, share %, Saved, Cancelled, Abandoned per reason) — **rows with `count > 0` are clickable** and open `CancellationReasonUsersModal` (see below) scoped to the currently-selected date range; an **"Other" reasons (free text)** table listing every `reason === "other"` event's `reasonText` with outcome chip, AEST timestamp, and **a User column** that renders a `ClickableUserDisplay` (email + optional name subtext) opening the standard `AdminUserModal` via `useAdminUserModal` — falls back to a plain "—" when the event has no `userId`; a 2-card retention summary (Retained 90d %, Pending); and a **90-day retention by offer** table (offer | saved | retained | churned | pending | retained %) showing which offers produce durable saves vs delayed churn. Retained % = `retained ÷ (retained + churned)` over matured saves (“—” when none matured). Short note under the funnel surfaces `pastDueExcludedFromOfferConversion` when non-zero.

**Reason drill-down modal** ([src/components/admin/CancellationReasonUsersModal.tsx](../../src/components/admin/CancellationReasonUsersModal.tsx)): paginated (20/page) user-level event list for a single cancellation reason. Toolbar has four outcome filter chips (`All` / `Saved` / `Cancelled` / `In progress`; resets to `All` whenever the modal opens for a new reason). Columns: Outcome chip, Started (AEST `yyyy-MM-dd HH:mm`), User (`ClickableUserDisplay` → opens `AdminUserModal`; "—" for guest/legacy events with no `userId`), and either **Free text** when the reason is `"other"` or **Offer accepted** for every other reason. Filter changes reset to page 1. Backed by `useCancellationFlowUsersByReason` (see below).

Data hooks: [src/hooks/queries/admin/useCancellationFlowAnalytics.ts](../../src/hooks/queries/admin/useCancellationFlowAnalytics.ts) — both hooks live in this file, follow the `useChargePastDueDeclineSummary` admin-hook pattern (inline key, `{ data, isLoading, isError }`):
- `useCancellationFlowAnalytics(filter)` — TanStack `useQuery`, queryKey `["admin", "cancellation-flow-analytics", filter]`.
- `useCancellationFlowUsersByReason(filter | null, { enabled? })` — TanStack `useQuery`, queryKey `["admin", "cancellation-flow-analytics", "users-by-reason", filter]`. Caller passes `null` filter or `enabled: false` to prevent fetching when the modal is closed. Returns `{ rows: ReasonUserRow[], totalCount }`.

Endpoints + aggregation rules: [api.md](./api.md#cancellation-flow-analytics).

**Client-safe constant copies.** `CancellationFlowAnalytics.tsx` declares its own module-local `CANCELLATION_REASONS` and `OFFER_TYPES` constants (identical values and order to the model) instead of importing them from `@/models/CancellationFlowEvent`. That module is a Mongoose model file — runtime-evaluating it in a client component crashes (`mongoose` is `serverExternalPackages`, so `models.CancellationFlowEvent` is undefined in the browser). The type-only imports (`import type { CancellationReason, OfferType }`) remain safe because types are fully erased at build time. Keep the local constants in sync by hand whenever the model's `CANCELLATION_REASONS` or `OFFER_TYPES` arrays change. This is the same pattern used elsewhere on this branch for the same class of crash.

## Facebook Ads Management — Health view tab (Task 29, 2026-05-27)

`FacebookAdsManagement` (`src/components/admin/FacebookAdsManagement.tsx`) now supports a third `viewMode` value: `"health"`.

**State / URL changes:**
- `viewMode` type widened from `"ads" | "spend-by-url"` to `"ads" | "spend-by-url" | "health"`.
- `urlViewMode` cast and `setViewMode` cast updated to include `"health"`.
- `handleViewModeChange` signature updated to `"ads" | "spend-by-url" | "health"`.
- The URL-sync `useEffect` now accepts `"health"` as a valid persisted value (legacy `"metrics"` → `"ads"` redirect is unchanged).
- The DateRangeToggle portal/render guard (`viewMode === "ads" || viewMode === "spend-by-url"`) now also includes `viewMode === "health"` so the date picker remains available when in health mode.

**Render:**
- A third tab button (`Health`) is added to the switcher next to `Ads` and `Spend by URL`.
- `{viewMode === "health" && <FacebookAdsHealthView startDate={startDate} endDate={endDate} />}` renders the orchestrator below the tab bar.
- The account-level summary cards and `CustomDateRangeModal` continue to only render for `"ads"` and `"spend-by-url"` modes.

**Orchestrator:** `src/components/admin/facebook-ads-health/FacebookAdsHealthView.tsx` — wires `useFacebookAdsHealth` to the four health sub-components (`FacebookAdsHealthTopBar`, `FacebookAdsHealthFilters`, `FacebookAdsHealthPivotTable`, `FacebookAdsHealthSettingsModal`). Local state: `metric`, `verdictFilter`, `statusFilter`, `minSpend`, `campaignFilter`, `search`, `settingsOpen`. `campaignOptions` derived from `data.rows` via `useMemo`.

**Client-side filtering (2026-05-27):** `verdict`, `learningStatus`, `minSpend`, and `search` are applied in a `useMemo` over the cached row set — they never reach the server and are excluded from the TanStack `queryKey`. Only `campaign` (data-slice) and `level`/`startDate`/`endDate` (aggregation grain) remain server-side. `filteredAlertCount` is also recomputed client-side from `displayedRows` so the banner reflects what's actually visible in the table.

## className conventions (2026-05-08)

All admin components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}` across this domain. When adding new conditional classes, use `cn()` rather than template literals.

## Overview redesign — feedback iteration (round 2, 2026-06-02)

UI-kit additions in [src/components/admin/ui/](../../src/components/admin/ui/): **`Segmented`** (pill toggle, generic over `string | number`) and **`RevenueAreaChart`** now supports a horizontal-scroll mode (`minPointPx` prop) with a fixed left y-gutter so dense series scroll instead of compressing.

Overview section changes:
- **`KpiGrid`** — *Users & Performance* collapsed from 5 tiles to **4**: Total Users + Signups merged into one tile (all-time → "Total Users"; any other range → that period's signups with total-users as subtext). **Renewal Rate** tile always renders, showing today's progressive rate to 1 dp (`renewalProgress.rate`, falling back to `membershipRenewals.succeeded/expected`). Revenue detail popover now lists **all 6** breakdown sources (incl. Mini Draws + Upsells), and the Membership-revenue popover uses **package icons** (`getPackageIcon`) instead of color dots.
- **`MembershipCard`** — legend uses package icons; Past-due + **Paused** render as text `Badge`s in the SectionTitle right slot (bottom tiles removed). Paused count comes from `summary.totalPausedCount`.
- **`UpcomingRenewalsCard`** — initials avatar removed; a `Today / To 27th` `Segmented` toggle drives `useUpcomingRenewals(0 | 27, …)`.
- **`PrizePerformanceCard`** — Prize cell shows the brand logo only (name dropped; moved to `alt`); a manual **Sync** button hits `POST /api/admin/analytics/spend-by-url/sync` and invalidates the spend-by-url query.
- **`QuickActionsCard`** — navigation-first: Create Major Draw (modal) + Export (modal) kept; Add Product / Send Broadcast removed; nav actions (Create Mini Draw, Launch Promo, Users, Affiliates, Draw Results, Manage Team, Submissions) route to `/admin/<tab>`. Up to 9 desktop (3×3), top 4 on mobile (`hidden sm:flex` on 5–9).
- **`RevenueChartCard`** — `Days / Months / Years` `Segmented` toggle; each period plots the full launch→now window (scrollable).
- **`UsersBreakdownSection`** — rebuilt on the kit (`Card` + `SectionTitle` + three `BarList` blocks for Age/State/Profession), Overview-only; keeps the lazy `useUserMetrics({ enabled })` gate. The shared `*BreakdownTable` components (still used by `UserMetricsView`) and `DashboardSection` were NOT modified.
- **`AdminPage`** / **`OverviewToolbar`** — the mobile date filter now renders **inline in the header row beside the theme toggle** (the separate centered date row was removed; `OverviewToolbar` `layout` placement renders the dropdown content-sized).

Backend/data:
- **`MembershipAnalyticsService`** — adds `totalPausedCount` (distinct `userId` in `CancellationFlowEvent` with `offerAccepted:"pause_30d"`, `outcome:"saved"`, `savedAt` within 30 days — a proxy; true live pause state lives in Stripe `pause_collection`, not mirrored).
- **`activity-log` route** — new event types `upsell_accepted` (from `PaymentEvent.packageType==="upsell"`, beats the ≥$300 high-value override), `cancellation_offer_accepted` (from `CancellationFlowEvent`), `admin_role_update` (from `StaffActivity` staff PATCHes), `affiliate_payout` (from `AffiliatePayout`, amount in cents → /100). `subscription_past_due` already emitted. `ActivityLogManagement` type-filter extended.
- **`adChannelProviders`** (dashboard-stats) — the Facebook provider now skips days in the future (fixes `(#100) since cannot be in the future` when a range runs to a future draw date).

## Overview redesign — perf, loaders, charts, modals, top-draws (rounds 3–4, 2026-06-02)

Performance / correctness:
- **`RevenueChartCard`** no longer forces a launch→now window every load (that pulled the full payment-event history each render → slow dashboard). Uses the revenue-breakdown API's per-period defaults (Days = last 30, Months = last 12, Years = since launch). Adds per-point `pointLabels` so the hover tooltip shows the real date (was the sampled axis tick → repeated dates). Header is `flex-col sm:flex-row` so the **period toggle drops to its own row on mobile**; toggle uses the larger default `Segmented` size. Mobile passes `minPointPx={0}` so the chart fits to width and **touch-drag scrubs the focus** (`RevenueAreaChart` gained touch handlers + `touch-action: pan-y`). The tooltip **flips below** near the top, which let us drop the `pt-12 -mt-12` headroom hack that was overlapping/stealing clicks from the header toggle. Skeleton while loading.
- **`DashboardStatsSnapshotReader`** — live-day computation (All-Time exceeds the 90-day snapshot window) is **parallelized with a bounded pool (8)**, order-independent reduce, single refund-set load — byte-identical output, far less wall-clock. Clamps enumeration to today. Reader-test fixture moved `2099`→`2024` (the clamp skips future days); 10/10 pass.
- **Skeleton loaders** restored: `MetricCard` has a `loading` prop; `KpiGrid`/`MembershipCard`/`RevenueBreakdownCard`/`AdvertisingPlatformCard` accept `loading` and skeleton **only when no cached data yet** (`loading && !data`). `DashboardOverview` passes `statsLoading`/`membershipLoading`.

Cards:
- **`KpiGrid`** — Today's Revenue tile gained `sub="From all sources"` (height parity); "Conversion" → **"Conversion Rate"**.
- **`AdvertisingPlatformCard`** — columns now **Platform / Spend / Revenue / ROAS** (FB revenue = `spend × roas`); brand logos (inline SVG `src/components/admin/ui/PlatformLogos.tsx`) replace color swatches; rows add **Klaviyo Email** + **Klaviyo SMS** (Coming soon, alongside TikTok/Snapchat).
- **`MembershipCard`** — past-due badge shows `{n} past due · {fmtCompact(totalPastDueRevenue)}`. Donut arcs (`Donut.onSegmentClick`) + legend rows open `MembershipByPackageDetailModal` for that tier; users open via `useAdminUserModal`.
- **`RevenueBreakdownCard`** — bar rows (`BarList.onItemClick`) open `RevenueDetailModal` (`category` = source key); gets `dateRange`/`startDate`/`endDate`/`onUserClick` from `DashboardOverview`.
- **`TopDrawsCard`** — wired via `useTopMiniDraws` (active draws server-sorted by entries): name + status, capacity bar + %, entries. Per-draw revenue isn't derivable, so omitted; "View all" → `/admin/mini-draws`.
- **`PrizePerformanceCard`** — manual **Sync** now syncs a bounded **last-14-day** window (Meta 500'd after 31s pulling all-time).
