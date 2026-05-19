# Shared UI — Patterns

## Package display names — 2026-05-14

Two helpers control how package names are shown to users. See `docs/subscription/patterns.md P0` for the full rule summary.

### Catalog surfaces — `getPackageDisplayName(plan)`
Catalog-facing components (`MembershipSection`, `PackageSelectionModal/PlanCard`, `SpecialPackagesModal/PackagesGrid`, `SpecialPackagesModal/BenefitsPanel`, `PackageInclusionsSlideUp`) render package names via `getPackageDisplayName(plan)` from `src/utils/membership/getDisplayName.ts` instead of reading `plan.name` directly. This strips the `"Additional "` prefix from member-only one-time packs so users see "Tradie Pack" rather than "Additional Tradie Pack".

Mini-draw package modals (`MiniDrawPackageModal`, `MiniDrawPackages` tooltip) use `pkg.displayName ?? pkg.name` since `MiniDrawPackage` carries its own `displayName` field.

### Receipt surfaces — `getReceiptLabel(pkg)` / `getReceiptLabelByPackageId(id, resolvers)`
Post-payment success screens and Klaviyo invoice email line items use `getReceiptLabel` from `src/utils/membership/getReceiptLabel.ts` to append a context suffix (`(Member)` or `(Mini Draw)`) so users can distinguish colliding display names in their purchase history.

- `MiniDrawPackages.tsx` — `setProcessingPackageName(getReceiptLabel(pkg))` on purchase success.
- `SpecialPackagesModal` — `setProcessingPackageName(getReceiptLabel(pkg))` on purchase success.
- `MembershipModal` — `setProcessingPackageName(getReceiptLabelByPackageId(activePlan.id, { membership: getPackageById, mini: getMiniDrawPackageById }))` for one-time and mini-draw purchases.

Do NOT apply `getReceiptLabel` to catalog cards, Stripe metadata, admin views, or internal event payloads — those retain the raw `name`.

## MembershipModal + PackageSelectionModal electric scheme — 2026-05-18

`MembershipModal/PlanSummaryCard` ("Selected Package" card) and `PackageSelectionModal/PlanGrid` + `PlanCard` ("Select Your Package" popup) now inherit the **same colour resolution as `MembershipSection`'s `renderPlanCard`**: membership-tab plans → `getMembershipSectionColorScheme(plan.id, true)`, one-time / additional packs → `getElectricPackageColorScheme(plan.id)` (replacing `getPackageColorSchemeForPromo` + the `useVariantContext`/`contextVariantConfig` wiring, which was deleted through `PlanSummaryCard` → `PaymentStep` → `MembershipModal/index`). In `PlanSummaryCard` the package **name and price** use the `ElectricPackageCard` dark-mode title style (tier accent + `0 0 14px {accent}80` glow, or the VIP champagne-gold gradient with drop-shadow); the **benefit/entry lines** use "electric white" (`#FFFFFF` + `0 0 8px {accent}66` glow), matching the MembershipSection entries block. The upsell-offer path (`isUpsellOffer`) still uses `promoThemePrimary` and is visually unchanged. The `Nx Bonus entries have been applied` band was removed from `PlanSummaryCard`. The package name renders via `getPackageDisplayName` (strips the internal `"Additional "` prefix). For member additional packs (`getAdditionalPackDiscount` non-null) the struck regular price (same `text-xs sm:text-sm` size as the discounted price) and a tier-accent `{percentOff}% Off` pill sit in normal flow on the row directly above the discounted price (not absolute). The discounted price renders as `= ${price}` (the leading `=` only when a discount applies, plain `${price}` otherwise) in accent title style, above an uppercase muted `One Time Payment` / `Per Giveaway` label. `PlanGrid` passes a `discount` prop (`getAdditionalPackDiscount`). In `PlanCard` the struck regular price + tier-accent `{percentOff}% Off` pill are NOT in the vertical price stack — they sit in a single horizontal row absolutely positioned `left-full top-1/2 -translate-y-1/2 ml-1.5` (middle-upper-right of the `${plan.price}` number) so they never push the `One Time` label down. The prop is only non-null for `additional-{tier}-pack`, so this only appears when the modal is showing additional packages.

## ElectricPackageCard light theme — 2026-05-16

