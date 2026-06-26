# Client State — Frontend

This domain IS frontend (no backend surface).

See [architecture.md](./architecture.md) for the full layout: TanStack Query, Zustand stores, Contexts, generic hooks.

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
- `<FloatingPromoBannerHost />` — global floating promo banner orchestrator (replaces per-page mounting).
- Tracking trackers (Affiliate / Referral / PromoLink / Klaviyo identifier).

The `transition-colors duration-200 ease-out` utility was removed from `<body>` to stop a global colour-transition repaint on every theme flip.

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

**Live-progress polling (2026-06-24):** `useChargePastDueRunDetail` and `useChargePastDueRuns` now set a conditional `refetchInterval` — they poll (3 s detail / 5 s list) **only while a run's `status === "running"`** and stop once it finalizes. This surfaces the chunked bulk-charge job's incremental totals in the dashboard history view as it drains (the charge now runs as client-driven `start → chunk → …` requests that update `ChargeJobRun.totals` after each chunk — see `docs/admin/`).
