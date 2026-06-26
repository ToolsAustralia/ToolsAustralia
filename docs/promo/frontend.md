# Promo — Frontend

## Components

- [src/components/promo/](../../src/components/promo/) — promo display components
- [src/components/banners/](../../src/components/banners/) — site-wide banner components

## Pages

- `src/app/promotions/` — admin / setup-style promo pages
- `src/app/(site)/promotion/` — public promo landing pages

### Klaviyo `Viewed Giveaway` event mount (added 2026-05-28)

[`PromoViewTracking.tsx`](../../src/app/promotions/_components/PromoViewTracking.tsx) is a zero-render client component that fires the canonical Klaviyo `Viewed Giveaway` event once per route change. It is mounted in two places to cover every `/promotions/*` route with a single client-side fire:

- [`src/app/promotions/[slug]/page.tsx`](../../src/app/promotions/[slug]/page.tsx) — covers all dynamic-slug promo pages.
- [`src/app/promotions/_components/ToolsetLandingPage.tsx`](../../src/app/promotions/_components/ToolsetLandingPage.tsx) — covers the four brand pages (`/promotions/dewalt`, `/makita`, `/milwaukee`, `/ryobi`) which all render through this shared component.

Both mounts pass the resolved `prize` from [src/config/prizes.ts](../../src/config/prizes.ts) — `title` prefers `prize.heroHeading` falling back to `prize.label`, `prizeName` is `prize.label`, `prizeImageUrl` is `prize.gallery?.[0]?.src` (omitted when absent, per the canonical no-sentinel rule). Mirrors the established pattern in [`MiniDrawViewTracking.tsx`](../../src/app/(site)/mini-draws/[id]/components/MiniDrawViewTracking.tsx) and [`ProductViewTracking.tsx`](../../src/app/(site)/shop/[slug]/components/ProductViewTracking.tsx). The event coexists with the existing `Viewed Page` (`PageType: "promotion"`) — does not replace it. Schema + snapshot test live under [docs/tracking/](../tracking/KLAVIYO_INTEGRATION.md).

## Hooks

| Hook | Purpose |
|---|---|
| `usePromoLink()` | Resolve a `PromoLink` from URL params |
| `usePromoPageTracking()` | Write `PromoAnalyticsVisit` rows on promo-page visits |
| `usePromoWelcomeModal()` | Welcome modal for first-time promo visitors |

## Stores

- [src/stores/usePromoThemeStore.ts](../../src/stores/usePromoThemeStore.ts) — Zustand store for promo-driven theming overrides

## Static banner left-visual (SpecialPromo, 2026-06)

The PromoBanner left image is resolved by [`resolvePromoBannerLeftVisual`](../../src/utils/promo-banner/resolve-promo-banner-left-visual.ts) (Holiday art → variant `leftImageUrl` → scheduled `imageUrl` → static brand art). The static family is now one of three states (`build-static-promo-banner-paths.ts`):

- `drawn-tonight` — draw calendar date is today
- `drawn-tomorrow` — ≤48h to freeze
- `special-promo` — **everything else** (any active/scheduled promo + default)

The old `last-chance` / `ends-tonight` families and their `LastChance/` `EndsTonight/` image folders were removed; every non-draw state now uses `{Brand}/SpecialPromo/special-promo-{3|5|10}x.webp` (art reads "SPECIAL PROMO — {N}x ENTRIES ACTIVATED"). SpecialPromo ships only 3×/5×/10× — [`specialPromoMultiplierFileKey`](../../src/utils/promo-banner/banner-multiplier-file-key.ts) maps 2×/unknown/null to 10×, so keep 2× out of promos. Full behaviour: [docs/PROMO_BANNER_BEHAVIOUR.md](../PROMO_BANNER_BEHAVIOUR.md).

## State conventions

- Banner text reads via TanStack Query (rarely changes)
- Per-page promo state via `usePromoLink()` hook
- Theme overrides via Zustand (synchronous client-side decisions)

## className conventions (2026-05-08)

Promo components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Interaction smoothness (Phase 1, 2026-05-09)

