# Site-wide Interaction Smoothness — Design Spec

- **Date:** 2026-05-09
- **Branch:** `claude/ShopFeature`
- **Goal:** Every interaction (scroll, swipe, hover, tap, modal open) feels smooth on phone, tablet, and desktop. Cover modern Chrome, Safari (iOS + macOS), Firefox, Edge.
- **Constraint:** Desktop visual identity unchanged. Mobile/tablet may simplify effects.
- **Out of scope:** API/network latency, accessibility audit, admin pages, Tailwind v4, framer-motion → motion/react migration, React Compiler, capability-class detection beyond OS-level signals (`Save-Data`, `prefers-reduced-motion`, `prefers-reduced-transparency`), custom performance telemetry pipes (Vercel Speed Insights at 10% sample is already mounted and sufficient).
- **Definition of done per phase:** lint + type-check + `next build` clean, no visual regression on the verification page set on desktop, sustained 60fps on a Pixel 4a profile (4× CPU, Slow 4G) for the listed interactions. Each phase is a separate commit.

---

## 1. Why this exists

The site uses patterns that compound into mobile/tablet jank:

1. **Two carousel libraries** (Swiper + Embla, ~55KB gz). 9 Swiper instances, 5 Embla, 1 hand-rolled.
2. **Every modal eagerly imported.** Stripe-bearing modals fire `loadStripe()` at module init on every dashboard mount (~140KB gz on `/my-account/*` first paint).
3. **Twelve+ 1-second `setInterval` countdowns** re-rendering parents that contain carousels and inline `style={{}}` / Embla `plugins[]` arrays — silent reinit storm.
4. **79 files use `backdrop-blur`** (176 instances), **157 files have always-on infinite animations** (316 occurrences) — composite cost murders mobile scroll.
5. **15+ unthrottled resize listeners**, **non-passive wheel/touchmove** in modal scroll-locking utilities.
6. **No tier awareness.** A 7" Android tablet (768px viewport, weak GPU) and an iPhone Plus landscape (~932px) get the full desktop effect stack.
7. **No iOS Safari fixes.** Tailwind doesn't emit `-webkit-backdrop-filter`. Embla viewports without `touch-action` lock vertical scroll on iOS during horizontal drag. `min-h-screen` gets covered by Safari toolbar.
8. **No print stylesheet.** Carousels and floating widgets render in printed pages.

---

## 2. Strategic decisions

### 2.1 One carousel library: Embla v8

Replaces every Swiper feature we use. ~7KB core + ~2KB plugins vs Swiper ~45KB. Already in deps for some carousels.

**Add:** `embla-carousel-fade`, `embla-carousel-class-names`.
**Remove (Phase 4):** `swiper`, `embla-carousel-autoplay` (installed but never imported).

Net bundle delta after Phase 4: **−45KB gz**.

### 2.2 Three device tiers via CSS tokens

Three tiers — `mobile`, `tablet`, `desktop` — selected by viewport width. One Save-Data tier override that forces `mobile`. OS modes (`prefers-reduced-motion`, `prefers-reduced-transparency`) handled via `@media` rules.

```
mobile  : < 768px    OR  Save-Data on
tablet  : 768–1023px
desktop : ≥ 1024px
```

A `<DeviceTierProvider>` (renders nothing) sets `data-tier` and `data-save-data` on `<html>`. Components consume CSS custom properties keyed off `data-tier`. **Components stay declarative; no JS branches in render.**

```css
/* globals.css additions */
:root {
  --ta-blur:               12px;
  --ta-shadow-card:        0 16px 48px rgb(0 0 0 / 0.40);
  --ta-shadow-card-hover:  0 24px 60px rgb(0 0 0 / 0.55);
  --ta-card-hover-y:       -4px;
  --ta-transition-dur:     200ms;
  --ta-marquee-state:      running;
}
html[data-tier="mobile"] {
  --ta-blur: 0px;
  --ta-shadow-card: 0 4px 12px rgb(0 0 0 / 0.30);
  --ta-shadow-card-hover: 0 4px 12px rgb(0 0 0 / 0.30);
  --ta-card-hover-y: 0px;
  --ta-transition-dur: 150ms;
}
html[data-tier="tablet"] {
  --ta-blur: 4px;
  --ta-shadow-card: 0 8px 24px rgb(0 0 0 / 0.35);
  --ta-shadow-card-hover: 0 12px 32px rgb(0 0 0 / 0.45);
  --ta-card-hover-y: -2px;
}
html[data-save-data="true"] { --ta-marquee-state: paused; }

@media (prefers-reduced-motion: reduce) {
  :root { --ta-transition-dur: 1ms; --ta-marquee-state: paused; }
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
@media (prefers-reduced-transparency: reduce) {
  :root { --ta-blur: 0px; }
}
@media print {
  [data-print="hide"], header[data-sticky="true"], [data-floating-widget],
  [data-tracking-pixel] { display: none !important; }
  html, body { background: #fff !important; color: #000 !important; }
}
```

