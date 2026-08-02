# Client State — Frontend

This domain IS frontend (no backend surface).

See [architecture.md](./architecture.md) for the full layout: TanStack Query, Zustand stores, Contexts, generic hooks.

> **Forced-logout storage clear (2026-07-02, updated 2026-07-09):** the forced-logout path in
> [`queries.ts`](../../src/lib/queries.ts) — now **401 or 404+`USER_NOT_FOUND` only** (403 was removed:
> it force-logged-out staff with partial permissions, see [gotchas.md](./gotchas.md)) — calls
> `clearUserScopedClientStorage()` before its in-place `signOut()`, so an expired session also wipes
> user-scoped client storage (`modal-priority-store` lives here too).
> See [auth/frontend.md](../auth/frontend.md#total-sign-out-2026-07-02).

## `useRevenueBreakdown` — `ChartData.membershipRenewals` (2026-06-15)

[`useAdminQueries.ts`](../../src/hooks/queries/useAdminQueries.ts) `ChartData` (and
`RevenueBreakdownResponse.totals`) gained an optional `membershipRenewals` — the
renewal subset of `memberships` per point. The Overview revenue chart subtracts it
client-side for its "Exclude renewals" toggle (`total − membershipRenewals`), so
the recurring-vs-new split needs no separate request. See
[admin/frontend.md](../admin/frontend.md).

## Root providers (2026-05-09)

[`src/app/providers.tsx`](../../src/app/providers.tsx) is the single root client tree. It composes (in order): `ErrorBoundary` → `ThemeProvider` → `SessionProvider` → `QueryClientProvider` → `ApiErrorBoundary` → `UserProvider` → `SidebarProvider` → `CartProvider` → `LoadingProvider` → `ToastProvider` → `MotionConfig`. Inside `MotionConfig` it mounts:

- `<DeviceTierProvider />` — once, writes `data-tier` / `data-viewport-tier` / `data-save-data` on `<html>`. See [shared-ui/patterns.md](../shared-ui/patterns.md#device-tier-system).
- `<MotionConfig reducedMotion="user">` — framer-motion respects OS `prefers-reduced-motion`.
- Tracking trackers (Affiliate / Referral / PromoLink / Klaviyo identifier).

The `transition-colors duration-200 ease-out` utility was removed from `<body>` to stop a global colour-transition repaint on every theme flip.

The file's dead re-export block (Skeleton/Progress/Spinner loaders, ErrorRecovery variants, `useErrorRecovery` — zero importers ever used the `@/app/providers` path for them) was deleted in perf Tier-2 (2026-07-20); import those from their own modules (`@/components/loading/*`, `@/components/error/ErrorRecovery`, `@/hooks/useErrorRecovery`).

## Listener helpers in floating widgets

`RewardsFloatingWidget` uses [`addThrottledResize`](../../src/utils/dom/listenerHelpers.ts) instead of a raw `window.addEventListener("resize", …)` so positional recompute on viewport resize is RAF-throttled. The button is tagged with `data-floating-widget="true"` for the print stylesheet.

## When to use which

- **Server data** (anything from API) → TanStack Query
- **Cross-cutting client state** (theme, modal priority) → Zustand
- **Scoped client state** (sidebar open, current cart) → Context
- **Per-component derived state** → useState / useReducer

Don't mix. Common mistake: mirroring server-state into Zustand. Don't.

## Admin query type additions (2026-06-02, Overview redesign round 2)

`src/hooks/queries/useAdminQueries.ts` gained:
- `MembershipByPackageSummary.totalPausedCount: number` — surfaced by the membership-by-package endpoint (a 30-day retention-pause proxy from `CancellationFlowEvent`; see `docs/admin/`). Consumed by the Overview `MembershipCard` "Paused" badge.
- `MembershipByPackageSummary.totalActiveRevenueTrend?: TrendData` (added 2026-06-03) — MRR % change vs the previous comparable period, computed server-side from the daily membership snapshot. Consumed by the Overview MRR KPI tile (`trendPct(...)`). Omitted for all-time and when the baseline day has no snapshot; see `docs/admin/api.md`.
- `ActivityLogItem.type` union extended with `upsell_accepted`, `cancellation_offer_accepted`, `admin_role_update`, `affiliate_payout` (kept in sync with the `/api/admin/activity-log` route's union; the separate `RecentActivity` type for `/api/admin/dashboard/recent-activities` is intentionally NOT extended). `useActivityLogInfinite` carries these to the Overview activity feed.

`src/hooks/queries/admin/useAdminMiniDrawsList.ts` adds **`useTopMiniDraws(poolLimit = 50)`** — the full **active** mini-draw pool (`?status=active&sortBy=totalEntries&sortOrder=desc&limit=N`), returning `{ _id, name, status, totalEntries, minimumEntries }`. The Overview `TopDrawsCard` ranks this pool **client-side by fill ratio** (`entries ÷ capacity`) and takes the top 5 — the list route has no fill-ratio sort key, so the hook returns the whole (small) active set and the card does the "closest to drawing" ordering.

`src/hooks/queries/useMerByDraw.ts` adds **`useMerByDraw()`** — keyed `["admin","analytics","mer-by-draw"]`, no params (the endpoint returns every MER-eligible draw, newest first). Feeds the Overview `MerByDrawCard` (Marketing Efficiency Ratio per draw). Response shape (`MerByDrawResponse`) lives in the shared `src/types/admin/mer.ts` so the server service and this client hook don't duplicate the contract. See `docs/admin/mer-table.md`.

`src/hooks/queries/useAdminQueries.ts` adds **`usePlatformRevenueBreakdown(...)`** — per-platform acquisition revenue split by source category plus a paginated buyer list (`PlatformRevenueBreakdownData` / `PlatformByCategoryEntry`). Keyed `["admin","dashboard","revenue-details-by-platform", platform, dateRange, startDate, endDate, category, page, summaryOnly]`, hits `/api/admin/dashboard/revenue-details/by-platform`, and `enabled` only when a `platform` is set. `summaryOnly` (the hover preview) requests just the category bars and uses a longer `staleTime` (5 min vs 1 min).

`src/hooks/queries/admin/useChargePastDueRuns.ts` — `ListedRunDTO` gained **`kind: "charge" | "recover"`** (2026-06-16). Past-Due Charge History now lists BOTH normal charge runs and stranded-invoice recovery runs in one "Bulk Runs" table (the `recover` runs were previously hidden); the UI badges Recovery vs Charge and folds recovery revenue into the same summary total. Mirrors `ListedRun` in `chargePastDueHistory.ts` and the Norm `/v1/charge-past-due/runs` schema.

`src/hooks/queries/admin/useChargePastDueRunDetail.ts` — `RunDetailRowDTO` gained an optional **`recovery: { bulk?, step?, newInvoiceId? }`** (2026-07-31). The drawer needs it to count declines correctly: a bulk recovery writes one summary row per member, and only the rows *without* a `newInvoiceId` lack a separately-coded counterpart, so only those may be counted. Without the field the drawer double-counted recovered members and bucketed the codeless half as `unknown`. Bucketing logic is shared with the server via `src/utils/admin/chargeDeclineReasons.ts` — do not re-implement it in a component. Mirrors `RunDetailRow` in `chargePastDueHistory.ts` and the Norm `/v1/charge-past-due/runs/{runId}` schema.

**Live-progress polling (2026-06-24):** `useChargePastDueRunDetail` and `useChargePastDueRuns` now set a conditional `refetchInterval` — they poll (3 s detail / 5 s list) **only while a run's `status === "running"`** and stop once it finalizes. This surfaces the chunked bulk-charge job's incremental totals in the dashboard history view as it drains (the charge now runs as client-driven `start → chunk → …` requests that update `ChargeJobRun.totals` after each chunk — see `docs/admin/`).

## Packages-focus additions (2026-07-17)

`src/hooks/queries/usePackagesFocusBreakdown.ts` adds **`usePackagesFocusBreakdown(platform, startDate, endDate, { enabled? })`** — keyed `["admin","analytics","packages-focus", platform, startDate, endDate]`, hits `GET /api/admin/analytics/packages-focus`, enabled only when both dates are set. Response types (`PackagesFocusBreakdownResponse`, `PackagesFocusTotals`, campaign/adset/ad node types) are re-declared in the hook file per convention; `PackagesFocusAdNode.packagesFocus?` is a client-side-only field set by the prize modal's grouper. Consumed by `AdSpendFocusModal`, `PrizePerformanceAdsModal` (types only), `CampaignTreeTable`, and `SpendByUrlSection`'s focus strip (see `docs/admin/frontend.md`).

`src/hooks/queries/useSpendByUrlAnalytics.ts` type extensions (byte-identical mirrors of the service shapes, per this file's re-declare convention): `SpendByUrlRow.packagesFocus?` — optional membership/one-time split (`SpendByUrlFocusTotals { spend; spendCents; revenue; revenueCents; conversions; roas }`; absent = pre-split data or `unknown://` row); `SpendByUrlDetailRow` gains optional `campaignId/campaignName/adsetId/adsetName` + required `packagesFocus: "membership" | "one-time" | "unclassified"`. Consumed by the Prize Performance modal's campaign tree and the Facebook Ads tab's focus chips/badges (see `docs/admin/frontend.md`).

## 2026-07-20 — LazyMotion in providers

`src/app/providers.tsx` now wraps the tree in `<LazyMotion features={loadMotionFeatures}>`
(non-strict), where `loadMotionFeatures` async-imports `src/app/lazy-motion-features.ts`
(default-exports `domMax`). This code-splits framer-motion features out of the shared chunk
into a post-hydration async chunk (landing routes −~16 kB First Load JS). Pattern + rules:
docs/shared-ui/patterns.md P7.
