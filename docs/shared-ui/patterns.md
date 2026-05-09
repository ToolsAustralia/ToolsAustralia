# Shared UI — Patterns

## Site-wide interaction smoothness — Phase 1 (2026-05-09)

The codebase exposes a small set of cross-cutting helpers used by feature components to keep interactions cheap on lower-tier devices and avoid the pathological re-render patterns that came up in the Site-wide Interaction Smoothness audit. Reach for these instead of writing ad-hoc `setInterval` / `resize` / `scroll` plumbing.

### Device Tier System

Three viewport tiers are selected at runtime: `mobile` (< 768px) / `tablet` (< 1024px) / `desktop` (>= 1024px). The `Save-Data` connection hint demotes to `mobile`. Tier resolution lives in [`src/lib/device/deviceTier.ts`](../../src/lib/device/deviceTier.ts) (`resolveViewportTier`, `effectiveTier`).

[`<DeviceTierProvider>`](../../src/components/system/DeviceTierProvider.tsx) is mounted once in [`src/app/providers.tsx`](../../src/app/providers.tsx) and writes `data-tier`, `data-viewport-tier`, `data-save-data`, `data-reduced-transparency` attributes onto `<html>`. CSS branches off these attributes to scale visual cost down per tier without prop-drilling.

The token block in [`src/app/globals.css`](../../src/app/globals.css) exposes:

| Token | Purpose |
|---|---|
| `--ta-blur` | `backdrop-filter` blur radius (12px desktop / 4px tablet / 0px mobile) |
| `--ta-shadow-card` / `--ta-shadow-card-hover` | Card shadow + hover variant |
| `--ta-card-hover-y` | Hover lift translation (-4px / -2px / 0) |
| `--ta-transition-dur` | Transition duration (200ms desktop / 150ms mobile / 1ms when `prefers-reduced-motion`) |
| `--ta-marquee-state` | `running` / `paused` (paused on `Save-Data` and `prefers-reduced-motion`) |

Components consume tokens via Tailwind arbitrary-value syntax, e.g. `backdrop-blur-[var(--ta-blur)]`, `shadow-[var(--ta-shadow-card)]`. iOS Safari requires `-webkit-backdrop-filter` alongside `backdrop-filter`; Tailwind v3 only emits the unprefixed form, so `globals.css` mirrors it globally for any class matching `[class*="backdrop-blur"]`. `@media (prefers-reduced-transparency: reduce)` zeros `--ta-blur`; `@media (prefers-reduced-motion: reduce)` collapses transitions and pauses marquees globally.

For JS-side branching, use [`useDeviceProfile()`](../../src/hooks/useDeviceProfile.ts) — returns `{ tier, viewportTier, flags: { saveData, reducedMotion, reducedTransparency } }`. Resize updates are RAF-throttled and the connection-change listener is wired through `navigator.connection`. `<MotionConfig reducedMotion="user">` is mounted alongside the provider so framer-motion respects the OS setting.

### Listener Helpers

[`src/utils/dom/listenerHelpers.ts`](../../src/utils/dom/listenerHelpers.ts) provides three small helpers that return cleanup functions and centralise the passive / RAF-throttled patterns:

| Helper | Use for |
|---|---|
| `addPassiveScroll(target, fn)` | Passive scroll listeners that don't need scroll position |
| `addThrottledResize(fn)` | Window resize handlers — RAF-throttled to avoid layout thrash |
| `addRAFScrollListener(target, fn)` | Scroll listeners that read scroll position; passive + RAF-throttled, callback receives `scrollY` |

Prefer these over `window.addEventListener("resize", …)` / `("scroll", …)` directly. They guarantee `{ passive: true }` and RAF-throttling so high-frequency events don't pin the main thread.

### Leaf Timers