Components use the tokens:
```tsx
<div className="backdrop-blur-[var(--ta-blur)] shadow-[var(--ta-shadow-card)]
                hover:translate-y-[var(--ta-card-hover-y)]
                transition-[transform,box-shadow,opacity]
                duration-[var(--ta-transition-dur)]" />
```

### 2.3 iOS Safari companion fixes

1. **`-webkit-backdrop-filter`** alongside `backdrop-filter`. Tailwind v3 doesn't emit the webkit prefix. Add a small CSS rule in `globals.css` that mirrors Tailwind's `backdrop-filter` to `-webkit-backdrop-filter` for any element matching `[class*="backdrop-blur"]`.
2. **`touch-action: pan-y pinch-zoom`** on every Embla viewport so vertical page scroll passes through horizontal drag. Built into our `EmblaCarousel` wrapper.
3. **`min-h-svh` instead of `min-h-screen`** for hero sections — Safari toolbar accounted for. Audit once and convert.
4. **`window.visualViewport`** keyboard avoidance for `ModalContainer` so iOS keyboard doesn't cover modal form inputs.

### 2.4 Print stylesheet

CSS-only via `@media print` (see §2.2). Tag floating widgets with `data-floating-widget="true"` and tracking pixels with `data-tracking-pixel="true"`. Carousels stay (printable as static).

### 2.5 Stop interval-driven re-render storms

Every 1-second countdown lives in a leaf component owning its own `useState`. Parent never re-renders on tick. Unblocks Embla memoization and stops AnimatePresence replays.

### 2.6 Load Stripe.js on intent

All 9 Stripe-bearing modals + 6 modals in `UnifiedModalManager` → `next/dynamic({ ssr: false })`. Stripe.js loads on first modal trigger, not on dashboard mount.

### 2.7 Listener hygiene

Every `addEventListener('scroll'|'resize'|'wheel'|'touchmove')` is passive where possible, RAF-throttled otherwise. Shared helpers in `src/utils/dom/listenerHelpers.ts`.

### 2.8 Animation discipline

`<MotionConfig reducedMotion="user">` at the root of `providers.tsx` so all framer-motion respects OS reduced-motion. Components hosting `repeat: Infinity` motion call `useInViewportAnimation()` to pause when offscreen.

### 2.9 What we explicitly do NOT add

- Feature flags per phase (commits are the rollback unit).
- Custom `performance.mark()` telemetry plumbing (Speed Insights at 10% covers it).
- Hardware/network capability detection (`deviceMemory`, `hardwareConcurrency`, `effectiveType`) — Save-Data + reduced-motion + reduced-transparency are the OS-level signals that matter.
- A `wide` tier (≥ 1536px) — not load-bearing; collapse into `desktop`.
- SSR cookie for tier hydration — accept a one-frame token transition on hydrate.

---

## 3. Inventory baseline (audit results)

Source of truth for the implementer. Every phase below references these paths.

### 3.1 Carousels (9 Swiper + 5 Embla + 1 hand-rolled)