`ElectricPackageCard` accepts an optional `theme?: "light" | "dark"` prop (default `"dark"`, keeping the existing electric design byte-for-byte unchanged); `"light"` is now the classic bright branded-tier card — the card body IS the vivid tier gradient (`colorScheme.bgGradient`), scheme-derived ink colours (`lightInk`: black for lime/amber tiers, white for all others), a solid bright CTA (`backgroundColor: accent`), keeping the new badge/struck-price/per-word-title structural elements; dark rendering is unaffected for all existing consumers.

## SpecialPackagesModal color scheme — 2026-05-15

`SpecialPackagesModal/PackagesGrid` and `SpecialPackagesModal/BenefitsPanel` now use `getElectricPackageColorScheme` (electric dark: `linear-gradient(180deg,#0b0c0f,#060607)` body, tier-accent radial glow, accent border) instead of `getPackageColorSchemeForPromo`. `PackagesGrid` renders a struck regular price via `getAdditionalPackDiscount` when the pack has a genuine member discount (the SAVE shield clip-path polygon was removed from `PackagesGrid` — struck price is kept; the shield remains only in `ElectricPackageCard`). `PackagesGrid` also shows a `BestValueBadge` (top-left ribbon) on packs where `isOneTimeBestValuePlanId` returns true. `BenefitsPanel` benefit text and heading now carry a subtle `textShadow` glow matching the tier accent. `ElectricPackageCard` gains a VIP premium intensity path (`isPremium = !!colorScheme.textGradientStyle`) that applies a stronger outer bloom, brighter body radial gradient, solid-gold border, larger glowing title, and enlarged entries number; all non-VIP (Boss and below) tiers are visually unchanged. The entries number on `ElectricPackageCard` now uses the same white+tier-accent-glow lightning style for all tiers including VIP (VIP title retains its gold gradient); the price panel is `w-fit mx-auto` (contained/centered, not full-width); `PackagesGrid` entries number is also white+glow with the label "FREE ENTRIES"; `BenefitsPanel` benefit text is white+glow while icons use the solid tier accent colour for contrast.

## Admin modal hover-preview pattern — 2026-05-14

`AdminPromoToggle` (`src/components/modals/AdminPromoToggle.tsx`) gained a live per-package entry preview powered by `PromoPurchaseEntriesPreview` (`src/components/admin/PromoPurchaseEntriesPreview.tsx`).

**Hover-preview pattern:** The toggle buttons fire immediately on click (no draft/save step). To let admins preview before committing, three `hoverMultiplier` states (`hoverMembership`, `hoverOneTime`, `hoverMini`) are set via `onMouseEnter`/`onMouseLeave` on each multiplier button. The preview component receives a resolved `snapshot`:
- `hover value` if a button is hovered
- `active promo multiplier` if no hover
- `1` (base entries, no multiplier) if no active promo and no hover

The OFF button hovers as `1` so admins can see what entries look like with the multiplier removed. The `PromoPurchaseEntriesPreview` is a pure read-only component: it accepts a `PromoMultiplierSnapshot` and delegates all row computation to `src/utils/admin/promo-purchase-entries-preview.ts`, which reads exclusively from static package data (`membershipPackages`, `miniDrawPackages`).

## Site-wide interaction smoothness — Phase 5B (2026-05-10)

Phase 5B is the last-mile cleanup of the smoothness arc: image `sizes` audit, deferred-mount infra, content-visibility on below-fold sections, and modal viewport plumbing.