Countdown timers in promo components — `GiveawayCountdownTimer`, `FloatingCountdownBanner`, `FreezePeroidBanner` — are now leaf-isolated via [`<CountdownLeaf>`](../../src/components/ui/CountdownLeaf.tsx) / [`useLeafTimer`](../../src/hooks/useLeafTimer.ts) so the parent promo section / banner host doesn't re-render on every tick. `OtherToolsetsCarousel` pauses its infinite framer-motion loop when offscreen via [`useInViewportAnimation`](../../src/hooks/useInViewportAnimation.ts), and `FloatingPromoBanner` / `FloatingGetEntriesButton` consume the device-tier CSS tokens (`--ta-blur`, `--ta-shadow-card`, `--ta-transition-dur`) so visual cost scales down on mobile / `Save-Data`. Floating elements set `data-floating-widget="true"` so the print stylesheet hides them. The new [`FloatingPromoBannerHost`](../../src/components/banners/FloatingPromoBannerHost.tsx) is mounted once in `providers.tsx` and orchestrates promo banner visibility globally instead of per-page mounting. See [shared-ui/patterns.md](../shared-ui/patterns.md#site-wide-interaction-smoothness--phase-1-2026-05-09) for the helpers.

## FloatingPromoBanner safe-area inset (2026-06-09)

[`FloatingPromoBanner`](../../src/components/banners/FloatingPromoBanner.tsx) is `fixed bottom-0` and now carries `pb-[env(safe-area-inset-bottom)]` on its root so its content clears the iOS home indicator. This became necessary once the app set `viewport-fit=cover` in the viewport meta — that removes the browser's automatic safe-area inset, so any bottom-pinned element must add the padding itself. Keep this class when restyling the banner.

## Cobber support widget on promotions (2026-06-26)

The promotions route group (`src/app/promotions/`) is **outside** `(site)`, so it never inherited the AI support widget mounted in `(site)/layout.tsx`. It is now mounted in [`src/app/promotions/layout.tsx`](../../src/app/promotions/layout.tsx) via `<SupportChatWidgetMount side="left" />` — **docked bottom-LEFT** because the promotions pages already use bottom-right for the guest theme toggle ([`PromotionsGuestThemeToggle`](../../src/components/ui/ThemeToggle.tsx), `fixed bottom-4 right-4`) and the account FAB. The widget bubble sits at `z-9000` (above the promo floating banner/toggle), so it floats over any `fixed bottom-0` promo banner rather than being hidden. Corner is controlled by the `SupportChatWidget` `side?: "left" | "right"` prop (default `"right"` everywhere else). See [ai-chatbot/README.md](../ai-chatbot/README.md) row 5.

## PrizeShowcase gallery — Embla migration (Phase 1.5, 2026-05-10)

