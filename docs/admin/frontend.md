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
- `BlockedTransactionsManagement.tsx` — blocked-card / Stripe allowlist admin UI. Mongo-backed: reads via `useBlockedCards(filter)` (cursor-paginated against the persisted `BlockedTransaction` collection). Hook returns `{ rows, total, hasMore, isLoading, isFetching, isFetchingNextPage, fetchNextPage, refetch, error }`. The table card shows a "Showing X of Y" counter and a "Load more" button at the bottom. Query errors surface in an amber banner above the filters card. Eligibility badges: auto-eligible / already-allowlisted / fraud-signal / permanent-issue / not-member. The "Allowlist with override" button bypasses every filter (records `manual_admin_override`). The dataset uses the narrower `outcome.type === "blocked"` filter (matches Stripe Dashboard's "Blocked" pill). Service contract: [billing-stripe/architecture.md](../billing-stripe/architecture.md#service-inventory--allowlistservice).
  - **Filters (2026-05-07)**: date range matches `/admin/past-due-history` exactly — `DateRangeToggle` chips (Today / Yesterday / Current Draw / Last Draw / All Time / Custom) with `useAdminMobileDateToolbarSlot()` portaling on mobile, draw-aware presets via `useCurrentAndLastDrawDates()`, custom range via `CustomDateRangeModal` with `useMajorDrawsForDateRange()` highlighting. Plus an **email substring search** (debounced 300ms, server-side regex), an **eligibility multi-select** (auto-eligible / already-allowlisted / fraud-signal / permanent-issue / skipped — not member), and a **decline-code multi-select** grouped by Recoverable / Fraud signals / Permanent issues / Other (options from [src/utils/billing/declineCodeLabels.ts](../../src/utils/billing/declineCodeLabels.ts)).
  - **Metric cards**: Total blocked (current filters) · Auto-eligible · Skipped — filter · **Total on allowlist** (all-time, all active fingerprints, driven by `useAllowlistStats()` against `GET /api/admin/allowlist/stats`).
  - **Email column** is clickable via `ClickableUserDisplay` — opens the same `UserDetailModal` the users + past-due-history tabs use. `BlockedRow.userId` is resolved server-side in `listBlocked` (joins `User` by `stripeCustomerId` then `customerEmail`); guests render as plain text.
  - **Eligibility verdict** is computed by the shared mapper [src/utils/admin/blockedTransactionEligibility.ts](../../src/utils/admin/blockedTransactionEligibility.ts) so the post-join filter and the in-row badge can never disagree.
  - **MultiSelectFilter** popover component lives at [src/components/admin/MultiSelectFilter.tsx](../../src/components/admin/MultiSelectFilter.tsx) and powers both the eligibility and decline-code multi-selects.
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

**Mobile cards (sm:hidden)** — error message + auto-logged/timestamp metadata at top, badges row (severity / category / status), then a `<dl>` with explicit `User / API / Page` rows. Full-width red "View Investigation" CTA at the bottom with adequate touch target.

**Detail modal (ErrorReportDetailModal)** — slide-up bottom-sheet on mobile (`items-end` + `rounded-t-2xl`), centred dialog on `sm+`. The info section is a 4-up grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) of User / API / Page / Environment panels — split from the previous combined Route+API panel. Diagnostic "Copy Context" string includes both API and Page on separate lines.

**Long-content panels in the modal (Stack Trace + Console Logs / Notes)** must use `min-w-0` on the grid item, `overflow-x-hidden` (or `overflow: auto`) on the scroll container, and `whitespace-pre-wrap break-all` on the inner text. Without these, long JSON / URL payloads in `consoleErrors[].message` blow out the grid column and burst the modal on small screens.

**Note: `ErrorReportsAnalytics` component was deleted 2026-05-11.** The server still returns `analytics` in the response payload (the API contract is unchanged), but the client no longer consumes or renders it. If you reintroduce an analytics view, the data is already on the response — restore an `analytics` field on the `ErrorReportsResponse` type and render it.

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

  **Manual Retries — grouped-by-user UX.** Rows are no longer flat; they're collapsed into one row per user via `groupChargeAttemptsByUser` from [src/utils/admin/groupChargeAttemptsByUser.ts](../../src/utils/admin/groupChargeAttemptsByUser.ts). The summary row shows last-attempt time, admin label, user (rendered with `<ClickableUserDisplay>` so clicking the email opens `UserDetailModal`), attempt count + per-status breakdown (`N✓ N✗ N⏭`), latest-status badge, and total amount. A chevron toggles a nested table with per-attempt rows (When / Invoice / Status / Amount / Error / Action). Stranded-error rows still expose the `Recover` button + checkbox; the group-row checkbox toggles all stranded attempts for that user (supports `indeterminate` state).

  **Server-side user search.** A debounced `<input type="search">` next to the bulk-recover button drives a `userSearch` query param sent to `GET /api/admin/charge-past-due/manual-retries`. `useDebounce(input, 300)` smooths typing; the `filter` memo is keyed on the debounced value so changing the search resets pagination from offset 0. The Bulk Runs query receives the same `filter` object but the API ignores `userSearch`.

  **"Loaded attempts only" hint.** When the manual-retries query has more pages, a small line `"Per-user counts reflect loaded attempts only. Click \"Load more\" to widen the view."` renders above the Load-more button — per-user totals only aggregate over the currently-fetched pages, not the unbounded server-side total.

  **Error column precedence.** Both per-attempt error cells render `r.declineCode ?? r.errorCode ?? r.errorMessage ?? ""` so the most specific Stripe signal wins (e.g. `do_not_honor` over the generic `card_declined` bucket).

- [src/app/admin/component/PastDueChargeHistoryDrawer.tsx](../../src/app/admin/component/PastDueChargeHistoryDrawer.tsx) — slide-in drawer for a single run. Fetches `GET /api/admin/charge-past-due/runs/[runId]` via `useChargePastDueRunDetail` and displays a status-badged Summary card (started / finished / duration / admin / eligible / attempted / succeeded / failed / revenue) with a Skip-breakdown subsection, plus a Per-invoice attempts card-table. Uses the admin neutral palette (`dark:bg-neutral-900`, `dark:border-neutral-800`) and the same `RunStatusBadge` / `RetryStatusBadge` colours as the parent page.

  **Per-invoice attempts — grouped-by-user UX.** Same `groupChargeAttemptsByUser` grouping as the parent page, with a chevron-driven collapsible per-user row. Rows are augmented with the run's `adminName` (one admin per run, so the DTO doesn't carry it per-row) before grouping. A **client-side** email search input (no debounce, no API call) filters `groupedAttempts` by `userEmail.includes(query.toLowerCase())` — search is local because the entire run's row set is already in memory. Header shows `{groupedAttempts.length} users` instead of a row count. User emails render via `<ClickableUserDisplay>`.

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

## Hooks

| Hook | Purpose |
|---|---|
| `useAdminMobileDateToolbarSlot()` | Admin-specific date toolbar mobile UX |
| (admin queries via `useAdminQueries.ts`) | TanStack Query hooks for admin data |

## Theme

Admin uses [AdminThemeContext](../theme/architecture.md#three-contexts) — separate from member theme.

## className conventions (2026-05-08)

All admin components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}` across this domain. When adding new conditional classes, use `cn()` rather than template literals.
