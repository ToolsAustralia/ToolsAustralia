# Promo — Frontend

## Components

- [src/components/promo/](../../src/components/promo/) — promo display components
- [src/components/banners/](../../src/components/banners/) — site-wide banner components

## Pages

- `src/app/promotions/` — admin / setup-style promo pages
- `src/app/(site)/promotion/` — public promo landing pages

## Hooks

| Hook | Purpose |
|---|---|
| `usePromoLink()` | Resolve a `PromoLink` from URL params |
| `usePromoPageTracking()` | Write `PromoAnalyticsVisit` rows on promo-page visits |
| `usePromoWelcomeModal()` | Welcome modal for first-time promo visitors |

## Stores

- [src/stores/usePromoThemeStore.ts](../../src/stores/usePromoThemeStore.ts) — Zustand store for promo-driven theming overrides

## State conventions

- Banner text reads via TanStack Query (rarely changes)
- Per-page promo state via `usePromoLink()` hook
- Theme overrides via Zustand (synchronous client-side decisions)

## E2E test IDs

Specs in `e2e/promo/` consume these data-testids (registered in `e2e/utils/selectors.ts`):

| testid | Component | File |
|---|---|---|
| `promo-banner` | Header top bar (red/blue promotional bar) | `src/components/layout/Header.tsx` |
| `promo-banner-dismiss` | Top bar close X | `src/components/layout/Header.tsx` |
| `promo-welcome-modal` | `<ModalContainer testId>` on `PromoWelcomeModal` | `src/components/modals/PromoWelcomeModal.tsx` |
| `promo-welcome-code` | Code badge inside the welcome modal | `src/components/modals/PromoWelcomeModal.tsx` |

Notes:

- The top-bar dismiss button only updates React state in this branch; it does NOT write `topBarHidden` to localStorage. The bar reappears on reload for guests. Spec asserts within-session dismissal only.
- `PromoWelcomeModal` is gated by `sessionStorage["tools-aus:promo-welcome-shown:<CODE>"]`. Specs seed a real `PromoLink` row to drive the validate API.
- `useUTMPersistence` calls `extractAttributionParams(window.location.search)` which then calls `new URL("?...")` — this throws (not an absolute URL) and the function returns `{}` so UTM never persists in the current code path. The `link-tracking.spec.ts` documents this and only asserts the promo-code persistence path.

## FloatingPromoBanner page-aware spec (added 2026-05-05)

`e2e/banners-widgets/floating-promo-page-aware.spec.ts` (project: `chromium-guest`) loops the routes the banner is hard-coded to suppress on (`/shop`, `/affiliate`, `/login`, `/terms`, `/privacy`) and asserts `floating-promo-banner` is absent. Mirrors the pathname guards in `src/components/banners/FloatingPromoBanner.tsx`. The banner is also suppressed when no active promo multiplier is resolved (`activeMultiplier <= 1`), so banner-absent on a permitted route does not contradict the assertion — we only verify the page-guard branch.

Component edit: added `data-testid="floating-promo-banner"` to the outer `motion.div` of `FloatingPromoBanner` (testid was reserved in `e2e/utils/selectors.ts` but not previously applied).