- **`<LazyMount>` ([`src/components/ui/LazyMount.tsx`](../../src/components/ui/LazyMount.tsx))** — defers mounting `children` until the wrapper enters the viewport (300px slack via IntersectionObserver), rendering `fallback` until then. Pair with `<Suspense fallback={…}>` for server-streamed sections so the fallback acts as both the LazyMount placeholder *and* the Suspense fallback (extract once into a shared variable to avoid drift). Used by `src/app/(site)/page.tsx` to defer `WinnerTestimoniesClient`, `HomeMiniDraws`, and the two `HomeProducts` sections (best sellers / new arrivals). The component is `"use client"` and creates a client boundary for everything inside it — fine for the existing client children of those sections.
- **`content-visibility: auto` + `contain-intrinsic-size: 1px 800px`** is now applied via inline `style={{ contentVisibility: "auto", containIntrinsicSize: "1px 800px" }}` on the four below-fold home sections plus the SEO brand-grid block. We deliberately did NOT apply it to `<NewsletterSection>` (overlap-positioned via `-translate-y-1/2` would be culled) or `<Footer>` (contains the absolute-positioned NewsletterSection). None of the targeted sections use anchor IDs, so the Chromium 395078320 anchor-scroll caveat does not apply.
- **`<Image sizes>` audit** — every remaining `<Image>` in user-facing markup now ships an accurate `sizes` hint. The audit runs by walking each `<Image …>` JSX tag (multi-line aware) and grep-resistant — see `c:/tmp/find-missing-sizes.mjs` if it ever needs to be re-run. Skipped: dev-only previews (`src/components/dev/`), email previews (`src/components/email-preview/`), `src/examples/`, and JSX-commented-out tags (`PartnerModal` line 196).
- **`MultiplierBannerImage` API change** — accepts an optional `sizes` prop (defaults to `(max-width: 768px) 100vw, 1024px`) so consumers can pass through a more accurate hint where the host knows it.
- **Listener hygiene final pass:** [`Select`](../../src/components/modals/ui/Select.tsx) and [`Dropdown`](../../src/components/modals/ui/Dropdown.tsx) repositioning logic now uses an rAF-coalesced passive capture-phase scroll listener (was a 50ms `setTimeout` debounce on a non-passive capture-phase listener). Capture phase is preserved with an inline comment explaining why — modal bodies and other nested scrollables must reposition the popover, and bubble-phase wouldn't see those scroll events. The non-passive wheel listener that calls `e.stopPropagation()` to keep wheel events from leaking past the open list is preserved with an inline NOTE.
- **`ModalContainer` visualViewport keyboard avoidance** — while a modal is open, the active modal sets `--ta-vv-height` on `<html>` from `window.visualViewport.height`, updated on the visualViewport `resize` and `scroll` events (mobile soft-keyboard show/hide and pinch-zoom). Modal content that needs to keep its bottom CTAs visible above the iOS / Android soft keyboard can opt in via `style={{ maxHeight: "var(--ta-vv-height, 100vh)" }}`. We do NOT force this on existing modal content — only the CSS variable is exposed; consumers opt in. The wheel + touchmove listeners on the scrollable element are still non-passive (so they can `preventDefault()` at the scroll-lock boundary) and now have an inline NOTE explaining why they must stay non-passive.
- **Offscreen framer-motion final pass:** `GiveawayCountdownTimer` (3 `repeat: Infinity` shimmer/pulse loops), `PowerToolsetCarousel` (radial pulse + Y-bob, previously gated on `tier === "desktop"` only — now also `inView`), and `UrgencyClockIcon` (6 infinite loops driving the shake / glow / clock-hand spin) all read `useInViewportAnimation(ref)` and gate both `animate` and `transition` on the result. `RewardsFloatingWidget` and `PromoWelcomeModal` were already gated in Phase 2.

## Site-wide interaction smoothness — Phase 5A (2026-05-10)

Phase 5A finished the carousel-modernisation arc started in Phase 4 and started the lazy-modal sweep:

