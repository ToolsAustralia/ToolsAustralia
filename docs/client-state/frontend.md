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
