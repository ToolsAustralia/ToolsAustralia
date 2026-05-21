# Winner Testimony Section + Modal — Visual Refactor

**Date:** 2026-05-04
**Owner:** DJ
**Status:** Approved design

## Summary

Refactor the "Hear From Our Winners" section (`WinnerTestimonySection`) and the "Read Full Story" modal it contains. The current layout looks generic and showcases the winner's photo as a plopped-on product image, which feels cheap. The refactor restyles both pieces as a single cinematic editorial system: prize photo becomes a moody full-bleed background, the winner's quote and name overlay it like a movie poster / luxury feature article, and everything follows the existing `usePromoTheme()` brand colors and the site's light/dark mode.

No data model, API, or business logic changes — purely a UI refactor of one section and its modal. Same prop API for callers.

## Goals

1. Remove the "ugly product shot" feel of the current photo treatment by making the photo cinematic background, not a centered display image.
2. Make the section feel premium / editorial / "expensive" — appropriate to a winner's testimony.
3. Drive all accents (edge glows, label borders, opening quote-mark, CTA gradient, divider) from `usePromoTheme()` so the section adapts when the user is on a Dewalt / Makita / Milwaukee / Ryobi promo page.
4. Adapt the section background AND the modal shell to site light/dark mode. Card and modal hero band stay cinematic-dark in both modes (deliberate — keeps the prize photo dramatic).
5. Refactor the modal into a magazine-article layout: hero band + editorial body + meta footer.
6. Work cleanly across mobile (≤640px), tablet (640–1024px), and desktop (≥1024px).
7. Remove the avatar / portrait icon — Tools Australia does not have separate winner profile photos.

## Non-goals

- No changes to `WinnerSummary` data shape, the `/api/winners/all` endpoint, or any backend.
- No changes to `WinnerCard` (used elsewhere on `/winners`).
- No changes to the carousel library — keep the existing Embla setup.
- No new business rules around when the section renders (still: only when there is at least one winner with a non-empty testimony).
- No copy changes to other surfaces (homepage, account, etc.) — only the section/modal visuals.

## Architecture

### File-level breakdown

The current `src/components/sections/WinnerTestimonySection.tsx` is 458 lines and bundles three concerns: the section frame, the carousel slide card, and the modal. Split into three focused files in `src/components/sections/winner-testimony/`:

```
src/components/sections/winner-testimony/
  WinnerTestimonySection.tsx     # section frame + carousel + theming entry point (~180 lines)
  WinnerCinematicCard.tsx        # the card slide — photo + overlay + quote (~120 lines)
  WinnerStoryModal.tsx           # full modal: cinematic hero + editorial body + meta footer (~140 lines)
  index.ts                        # re-exports for callers
```

Re-export `WinnerTestimonySection` as the default export from `index.ts` so existing import paths keep working:
```ts
// src/components/sections/winner-testimony/index.ts
export { default } from "./WinnerTestimonySection";
```
Then update `src/components/sections/WinnerTestimonySection.tsx` to a one-line re-export (`export { default } from "./winner-testimony";`) so callers (`WinnerTestimoniesClient`, `ToolsetLandingPage`, `[slug]/page.tsx`, `WinnersPageClient`, `my-account/draws/page.tsx`, `GiveawayDetails`) need no changes.

### Why split now

The 458-line file already has tangled responsibilities (carousel state, modal state, two completely different layouts in one render tree). Splitting now is a targeted improvement that serves the refactor — easier to reason about, easier for future edits to either the card or the modal in isolation. Not unrelated cleanup.

### Shared visual primitives

Both `WinnerCinematicCard` and the hero band in `WinnerStoryModal` share the same visual treatment (photo + vignette + brand glow + top pills + bottom name/prize overlay). Extract the shared piece as a small internal component within the folder:

```
WinnerCinematicHero.tsx           # the photo-hero block, used by both card and modal
```

Props:
```ts
interface WinnerCinematicHeroProps {
  winner: WinnerSummary;
  variant: "card" | "modal";  // controls height + text size scale
  className?: string;
}
```

This is the only abstraction. Section frame, modal shell, and editorial body are not extracted — they're each used in exactly one place.

## Section design

### Background

Two layers, both as `style` props (no Tailwind for the radial gradients — they need brand color interpolation from `theme.primary`):

