# Shared UI — Patterns

## PackageTile — the package-modal card — 2026-08-04

`src/components/modals/PackageTile.tsx` is the single package card rendered by **both**
package modals (`PackageSelectionModal/PlanGrid`, `SpecialPackagesModal/PackagesGrid`),
from the "Package Selection + Special Packages modals" handoff. It replaced
`PackageSelectionModal/{PlanCard,FeaturesPreview}` — **both deleted**, not left orphaned.

Three engraved bands over a glossy tier fill: identity → stats (hero entries + catalogue-
access ring) → footer (price + CTA, with the ribbon and discount tag riding the CTA's top
edge). Bands butt directly together; the separation is a seam (`border-top` + inset
highlight), never padding.

**One hex drives the whole card.** `glossFill`, `needsDarkInk` and `shadeHex` live in
`packageColorScheme.ts`. `needsDarkInk` thresholds relative luminance at 0.62, which is why
the amber Foreman and lime Tradie-pack tiles carry **black** ink while cyan/red/blue carry
white — never hardcode `#fff` on this card.

**Rules that are easy to get wrong:**
- **`isCurrent` suppresses the selected treatment** (`selected = isSelected && !isCurrent`),
  or the modal dresses the plan the user already owns as their active choice.
- **A current plan shows no ribbon** — the CTA already reads "Current plan"; a CURRENT tag
  on top says it twice.
- **A compact tile never shows both overlays.** The discount tag renders only when
  `hasDiscount && (!compact || !ribbon)`; with a ribbon, the struck price carries the
  discount alone. Two pills on a ~152px button is the congestion the redesign fixed.
- **Band 2's third column is a fixed px width, not `auto`** — an `auto` column gets squeezed
  by the `1fr` and the access caption collapses onto three lines.
- The CTA is **44px at every breakpoint** (mobile tap target).

`packageCardSurface.ts` still owns the *section* card and the selected-package summary — the
two systems now coexist deliberately; see the note in that file.

### Package copy conventions — 2026-08-05

Two strings differ **by surface on purpose**. Both look like inconsistencies at a glance, so
neither should be "fixed" to match the other without reading this.

**Period label.**

| Surface | Subscription label |
| --- | --- |
| Membership section / landing cards (`ElectricPackageCard`) | `per month · cancel anytime` |
| Modals (`PackageTile` via `PlanGrid`, `PlanSummaryCard`) | `Per Giveaway` |

A visitor on a landing card has not joined yet and needs the billing cadence plus the
no-lock-in reassurance. By the modal they are buying, and the useful fact is which draw the
payment enters. These are not contradictory —
[`/terms`](../../src/app/(site)/terms/page.tsx) states *"Per giveaway" means per calendar
month*, so the two are defined as equivalent. One-time packs read `One Time` / `One Time
Payment` on every surface.

**Access-ring caption** — `catalogue access` was replaced everywhere (2026-08-05) with
partner-discount wording, to match the terms and the rest of the site:

| Context | Caption |
| --- | --- |
| Membership tiers, and any pack with no day window | `partner discount access` |
| One-time pack, comfortable density | `{n}-day discount access` |
| One-time pack, compact density | `{n}-day access` |

The shortened forms exist because the ring's column is a fixed 96px (80px compact) — see the
fixed-width note above — and a day-count prefix pushes the full phrase past it. Shorten
rather than truncate.