| # | File | Tech | Note | Pages |
|---|---|---|---|---|
| 1 | [BrandScroller.tsx L85-95](src/components/ui/BrandScroller.tsx) | Embla + auto-scroll | **Plugins not memoized** | `/`, `/promotions/*` |
| 2 | [OtherToolsetsCarousel.tsx L133-136](src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx) | Embla | Empty plugins literal — harmless | promo |
| 3 | [WinnerTestimonySection.tsx L153-161](src/components/sections/winner-testimony/WinnerTestimonySection.tsx) | Embla | **Options not memoized** | `/`, `/winners`, `/my-account/draws` |
| 4 | [LatestWinnerHero.tsx L26-35](src/components/sections/LatestWinnerHero.tsx) | Embla | Memoized | `/`, `/my-account/draws`, `/promotions/*` |
| 5–6 | [PrizeShowcase.tsx L1061, L1196](src/components/sections/promo/PrizeShowcase.tsx) | **Swiper** main + thumbs | EffectFade + Grid | `/`, `/promotions/*`, `/my-account/draws` |
| 7–10 | [MajorDrawSection.tsx L909, L949, L1244, +1](src/components/sections/MajorDrawSection.tsx) | **Swiper** ×4 (main + thumbs × 2 layouts) | Navigation + Pagination + Thumbs + FreeMode | `/`, `/promotions/*` |
| 11–12 | [MiniDrawImageGallery.tsx L80, L134](src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx) | **Swiper** main + thumbs | Navigation + Pagination + Thumbs + FreeMode | `/mini-draws/[id]` |
| 13–14 | [FullscreenImageViewer.tsx L176, L295](src/components/ui/FullscreenImageViewer.tsx) | **Swiper** main + thumbs | Keyboard + Thumbs + FreeMode | shared modal |
| 15 | [RecentWinnersCarousel.tsx L43-88](src/components/sections/RecentWinnersCarousel.tsx) | **Hand-rolled** slice + buttons | No swipe, raw fetch, resize listener | `/my-account/draws` |
| 16 | [PowerToolsetCarousel.tsx](src/components/sections/promo/prize-selection/PowerToolsetCarousel.tsx) | Pure framer-motion | Infinite radial pulse + Y bob | promo |

### 3.2 Always-on infinite animations — top files

`PaymentMethodSelector — 19`, `MembershipModal — 8`, `PromoWelcomeModal — 7`, `UrgencyClockIcon — 6`, `PaymentMethodsTab — 6`, `MajorDrawSection — 4`, `GiveawayCountdownTimer — 4`, `RewardsFloatingWidget — 4`, `ProductCard — 4`, `UpsellModal — 4`, `FloatingCountdownBanner — 4`.

### 3.3 `backdrop-blur` — top files

`MajorDrawSection — 16`, `packageColorScheme.ts — 9`, `PartnerHero — 8`, `RewardsFloatingWidget — 7`, `PrizeShowcase — 4`, `MajorDrawStats — 4`, `DetailHeroBanner — 4`, `MiniDrawCountdown — 4`, `GiveawayCountdownTimer — 4`, `PowerToolsetCarousel — 4`, `Header — 3`, `RecentWinnersCarousel — 3`, `WinnersShowcase — 3`, `FullscreenImageViewer — 3`.

### 3.4 `setInterval` callsites

**1s:** `BenefitCountdown:67`, `PromoBanner:657`, `GiveawayCountdownTimer:73`, `MajorDrawSection:255`, `HorizontalCountdown:55`, `FreezePeroidBanner:42`, `FloatingCountdownBanner:75`, `MajorDrawOverview:72`, `MiniDrawCountdown:45`, `OTPVerificationModal:43`, `EmailVerificationModal:126`, `login/page:135`.

**3s UI toggle:** `Header:247` (top-bar promo), `MajorDrawHeaderStrip:55`, `MajorDrawOverview:170`.

### 3.5 Listener audit

**Unthrottled, missing passive flag:** `FloatingCountdownBanner:128`, `FloatingGetEntriesButton:49`.
**Document scroll capture:** `Select:203`, `Dropdown:165`.
**Non-passive wheel/touchmove:** `Select:212`, `Dropdown:174`, `ModalContainer:238-240`.
**Unthrottled resize:** `BrandScroller:49`, `BrandLogoCard:51`, `RewardsFloatingWidget:175`, `RecentWinnersCarousel:49`, `PromoBanner:459/689`, `OtherToolsetsCarousel:98`.
**Recursive RAF:** `AnimatedNumber:37,40`.

### 3.6 Modals

**No modal uses `next/dynamic` or `React.lazy` anywhere in repo.**

[UnifiedModalManager L10-16](src/components/modals/UnifiedModalManager.tsx) statically imports 6 modals; mounted on every `(site)/*` and `/promotions/*` via the layouts.