- `RecentWinnersCarousel` was rebuilt on top of `useEmblaCarousel` (no Swiper, no manual `slice(currentIndex, currentIndex + itemsPerView)`, no `window.resize` listener — Embla observes container resize natively). Per-card markup moved into [`RecentWinnerCard`](../../src/components/cards/RecentWinnerCard.tsx), a memoised component that consumes the `RecentWinner` shape from the new TanStack hook. This is intentionally a separate component from the existing [`WinnerCard`](../../src/components/cards/WinnerCard.tsx) (which renders the `/winners` gallery card with promo-theme borders and a "View draw" CTA): the homepage carousel variant has a fundamentally different design — full-bleed photo, name overlay, draw-type badge — and the two components never share JSX. Reach for `RecentWinnerCard` only inside the homepage `RecentWinnersCarousel`; reach for `WinnerCard` for the `/winners` gallery and any other surface that wants a clickable "go to draw" affordance.
- The carousel uses the shared [`EmblaCarouselButton`](../../src/components/ui/embla/EmblaCarouselButton.tsx) for prev/next, and `embla-carousel-class-names` (already a project dependency) for the active-snap class hook. Options/plugins are memoised so `useEmblaCarousel` does not reinit on every render — same referential-equality contract documented on `EmblaCarousel.tsx`. Pagination dots come from `emblaApi.scrollSnapList()` rather than a `Math.ceil(winners.length / itemsPerView)` calculation, so they always match Embla's resolved slide count.
- Data for the carousel now flows through [`useRecentWinners`](../../src/hooks/queries/useRecentWinners.ts), a thin TanStack Query wrapper over `GET /api/winners/all?limit=<n>` keyed by `["recent-winners", { limit }]`. Cache is scoped by limit so the homepage `limit=12` carousel and the `/winners` page (`limit=100`) do not share a cache row. The hook deliberately does **not** use the shared `apiGet` helper from `src/lib/queries.ts` because the endpoint is unauthenticated and the helper's auth-error force-logout path is overkill here.
- The Phase 2 ghost-name + persistent shimmer were already stripped in Phase 2 — Phase 5A simply preserves the slimmed card markup verbatim and adds a more accurate `sizes` hint to the next/image (`(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw`).

## Site-wide interaction smoothness — Phase 2 (2026-05-10)

Phase 2 retired fixed `backdrop-blur-*`, `transition-all duration-*`, and inline shadow / hover-translate values in favour of the device-tier CSS tokens introduced in Phase 1 (`--ta-blur`, `--ta-shadow-card`, `--ta-shadow-card-hover`, `--ta-card-hover-y`, `--ta-transition-dur`). On desktop the rendered output is identical (token defaults match the previous fixed values); on mobile and tablet the same components now compose with lighter blurs, smaller shadows and shorter durations without a JS branch in render. Components affected include `Header`, `MembershipSection`, `RecentWinnersCarousel`, `MajorDrawSection` (token swap only — Embla migration ships in Phase 4), `RewardsFloatingWidget`, `PromoWelcomeModal`, `PrizeShowcase`, `WinnersShowcase`, `GiveawayCountdownTimer`, and the partner / promo banners.

Where a component drove infinite framer-motion (`repeat: Infinity`), the loop is now gated. `PowerToolsetCarousel` reads `useDeviceProfile()` so its radial pulse + Y-bob only run on `tier === "desktop"`. `RewardsFloatingWidget` wraps its FAB in `useInViewportAnimation` so the rotate / scale-pulse loops pause when offscreen. `PromoWelcomeModal` checks `useReducedMotion()` for both its glow loops and its confetti trigger. `GiveawayCountdownTimer` switched its `<AnimatePresence>` from `mode="wait"` to `mode="popLayout"` so countdown digits enter / exit overlap rather than block on slow devices. `RecentWinnersCarousel` no longer renders the persistent `animate-shimmer-horizontal` overlay or the duplicated blurred ghost name on each card. `globals.css` adds an override that disables `.animate-shimmer*` on mobile and under reduced-motion, plus stops `border-glow-*` keyframes on the mobile tier and Save-Data so brand glows don't pin the GPU on phones.

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

**Inline two-Embla pattern (overlay UI on the main viewport, 2026-05-10):** [`FullscreenImageViewer`](../../src/components/ui/FullscreenImageViewer.tsx), [`MiniDrawImageGallery`](../../src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx) (Phase 3 of the smoothness plan) and [`MajorDrawSection`](../../src/components/sections/MajorDrawSection.tsx) (Phase 4) keep `useEmblaCarousel` inline rather than using `EmblaThumbsGallery<T>` because each file needs siblings rendered *between* / *over* the main and thumbs viewports — a captioned info bar in the fullscreen viewer, absolutely-positioned navigation chevrons + pagination dots + counter overlaid on the rounded main card in the mini-draw gallery, and a "VIEW SPECS" overlay button + brand-colored bordered card wrapping the main viewport in MajorDrawSection. The wrapper renders `<main /><thumbs />` as fixed siblings under one root, so none of those patterns fit. The inline version uses the same option/plugin shape as `EmblaThumbsGallery<T>` (main: `loop: false, duration: 25` + `ClassNames()`; thumbs: `containScroll: "keepSnaps", dragFree: true` + `ClassNames()`) and replicates the linkage: `mainApi.on("select", onSelect)` updates the active index, scrolls the thumbs strip via `thumbsApi.scrollTo(i)`, and clicking a thumb calls `mainApi.scrollTo(i)`. Both viewports get `data-carousel="true"` and `touch-action: pan-y pinch-zoom` manually since the wrapper isn't wrapping them. Pagination dots are rendered from `mainApi.scrollSnapList()` length so dot count tracks slide count even on dynamic image arrays. Keyboard navigation (`ArrowLeft` / `ArrowRight` / `Escape`) is wired by the file's own `keydown` listener calling `mainApi?.scrollPrev()` / `scrollNext()` / `onClose()`.

