# Promo — Frontend

## /promotions gallery filter — full-width sticky bar at `top-0` (2026-07-08)

`GiveawayGalleryClient` filter dock was `sticky top-16 sm:top-20` inside a `SectionContainer` — the `top-16/20` was meant to clear a fixed PromoBanner, but on `/promotions` the PromoBanner is rendered **in-flow** (`followOnScroll={false}`, [page.tsx](../../src/app/promotions/page.tsx)) and there's **no fixed header** (the gallery is chrome-free), so that offset left a big empty gap above the filter once it stuck. Fixed: the dock is now a **full-width sticky bar** (`sticky top-0 w-full`, edge-to-edge glass + bottom border) pulled OUT of `SectionContainer` (rendered directly in the page's full-width `<main>`), with its content still in an inner `max-w-7xl` container. The grid sits in its own `SectionContainer` below. **Note:** `top-0` is correct only because nothing is fixed above the gallery here — do NOT copy this to the `[slug]` pages, where the PromoBanner IS a fixed scroll-follow pill.

## FloatingCountdownBanner "Enter Now" → `/promotions` (2026-07-08)

The floating countdown banner's `handleViewDetails` ("Enter Now" / "Visit Page") now navigates to the **`/promotions` gallery landing**, not `/promotions/${DEFAULT_PRIZE_SLUG}` (owner request). The `?aff` affiliate param is still preserved. Consistent with `/promotions` now being the real root gallery (it used to bare-redirect to `DEFAULT_PRIZE_SLUG`). The `DEFAULT_PRIZE_SLUG` import was dropped from the banner. Other default-slug links (Footer, WinnerCard, HorizontalCountdown, admin promo/affiliate link builders) were **left as-is** — only this banner was changed.

## /promotions — prize-combinations gallery (2026-07-07, designed — pending owner rating)

Editorial index of every major-draw prize combination, now the PROMOTIONS ROOT (owner call — the old bare
/promotions was a redirect to DEFAULT_PRIZE_SLUG): `src/app/promotions/page.tsx` (server —
static metadata, builds serializable cards) + `_components/GiveawayGalleryClient.tsx` (filter pills + grid).
Page composition: **dark hero band** (combo count eyebrow, display heading) → **featured headline combo**
(`DEFAULT_PRIZE_SLUG`, full-width art overlapping the hero, "This month's headline" badge, `priority` images
— excluded from the grid only in the UNFILTERED view, so a filtered pair matching only the featured combo
still shows it) → **sticky glass filter dock** (follows the scroll on every viewport — the promotions layout
is chrome-free so `top` offsets are safe) with TWO independent dimensions: **toolset brand** (brand-dotted
pills) × **toolbox brand** (Sidchrome / Milwaukee Toolbox / Kincrome) — combinable (AND) or single; tapping an
active pill clears it; count + Clear live in the dock (sm+) / below it (mobile) → grid of **showroom
`ComboCard`s** (extracted component; dark glass shell `from-white/[.07]`, pointer tilt via `useTilt(4)`
(motion-safe), top hairline / value badge / hover border+glow in the brand's `BRAND_THEMES` primary; Milwaukee
uses the TA site red per prize-brand-colors convention; badge ink via YIQ luminance so DeWalt/Ryobi yellows
get dark ink; identity row renders the **brand wordmark SVG** (`wordmarkSrc`, `public/images/brands/<name>/`)
when shipped, falling back to the text title, beside a "{storage} toolbox" chip) → **gold cash-alternative
band** ("Rather have the cash?") closing the page. The hero also mounts **`GalleryCountdown`**
(`_components/GalleryCountdown.tsx`) — a live major-draw countdown in the dashboard's red countdown-chip
vocabulary via `useCurrentMajorDraw` (30s tick; renders nothing until the draw resolves and only while
`status === "active"`, so the hero reserves no space for it). Filter pills are dark-theme-only styles now
(the page ground is dark in both themes). Cards come from `listPrizes()`, each
using the SAME manifest-verified landing hero art as its `/promotions/<slug>` page via
`getLandingHeroImagePaths(slug)` — mobile asset `< lg`, desktop asset `≥ lg` (the promotions-wide 1024px
art-direction split), `object-contain` on a **white art plate framed inside the dark shell** (rounded inset
`m-2.5` — the art is composited for light backgrounds, so the plate reads as a lit display case). Combos with
no shipped art are skipped, not broken. **Analytics caveat:** the bare `/promotions`
path has no promo slug, so `usePromoPageTracking` fires NO PromoAnalyticsVisit for gallery views (harmless);
extend the validator + pageType deliberately if gallery tracking is wanted.

