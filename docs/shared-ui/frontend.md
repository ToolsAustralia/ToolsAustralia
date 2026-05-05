# Shared UI — Frontend

## Component categories

See [architecture.md](./architecture.md#categories) for the full inventory.

## Cards

### WinnerCard

[src/components/cards/WinnerCard.tsx](../../src/components/cards/WinnerCard.tsx) renders a winner tile (image, name, prize, draw-type badge) and is consumed by the homepage Latest Winners hero, the `/winners` grid, and winner-testimony surfaces.

- The top badge reads **`<date>` MAJOR DRAW WINNER** or **`<date>` MINI DRAW WINNER** — date prefix from [`getWinnerDisplayDate`](../../src/utils/winners.ts) (en-AU short format, e.g. `27 APR 2026`), draw-type suffix from `winner.drawType`. The whole label is uppercased and tracked via Tailwind classes; do not pre-uppercase in the helper.
- The whole card is wrapped in a `<Link>`. Clicking anywhere navigates to:
  - `/promotions/${DEFAULT_PRIZE_SLUG}` for major-draw winners (the default promotions page from [src/config/prizes.ts](../../src/config/prizes.ts)).
  - `/mini-draws` for mini-draw winners (the mini-draws listing page, **not** a per-draw deep link).
- `showDrawLink` (default `true`) controls whether the bottom CTA strip ("Explore this promotion" / "View mini draws") is rendered. The card stays clickable either way; the strip is purely visual reinforcement on the `/winners` grid. The homepage hero passes `showDrawLink={false}` and relies on the card-level click.
- Uses a named Tailwind group (`group/card`) on the outer Link so the inner image's unnamed `group-hover:scale` only fires on image hover, not on bottom-CTA hover.

## Sections

### `sections/winner-testimony/` — Hear From Our Winners

[src/components/sections/winner-testimony/](../../src/components/sections/winner-testimony/) is a cinematic editorial section showcasing winner testimonies. It is composed of:

- [`WinnerTestimonySection`](../../src/components/sections/winner-testimony/WinnerTestimonySection.tsx) — section frame, theming, and Embla carousel orchestration. An inner `PopulatedSection` holds the Embla hooks so they only run when there are winners; the empty state branch renders without them.
- [`WinnerCinematicCard`](../../src/components/sections/winner-testimony/WinnerCinematicCard.tsx) — carousel slide; wraps the hero and adds the absolutely-positioned brand-gradient `Read full story →` CTA pill in the bottom-right. Receives an `onOpenStory(id)` callback from the section.
- [`WinnerCinematicHero`](../../src/components/sections/winner-testimony/WinnerCinematicHero.tsx) — shared cinematic photo block (full-bleed `next/image` with object-cover/center-30% focal point, brand-tinted edge glow, vignette, top-row pills, overlaid name + prize). Used by both the card and the modal hero band via a `variant: "card" | "modal"` prop; the `card` variant additionally overlays an opening quote-mark + testimony excerpt.
- [`WinnerStoryModal`](../../src/components/sections/winner-testimony/WinnerStoryModal.tsx) — magazine-article modal. Cinematic hero band on top, then editorial body: brand `THE STORY` eyebrow flanked by gradient lines, Georgia-serif story prose with brand-colored floated drop cap on the first paragraph, gradient brand divider, and a meta footer (Calendar/MapPin/Gift Lucide icons in brand color + values).
- [`theme.ts`](../../src/components/sections/winner-testimony/theme.ts) — `buildSectionBackground(primaryHex, isDark)` and `buildHeroEdgeGlow(primaryHex, isDark)` helpers; both compose CSS background strings via [`hexToRgbaString`](../../src/utils/package-colors/packageColorScheme.ts) from package-colors.

Section background and modal shell colors flip with site light/dark mode (`useTheme()` from [src/contexts/ThemeContext.tsx](../../src/contexts/ThemeContext.tsx)); accents — eyebrow color, divider gradient, edge glow, label borders, opening quote-mark, CTA pill, drop cap, meta icons — follow the active brand promo theme via `usePromoTheme()` from [src/stores/usePromoThemeStore.ts](../../src/stores/usePromoThemeStore.ts). The card itself and the modal hero band intentionally stay cinematic-dark in both site themes — by design, to keep the prize photo dramatic; only the surrounding section flips.

The legacy entry path [src/components/sections/WinnerTestimonySection.tsx](../../src/components/sections/WinnerTestimonySection.tsx) is now a one-line re-export of this module so existing import paths keep working unchanged.

**Updated 2026-05-04**: removed photo background — section + card + modal hero are now typographic on a dark brand-glow stage (no `<Image>`). The card CTA was moved out of absolute positioning into normal document flow below the hero (full-width on mobile, auto-width on `sm`+) so it can never overlap the winner name. The italic subtitle paragraph (`Tradies, weekend warriors…`) was removed from the populated header.

## Modals

### RenewalFailedModal

[`src/components/modals/RenewalFailedModal.tsx`](../../src/components/modals/RenewalFailedModal.tsx) handles failed subscription renewal payments. It calls `POST /api/stripe/pay-failed-invoice` via `usePayFailedInvoice` (TanStack Query mutation). When that flow returns an error matching "no payable invoice" or similar phrases, the modal renders a fallback "Pay overdue amount" CTA that calls `POST /api/stripe/force-charge-overdue`.

**Force Charge fallback state variables:** `forceChargeProcessing` (boolean), `forceChargeResult` (nullable object with `success`, `chargedInvoiceId`, `paymentStatus`, `amount`, `reason`, `message`). Both are reset when the modal opens.

**`isNoPayableInvoiceError(errMsg)`** — inline helper that matches the error state variable `error` against known "no payable invoice" phrases. When it returns `true` and `forceChargeResult` is null, the amber "Pay overdue amount" button appears. On result, success renders a green panel and failure renders a red panel. Full flow documented in [docs/admin/frontend.md](../admin/frontend.md#force-charge-ui).

## Z-index ordering

[src/constants/z-index.ts](../../src/constants/z-index.ts) defines z-index constants. Always reference these — never use raw numbers.

## Display helpers

- `display-name.ts` — formats user display names consistently across the app
- `brand-utils.ts` — brand display formatting
- `prize-brand-colors.ts` — resolves color tokens for prize / brand contexts

## Image helpers

`utils/images/` — image src resolution, lazy-load helpers, srcSet building.

## Motion

`utils/motion/` — Framer Motion presets and helpers.

**Updated 2026-05-04**: bumped `ToolboxSelector` unselected text to full white for legibility across brand themes; switched `LatestWinnerHero` CTA arrow to inherit `currentColor` so it stays visible in dark mode for light-primary brands.