[`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx) main image + thumbs gallery migrated from Swiper (`EffectFade` + `Grid` modules) to Embla (`embla-carousel-react`) with `embla-carousel-fade` and `embla-carousel-class-names` plugins. Two user-reported bugs fixed by the migration:

1. **Click-snapback on second-page thumbs.** Swiper combined `slideToClickedSlide` with `slidesPerGroup: 12`, causing a click on a second-page thumb to jump back to the first page. Embla has no equivalent — thumb click only calls `mainApi.scrollTo(i)`; the thumbs viewport stays put unless the active item leaves the visible window.
2. **Last 2 of 18 items unreachable on mobile.** Swiper Grid (`rows: 2`, `slidesPerView: 4`, `slidesPerGroup: 8`) refused to advance to a partial third page (remainder < `slidesPerView`). Embla replaces this with a **column-grouping** approach: `enhancedGallery` is grouped into pairs of 2 — each Embla slide is one column holding 2 stacked thumbs (`flex flex-col gap-2`). With 18 items → 9 columns; mobile shows 4 columns at a time, all reachable. Slide widths use responsive Tailwind: `flex-[0_0_25%] sm:flex-[0_0_20%] lg:flex-[0_0_16.66%]` (4 / 5 / 6 columns visible).

Other migration notes: prev/next buttons rewired from `mainSwiperRef.current.slidePrev/Next()` to `mainApi.scrollPrev/Next()`; `mainCanSlidePrev/Next` and `thumbCanSlidePrev/Next` derived from `canScrollPrev()` / `canScrollNext()` via `select` / `reInit` event handlers; viewport divs keep the `main-swiper` / `thumbs-swiper` className for any pre-migration shared CSS in [`globals.css`](../../src/app/globals.css) (Swiper-internal selectors no longer match anything in this component but still apply to `MajorDrawSection` until Phase 4); `touch-action: pan-y pinch-zoom` set on each viewport for iOS Safari vertical-scroll passthrough; `data-carousel="true"` set so the print stylesheet styles them as static. Three previously-missing `<Image sizes=>` attributes added (first-prize text banner; two Stripe checkout images).

Phase 3's `FullscreenImageViewer` and `MiniDrawImageGallery` Swiper migrations are intentionally still pending — they don't share the click-snapback / unreachable-trailing-items bugs.

## PromoTrustBar — Workshop Caution Plaque redesign (2026-05-14)

[`PromoTrustBar`](../../src/components/sections/promo/PromoTrustBar.tsx) renders the thin strip at the top of promo pages. The countdown lives in [`GiveawayCountdownTimer`](../../src/components/sections/promo/GiveawayCountdownTimer.tsx), so this bar is intentionally **static** — no animation, no countdown numbers. Urgency is signalled by typography, material, and a hazard-stripe channel that escalates per tier.

**Shell** (shared across every state, via the internal `WorkshopShell` helper):
- Brushed-steel body (`STEEL_BG` + `STEEL_GRAIN` CSS gradients)
- Brass rivets in the four inset corners (`<Rivet />`)
- Top + bottom edge bands:
  - **Default state (no urgency)** — 2 px brass rule gradient. Hazard yellow is *absent* so it retains urgency meaning when it appears.
  - **Urgency states** — diagonal hazard stripe band whose thickness escalates: `finalHours` 6 px → `drawnTomorrow` 8 px → `drawnTonight` / `frozen` 10 px. Frozen swaps the yellow+black hazard for a red+yellow `HAZARD_STRIPE_FROZEN` variant.

**Default state content**: three trust items (Trophy / Shield-link / Calendar) on the steel substrate. Icons use `theme.primary` from [`usePromoTheme`](../../src/stores/usePromoThemeStore.ts); text is white stencil (Oswald/Bebas Neue family). The cert link host is intentionally **not themed** — kept white at every breakpoint so the attribution link reads cleanly on dark steel regardless of brand colour.

The cert item is **visible at every breakpoint** in the normal state. Mobile + tablet render just the link host (`randomdraws.com.au`); desktop (`≥lg`) prepends the `Govt-certified draws · ` prefix. Text items also swap their compact (`lineMobile`) vs verbose (`lineDesktop`) variants at the same `lg:` breakpoint, so the 640 px tablet width fits all three items without overlap. The urgency state replaces the entire trust-items layout with the brass-plaque deadline strip, so the cert is implicitly hidden during `finalHours` / `drawnTomorrow` / `drawnTonight` / `frozen` without an explicit `hidden` rule.

**Urgency state content**:
- **Desktop**: brass nameplate on the left containing a `Clock`/`Lock` icon (tinted with `theme.primary`) and an engraved tier label (`FINAL HOURS` / `DRAWN TOMORROW` / `DRAWN TONIGHT` / `ENTRIES CLOSED`), followed by the deadline text (preLine + `formatDeadlineLabel`), followed by the existing urgency image pinned right. The plaque sits on a 3 px theme-coloured "shelf" (a brand-tinted `box-shadow`) so the brand reads underneath the brass surface.
- **Mobile (<sm)**: the brass nameplate is **dropped** — the urgency image already carries the tier label visually. Layout becomes: standalone timer icon + deadline text on the left, image on the right.
- **Frozen**: brass plaque swaps to a red gradient (`RED_BG`), engraved text uses the darker `ENGRAVED_TEXT_RED` tone, icon swaps from `Clock` to `Lock`, hazard band swaps to the red variant. The brand-coloured shelf is intentionally **dropped** — the red "STOP, entries closed" signal must not be muddied by brand colour.

**Theme integration** — three surfaces accept `theme.primary` / `theme.primaryLight` from `usePromoTheme()`:
1. **Default-state brass rule** (`buildBrassRule(themePrimary)`): the 2 px brass edge gradient blends the brand colour into its middle stop, so the chassis itself reads brand-tinted without losing the brass feel.
2. **Brass plaque underglow** (urgency, non-frozen): a 3 px theme-coloured drop-shadow below the plaque.
3. **Icons** (default & urgency): trust-item icons, the small icon inside the brass plaque, and the mobile standalone timer icon all use `theme.primary`. The cert link host stays white (readability over brand expression).

Hazard yellow, brushed steel, brass rim, and rivets stay constant across themes — these define the workshop substrate and are not branded. Frozen overrides everything to red.