[stripe-client.ts L15-22](src/lib/stripe-client.ts) calls `loadStripe()` at module init when env key is set. Stripe-bearing modals: `MembershipModal`, `StripePaymentModal`, `SubscriptionManagementModal`, `RenewalFailedModal`, `SpecialPackagesModal`, `UpsellModal`, `PaymentMethodSelector`, `PaymentMethodsTab`, `SavedPaymentMethodsModal`.

[providers.tsx L102](src/app/providers.tsx) mounts `FloatingPromoBanner` globally — even on `/login`, `/admin/*`, `/oauth-redirect`.

### 3.7 Image audit

68 `<Image>` callsites missing `sizes=`. Top files: `MajorDrawSection — 13`, `PrizeShowcase — 6`, `Footer — 5`, `PowerToolsetCarousel — 4`, `PartnerBenefitsPromoSection — 4`, `MembershipSection — 4`, `MembershipModal — 4`, `Header — 4`, `ProductCategories — 4`.

### 3.8 globals.css

`src/app/globals.css` has 56+ `@keyframes` (brand glow-pulse, VIP shell auras, border-glow per brand). Brand assets — keep them. Phase 2 gates *application* behind `data-tier`.

---

## 4. New files

| Path | Purpose | Phase |
|---|---|---|
| `src/lib/device/deviceTier.ts` | Pure tier resolver | 1 |
| `src/hooks/useDeviceProfile.ts` | React-bound tier + flags | 1 |
| `src/hooks/useInViewportAnimation.ts` | IO-based pause hook | 1 |
| `src/hooks/useLeafTimer.ts` | Re-render-isolated timer | 1 |
| `src/hooks/queries/useRecentWinners.ts` | TanStack Query hook | 5 |
| `src/utils/dom/listenerHelpers.ts` | Passive/throttled listeners | 1 |
| `src/components/system/DeviceTierProvider.tsx` | DOM data-attr writer | 1 |
| `src/components/ui/LazyMount.tsx` | IO-based deferred mount | 5 |
| `src/components/ui/embla/EmblaCarousel.tsx` | Stable-options Embla wrapper | 1 |
| `src/components/ui/embla/EmblaThumbsGallery.tsx` | Main+thumbs replacement for Swiper | 1 |
| `src/components/ui/embla/EmblaCarouselButton.tsx` | Standard nav button | 1 |
| `src/components/cards/WinnerCard.tsx` | Extracted shared winner card | 5 |
| `src/components/banners/FloatingPromoBannerHost.tsx` | Path-gated dynamic loader | 1 |

---

## 5. Phase plan

Each phase is one commit. Each phase ships user value or removes risk before the next starts.

### Phase 1 — Foundation

No visual change in production. Installs the tier system, iOS fixes, print stylesheet, Embla helpers, and stops the silent reinit storms.

**Edits:**

- **[src/app/providers.tsx](src/app/providers.tsx):** wrap `{children}` in `<MotionConfig reducedMotion="user">`. Mount `<DeviceTierProvider />`. Replace `<FloatingPromoBanner />` with `<FloatingPromoBannerHost />`.
- **[src/app/layout.tsx L120](src/app/layout.tsx):** drop `transition-colors duration-200 ease-out` from `<body>`.
- **[src/app/globals.css](src/app/globals.css):** append the CSS token layer + reduced-motion + reduced-transparency + Save-Data + print rules from §2.2. Append the `-webkit-backdrop-filter` companion rule from §2.3 #1.
- **[src/components/ui/BrandScroller.tsx](src/components/ui/BrandScroller.tsx):** memoize `options` and `plugins` via `useMemo`. Update plugin speed via `emblaApi.plugins().autoScroll.options.speed = ...; autoScroll.reset()` instead of recreating the plugin. Replace resize listener with `addThrottledResize`. Pause auto-scroll when offscreen (`useInViewportAnimation`) and when `data-save-data="true"` is set.
- **[src/components/sections/winner-testimony/WinnerTestimonySection.tsx L153-161](src/components/sections/winner-testimony/WinnerTestimonySection.tsx):** wrap Embla options + plugins in `useMemo`.
- **[src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx L133-136](src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx):** same memoization fix; resize listener → `addThrottledResize`.
- **Leaf-ify all 1-second timers** (extract into per-section `<*CountdownLeaf>` components owning their own `useState`):
  `HorizontalCountdown`, `MajorDrawSection:255`, `GiveawayCountdownTimer:73`, `FloatingCountdownBanner:75`, `MajorDrawOverview:72`, `MiniDrawCountdown:45`, `FreezePeroidBanner:42`, `PromoBanner:657`, `BenefitCountdown:67`.