**Dark mode:**
```css
background:
  radial-gradient(ellipse at top, rgba({theme.primaryR}, {theme.primaryG}, {theme.primaryB}, .16) 0%, transparent 35%),
  radial-gradient(ellipse at bottom right, rgba({brand}, .10) 0%, transparent 45%),
  linear-gradient(135deg, #050811 0%, #0b1326 50%, #050811 100%);
```

**Light mode:**
```css
background:
  radial-gradient(ellipse at top, rgba({brand}, .10) 0%, transparent 40%),
  radial-gradient(ellipse at bottom right, rgba({brand}, .08) 0%, transparent 45%),
  linear-gradient(135deg, #f5f3ee 0%, #ebe7dd 50%, #f5f3ee 100%);
```

The `{brand}` rgb is parsed from `theme.primary` once per render (helper: `hexToRgb(theme.primary)`).

Detect site mode via existing `useTheme()` hook (Theme domain) — read whether `dark` class is on `<html>`. Match how other section components handle this; do not introduce a new mechanism.

### Header

Above the carousel:

- Eyebrow: `— REAL STORIES —`, Inter 800, 10px, letter-spacing `.32em`, color `theme.primary`
- Title: `Hear From Our Winners`, Inter 800, 34px (sm: 28px), letter-spacing `-.5px`, color adapts to mode (`#fff` dark / `#0f172a` light)
- Divider: 48px × 2px, `background: theme.gradient`, rounded
- Subtitle: Georgia italic 16px, `Tradies, weekend warriors, first-home builders — the people behind the prizes.` Color: `rgba(255,255,255,.7)` dark / `#475569` light.

### Carousel slide card (`WinnerCinematicHero` with `variant="card"`)

Always dark cinematic regardless of site mode. ~380px height on desktop, ~340px tablet, ~320px mobile.

**Layers (top to bottom in DOM, bottom to top in z-stack):**

1. **Photo background** — `<Image fill className="object-cover">`, source from `winner.imageUrl || winner.prize.images[0] || "/images/promotion/PrizeHeader/PrizeHeader.webp"`. Use `object-cover` (not `object-contain`) so the photo fills and crops dramatically.
2. **Brand edge glow** — absolute inset-0 div with two radial gradients at top-left and bottom-right corners, brand-colored at ~22–28% alpha.
3. **Vignette** — absolute inset-0 div, `linear-gradient(180deg, rgba(0,0,0,.20) 0%, rgba(0,0,0,.55) 50%, rgba(0,0,0,.95) 100%)`. Heavier at the bottom so the overlaid text always reads.
4. **Top row** — flex row, padding `top-5 left-6 right-6`, `z-2`:
   - Left pill: `Major Draw Winner` / `Mini Draw Winner` from `winner.drawType`. 10px, letter-spacing `.28em`, white text, `bg: rgba(0,0,0,.4)` with `backdrop-blur-sm`, brand-colored 1px border.
   - Right pill (desktop only): `{Month Year} · {winnerState}` from `getWinnerDisplayDate` + `winner.winnerState`. Same styling, neutral white border.
5. **Bottom block** — absolute `bottom-0`, padding `28px 32px`, `z-2`:
   - Opening quote mark: Georgia 48px, line-height `.4`, color `theme.primary`, opacity `.85`
   - Quote: Georgia italic 21px (sm: 17px), line-height `1.45`, max-w `620px`, white. Source: `getWinnerTestimonyExcerpt(winner.testimony, 220)` (shorter excerpt — the modal carries the full read).
   - Bottom row (flex, wrap):
     - Left: name (Inter 700, 20px) + prize line (Inter 600 uppercase, 11px, letter-spacing `.18em`, white/60) — prize label uses `winner.selectedPrize || winner.prize.name`.
     - Right: CTA pill `Read full story →`, `background: theme.gradient`, brand-shadowed. Click handler: `setStoryModalWinnerId(winner.id)`.

### Carousel chrome

Keep existing Embla setup (loop when >1, dots, prev/next, page indicator). Restyle:

- Prev/Next arrows: brand-tinted backgrounds (`rgba({brand}, .15)` with `border: 1px solid theme.borderRgba`), white chevron
- Active dot: brand gradient, 32px wide
- Inactive dot: `rgba(255,255,255,.25)` dark / `rgba(15,23,42,.20)` light

### Bottom CTA

Existing `Join the Winners Circle →` button, kept but restyled to match: brand gradient pill, themed shadow `0 14px 30px {theme.shadowRgba}`.

## Modal design (`WinnerStoryModal`)

