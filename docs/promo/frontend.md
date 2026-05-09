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

## className conventions (2026-05-08)

Promo components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Interaction smoothness (Phase 1, 2026-05-09)

Countdown timers in promo components — `GiveawayCountdownTimer`, `FloatingCountdownBanner`, `FreezePeroidBanner` — are now leaf-isolated via [`<CountdownLeaf>`](../../src/components/ui/CountdownLeaf.tsx) / [`useLeafTimer`](../../src/hooks/useLeafTimer.ts) so the parent promo section / banner host doesn't re-render on every tick. `OtherToolsetsCarousel` pauses its infinite framer-motion loop when offscreen via [`useInViewportAnimation`](../../src/hooks/useInViewportAnimation.ts), and `FloatingPromoBanner` / `FloatingGetEntriesButton` consume the device-tier CSS tokens (`--ta-blur`, `--ta-shadow-card`, `--ta-transition-dur`) so visual cost scales down on mobile / `Save-Data`. Floating elements set `data-floating-widget="true"` so the print stylesheet hides them. The new [`FloatingPromoBannerHost`](../../src/components/banners/FloatingPromoBannerHost.tsx) is mounted once in `providers.tsx` and orchestrates promo banner visibility globally instead of per-page mounting. See [shared-ui/patterns.md](../shared-ui/patterns.md#site-wide-interaction-smoothness--phase-1-2026-05-09) for the helpers.