- **Leaf-ify 3-second toggles:** `Header:247` (top-bar promo), `MajorDrawHeaderStrip:55`.
- **Listener fixes:**
  - `FloatingCountdownBanner:128`, `FloatingGetEntriesButton:49` → `addRAFScrollListener`.
  - `BrandLogoCard:51`, `RewardsFloatingWidget:175`, `PromoBanner:459/689` → `addThrottledResize`.
- **[src/components/ui/AnimatedNumber.tsx L37-40](src/components/ui/AnimatedNumber.tsx):** wrap RAF in `useInViewportAnimation`; show final value when not in view.
- **`min-h-screen` → `min-h-svh`** on all hero sections (grep + audit).
- **Tag for print:** `FloatingPromoBanner`, `FloatingCountdownBanner`, `FloatingGetEntriesButton`, `RewardsFloatingWidget` get `data-floating-widget="true"`. Tracking-pixel `<Script>` tags in `layout.tsx` get `data-tracking-pixel="true"`.

**Package:** add `embla-carousel-fade`, `embla-carousel-class-names` (used in Phase 3+; cheap to add now so Phase 1 is the only `npm install`).

**Verification:**
- `npm run lint && npm run type-check && npm run build` clean.
- `document.documentElement.dataset.tier` set on hydrate (`mobile|tablet|desktop`).
- iOS Safari computed styles show `-webkit-backdrop-filter` on every blurred element.
- Print preview hides floating widgets and tracking pixels.
- DevTools: `HorizontalCountdown` ticking does not trigger Embla `reInit` on home neighbors.
- `FloatingPromoBanner` JS chunk does not load on `/login`, `/admin`, `/oauth-redirect`.

**Rollback:** revert commit. New helpers are pure-additive.

---

### Phase 2 — Tier-aware effect strip

Mobile and tablet get lighter effects via the CSS tokens from Phase 1. Desktop unchanged.

**Edits:** for each of the files below, swap fixed `backdrop-blur-md`, fixed shadows, fixed hover translates, and `transition-all` for the token equivalents (`backdrop-blur-[var(--ta-blur)]`, `shadow-[var(--ta-shadow-card)]`, `hover:translate-y-[var(--ta-card-hover-y)]`, `transition-[transform,opacity,box-shadow] duration-[var(--ta-transition-dur)]`).

- **[RecentWinnersCarousel.tsx](src/components/sections/RecentWinnersCarousel.tsx):** also remove the `bg-clip-text + blur-md + animate-pulse` ghost name (L218-227) and persistent `animate-shimmer-horizontal` (L213).
- **[MajorDrawSection.tsx](src/components/sections/MajorDrawSection.tsx):** 16 backdrop-blur, 26 filters, 23 gradients, 11 transition-all. Token pass. Stacked `drop-shadow-[…]` chains gated to `tier=desktop` via `useDeviceProfile()`.
- **[PrizeShowcase.tsx](src/components/sections/promo/PrizeShowcase.tsx):** token pass.
- **[PowerToolsetCarousel.tsx](src/components/sections/promo/prize-selection/PowerToolsetCarousel.tsx):** extend the existing `useReducedMotion` gate to also check `useDeviceProfile().tier === "desktop"` for the radial pulse + Y bob.
- **[WinnersShowcase.tsx](src/components/sections/promo/WinnersShowcase.tsx):** token pass.
- **[RewardsFloatingWidget.tsx](src/components/features/RewardsFloatingWidget.tsx):** token pass; wrap `repeat: Infinity` glow in `useInViewportAnimation`.
- **[GiveawayCountdownTimer.tsx](src/components/sections/promo/GiveawayCountdownTimer.tsx):** token pass; replace `mode="wait"` with `mode="popLayout"`.
- **[FloatingCountdownBanner.tsx](src/components/banners/FloatingCountdownBanner.tsx):** token pass.
- **[PromoWelcomeModal.tsx](src/components/modals/PromoWelcomeModal.tsx):** gate `repeat: Infinity` glow + confetti on `useReducedMotion`.
- **[PaymentMethodSelector.tsx](src/components/modals/PaymentMethodSelector.tsx):** all 19 always-on animations gate via `useReducedMotion`. Most should be hover/focus-only anyway.
- **[MembershipModal.tsx](src/components/modals/MembershipModal.tsx):** gate 8 always-on; token pass on 5 backdrop-blur.
- **[UpsellModal.tsx](src/components/modals/UpsellModal.tsx):** gate 4 always-on.
- **[Hero.tsx](src/components/sections/Hero.tsx):** token pass on 16 filters.
- **[PartnerHero.tsx](src/app/(site)/partner/components/PartnerHero.tsx):** token pass.
- **[Header.tsx](src/components/layout/Header.tsx):** 21 `transition-all` → `transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)]`. Add `data-sticky="true"`.
- **[MembershipSection.tsx](src/components/sections/MembershipSection.tsx):** 12 `transition-all` → explicit list.
- **[globals.css](src/app/globals.css):** add
  ```css
  @media (max-width: 767.98px), (prefers-reduced-motion: reduce) {
    .animate-shimmer, .animate-shimmer-horizontal { animation: none !important; }
  }
  html[data-tier="mobile"] [class*="border-glow-"]:not(:focus-visible),
  html[data-save-data="true"] [class*="border-glow-"]:not(:focus-visible) {
    animation: none !important;
  }
  ```