Note the word "catalogue" survives legitimately in **code**, describing the numeric
percentage and the vendor catalogue itself (`getPartnerCatalogAccessPercentForPlanId`,
`PARTNER_CATALOG_TOTAL`, `PackageTile`'s `accessPct` doc). Only customer-visible *strings*
changed.

**Not yet done from that handoff:** the modal *chrome* — shell gradient/border, the header
and promo banner, the gold tab pills, the benefits panel restyle, the accent Buy button and
trust strip. Only the tile and the two grids landed. The tile is the piece that makes both
modals match the membership cards; the chrome is a second pass.

## PartnerBrandWall — odometer + conveyor belts — 2026-08-04

`src/components/sections/PartnerBrandWall.tsx` is the partner-network section rendered by
**both** `/membership` (via `MembershipBrandShowcase`, now a thin CTA-binding wrapper) and
`/promotions/[slug]` (via `UnlockDiscounts`, which keeps its member discount grid below —
the wall *sells* the network, the grid *serves* the codes a member already pays for).
Recreated from the "Brand Wall 1K" design handoff in this codebase's idioms.

### The count is OFFERS, and it comes from the generated constant (LEGAL — rule 11 adjacent)

The odometer defaults to `PARTNER_CATALOG_TOTAL` (`src/generated/partnerCatalogPreview.ts`,
currently 1833) and is labelled **"Partner offers · one card"**. It is deliberately **not**
labelled "partner brands": `PARTNER_BRAND_OFFERS` — the list behind the CTA — holds **7**
direct brands, and the handoff's own rule is *only claim a count you can back with the list
behind the CTA*. The two programmes are distinct (BUSINESS.md §: 7 direct partners + the
1,833-offer iGoDirect/MyRewards catalogue via portal SSO). Reading the generated constant
also means the number tracks the catalogue instead of rotting inside a copy string. **If you
relabel this to "brands" or hardcode a number, you have reintroduced an overclaim** — the
same class of problem the 2026-07-31 audit fixed in `UnlockDiscounts`.

### Invariants

- **Skin is CSS, never a JS boolean.** Both skins live in `globals.css` under
  `.ta-brand-wall` / `.dark .ta-brand-wall`, with `[data-skin]` rules last so an explicitly
  pinned skin wins. An earlier pass derived `isDark` via `useHtmlDarkForUi()` and the wall
  stayed light inside a dark page: reading the theme class *during render* is not reactive —
  the class lands after the render that read it and nothing schedules a second one. That hook
  is for portaled UIs (modals), not in-page sections. CSS variables also mean no hydration
  mismatch and no re-render on theme change.
- **Each belt renders an EVEN number of identical passes (`trackCopies`), not always two.**
  `translateX(-50%)` is seamless only if the track is an even number of copies **and** half
  the track is at least as wide as the belt. The handoff assumed ~48 tiles per belt and hard-
  coded a plain double; belt 1 holds 7 partners, whose double is far narrower than a desktop
  viewport — which showed as a large dead gap before it wrapped. `trackCopies` sizes the
  repeat to clear `MIN_HALF_TRACK_PX`. Only the first pass is announced (`aria-hidden` +
  `tabIndex={-1}` on the rest) so each partner is read and tabbed once.
- **Never add `justify-center` to the track.** When the track is wider than the belt,
  centering starts it at a negative offset and the `-50%` travel then runs off the right end
  — reintroducing the exact gap `trackCopies` exists to prevent. (Tried and reverted
  2026-08-04.)
- **Speed is per-tile, not per-belt.** Duration is `--bw-tile-sec × tiles-per-cycle`, so every
  belt moves at the same px/sec regardless of how many tiles it carries. The handoff's fixed
  per-belt durations (52s/64s/46s) only work when all belts hold the same count; ours hold 7
  vs ~47, which made the portal belts ~6× faster than the partner belt. Belts 2 and 3 differ
  by ~2% in duration *because* belt 2 holds two more tiles — that is equal speed, not a bug.
  `--bw-tile-sec` shortens under 640px, where tiles are logo-only (~130px vs ~300px).
- **Belt 1 is our 7 direct partners; belts 2–3 are the portal slice** (`PARTNER_WALL_TILES`,
  93 artwork-bearing Automotive/Technology offers — see
  [docs/partner/frontend.md](../partner/frontend.md)). All tiles share one layout: fixed
  120px logo box + a fixed 136px name column clamped to two lines. Both fixed sizes matter —
  a height-capped logo let aspect ratio drive tile width (portal artwork is squarish, so
  tiles came out 132px vs 208px), and single-line names drove belt 1 from 198px to 421px.
  **Never pad with invented partner names** (the prototype's ~40 fake Australian businesses
  are not shippable). If the portal slice is unavailable — `NEXT_PUBLIC_PARTNER_MEDIA_URL`
  unset, so no image URL resolves — every belt falls back to the direct partners rather than
  rendering an empty conveyor.
- **Mobile is logo-only.** Below `sm` the name column is hidden: it is the widest part of the
  tile, and the offer chip inside it only reveals on hover/`focus-visible`, neither of which a
  touch user gets — so it was reserving width for something never shown. The name still
  reaches screen readers via the tile's `aria-label`.
- **Tiles are buttons, not outbound links.** A tile fires the same action as the CTA. The
  section converts rather than sending visitors off-site pre-join, and it sidesteps the
  catalogue's placeholder `"#"` links, which as anchors would be focusable routes to nowhere.
- **The offer chip stays in layout.** Hidden via `opacity`/`transform` only — `display:none`
  would reflow the moving track on hover. Revealed on `:hover` *and* `:focus-visible`, since
  hover-only reveal is unreachable on touch and keyboard.
- **Dark skin restores a white plate behind each logo** (`--bw-logo-plate`). The partner
  wordmarks are dark ink drawn for white grounds (Seal Motors, Toolman Lane, ZJWRAPS, BAL all
  vanish on the glass tile); the handoff assumed logos designed for dark, which ours are not.
- **Motion rides `--ta-marquee-state`** (CLAUDE.md perf footgun #6) — already `paused` under
  `html[data-save-data="true"]` and `prefers-reduced-motion`, same gate as the old `.marquee`.
  Only `transform` animates. The odometer lands instantly under reduced motion.
- **The odometer rolls on `IntersectionObserver`, not on mount.** The section sits well below
  the fold on both hosts, so a mount-triggered roll always finished unseen. Its `roll`
  callback depends on `count`, not the derived digits array, or the effect would tear down and
  re-create the observer every render.
- Drum cell height is read from the DOM, not hardcoded to 92px — the plate scales down below
  `sm` and the roll maths (`-(10 + digit) × cellHeight`) depends on that height.

## SecureCheckoutBar — theme-aware payment marks — 2026-08-04

`src/components/ui/SecureCheckoutBar.tsx` renders the "INSTANT AND SECURE CHECKOUT WITH"
rule plus the five payment marks (Visa, Google Pay, Mastercard, Stripe, Apple Pay) as
**inline SVG**, themed through `--sc-*` variables declared on its own `.ta-secure-checkout`
root class (`globals.css`: light defaults + a `.dark` override).

**Why SVG and not the raster.** A flattened `/images/safe-checkout-stripe.webp` has baked-in
dark ink, so the only way to keep it legible on a dark surface is to force a white plate
behind it. `MembershipModal` did exactly that (`bg-[#ffffff] rounded-lg p-2`), punching a
white slab into the dark modal in dark mode. The SVG marks flip only the ink that would
disappear (Visa wordmark, the two "Pay" texts, the Stripe wordmark) and keep fixed brand
colours hardcoded (Mastercard discs, the Google "G"). They also cost no network request and
cannot shift layout.

**Scope the variables to the component, not the host.** These tokens started life as
`--pbc-*` scoped to `.prize-builder`, which is why the bar could not be reused anywhere
else — outside that card the variables were undefined. The `.ta-secure-checkout` class
carries its own values, so the bar themes correctly in any host. Values were carried over
verbatim, so `PrizeBuilderCta` renders identically (verified: `npm run test:prize-builder-card`,
22 assertions incl. all five `aria-label`s).

Consumers: `PrizeBuilderCta` (was the original home — its local copy and the five mark
components are deleted, 194 → 81 lines) and `MembershipModal` step 2.

**~~Still on the raster~~ — moot (2026-08-26).** `MajorDrawSection` held three remaining
`/images/safe-checkout-stripe.webp` usages with the same white-plate problem. The component was
deleted as dead code, so there is nothing left to convert.

## Package card surface — one source of truth for card chrome — 2026-08-04

`src/utils/package-colors/packageCardSurface.ts` owns the **chrome** of every package card, the
way `packageColorScheme.ts` / `electricPackageScheme.ts` own the **colour**. One call —
`getPackageCardSurface(planId, { isMembershipTab, theme = "light", colorScheme? })` — returns
`body`, `border`, `sheen`, `inset`, `bloom`, `bloomSelected`, `ring`, `ink`, `inkMuted`,
`inkFaint`, `divider`, `title`, `bigNumber`, `pricePanel`, `cta`, `accentHex`, `isPremium`,
`blackText`, `theme`.

**Why it exists.** That derivation used to live inline inside `ElectricPackageCard`, so the
three modal package cards each hand-rolled an approximation and drifted into three different
bodies: slate `#0f172a→#1e293b` (`PackageSelectionModal/PlanCard`,
`MembershipModal/PlanSummaryCard`), electric-black `#0b0c0f→#060607`
(`SpecialPackagesModal/PackagesGrid`), and the section's own vivid tier gradient. `PlanCard`
also carried a `ring-4 ring-yellow-400 ring-offset-slate-900` selection ring — the same yellow
on every tier regardless of accent — and shifted its border 2px→3px on select.

**The part you cannot see from a colour scheme.** Light theme applies three deliberate
**cross-tier background remaps** so no two adjacent cards in either tab repeat a colour:
membership Tradie renders `foreman-pack`'s body, one-time Boss renders
`foreman-subscription`'s, membership Boss renders `power-pack`'s. Any surface that builds a
vivid body from `colorScheme.bgGradient` alone silently disagrees with the section on exactly
those three tiers. This is the main reason to call the function rather than re-deriving.

**Consumers** (all four now render the same chrome, light theme):
`sections/membership/ElectricPackageCard` (passes its caller-resolved `colorScheme` through the
optional override so its public prop contract is unchanged),
`modals/PackageSelectionModal/{PlanCard,FeaturesPreview}`,
`modals/SpecialPackagesModal/PackagesGrid`, `modals/MembershipModal/PlanSummaryCard`.
`PlanSummaryCard` also dropped its `bg-gray-50 border-gray-200` wrapper so the card reads as one
piece; its `isUpsellOffer` path is themed by `promoThemePrimary` (not a package tier) and keeps
the original slate treatment — gated on `useTierSurface = isPackageCard && !isUpsellOffer`.

**Rules when consuming:**
- **Border is constant across states.** Selection swaps `bloom` → `bloomSelected` only, so
  selecting never shifts layout. Do not thicken the border on select.
- **Selected state needs ink contrast, not more accent.** Every neighbour on the vivid tier
  bodies is a different vivid colour, so an accent-only glow does not read as "selected".
  `bloomSelected` bakes in the `ring` (white on dark-ink tiers, black on lime/amber).
- **Pills and check badges fill with `ink`, not `accentHex`** — an accent chip vanishes on a
  body made of that same accent. The contrast pair is
  `{ backgroundColor: surface.ink, color: surface.blackText ? "#FFFFFF" : "#0A0A0A" }`.
- **Never hardcode `text-white/…` on a card body.** Lime and amber tiers use black ink; use
  `ink` / `inkMuted` / `inkFaint`, whose polarity tracks `blackText`.
- Render the `sheen` on an inset, `pointer-events-none`, `aria-hidden` layer beneath content
  (`z-0` with the content at `z-10`) — it is the depth pass that stops the vivid body reading
  as a flat swatch.

Not yet converted (one-line consumers when they are next touched): `MiniDrawPackageModal`,
`PackageInclusionsSlideUp`.

Test: `npm run test:package-card-surface` (17 assertions, standalone tsx, no DB) — covers the
three remaps, remap/tab keying, ink polarity per tier, ring contrast, the constant border, the
VIP premium path, and the `colorScheme` override.

## Package display names — 2026-05-14

Two helpers control how package names are shown to users. See `docs/subscription/patterns.md P0` for the full rule summary.

### Catalog surfaces — `getPackageDisplayName(plan)`
Catalog-facing components (`MembershipSection`, `PackageSelectionModal/PlanCard`, `SpecialPackagesModal/PackagesGrid`, `SpecialPackagesModal/BenefitsPanel`, `PackageInclusionsSlideUp`) render package names via `getPackageDisplayName(plan)` from `src/utils/membership/getDisplayName.ts` instead of reading `plan.name` directly. This strips the `"Additional "` prefix from Additional one-time packs so users see "Tradie Pack" rather than "Additional Tradie Pack".

Mini-draw package modals (`MiniDrawPackageModal`, `MiniDrawPackages` tooltip) use `pkg.displayName ?? pkg.name` since `MiniDrawPackage` carries its own `displayName` field.

### Receipt surfaces — `getReceiptLabel(pkg)` / `getReceiptLabelByPackageId(id, resolvers)`
Post-payment success screens and Klaviyo invoice email line items use `getReceiptLabel` from `src/utils/membership/getReceiptLabel.ts` to append a context suffix (`(Member)` or `(Mini Draw)`) so users can distinguish colliding display names in their purchase history.

- `MiniDrawPackages.tsx` — `setProcessingPackageName(getReceiptLabel(pkg))` on purchase success.
- `SpecialPackagesModal` — `setProcessingPackageName(getReceiptLabel(pkg))` on purchase success.
- `MembershipModal` — `setProcessingPackageName(getReceiptLabelByPackageId(activePlan.id, { membership: getPackageById, mini: getMiniDrawPackageById }))` for one-time and mini-draw purchases.

Do NOT apply `getReceiptLabel` to catalog cards, Stripe metadata, admin views, or internal event payloads — those retain the raw `name`.

## MembershipModal + PackageSelectionModal electric scheme — 2026-05-18

> **Card chrome superseded 2026-08-04** by "Package card surface" above — these three surfaces
> now render the section's vivid light-theme body, not the slate
> `#0f172a→#1e293b` gradient described below, and `PlanCard`'s yellow selection ring is gone.
> The **colour resolution**, discount/struck-price layout and copy rules below still hold.

`MembershipModal/PlanSummaryCard` ("Selected Package" card) and `PackageSelectionModal/PlanGrid` + `PlanCard` ("Select Your Package" popup) now inherit the **same colour resolution as `MembershipSection`'s `renderPlanCard`**: membership-tab plans → `getMembershipSectionColorScheme(plan.id, true)`, one-time / additional packs → `getElectricPackageColorScheme(plan.id)` (replacing `getPackageColorSchemeForPromo` + the `useVariantContext`/`contextVariantConfig` wiring, which was deleted through `PlanSummaryCard` → `PaymentStep` → `MembershipModal/index`). In `PlanSummaryCard` the package **name and price** use the `ElectricPackageCard` dark-mode title style (tier accent + `0 0 14px {accent}80` glow, or the VIP champagne-gold gradient with drop-shadow); the **benefit/entry lines** use "electric white" (`#FFFFFF` + `0 0 8px {accent}66` glow), matching the MembershipSection entries block. The upsell-offer path (`isUpsellOffer`) still uses `promoThemePrimary` and is visually unchanged. The `Nx Bonus entries have been applied` band was removed from `PlanSummaryCard`. The package name renders via `getPackageDisplayName` (strips the internal `"Additional "` prefix). For member additional packs (`getAdditionalPackDiscount` non-null) the struck regular price (same `text-xs sm:text-sm` size as the discounted price) and a tier-accent `{percentOff}% Off` pill sit in normal flow on the row directly above the discounted price (not absolute). The discounted price renders as `= ${price}` (the leading `=` only when a discount applies, plain `${price}` otherwise) in accent title style, above an uppercase muted `One Time Payment` / `Per Giveaway` label. `PlanGrid` passes a `discount` prop (`getAdditionalPackDiscount`). In `PlanCard` the struck regular price + tier-accent `{percentOff}% Off` pill are NOT in the vertical price stack — they sit in a single horizontal row absolutely positioned `left-full top-1/2 -translate-y-1/2 ml-1.5` (middle-upper-right of the `${plan.price}` number) so they never push the `One Time` label down. The prop is only non-null for `additional-{tier}-pack`, so this only appears when the modal is showing additional packages.

## ElectricPackageCard light theme — 2026-05-16

`ElectricPackageCard` accepts an optional `theme?: "light" | "dark"` prop (default `"dark"`, keeping the existing electric design byte-for-byte unchanged); `"light"` is now the classic bright branded-tier card — the card body IS the vivid tier gradient (`colorScheme.bgGradient`), scheme-derived ink colours (`lightInk`: black for lime/amber tiers, white for all others), a solid bright CTA (`backgroundColor: accent`), keeping the new badge/struck-price/per-word-title structural elements; dark rendering is unaffected for all existing consumers.

## SpecialPackagesModal color scheme — 2026-05-15

> **`PackagesGrid` body superseded 2026-08-04** by "Package card surface" above — it renders the
> vivid light-theme tier body now, not the electric-dark `linear-gradient(180deg,#0b0c0f,#060607)`
> described below. `BenefitsPanel` is unchanged. Everything else below still holds.

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
- **Offscreen framer-motion final pass:** `GiveawayCountdownTimer` (3 `repeat: Infinity` shimmer/pulse loops) and `UrgencyClockIcon` (6 infinite loops driving the shake / glow / clock-hand spin) read `useInViewportAnimation(ref)` and gate both `animate` and `transition` on the result. `RewardsFloatingWidget` and `PromoWelcomeModal` were already gated in Phase 2. The pass also covered `PowerToolsetCarousel` (radial pulse + Y-bob, gated on `tier === "desktop"` *and* `inView`) — that component was **deleted** 2026-07-21, and its prize-builder replacement runs no infinite loops at all (CSS transitions only, disabled under `prefers-reduced-motion`).

## Site-wide interaction smoothness — Phase 5A (2026-05-10)

Phase 5A finished the carousel-modernisation arc started in Phase 4 and started the lazy-modal sweep:

- `RecentWinnersCarousel` was rebuilt on top of `useEmblaCarousel` (no Swiper, no manual `slice(currentIndex, currentIndex + itemsPerView)`, no `window.resize` listener — Embla observes container resize natively). Per-card markup moved into [`RecentWinnerCard`](../../src/components/cards/RecentWinnerCard.tsx), a memoised component that consumes the `RecentWinner` shape from the new TanStack hook. This is intentionally a separate component from the existing [`WinnerCard`](../../src/components/cards/WinnerCard.tsx) (which renders the `/winners` gallery card with promo-theme borders and a "View draw" CTA): the homepage carousel variant has a fundamentally different design — full-bleed photo, name overlay, draw-type badge — and the two components never share JSX. Reach for `RecentWinnerCard` only inside the homepage `RecentWinnersCarousel`; reach for `WinnerCard` for the `/winners` gallery and any other surface that wants a clickable "go to draw" affordance.
- The carousel uses the shared [`EmblaCarouselButton`](../../src/components/ui/embla/EmblaCarouselButton.tsx) for prev/next, and `embla-carousel-class-names` (already a project dependency) for the active-snap class hook. Options/plugins are memoised so `useEmblaCarousel` does not reinit on every render — same referential-equality contract documented on `EmblaCarousel.tsx`. Pagination dots come from `emblaApi.scrollSnapList()` rather than a `Math.ceil(winners.length / itemsPerView)` calculation, so they always match Embla's resolved slide count.
- Data for the carousel now flows through [`useRecentWinners`](../../src/hooks/queries/useRecentWinners.ts), a thin TanStack Query wrapper over `GET /api/winners/all?limit=<n>` keyed by `["recent-winners", { limit }]`. Cache is scoped by limit so the homepage `limit=12` carousel and the `/winners` page (`limit=100`) do not share a cache row. The hook deliberately does **not** use the shared `apiGet` helper from `src/lib/queries.ts` because the endpoint is unauthenticated and the helper's auth-error force-logout path is overkill here.
- The Phase 2 ghost-name + persistent shimmer were already stripped in Phase 2 — Phase 5A simply preserves the slimmed card markup verbatim and adds a more accurate `sizes` hint to the next/image (`(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw`).

## Site-wide interaction smoothness — Phase 2 (2026-05-10)

Phase 2 retired fixed `backdrop-blur-*`, `transition-all duration-*`, and inline shadow / hover-translate values in favour of the device-tier CSS tokens introduced in Phase 1 (`--ta-blur`, `--ta-shadow-card`, `--ta-shadow-card-hover`, `--ta-card-hover-y`, `--ta-transition-dur`). On desktop the rendered output is identical (token defaults match the previous fixed values); on mobile and tablet the same components now compose with lighter blurs, smaller shadows and shorter durations without a JS branch in render. Components affected include `Header`, `MembershipSection`, `RecentWinnersCarousel`, `MajorDrawSection` (token swap only — Embla migration ships in Phase 4), `RewardsFloatingWidget`, `PromoWelcomeModal`, `PrizeShowcase`, `WinnersShowcase`, `GiveawayCountdownTimer`, and the partner / promo banners.

Where a component drove infinite framer-motion (`repeat: Infinity`), the loop is now gated. `PowerToolsetCarousel` read `useDeviceProfile()` so its radial pulse + Y-bob only ran on `tier === "desktop"` (that component was deleted 2026-07-21). `RewardsFloatingWidget` wraps its FAB in `useInViewportAnimation` so the rotate / scale-pulse loops pause when offscreen. `PromoWelcomeModal` checks `useReducedMotion()` for both its glow loops and its confetti trigger. `GiveawayCountdownTimer` switched its `<AnimatePresence>` from `mode="wait"` to `mode="popLayout"` so countdown digits enter / exit overlap rather than block on slow devices. `RecentWinnersCarousel` no longer renders the persistent `animate-shimmer-horizontal` overlay or the duplicated blurred ghost name on each card. `globals.css` adds an override that disables `.animate-shimmer*` on mobile and under reduced-motion, plus stops `border-glow-*` keyframes on the mobile tier and Save-Data so brand glows don't pin the GPU on phones.

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
| `--ta-marquee-state` | `running` / `paused` (paused on `Save-Data` and `prefers-reduced-motion`). Consumed via `[animation-play-state:var(--ta-marquee-state)]` by the two CSS marquees: the `/promotions` hero wordmark marquee and `MembershipBrandShowcase`. Add it to any new CSS marquee. |

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

[`useInViewportAnimation(ref)`](../../src/hooks/useInViewportAnimation.ts) returns `true` when the ref is within a 200px-margin IntersectionObserver. Use it to pause infinite framer-motion / canvas animations while their host is offscreen — used by `BrandScroller`, `OtherToolsetsCarousel`, animated number ramps. For **pure-CSS marquees in Server Components** prefer `content-visibility: auto` + `contain-intrinsic-size` on the strip wrapper instead (no client boundary needed) — see the two `marquee-scroll` consumers. `BrandScroller` additionally skips the embla `AutoScroll` plugin outright (static strip) under `useReducedMotion()` / `navigator.connection?.saveData`.

### Embla wrappers

[`src/components/ui/embla/`](../../src/components/ui/embla/) wraps `embla-carousel-react` so consumers don't repeat boilerplate:

- `EmblaCarousel` — single-track wrapper with `options` / `plugins` / `onApi`. Sets `data-carousel="true"` and `touch-action: pan-y pinch-zoom` on the viewport so iOS doesn't fight horizontal swipes against vertical scroll.
- `EmblaThumbsGallery<T>` — main + thumbs pair with synced selection, `fade` option (uses `embla-carousel-fade`), and `onIndexChange` / `onMainApi` hooks. Uses `embla-carousel-class-names` for state class hooks.
- `EmblaCarouselButton` — accessible prev / next chevron button.

**Referential-equality contract:** `useEmblaCarousel` reinitializes when `options` or `plugins` change by reference. Callers MUST memoize both with `useMemo` to avoid plugin reinit storms — the wrappers do not defensively re-memoize because a shallow `useMemo` on a fresh-each-render literal is a no-op.

**Column-grouping pattern (2-row thumb gallery, 2026-05-10):** when migrating a Swiper `Grid` (`rows: 2`, `fill: "column"`) thumb strip to Embla, group thumbs into pairs and treat each Embla slide as a *column* of 2 vertically-stacked thumbs (`flex flex-col gap-2 h-full`). Slide widths: `flex-[0_0_25%] sm:flex-[0_0_20%] lg:flex-[0_0_16.66%]` (4 / 5 / 6 columns visible). This avoids two Swiper-Grid limitations: (1) `slidesPerGroup` + `slideToClickedSlide` snap-back on second-page clicks, and (2) Swiper Grid refusing to advance to a partial final page when remainder < `slidesPerView`. First applied in `PrizeShowcase` (Phase 1.5 of the smoothness plan) — **that gallery was removed on 2026-07-21** with the prize-builder rewrite, so the pattern no longer has a live reference implementation here; it remains valid for `MajorDrawSection` and any other 2-row thumb gallery.

**Inline two-Embla pattern (overlay UI on the main viewport, 2026-05-10):** [`FullscreenImageViewer`](../../src/components/ui/FullscreenImageViewer.tsx), [`MiniDrawImageGallery`](../../src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx) (Phase 3 of the smoothness plan) and [`MajorDrawSection`](../../src/components/sections/MajorDrawSection.tsx) (Phase 4) keep `useEmblaCarousel` inline rather than using `EmblaThumbsGallery<T>` because each file needs siblings rendered *between* / *over* the main and thumbs viewports — a captioned info bar in the fullscreen viewer, absolutely-positioned navigation chevrons + pagination dots + counter overlaid on the rounded main card in the mini-draw gallery, and a "VIEW SPECS" overlay button + brand-colored bordered card wrapping the main viewport in MajorDrawSection. The wrapper renders `<main /><thumbs />` as fixed siblings under one root, so none of those patterns fit. The inline version uses the same option/plugin shape as `EmblaThumbsGallery<T>` (main: `loop: false, duration: 25` + `ClassNames()`; thumbs: `containScroll: "keepSnaps", dragFree: true` + `ClassNames()`) and replicates the linkage: `mainApi.on("select", onSelect)` updates the active index, scrolls the thumbs strip via `thumbsApi.scrollTo(i)`, and clicking a thumb calls `mainApi.scrollTo(i)`. Both viewports get `data-carousel="true"` and `touch-action: pan-y pinch-zoom` manually since the wrapper isn't wrapping them. Pagination dots are rendered from `mainApi.scrollSnapList()` length so dot count tracks slide count even on dynamic image arrays. Keyboard navigation (`ArrowLeft` / `ArrowRight` / `Escape`) is wired by the file's own `keydown` listener calling `mainApi?.scrollPrev()` / `scrollNext()` / `onClose()`.

**MajorDrawSection migration (Phase 4, 2026-05-10 — component since deleted):** [`MajorDrawSection`](../../src/components/sections/MajorDrawSection.tsx) shipped with four `Swiper` instances (mobile main + thumbs, desktop main + thumbs); Phase 4 replaced them with two `<PrizeImageGallery>` instances (a private inline two-Embla component declared in the same file). One instance is mounted inside the mobile `lg:hidden` layout and the other inside the desktop `hidden lg:grid` layout, so only one runs per viewport and the two have independent `activeIndex` state — matching the original Swiper behaviour. The component renders the bordered main-image card (with the brand-themed glow border + VIEW SPECS overlay) and the dragFree thumb strip together as siblings, accepting render-slot props (`specsButton`, `cardClassName`, `cardStyle`, `mainSizesAttr`, `thumbSizeClassName`, etc.) so per-layout sizing differs without forking the gallery. Pagination dots use the `EmblaPaginationDots` helper (also private to the file) rendered from `mainApi.scrollSnapList()`. Navigation buttons reuse the shared `<EmblaCarouselButton>` primitive. Phase 4 also removed `swiper` and the unused `embla-carousel-autoplay` from `package.json` (zero `from "swiper"` / `import "swiper/css"` hits remain in `src/`), so production builds for routes that include MajorDrawSection (`/`, `/promotions/[slug]`, `/my-account/draws`) drop the Swiper bundle (~50–60kB minified).

### Additional keyframes in globals.css

Two keyframes were added to `src/app/globals.css` as part of the cancellation flow redesign:

- **`@keyframes scaleIn`** — `scale(.6) opacity(0)` → `scale(1) opacity(1)` in 0.35s ease-out. Used by `StepSaveSuccess` check-circle via `motion-safe:animate-[scaleIn_.35s_ease-out_forwards]`.
- **`.cf-cta-shine`** — reusable CSS class that produces the same shine sweep as the membership "Enter Now" button (`.ta-enter-cta::after`). Sets `position: relative; overflow: hidden` on the host; the `::after` pseudo-element uses `inset: -40%`, `linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)`, and the shared `ta-enter-shine` keyframe (3.6s ease-in-out infinite) — **no duplicate keyframe**. Direct children are lifted via `.cf-cta-shine > * { position: relative; z-index: 1 }` so content always sits above the sweep. Reduced-motion gated: `@media (prefers-reduced-motion: reduce)` disables animation and transform on `::after`. Used by `PrimaryCta` (`primitives.tsx`) — children are wrapped in `<span className="relative z-[1] inline-flex items-center justify-center gap-2">` to guarantee layering above the shine regardless of children content.
- **`@keyframes promo-shimmer-sweep`** — full-width diagonal highlight sweep for the dashboard promo banner ([`DashboardPromoBanner`](../../src/components/sections/dashboard/DashboardPromoBanner.tsx)). Keeps a fixed `skewX(-18deg)` so the highlight band stays diagonal while it travels the whole banner width: the 42%-wide band sits at `left:-60%` and `translateX(0 → 380%)` of its own width.

### Print stylesheet

`@media print` in `globals.css` hides `[data-floating-widget]`, `[data-tracking-pixel]`, `header[data-sticky="true"]`, and any `[data-print="hide"]` element, and forces black-on-white. Tag floating UI / pixel scripts with the matching `data-*` attribute when adding new ones (`RewardsFloatingWidget` and the analytics scripts already do).

## MiniDrawPackages — two light tiers (rewritten 2026-08-12)

[`src/components/features/MiniDrawPackages.tsx`](../../src/components/features/MiniDrawPackages.tsx) is the pack picker rendered on `/mini-draws/[id]`. The catalogue is **not tier-gated**: every visitor (signed-in or not, member or not) sees all 8 active packs from `getMiniDrawPackages()`. Login is enforced at purchase time via `LoginPromptModal`.

> _Superseded:_ the original 2026-05-14 version filtered with `getMiniDrawPackagesForViewer(hasAccess)` so guests saw only Mini Pack 1–3 and members only the `additional-*-pack-mini` records. That gate was dropped before this rewrite; the helper still exists in `miniDrawPackages.ts` but nothing on the mini-draw surfaces calls it.

The 8 packs split into two groups, keyed off `getMiniDrawPackLightScheme(id).group`:

- **Mini packs** — `mini-pack-1|2|3` ($1 / $5 / $10), a 3-column tile grid.
- **Bigger packs** — `additional-{tradie,foreman,boss,power,vip}-pack-mini`, stacked full-width rows carrying the tier accent as a 3px left rule.

Mobile shows **one group at a time** behind a segmented control (`Mini packs` / `Bigger packs`); desktop stacks **both** under uppercase labels. Tapping any pack **selects it and opens its detail sheet** in one action — the old "What's included in {pack}?" button is gone.

Tiles live in [`MiniDrawPackTiles.tsx`](../../src/components/features/MiniDrawPackTiles.tsx) (`MiniPackTile`, `BigPackRow`, `PackTrustRow`, `MiniDrawPacksSheet`, `getMiniDrawPackTiers`) because **three** surfaces render the same two tiers: this picker, the browse-page quick-enter sheet, and the full "Entry packages" catalogue sheet. Forking the tile markup per surface is exactly how the old neon grid drifted out of step with its own modal.

`MiniDrawPackages` also owns the **mobile sticky "Enter draw" bar** (portaled to `<body>`, `data-floating-widget`, gated behind a `showStickyBar` prop that only `/mini-draws/[id]` passes). It lives here rather than in `MiniDrawInteractions` so `selectedPackId` and the purchase state have exactly one owner.

### Post-purchase upsell trigger — segment contract (2026-05-18)

`triggerUpsellModal` in `MiniDrawPackages.tsx` posts to `/api/upsell/trigger` with a `userType`. Every mini upsell record in `upsellPackages.ts` (built by `buildMiniUpsellRecords`) declares `userSegments: ["mini-draw-buyer"]`, and `getBestUpsellOfferForUser` → `filterUpsellPackagesByUserSegment` drops any offer whose segments don't include the sent `userType` (or `"all"`). Because this component **only ever sells mini-draw packs**, `userType` must always be `"mini-draw-buyer"` for `packageType === "mini-draw"` — it is now keyed off `packageType`, not an ID prefix. The previous `packageId.startsWith("mini-pack-")` check matched only the legacy `mini-pack-1|2|3` ids and silently dropped the upsell for the newer `additional-*-pack-mini` packs (Tradie→VIP), which is why only the old mini packs surfaced an upsell.

### Per-tier LIGHT theming (2026-08-12 — replaces the electric treatment on mini-draw surfaces)

The mini-draw pack tiles and `MiniDrawPackageModal` are now **light cards on white**, keyed per pack via `getMiniDrawPackLightScheme(packId)` in `electricPackageScheme.ts`. Each tier returns five values:

| field | used for |
|---|---|
| `accent` | the 3px left rule on a `BigPackRow` and the 7px tier dot on the detail chip |
| `ink` | price text, tier chip text, the "Purchase now" CTA fill (light theme) |
| `soft` | selected-tile tint, chip background, the "Entries go to" row (light theme) |
| `inkDark` / `softDark` | the same two roles under the class-based dark theme |

| Tier | Pack ids | accent | ink | soft |
|---|---|---|---|---|
| Mini | `mini-pack-1/2/3` | `#1E90FF` | `#0B63CE` | `#EFF6FF` |
| Tradie | `additional-tradie-pack-mini` | `#B4E600` | `#5E7A00` | `#F6FFE0` |
| Foreman | `additional-foreman-pack-mini` | `#00C3DB` | `#0E7490` | `#ECFEFF` |
| Boss | `additional-boss-pack-mini` | `#E0A019` | `#A56A00` | `#FFF8EC` |
| Power | `additional-power-pack-mini` | `#FF1F1F` | `#C70000` | `#FEF2F2` |
| VIP | `additional-vip-pack-mini` | `#C9A227` | `#8A6B1E` | `#FBF7EA` |

Three things to know before touching it:

1. **This is a SEPARATE ramp, not a repoint of `accentHex`.** Tradie's neon `#CCFF00` and Foreman's `#00E5FF` are invisible as a 3px rule on white, so the light table darkens them to `#B4E600` / `#00C3DB` and VIP drops the champagne gradient for a flat `#C9A227`. Editing `accentHex` instead would have repainted `MembershipSection`, `PackageSelectionModal`, `PackageInclusionsSlideUp` and the discount routes as a side effect — every one of those still wants the neon-on-dark treatment.
2. **Colour ships as CSS custom properties, not inline `style`.** These surfaces still render under the site's `dark` class, and a `dark:` variant cannot read an inline style value (see the "Inline `style={{ color }}` is invisible to `dark:`" gotcha). Each tile sets `--pk-accent/--pk-ink/--pk-ink-d/--pk-soft/--pk-soft-d` and consumes them through arbitrary values: `text-[var(--pk-ink)] dark:text-[var(--pk-ink-d)]`.
3. **No glow, no dark tiles, no gold gradient text, no info dot** on these surfaces. `getMiniDrawPackageColorScheme` and its `textGradientStyle` / glow path are now unused by the mini-draw pages — they remain only for the membership surfaces.

`MiniDrawPackageModal` moved from `ModalContainer` to [`SheetShell`](../../src/components/ui/SheetShell.tsx): bottom sheet on mobile, centred 440px modal on desktop, with scroll-lock + focus-trap for free. It takes an optional `drawName` (rendered in an "Entries go to" row, truncated to 38 chars so it never wraps) and an optional `ctaLabel` — `ReadyToEnter` opens it with **no draw bound**, where the row reads "Any active mini draw you pick" and the CTA becomes "Pick a mini draw" (there is nothing to charge against yet, so it scrolls back to the results grid instead).

## Electric package color schemes — Phase 1 (2026-05-15)

`src/utils/package-colors/electricPackageScheme.ts` is a self-contained, dev-only color-scheme module that maps package plan IDs to vivid "electric" `PackageColorScheme` objects. It does NOT extend `COLOR_KEYS` and does NOT edit `packageColorScheme.ts` — zero production impact until a component explicitly imports `getElectricPackageColorScheme`.

Six tiers are defined: `apprentice` (#1E90FF blue), `tradie` (#CCFF00 lime, black text), `foreman` (#00E5FF cyan), `boss` (#E0A019 warm amber-gold, black text), `power` (#FF1F1F red), and `vip` (matte black + brilliant champagne white-gold `#FFDF63` with gradient text). VIP is differentiated from Boss by gold tone and a crisp polished finish — a sharp double-rim outer shadow and tight glow — not by larger text or heavier blur. VIP uses the `ELECTRIC_BLACK` constant (matte black with a `textGradientStyle` CSS object using a bright champagne-to-white-gold gradient); Boss uses `ELECTRIC_GOLD` with a warmer amber palette.

`planIdToElectricTier(planId)` normalises any plan id — including `additional-*` prefixes and `*-member` suffixes — to a tier by substring matching. Unknown plan ids fall back to `power` (electric-red).

Consumers: `ElectricPackageCard` (live `MembershipSection` one-time tab), `PackageSelectionModal`, `PackageInclusionsSlideUp`, `SpecialPackagesModal` and the discount routes. **The mini-draw surfaces no longer consume the dark schemes** — as of 2026-08-12 they read the separate light ramp `getMiniDrawPackLightScheme(packId)` exported from the same file (see "Per-tier LIGHT theming" above). `getMiniDrawPackageColorScheme(packId)` is kept for any surface that still wants the dark treatment for a mini pack id. Subscription/membership-tab cards keep their `getMembershipSectionColorScheme` palette and are unaffected by this module.

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

## P7. framer-motion via LazyMotion — landing-path components use `m.*` (2026-07-20)

`src/app/providers.tsx` wraps the app in **`<LazyMotion features={loadMotionFeatures}>`**,
where `loadMotionFeatures = () => import("./lazy-motion-features")…` **async-loads** the
feature bundle (`src/app/lazy-motion-features.ts` default-exports `domMax`). This code-splits
framer-motion's features out of the shared/critical chunk into a **post-hydration async
chunk** — landing routes (`/`, `/promotions/*`) dropped **~16 kB First Load JS**.

Rules for animated components:

- **Landing-path / shared components import the lean `m` renderer, not `motion`** — e.g.
  `import { m, AnimatePresence } from "framer-motion"` and `<m.div>`. `m` has no built-in
  features; it consumes whatever `LazyMotion` provides. Hooks (`useReducedMotion`,
  `useMotionValue`, `useTransform`, `animate`, `useInView`) and `AnimatePresence` are
  import-and-use as before. The 15 converted files: `PrizeShowcase`, `PowerToolsetCarousel`,
  `StaticToolsetHighlight`, `ToolboxSelector`, `Carousel3D`, `FloatingCountdownBanner`,
  `GiveawayCountdownTimer`, `FloatingGetEntriesButton`, `PromoBanner`,
  `PromotionsAccountButton`, `EntryProgressBar`, `ModalContainer`, `PromoWelcomeModal`,
  `RewardsFloatingWidget`, `MiniDrawCard`. _(2026-07-21: `PowerToolsetCarousel`,
  `StaticToolsetHighlight` and `ToolboxSelector` were deleted; `PrizeShowcase` still uses `m.*`
  and its new prize-builder children use plain CSS, so the rule is unchanged for new files.)_
- **`features={domMax}` (not `domAnimation`)** because live landing animations use framer
  **`layout`/`layoutId`** — the MiniDrawTabs indicator (and, until it was deleted, the
  PowerToolsetCarousel FLIP) — which need the max feature set. `domAnimation` would silently
  break them.
- **Non-strict on purpose.** Under `strict`, any `motion.*` inside the tree throws at runtime
  — a single missed importer among the 29 across the app (incl. admin, mini-draws, login)
  would be a production crash for no landing-bundle gain (those are route-isolated chunks).
  So **route-isolated components keep `motion.*`** (they self-load features in their own
  chunk); only landing-path importers were converted to `m.*`. Verify coverage with
  `grep -rn 'motion\.' <converted files>` → 0.
- **Adding a new animated landing component?** Use `m.*` + the imports above. Adding one that
  genuinely needs a feature beyond `domMax`, or one that's route-isolated? `motion.*` is fine
  (non-strict allows it).

## Partner-copy honesty pattern (2026-07-31)

`RewardsPartnerCard`, `PartnerPreview`, `DashboardGuestPanel` and `UnlockDiscounts` all
describe the same benefit, so they drift together. A portal audit found all four claiming
"Australia's top tool brands" against a catalogue that returns **zero** offers for
Milwaukee, DeWalt, Makita and Ryobi.

When editing any of these four:

- Sell **breadth or a count**, never a brand we do not carry. `getPartnerCatalogUnlockedCount(pct)`
  gives the real numerator/denominator; it returns `count: null` off-ladder (0% = guest /
  past-due with no pack) and callers fall back to the bare percent.
- The job that expectation line used to do is now done by a **surface**, not a sentence.
  The card originally carried "You'll see the whole catalogue in the portal. Offers above
  your level show an unlock prompt instead of a discount." — necessary while the portal was
  the only place to look, because it renders locked and unlocked offers identically. It was
  removed on 2026-08-03 (owner call: redundant) once
  [`/my-account/rewards/catalogue`](../../src/app/(site)/my-account/rewards/catalogue/page-client.tsx)
  shipped, which *shows* entitlement per offer instead of warning about it in prose.
  **If that catalogue is ever removed or gated, the sentence has to come back** — otherwise
  an unmarked lock in the portal reads as a broken promise again.
- The `PARTNER_BRAND_OFFERS` grid is Tools Australia's **own** partner programme, not the
  iGoDirect catalogue. It keeps its own "Tools Australia partners" heading so the access
  ring's percent is not read as describing it.

Full audit: `docs/partner/igodirect-portal-ux-audit.md`; rules: `docs/partner/rules.md` R8.

## Per-visit attention pulse — `.ta-nudge-attention` (2026-08-03)

Third member of the `ta-nudge-*` family in [`globals.css`](../../src/app/globals.css). Reach for
it when a CTA needs to be *noticed on arrival* — not when a card needs to be *fixed*.

Pick by lifetime, not by looks:

- **`.ta-nudge-pulse` / `.ta-nudge-shimmer`** — loop forever, for an **empty-state** card. The
  gap they point at persists until the member acts, so the animation should too. Cleared by a
  sessionStorage marker on click.
- **`.ta-nudge-attention`** — runs **4 cycles (~5.2s) then stops**, and **restarts on every
  mount**. For a CTA that already exists and just needs to be found. No marker, no hook, no
  sign-out cleanup: an App Router page remounts on navigation, so revisiting the page replays
  it, and staying on the page does not.

Three rules when applying it:

1. **Set `--ta-attention` to a tone that works against what the ring expands ONTO**, not the
   button itself. The ring paints outside the button's box. A red pulse on the gold rewards chip
   reads as an error; white on the teal hero reads as a highlight. Tier-owned CTAs should pass
   the member's own `${tierHex}8c` — except when that colour is the guest grey, which cannot
   pull attention; fall back to the default red there.
2. **Don't move it onto the element's own `box-shadow`.** It lives on `::after` specifically so
   it can coexist with the inline `boxShadow` several call sites already carry.
3. **In a layout, not a page? You need a `key`.** The mount-replay is free for a page component
   (the App Router remounts it) but a layout never remounts. See `rewardsTabPulseKey` and the
   nav write-up in `docs/dashboard-account/frontend.md`.

**Never gate it on the same marker as a "New" badge.** They answer different questions — "is this
new?" expires, "is this worth opening?" doesn't — and sharing a gate means one visit silently
kills every cue at once.

Reduced motion kills the `::after` entirely (`content: none`) — the OS signal is the only guard,
per the same policy as its siblings. Full write-up: `docs/dashboard-account/frontend.md`.

## `ParticipantsModal` is draw-type-agnostic (2026-08-13)

[`src/components/modals/draws/ParticipantsModal.tsx`](../../src/components/modals/draws/ParticipantsModal.tsx)
serves BOTH the major-draw and mini-draw entry pools. It takes `drawId` / `drawName` /
`drawType: "major" | "mini"` (was `majorDrawId` / `majorDrawName`) and switches the endpoint:

| `drawType` | Endpoint | Id passed as |
|---|---|---|
| `"major"` (default) | `/api/admin/major-draw/participants` | `?majorDrawId=` query param |
| `"mini"` | `/api/admin/mini-draw/[id]/participants` | path segment |

**The two APIs were written to one response envelope precisely so this component did not fork.**
A second `MiniDrawParticipantsModal` would have drifted the first time either side gained a
column, and the search / pagination / drill-through-to-user behaviour is identical either way.
The only shape difference is `entriesBySource`, now optional — mini-draw entry is package-only, so
there is no source split to report.

`403` is surfaced as its own message ("You don't have permission to view participants for this
draw") rather than the generic failure, because the mini-draw route is gated on
`miniDraws.viewParticipants` and a role can legitimately lack it while still seeing the draw list.

**When adding a third draw type, extend the union — do not copy the file.**

## UserSetupModal — an optional field among required ones (2026-08-17)

Step 2 (`Step2Demographics`) now collects **gender** alongside state / profession / date of birth, but it is the only optional field there. Three things keep it that way, and all three must hold together:

1. It is **not** in `stepsNeeded` — step 2 fires on missing state/profession/birthdate only, so gender alone never summons the modal.
2. It is **not** in the step-2 validation or the `Next disabled` condition — "Continue" stays enabled with gender empty.
3. Its `Dropdown` gets no `required` and no error slot, and is rendered **last** so the three fields that do gate progress read as the ask.

`isGenderDropdownOpen` joins `isStep2OverlayOpen`; without it the last field on the step gets clipped when its menu opens.

The `/my-account/settings` **ProfileTab** mirrors this: gender is the one field there with **no amber "Required" chip** and is excluded from the `missing` completeness list — badging an optional field as required would be a lie. It always POSTs the key (as `""` when unset) so clearing works.