Drop the existing `ModalHeader` usage entirely. Compose the modal manually inside `ModalContainer` (size `4xl`, height `fixed`, `max-h-[92dvh]`).

### Structure

```
<ModalContainer>
  <button (close X, absolute top-4 right-4) />
  <WinnerCinematicHero variant="modal" winner={...} />     # ~380px desktop / 280px mobile
  <div class="body">
    <BodyEyebrow />                                         # "— THE STORY —" with brand gradient flanking lines
    <BodyProse>                                             # Georgia 18px, 1.75 leading, drop cap
      {paragraphs split from testimony}
    </BodyProse>
    <MetaDivider />                                         # brand-tinted gradient line
    <MetaFooter />                                          # Option A: clean inline icons
  </div>
</ModalContainer>
```

### Hero band (variant="modal")

Same visual rules as the card hero, but:
- Height: 380px desktop, 320px tablet, 280px mobile
- `winner.name` rendered larger: Inter 800, 32px desktop / 22px mobile, letter-spacing `-.6px`
- Prize line stays the same scale
- Top row gets two pills: draw-type pill + draw-date pill (mobile shows only the draw-type pill)
- No CTA — the modal IS the destination

### Body shell

Padding: `36px 44px 38px` desktop, `24px 22px 28px` mobile. Background: `#0a0d18` dark / `#fafaf7` light. Text color: `#cfd5e0` dark / `#1f2937` light.

### Body eyebrow

Flex row with two flanking gradient lines:
```html
<div className="body-eyebrow" style={{ color: theme.primary }}>
  <span className="line line-left" />
  THE STORY
  <span className="line line-right" />
</div>
```
- Lines: 1px height, gradient `linear-gradient(90deg, transparent, {theme.primary at 50% alpha})` and the mirror
- Eyebrow text: Inter 800, 10px, letter-spacing `.32em`

### Body prose

```css
font-family: Georgia, serif;
font-size: 18px;       /* mobile: 16px */
line-height: 1.75;     /* mobile: 1.7 */
letter-spacing: -.1px;
```

Paragraphs from `stripRichTextHtml(winner.testimony).split(/\n+/).filter(Boolean)` (existing logic).

**Drop cap** on first paragraph only:
```css
.drop-cap::first-letter {
  float: left;
  font-family: Georgia, serif;
  font-size: 60px;     /* mobile: 46px */
  line-height: .85;
  padding: 6px 12px 0 0;
  font-weight: 700;
  color: {theme.primary};
}
```

### Meta divider

Above the meta footer, after the prose:
```css
height: 1px;
margin: 32px 0 24px;
background: linear-gradient(90deg, transparent, {theme.primary at 40% alpha}, transparent);
```

### Meta footer (Option A — confirmed)

Flex row, wraps on narrow widths, gap `24px 32px`. Inter 600, 13px (mobile 12px). Color `rgba(255,255,255,.75)` dark / `#475569` light. Border-top in brand-tinted line (matches the divider but flat).

Three items, each `inline-flex items-center gap-2`, brand-color icon (Lucide `Calendar`, `MapPin`, `Gift`) at 16px:
- `<Calendar /> {getWinnerDisplayDate(winner)}`
- `<MapPin /> {winner.winnerState}` (omit if absent)
- `<Gift /> {winner.drawName}`

### Close button

Absolute `top-4 right-4`, 36px circle, `background: rgba(0,0,0,.55)` with `backdrop-blur-sm`, white `X` icon. Above all hero content (`z-10`).

## Theming logic — shared between section and modal

A small helper at the top of `WinnerTestimonySection` (or a util in `winner-testimony/theme.ts`):

```ts
function buildSectionBackground(theme: PromoLandingTheme, isDark: boolean) {
  const { r, g, b } = hexToRgb(theme.primary);
  const baseGradient = isDark
    ? "linear-gradient(135deg, #050811 0%, #0b1326 50%, #050811 100%)"
    : "linear-gradient(135deg, #f5f3ee 0%, #ebe7dd 50%, #f5f3ee 100%)";
  const topAlpha = isDark ? 0.16 : 0.10;
  const bottomAlpha = isDark ? 0.10 : 0.08;
  return `
    radial-gradient(ellipse at top, rgba(${r},${g},${b},${topAlpha}) 0%, transparent 35%),
    radial-gradient(ellipse at bottom right, rgba(${r},${g},${b},${bottomAlpha}) 0%, transparent 45%),
    ${baseGradient}
  `;
}
```