**MajorDrawSection migration (Phase 4, 2026-05-10):** [`MajorDrawSection`](../../src/components/sections/MajorDrawSection.tsx) shipped with four `Swiper` instances (mobile main + thumbs, desktop main + thumbs); Phase 4 replaced them with two `<PrizeImageGallery>` instances (a private inline two-Embla component declared in the same file). One instance is mounted inside the mobile `lg:hidden` layout and the other inside the desktop `hidden lg:grid` layout, so only one runs per viewport and the two have independent `activeIndex` state — matching the original Swiper behaviour. The component renders the bordered main-image card (with the brand-themed glow border + VIEW SPECS overlay) and the dragFree thumb strip together as siblings, accepting render-slot props (`specsButton`, `cardClassName`, `cardStyle`, `mainSizesAttr`, `thumbSizeClassName`, etc.) so per-layout sizing differs without forking the gallery. Pagination dots use the `EmblaPaginationDots` helper (also private to the file) rendered from `mainApi.scrollSnapList()`. Navigation buttons reuse the shared `<EmblaCarouselButton>` primitive. Phase 4 also removed `swiper` and the unused `embla-carousel-autoplay` from `package.json` (zero `from "swiper"` / `import "swiper/css"` hits remain in `src/`), so production builds for routes that include MajorDrawSection (`/`, `/promotions/[slug]`, `/my-account/draws`) drop the Swiper bundle (~50–60kB minified).

### Additional keyframes in globals.css

`@keyframes scaleIn` (Task 3 — cancellation flow): `scale(.6) opacity(0)` → `scale(1) opacity(1)` in 0.35s ease-out. Used by `StepSaveSuccess` check-circle via `motion-safe:animate-[scaleIn_.35s_ease-out]`.

### Print stylesheet

`@media print` in `globals.css` hides `[data-floating-widget]`, `[data-tracking-pixel]`, `header[data-sticky="true"]`, and any `[data-print="hide"]` element, and forces black-on-white. Tag floating UI / pixel scripts with the matching `data-*` attribute when adding new ones (`RewardsFloatingWidget` and the analytics scripts already do).

## MiniDrawPackages tier-aware catalog (2026-05-14)

[`src/components/features/MiniDrawPackages.tsx`](../../src/components/features/MiniDrawPackages.tsx) is the purchase UI rendered on the `/mini-draws/[id]` page. It now uses `getMiniDrawPackagesForViewer(hasAccess)` instead of the raw `miniDrawPackages` array to show only the tier-appropriate packages:

- Guests / users without current draw entries and no active subscription → Mini Pack 1, 2, 3 (`isMemberOnly` absent / false).
- Users with an active subscription OR at least one current draw entry → the five `additional-*-pack-mini` records (`isMemberOnly: true`).

`hasAccess` is derived via `useUserMajorDrawStats(userData?._id)` + `hasAdditionalPackageAccess(userData, userMajorDrawStats)`, reusing the same helpers as the major-draw catalog. The `viewerPackages` computed list replaces all three in-component usages of the raw array: the grid render, the selected-package-modal lookup, and the `handlePurchase` package lookup.

### Post-purchase upsell trigger — segment contract (2026-05-18)

`triggerUpsellModal` in `MiniDrawPackages.tsx` posts to `/api/upsell/trigger` with a `userType`. Every mini upsell record in `upsellPackages.ts` (built by `buildMiniUpsellRecords`) declares `userSegments: ["mini-draw-buyer"]`, and `getBestUpsellOfferForUser` → `filterUpsellPackagesByUserSegment` drops any offer whose segments don't include the sent `userType` (or `"all"`). Because this component **only ever sells mini-draw packs**, `userType` must always be `"mini-draw-buyer"` for `packageType === "mini-draw"` — it is now keyed off `packageType`, not an ID prefix. The previous `packageId.startsWith("mini-pack-")` check matched only the legacy `mini-pack-1|2|3` ids and silently dropped the upsell for the newer `additional-*-pack-mini` packs (Tradie→VIP), which is why only the old mini packs surfaced an upsell.

