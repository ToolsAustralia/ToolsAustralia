# Client State — Frontend

This domain IS frontend (no backend surface).

See [architecture.md](./architecture.md) for the full layout: TanStack Query, Zustand stores, Contexts, generic hooks.

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