**Verification:**
- Visual smoke on the 6 verification pages × `mobile|tablet|desktop` — desktop unchanged, tablet lighter, mobile minimal.
- Pixel 4a profile: sustained 60fps during 5s scroll on `/`, `/promotions/[slug]`, `/my-account/draws`.
- Toggle OS reduced-motion → infinite loops stop; entrance animations still play once.
- Toggle Save-Data → marquee paused, infinite loops disabled.

**Rollback:** revert commit.

---

### Phase 3 — Migrate gallery Swipers to Embla

Retire 3 of 4 Swiper-using files. `swiper` package stays until Phase 4 (MajorDrawSection still uses it).

**Edits:**

- **[FullscreenImageViewer.tsx L176, L295](src/components/ui/FullscreenImageViewer.tsx):** Swiper main+thumbs → `<EmblaThumbsGallery>` (§4 wrapper). Keyboard nav uses the existing `keydown` listener at L109. Drop `swiper/css` imports.
- **[MiniDrawImageGallery.tsx L80, L134](src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx):** Swiper → `<EmblaThumbsGallery>`. Add `sizes=` to all 3 `<Image>` callsites.
- **[PrizeShowcase.tsx L1061, L1196](src/components/sections/promo/PrizeShowcase.tsx):** Swiper EffectFade + Grid → `<EmblaThumbsGallery fade>`. Migrate `slidesPerView: 4/5/6 + Grid rows: 2` → responsive Tailwind on slide width: `flex-[0_0_25%] sm:flex-[0_0_20%] lg:flex-[0_0_16.66%]`. Migrate `slideToClickedSlide` → `mainApi.scrollTo(i)`. Migrate `watchSlidesProgress` → `class-names` plugin. Add `sizes=` to the 6 missing-sizes `<Image>` callsites.

`<EmblaThumbsGallery>` viewport `<div>` applies `style={{ touchAction: "pan-y pinch-zoom" }}` (iOS Safari fix).

**Verification:**
- Click every thumbnail on `/promotions/[slug]` and `/mini-draws/[id]` — main image syncs.
- Open `FullscreenImageViewer`, navigate with arrows + keyboard.
- iOS Safari: horizontal swipe doesn't lock vertical scroll.
- `npm run build`: bundle still includes Swiper (held by MajorDrawSection).

**Rollback:** revert commit.

---

### Phase 4 — Migrate MajorDrawSection, remove Swiper

Highest-traffic file. Largest single migration.

**Edits:**

- **[MajorDrawSection.tsx](src/components/sections/MajorDrawSection.tsx):** all 4 Swiper instances → 2× `<EmblaThumbsGallery>` (mobile layout, desktop layout). Replace `[Navigation, Pagination, Thumbs]` with `<EmblaCarouselButton>` + custom dot pagination from `emblaApi.scrollSnapList()`. Replace `[FreeMode, Thumbs]` with Embla `dragFree: true` on thumbs. Drop all `swiper` imports. Add `sizes=` to all 13 missing-sizes `<Image>` callsites.