### Per-tier electric theming (2026-05-18)

The grid tiles, the desktop hover tooltip, and `MiniDrawPackageModal` use the **same electric visual language as `ElectricPackageCard`** (MembershipSection one-time tab), keyed per pack via `getMiniDrawPackageColorScheme(packId)` in `electricPackageScheme.ts`. Mapping: `mini-pack-1|2|3` → electric blue (one shared colour, matching the blue mini-pack upsell artwork); `additional-*-pack-mini` (Tradie→VIP) → lime / cyan / amber-gold / red / champagne-gold per tier.

All three surfaces render a **dark radial body** (`radial-gradient(...accent...) , linear-gradient(180deg,#0b0c0f,#060607)`) — NOT a flat `bgGradient` fill — with an accent inner-sheen overlay, an accent border, and a layered accent glow box-shadow. VIP (`isPremium`, detected via `scheme.textGradientStyle`) gets the premium treatment used by the card: warm-black body (`#0b0a06→#050402`), a `0 0 0 1px #FFFCEB, 0 0 0 3px accent` double-rim, and the champagne-gold gradient text for title/price/big-number. Titles glow (`textShadow 0 0 14px accent80`); the modal hero entries number is white with an accent glow; the "Purchase Now" CTA mirrors the card's `ta-enter-cta` (black bg + `accent` border + `accent` text + glow), not a gradient fill. The "Partner catalog" (cyan) and "Partner access" (green) rows stay semantic — info accents, intentionally identical across all tiers and the tooltip/modal. `MiniDrawPackageModal` makes `ModalContainer` a transparent pass-through (`!bg-transparent !border-0 !shadow-none !overflow-visible`) and owns the electric body itself so the outer glow is not clipped. Section chrome ("Choose Your Pack" header, footer) is untouched; the legacy `isHighValue` yellow/amber gradient branch is removed.

## Electric package color schemes — Phase 1 (2026-05-15)

`src/utils/package-colors/electricPackageScheme.ts` is a self-contained, dev-only color-scheme module that maps package plan IDs to vivid "electric" `PackageColorScheme` objects. It does NOT extend `COLOR_KEYS` and does NOT edit `packageColorScheme.ts` — zero production impact until a component explicitly imports `getElectricPackageColorScheme`.

Six tiers are defined: `apprentice` (#1E90FF blue), `tradie` (#CCFF00 lime, black text), `foreman` (#00E5FF cyan), `boss` (#E0A019 warm amber-gold, black text), `power` (#FF1F1F red), and `vip` (matte black + brilliant champagne white-gold `#FFDF63` with gradient text). VIP is differentiated from Boss by gold tone and a crisp polished finish — a sharp double-rim outer shadow and tight glow — not by larger text or heavier blur. VIP uses the `ELECTRIC_BLACK` constant (matte black with a `textGradientStyle` CSS object using a bright champagne-to-white-gold gradient); Boss uses `ELECTRIC_GOLD` with a warmer amber palette.

`planIdToElectricTier(planId)` normalises any plan id — including `additional-*` prefixes and `*-member` suffixes — to a tier by substring matching. Unknown plan ids fall back to `power` (electric-red).

Consumers: `ElectricPackageCard` (live `MembershipSection` one-time tab) and the mini-draw catalog (`MiniDrawPackages` grid + tooltip, `MiniDrawPackageModal`) via the `getMiniDrawPackageColorScheme(packId)` wrapper — see "Per-tier electric theming" above. Subscription/membership-tab cards keep their `getMembershipSectionColorScheme` palette and are unaffected by this module.

Test: `npm run test:electric-scheme` (standalone tsx script, no DB required).

Every Tailwind arbitrary class in this file uses literal hex values (no `${}` interpolation) so Tailwind's JIT content scanner can statically detect and emit them — matching the established pattern in `packageColorScheme.ts`.

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