`hexToRgb` exists pattern in the existing `getContrastText` helper — reuse / colocate. If a `hexToRgb` helper exists already in `src/utils/`, use that instead.

`isDark` comes from `useTheme()` (Theme domain — `src/hooks/useTheme.ts` or `src/contexts/ThemeContext.tsx`). Match the pattern other section components use.

## Responsive behavior

| Breakpoint | Card height | Hero height | Quote size | Drop cap | Meta wraps |
|------------|-------------|-------------|------------|----------|------------|
| ≤640px (mobile) | 320px | 280px | 17px | 46px | yes (gap 16px) |
| 640–1024px (tablet) | 360px | 320px | 19px | 52px | maybe |
| ≥1024px (desktop) | 380px | 380px | 21px | 60px | no |

Breakpoint values: use Tailwind defaults (`sm:`, `lg:`). Hero pill on the right collapses to mobile-only-show-left-pill at <640px. Meta row wraps naturally with `flex-wrap`.

## Files affected

| File | Change |
|------|--------|
| `src/components/sections/WinnerTestimonySection.tsx` | Becomes one-line re-export from `./winner-testimony` |
| `src/components/sections/winner-testimony/WinnerTestimonySection.tsx` | New — section frame, theming, carousel orchestration |
| `src/components/sections/winner-testimony/WinnerCinematicCard.tsx` | New — card slide wrapper |
| `src/components/sections/winner-testimony/WinnerCinematicHero.tsx` | New — shared cinematic photo block (card + modal hero) |
| `src/components/sections/winner-testimony/WinnerStoryModal.tsx` | New — modal with cinematic hero + editorial body |
| `src/components/sections/winner-testimony/index.ts` | New — re-exports |
| `src/components/sections/winner-testimony/theme.ts` | New (small) — `buildSectionBackground` + `hexToRgb` if not already in utils |
| `docs/draws/frontend.md` | Update — note the new visual treatment + file split |

Callers untouched:
- `src/app/(site)/components/WinnerTestimoniesClient.tsx`
- `src/app/promotions/_components/ToolsetLandingPage.tsx`
- `src/app/promotions/[slug]/page.tsx`
- `src/app/(site)/winners/components/WinnersPageClient.tsx`
- `src/app/(site)/my-account/draws/page.tsx`
- `src/components/sections/promo/GiveawayDetails.tsx`
- `src/components/sections/WinnerTestimoniesClientLazy.tsx`

## Manifest

The new `src/components/sections/winner-testimony/` folder is covered by the existing `shared-ui` domain glob `src/components/sections/**`. Winner data/types/utils stay under the `draws` domain. No manifest edits required.

Doc updates required as part of the refactor:
- `docs/shared-ui/frontend.md` — note the new `winner-testimony/` subfolder and the cinematic card pattern.
- `docs/draws/frontend.md` — note that the section/modal got a visual refactor (no API change).

## Risks / open considerations

- **Dark mode detection**: confirm `useTheme()` is the right hook to read site light/dark in this section. If `usePromoTheme()` already exposes a `preferDarkBackground` flag (it does for Ryobi toolset), check whether section background should use that instead of site theme. **Decision during implementation**: prefer site theme (`useTheme`) — `preferDarkBackground` is for component-level CTA contrast, not section background.
- **Drop cap on mobile**: at 16px body / 46px cap, the cap is ~3 lines tall. Tested in mockup, reads fine. If it breaks on very narrow viewports (<360px), reduce cap to 38px and padding to `4px 6px 0 0`.
- **Photo aspect**: `object-cover` will crop tall portraits aggressively. For winner photos that are vertical, the prize/face might end up at the bottom of the card and get hidden by the vignette. Mitigation: use `object-position: center 30%` so the focal point sits in the upper half. If users start uploading awkward photos in production, revisit with a focal-point picker.
- **Carousel re-init on theme switch**: switching site theme should not require Embla re-init since we only change CSS variables. Verify in implementation.
- **Server-rendered → client mismatch**: the section reads from `usePromoTheme()` (Zustand) and `useTheme()` — both client-only. Component is already `"use client"`, no change.

## Out of scope (for follow-up if wanted)

- Replacing the carousel with a fade transition or a 3D coverflow effect.
- Adding video testimonies.
- Per-winner "share" buttons.
- Persisting a "viewed" state per winner.