**Package:**
- Remove `"swiper": "^12.0.3"` from [package.json](package.json).
- Remove `"embla-carousel-autoplay": "^8.6.0"` (audited, never imported).
- `npm install`.

**Verification:**
- All 4 verification pages that render MajorDrawSection: visual smoke + thumb-click + nav buttons.
- `npm run build`: bundle no longer contains Swiper. Net `−45KB gz`.
- `grep -r "from \"swiper\"" src/` returns zero hits.
- Mobile profile: scroll the home page — frame-rate during the MajorDrawSection visible window matches the rest of the page.

**Rollback:** revert commit + revert `package.json`.

---

### Phase 5 — Last-mile

Hand-rolled carousel rebuild + modal lazy-loading + image sizes audit + content-visibility.

**Edits:**

1. **[RecentWinnersCarousel.tsx](src/components/sections/RecentWinnersCarousel.tsx):** full rewrite (~309 LOC → ~180 LOC). Embla via the wrapper, `slidesToScroll: 1`, responsive Tailwind slide widths `flex-[0_0_100%] sm:flex-[0_0_calc(50%-12px)] lg:flex-[0_0_calc(33.333%-16px)]`. Drop the resize listener (Embla observes container resize). Drop the raw `fetch("/api/winners/all?limit=12")`; use new `useRecentWinners()` TanStack Query hook (key: `["recent-winners", { limit }]` — shared with `WinnersPageClient`). Extract per-card rendering into shared `<WinnerCard>` (`src/components/cards/WinnerCard.tsx`). Add `sizes=` to the `<Image>`.

2. **Modal lazy-loading.** All 9 Stripe-bearing modals + 6 modals in `UnifiedModalManager` → `next/dynamic({ ssr: false })`. Files:
   - [UnifiedModalManager.tsx L10-16](src/components/modals/UnifiedModalManager.tsx): 6 imports → dynamic.
   - [my-account/page.tsx](src/app/(site)/my-account/page.tsx), [membership/MembershipPageClient.tsx](src/app/(site)/my-account/membership/components/MembershipPageClient.tsx), [my-account/settings/page.tsx](src/app/(site)/my-account/settings/page.tsx), [my-account/draws/page.tsx](src/app/(site)/my-account/draws/page.tsx), [my-account/benefits/page.tsx](src/app/(site)/my-account/benefits/page.tsx): `MembershipModal` + others → dynamic.
   - Each Stripe-bearing modal converted at every callsite.

