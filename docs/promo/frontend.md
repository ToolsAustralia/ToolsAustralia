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

## PrizeShowcase gallery — Embla migration (Phase 1.5, 2026-05-10)

[`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx) main image + thumbs gallery migrated from Swiper (`EffectFade` + `Grid` modules) to Embla (`embla-carousel-react`) with `embla-carousel-fade` and `embla-carousel-class-names` plugins. Two user-reported bugs fixed by the migration:

1. **Click-snapback on second-page thumbs.** Swiper combined `slideToClickedSlide` with `slidesPerGroup: 12`, causing a click on a second-page thumb to jump back to the first page. Embla has no equivalent — thumb click only calls `mainApi.scrollTo(i)`; the thumbs viewport stays put unless the active item leaves the visible window.
2. **Last 2 of 18 items unreachable on mobile.** Swiper Grid (`rows: 2`, `slidesPerView: 4`, `slidesPerGroup: 8`) refused to advance to a partial third page (remainder < `slidesPerView`). Embla replaces this with a **column-grouping** approach: `enhancedGallery` is grouped into pairs of 2 — each Embla slide is one column holding 2 stacked thumbs (`flex flex-col gap-2`). With 18 items → 9 columns; mobile shows 4 columns at a time, all reachable. Slide widths use responsive Tailwind: `flex-[0_0_25%] sm:flex-[0_0_20%] lg:flex-[0_0_16.66%]` (4 / 5 / 6 columns visible).

Other migration notes: prev/next buttons rewired from `mainSwiperRef.current.slidePrev/Next()` to `mainApi.scrollPrev/Next()`; `mainCanSlidePrev/Next` and `thumbCanSlidePrev/Next` derived from `canScrollPrev()` / `canScrollNext()` via `select` / `reInit` event handlers; viewport divs keep the `main-swiper` / `thumbs-swiper` className for any pre-migration shared CSS in [`globals.css`](../../src/app/globals.css) (Swiper-internal selectors no longer match anything in this component but still apply to `MajorDrawSection` until Phase 4); `touch-action: pan-y pinch-zoom` set on each viewport for iOS Safari vertical-scroll passthrough; `data-carousel="true"` set so the print stylesheet styles them as static. Three previously-missing `<Image sizes=>` attributes added (first-prize text banner; two Stripe checkout images).

Phase 3's `FullscreenImageViewer` and `MiniDrawImageGallery` Swiper migrations are intentionally still pending — they don't share the click-snapback / unreachable-trailing-items bugs.