[`useLeafTimer(intervalMs?)`](../../src/hooks/useLeafTimer.ts) is a `setInterval` re-render isolator: it owns the `now` state in a leaf component so a parent doesn't re-render every tick. [`<CountdownLeaf targetMs intervalMs?>`](../../src/components/ui/CountdownLeaf.tsx) is a thin render-prop wrapper around it for countdown displays. Used by `MiniDrawCountdown`, `GiveawayCountdownTimer`, `MajorDrawHeaderStrip`, `MajorDrawOverview`, `FloatingCountdownBanner`, `FreezePeroidBanner` so their hosting sections don't re-render on every tick.

### In-viewport gating

[`useInViewportAnimation(ref)`](../../src/hooks/useInViewportAnimation.ts) returns `true` when the ref is within a 200px-margin IntersectionObserver. Use it to pause infinite framer-motion / canvas animations while their host is offscreen — used by `BrandScroller`, `OtherToolsetsCarousel`, animated number ramps.

### Embla wrappers

[`src/components/ui/embla/`](../../src/components/ui/embla/) wraps `embla-carousel-react` so consumers don't repeat boilerplate:

- `EmblaCarousel` — single-track wrapper with `options` / `plugins` / `onApi`. Sets `data-carousel="true"` and `touch-action: pan-y pinch-zoom` on the viewport so iOS doesn't fight horizontal swipes against vertical scroll.
- `EmblaThumbsGallery<T>` — main + thumbs pair with synced selection, `fade` option (uses `embla-carousel-fade`), and `onIndexChange` / `onMainApi` hooks. Uses `embla-carousel-class-names` for state class hooks.
- `EmblaCarouselButton` — accessible prev / next chevron button.

**Referential-equality contract:** `useEmblaCarousel` reinitializes when `options` or `plugins` change by reference. Callers MUST memoize both with `useMemo` to avoid plugin reinit storms — the wrappers do not defensively re-memoize because a shallow `useMemo` on a fresh-each-render literal is a no-op.

**Column-grouping pattern (2-row thumb gallery, 2026-05-10):** when migrating a Swiper `Grid` (`rows: 2`, `fill: "column"`) thumb strip to Embla, group thumbs into pairs and treat each Embla slide as a *column* of 2 vertically-stacked thumbs (`flex flex-col gap-2 h-full`). Slide widths: `flex-[0_0_25%] sm:flex-[0_0_20%] lg:flex-[0_0_16.66%]` (4 / 5 / 6 columns visible). This avoids two Swiper-Grid limitations: (1) `slidesPerGroup` + `slideToClickedSlide` snap-back on second-page clicks, and (2) Swiper Grid refusing to advance to a partial final page when remainder < `slidesPerView`. First applied in [`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx) (Phase 1.5 of the smoothness plan); pattern is reusable for future migrations of `MajorDrawSection` and any other 2-row thumb gallery.

### Print stylesheet

`@media print` in `globals.css` hides `[data-floating-widget]`, `[data-tracking-pixel]`, `header[data-sticky="true"]`, and any `[data-print="hide"]` element, and forces black-on-white. Tag floating UI / pixel scripts with the matching `data-*` attribute when adding new ones (`RewardsFloatingWidget` and the analytics scripts already do).

## P1. Composition via children

Most primitives accept `children` and add behaviour. Don't try to prop-drill content — let consumers compose.

## P2. Tailwind via class merging

Components accept `className` and merge with internal classes via `clsx` / `cn`. Lets consumers override styling without forking.

## P3. ARIA defaults

Primitives include sensible ARIA defaults (e.g. `<Modal>` traps focus, sets `aria-modal`). Override via props for special cases.

## P4. Server-component-friendly

Most shared-ui components are server-component-friendly (no client-side state). Where state is needed, the component is `"use client"` at the file boundary.

## P5. Theme-aware

`dark:` variants present throughout. Don't write light-only components.

## P6. Re-export through `index.ts`

Clean imports: `import { Button, Modal } from "@/components"` instead of deep paths.