3. **`<Image sizes=>` cleanup.** Add `sizes=` to remaining ~50 callsites not touched by Phases 3–4. Use:
   - Hero: `sizes="(max-width: 768px) 100vw, 1280px"`.
   - 1/2/3 grid: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`.
   - 2/4 grid: `sizes="(max-width: 1024px) 50vw, 25vw"`.
   - Logo/icon: `sizes="(max-width: 640px) 80px, 120px"`.

4. **`content-visibility: auto`** + `contain-intrinsic-size: 1px 800px;` on offscreen-by-default sections: `<HomeMiniDraws>`, `<HomeProducts>` ×2, `<NewsletterSection>`, `<Footer>` content. Caveat: Chromium issue 395078320 — verify `scrollIntoView` still works.

5. **`<LazyMount>`** for heaviest below-fold home sections: `WinnerTestimoniesClient`, `HomeMiniDraws`, `HomeProducts ×2`. (Their existing `<Suspense>` wrappers don't defer mount until visible; `LazyMount` does.)

6. **Listener-hygiene final pass:**
   - [Select.tsx L203](src/components/modals/ui/Select.tsx) + [Dropdown.tsx L165](src/components/modals/ui/Dropdown.tsx): capture-phase scroll → throttled passive bubble-phase, with explicit close-on-scroll.
   - [Select.tsx L212](src/components/modals/ui/Select.tsx), [Dropdown.tsx L174](src/components/modals/ui/Dropdown.tsx): wheel listener stays non-passive (genuinely needs `preventDefault`); add inline comment documenting why.
   - [ModalContainer.tsx L238-240](src/components/modals/ui/ModalContainer.tsx): keep non-passive (modal scroll-lock); add inline comment. Add `window.visualViewport` resize listener to size modal under iOS keyboard (§2.3 #4).

7. **Pause infinite framer-motion when offscreen.** Apply `useInViewportAnimation` to: `RewardsFloatingWidget`, `GiveawayCountdownTimer`, `PromoWelcomeModal`, `PowerToolsetCarousel`, `UrgencyClockIcon`.

**Verification:**
- `npm run build`: `/my-account` route chunk drops by ~140KB gz (Stripe.js out of dashboard bundle).
- Open `MembershipModal` from cold dashboard → modal visible within 200ms.
- Lighthouse mobile on `/my-account`: TTI improvement ≥ 1.5s.
- iOS Safari: keyboard inside modal → modal resizes.
- React Query DevTools: `["recent-winners", { limit: 12 }]` cache key shared with WinnersPageClient.

**Rollback:** revert commit.

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Embla `fade` plugin timing differs from Swiper EffectFade | Medium | Visual | Tune `duration` option |
| Embla thumb-click feel differs from `slideToClickedSlide` | Medium | UX | `EmblaThumbsGallery` calls `scrollTo` — confirmed correct |
| Lazy `MembershipModal` causes visible delay | Medium | UX | Skeleton in `dynamic()` `loading` prop |
| `content-visibility: auto` breaks anchor-scroll (Chromium 395078320) | Low | UX | Exclude sections with anchor links; manual test |
| BrandScroller plugin live-update via internal API undocumented | Medium | Functional | Fallback: full plugin reinit on speed change |
| iOS Safari `-webkit-backdrop-filter` global rule misfires on edge cases | Medium | Visual | Verify at Phase 1; fall back to inline `WebkitBackdropFilter` if needed |
| `prefers-reduced-transparency` only iOS/macOS | Low | Functional | Acceptable; tier=mobile + Save-Data cover Android |
| `touch-action: pan-y pinch-zoom` interferes with horizontal swipe | Low | UX | Embla uses pointer events, not native scroll — verified |
| Phase 4 MajorDrawSection breaks countdown sync | Low | Functional | Countdown is leafified in Phase 1 |
| Removing `body transition-colors` makes theme toggle abrupt | Very low | Visual | `themeBootstrap` covers first-paint |
| `min-h-screen → min-h-svh` on browsers without `svh` | Low | Visual | Tailwind polyfills via fallback |

---

## 7. Future work (not in this spec)

- CSS scroll-snap fallback for the marquee.
- `framer-motion` → `motion/react`.
- React Compiler.
- Tailwind v4 migration.
- `viewport user-scalable=no` accessibility ticket.
- Admin pages perf.
- GrowthBook (or similar) for staged user rollout, if needed later.

---

## 8. References

- [Embla Carousel docs](https://www.embla-carousel.com/) — v8 plugin model.
- [embla-carousel-fade plugin](https://www.embla-carousel.com/docs/plugins/fade).
- [embla-carousel-class-names plugin](https://www.embla-carousel.com/docs/plugins/class-names).
- [embla-carousel-react useEmblaCarousel source](https://github.com/davidjerleke/embla-carousel/blob/master/packages/embla-carousel-react/src/components/useEmblaCarousel.ts) — confirms plugin/options reference-equality reinit.
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
- [MDN: prefers-reduced-transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency).
- [MDN: NetworkInformation.saveData](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData).
- [MDN: VisualViewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).
- [WebKit: -webkit-backdrop-filter](https://webkit.org/blog/3632/introducing-backdrop-filters/).
- [Motion: MotionConfig reducedMotion](https://motion.dev/docs/react-motion-config).
- [web.dev: content-visibility](https://web.dev/articles/content-visibility).
- [Chromium issue 395078320 — content-visibility + carousel](https://issues.chromium.org/issues/395078320).
- [web.dev: dynamic viewport units (svh, lvh, dvh)](https://web.dev/articles/viewport-units).

---

## 9. Open questions

1. Share base `<CountdownLeaf>` or per-section leaf components? **Recommendation:** shared base + formatting children.
2. `useRecentWinners` cache key — share with `WinnersPageClient`? **Recommendation:** yes — `["recent-winners", { limit }]`.
3. `EmblaThumbsGallery` thumb-active state via render-prop or CSS class? **Recommendation:** render-prop.
4. `LazyMount` `rootMargin` — `300px` or `500px`? **Recommendation:** `300px`.
5. Tailwind webkit-backdrop fix — global CSS rule or JIT plugin? **Recommendation:** global CSS rule (simpler, no plugin maintenance).