**Chrome parity + newsletter overlap (2026-07-07):** the gallery mounts the SAME top chrome the brand
landing pages use — `PromoBanner` (the sticky site-wide promo/countdown strip that reads as the "navbar") and
`PromotionsAccountButton` (floating account/nav menu, authed-only). **Both are `<Suspense>`-wrapped** (`PromoBanner`
reads `useSearchParams`). **`PromoBanner` MUST also be wrapped in a `<VariantProvider … isLoading={false}>`**:
it calls `useVariantContext()`, and with NO provider the default context is `isLoading: true` *forever* →
`isPromoResolved` stays false → the banner is stuck in its centered-logo **loading skeleton** and never renders
the promo strip (this was the "banner shows only a logo, no promos" bug). The `[slug]` pages get a real provider
from `VariantAssignmentWrapper`; the gallery runs no experiment, so a resolved empty provider is correct.
The gallery also passes **`followOnScroll={false}`** so the banner stays in-flow and never becomes the
fixed scroll-follow pill (the gallery has its own sticky filter dock — two floating top elements would fight). The page is `async` and server-fetches `getEffectivePromosForDisplay()` to pass
`initialMembershipPromo`/`initialOneTimePromo` to `PromoBanner`, AND mounts `<PromoThemeInitializer slug={DEFAULT_PRIZE_SLUG} />`
— WITHOUT both, the banner rendered unthemed/empty and looked different from the `[slug]` pages (owner: "should
be the same PromoBanner"). Fabricated "$XXXk+ prize-pool" stat row removed (owner). Overlap fix: the layout's
`NewsletterSection` is `absolute … -translate-y-1/2`, tucking up half its height into the page end; the gold
cash band carries `pb-28 sm:pb-36 lg:pb-44` so the newsletter floats over empty ground, not the band.

**Theme-aware + mobile 2-up + sticky-dock fix (2026-07-07):** the gallery is now **light + dark** (`bg-white
dark:bg-neutral-950`, follows the promotions guest theme toggle) — it was committed-dark; owner wanted light
mode too. Cards, dock, hero, featured lead all carry light+dark pairs; the brand wordmark SVGs are
brand-colored (`#c92a28`/`#FEBD17`/`#BFD730`…) so they read on both grounds without inverting. The hero
**brand strip is a one-row marquee** (matches the `/membership` `MembershipBrandShowcase`:
`animate-[marquee-scroll_45s_linear_infinite]`, masked edges, hover-pause, bigger white cards); the 5 toolset
wordmarks are repeated **4×** so the keyframe's `-50%` animated half always exceeds the viewport for a seamless
loop (2× isn't enough with only 5 brands on wide screens). **Grid is
`grid-cols-2` on mobile** (2-up — owner: "see in general what we're offering", small is fine), `lg:grid-cols-3`;
card copy compacts on mobile (wordmark scaled, toolbox chip + full catalog-label description hidden `<sm`, "View"
vs "View this combination"). **No value badge** (owner: "remove the price value") — and the **prize name is
always shown**: the short combo title (`card.title`, e.g. "Milwaukee × Sidchrome", truncated) on mobile, the
full catalog-label description from `sm`. The `accentInk`/`inkOn` YIQ helper was removed with the badge.
**Sticky filter dock now actually sticks:** the page ancestors use `overflow-x-clip` (NOT
`overflow-hidden`, which establishes a scroll container and silently breaks `position: sticky`); the dock's
`top-16 sm:top-20` clears the `PromoBanner` (which goes `fixed z-50` when scrolled). The "This month's headline"
badge on the featured combo was removed (owner).

## Landing page — new design assets, full replace (2026-06-23)

The promo landing hero **images + videos were fully replaced** with the new
"WIN A … TOOLBOX … $10,000 CASH" design (one version — the desktop variant whose design
matches the mobile set). Each of the 15 combos (5 brands × `milTB`/`sidTB`/`kinTB`) has a
desktop + mobile static (`.webp`) under `images/background/promo/landing/{brand}/` and a
desktop + mobile clip (`.mp4`) under `videos/landing/{brand}/`. **HiKOKI is now a full
landing brand** (its art shipped; the `getLandingHeroImagePaths` `hikoki` null-guard was
removed and `hikoki-*` added to `LANDING_HERO_MAP`). Notes:
- **No dark variants** — the new design has none, so the old `-dark`/`-dark-mobile` webps were
  deleted and `resolveLandingHeroImage` falls back to the light file (existing behaviour).
- **mp4-only, drawn tier falls back to base (2026-06-27)** — only `.mp4` ships (H.264 plays in
  every supported browser), so the `webm` `<source>` was **removed** from `LandingHeroVideo` (no
  more base-clip 404s). `getLandingHeroVideoPaths` now returns an **ordered mp4 list** (`srcs:
  string[]`): on the `drawn-tonight` / `drawn-tomorrow` tier the drawn clip is first with the
  **base clip appended as a fallback**, so a brand that ships no drawn art (**HiKOKI** has only
  base clips) still animates via its base clip instead of dropping to the still — the browser
  advances to the next `<source>` natively when the drawn one 404s. This mirrors the image
  resolver, which already drops a missing drawn still back to the base image.
- Source PNG statics were converted to webp (format only); manifest regenerated via
  `build:landing-manifest` (32 entries = 30 combos + all-prizes).

## Power toolset carousel — 5-up on desktop (2026-06-22)

With 5 toolset brands, `PowerToolsetCarousel` shows **2 neighbours each side + the active
centre** (a full 5-up) on `sm+`: new `leftNeighbor2` / `rightNeighbor2` (computed only when
`n >= 5`, since at n≤4 the `i±2` indices duplicate) are rendered in `hidden sm:block` wrappers.
Mobile stays 3-up to avoid overflow.

## Prize combo-render display normalised (2026-06-22)

The 15 "toolset + toolbox" prize card renders (`<toolset>-<toolbox>.webp`, e.g.
`dewalt-sidchrome.webp`) were normalised to a uniform **1600×1200 (4:3)** canvas — subject
trimmed, scaled to a common inner frame, bottom-anchored + centred — so every prize card in
`PrizeShowcase` displays at the same size without cut-off. `getPrizeGalleryImageLayout`
intercepts these combos with a uniform `object-contain` layout (no per-image scale), fixing the
prior inconsistency where dewalt/milwaukee combos were zoomed (`scale-150`) and the rest weren't.
See [shared-ui/frontend.md](../shared-ui/frontend.md) for the layout-function + badge details.

## Brand wordmark logos — SVG takeover + uniform sizing (2026-06-22)

`POWERSET_BRAND_TEXT` (`prize-selection/constants.ts`) now serves **SVG** wordmarks from
`public/images/brands/name/*.svg` for milwaukee / dewalt / makita / ryobi / hikoki (HiKOKI
is now the 5th selectable toolset — see below); the old `*.webp` wordmarks were
deleted. Each SVG is normalised to a uniform `700×200` viewBox with the artwork centred and
Milwaukee optically up-scaled (×1.4 — its lightning bolt makes the script read small), so
every brand renders at **equal visual size** in any container. Because equal sizing is now
baked into the assets, the former per-brand scale hacks were removed: makita's smaller
container in `PowerToolsetCarousel` / `StaticToolsetHighlight`, the milwaukee side-badge
scale, and `OtherToolsetsCarousel`'s `WORDMARK_SCALE` map. Wordmarks render via
`<Image unoptimized>` (Next serves the SVG as-is; no `dangerouslyAllowSVG` config change).
`PrizeShowcase`'s dead-code `_getBrandLogoPath` ryobi path was updated to `.svg` for tidiness.

## HiKOKI — 5th power toolset (2026-06-22)

HiKOKI is now a fifth selectable toolset alongside milwaukee / dewalt / makita / ryobi in
`prize-selection/constants.ts`: `ToolsetType` includes `"hikoki"`, `POWERSET_LABELS.hikoki`
is `"HIKOKI 15PC KIT AND MULTI CRUISER STORAGE"`, and `getToolsetColorKey` (in both
`PowerToolsetCarousel.tsx` and `StaticToolsetHighlight.tsx`) maps `hikoki → "hikoki-green"`.
Like the other toolsets it pairs with the **3 toolboxes** (Sidchrome / Milwaukee / Kincrome);
its included **Multi Cruiser is HiKOKI's storage system** (analogous to Makita MAKTRAK / Ryobi
LINK), **not** a 4th toolbox.

`POWERSET_IMAGES.hikoki` now points at the real composite hero
[`hikoki-set/HIKOKI.webp`](../../public/images/majordraws/hikoki-set/HIKOKI.webp) (transparent
HiKOKI toolset render, converted from the supplied PNG). One asset is still a placeholder:
- `/promotions/hikoki` ([`src/app/promotions/hikoki/page.tsx`](../../src/app/promotions/hikoki/page.tsx))
  renders via the shared `<ToolsetLandingPage toolsetSlug="hikoki" />` like the other brand
  pages, but currently **falls back to the standard promo hero** — no bespoke landing art yet.

## Components

- [src/components/promo/](../../src/components/promo/) — promo display components
- [src/components/banners/](../../src/components/banners/) — site-wide banner components

## Pages

- `src/app/promotions/` — admin / setup-style promo pages
- `src/app/(site)/promotion/` — public promo landing pages

### Klaviyo `Viewed Giveaway` event mount (added 2026-05-28)

[`PromoViewTracking.tsx`](../../src/app/promotions/_components/PromoViewTracking.tsx) is a zero-render client component that fires the canonical Klaviyo `Viewed Giveaway` event once per route change. It is mounted in two places to cover every `/promotions/*` route with a single client-side fire:

- [`src/app/promotions/[slug]/page.tsx`](../../src/app/promotions/[slug]/page.tsx) — covers all dynamic-slug promo pages.
- [`src/app/promotions/_components/ToolsetLandingPage.tsx`](../../src/app/promotions/_components/ToolsetLandingPage.tsx) — covers the five brand pages (`/promotions/dewalt`, `/makita`, `/milwaukee`, `/ryobi`, `/hikoki`) which all render through this shared component.

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

## PromoPackages — packages-design experiment concluded, control won (2026-07-06)

[`src/components/sections/promo/PromoPackages.tsx`](../../src/components/sections/promo/PromoPackages.tsx) always renders the control block: `<section id="packages">` + `SectionContainer` + `MembershipSection` (`title="Choose Your Entry Package"`), still passing `variantConfig?.packages` through for `hidePackages` / `displayOrder`.

Historical: from 2026-07-01 to 2026-07-06 it branched on `variantConfig?.packages.design` for the packages-design A/B test — `"membership"` rendered a `PromoMembershipDesign` treatment (the `/membership` tier + one-time-packs design). The control won (3.11% vs 2.65% conversion), so the treatment component, the `packages.design` config key, and the branch were removed. The generic experiment plumbing (`VariantAssignmentWrapper`, `getActiveExperimentForSlug`, `getServerVariantAssignment`) stays for future experiments. Historical operational details: [docs/ab-testing/promo-packages-design-runbook.md](../ab-testing/promo-packages-design-runbook.md).

## FloatingPromoBanner — removed (2026-07-01)

The floating "ENTRY BOOST ENDING SOON" promo banner (`FloatingPromoBanner` + its path-gated `FloatingPromoBannerHost` mount in `providers.tsx`) was **removed** — no longer needed. Its shared helpers (`PromoBadge`, `countdown-mode.ts`) and the `membershipTabChanged` window event stay, since `PromoBanner` still consumes them. (The Phase-1 note above references the old mount; it's historical.)

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
