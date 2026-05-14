# Fullpage Image Viewer Redesign

**Status:** design approved, awaiting plan
**Owner:** redesign/fullpage-image-viewer branch
**Target file:** [src/components/ui/FullscreenImageViewer.tsx](../../../src/components/ui/FullscreenImageViewer.tsx)
**Domain:** shared-ui

## Goal

Replace the current fullpage image viewer's noisy, themed-glow-everywhere chrome with a calmer, editorial "photo + info card" layout. Fix two real bugs while we're in there:

1. The current viewer is hardcoded dark (`!bg-black`) and ignores light mode entirely.
2. There's no way to inspect a photo — no pinch, no double-tap, no pan.

The viewer is used in three places today (`WinnerStrip`, `MiniDrawImageGallery`, `PrizeShowcase`) plus the dev modals gallery. The redesign keeps the existing `FullscreenImageItem` / `FullscreenImageCaption` interface so callsites don't have to change.

## Visual direction — "Editorial card"

Photo on the primary side, a dedicated info card on the secondary side. Caption is treated as content, not as a thin overlay. Brand color (`usePromoTheme`) is reduced to a single accent (badge + active thumbnail border) instead of bleeding into every element.

Removed from the current viewer:
- Themed glass background on the counter pill, close button, chevrons, and thumb wrapper
- Themed glow shadows on the close button and chevrons
- The 3-column caption strip (Major draw / Winner / Won date)
- The hardcoded `bg-black` and dark-only treatment

Added:
- Light/dark adaptive surfaces (driven by `useTheme()` from `ThemeContext`)
- Pinch-zoom + double-tap zoom + pan (via `react-zoom-pan-pinch`)
- A draggable info card on mobile (grab handle, can be pulled down to reveal more photo)
- An editorial-style info layout: badge + prize name + Winner / Date meta row + thumb strip

Explicitly out of scope: avatar / circular profile icon — the user rejected this in brainstorming.

## Layout

### Desktop (≥1024px)

Two-column flex inside the modal body:

```
┌────────────────────────────────────────┬──────────────────┐
│                                        │  [Major draw]    │
│                                        │                  │
│            Photo (object-fit: contain) │  June Mega       │
│            with pinch/pan/zoom         │  Giveaway        │
│                                        │                  │
│            < chevrons appear on hover  │  ─────────────   │
│                                        │  Winner          │
│                                        │  Sarah J.        │
│                                        │                  │
│                                        │  Won date        │
│                                        │  12 Jun 2026     │
│                                        │                  │
│                                        │  ─── thumbs ──   │
│                                        │  [▣][▢][▢][▢]   │
└────────────────────────────────────────┴──────────────────┘
  Top bar: counter pill (left) · close (right) — both unthemed
```

- Photo column ~62%, info card ~38%
- Info card uses subtle theme tint at the top fading into the surface color
- Thumbs are a flat **grid** (3–6 columns auto-fit) inside the info card, scrollable vertically when count exceeds the visible rows (desktop only — mobile uses a single horizontal row, see below)

### Mobile (<1024px)

Stacked. Photo on top ~50% of viewport height, info card on bottom ~41% with a grab handle.

```
┌──────────────────────────┐
│ [1/12]              [✕]  │  ← top bar over photo
├──────────────────────────┤
│                          │
│   Photo                  │  ← ~50vh
│   (pinch / double-tap)   │
│                          │
│   ‹              ›       │  ← chevrons (semi-transparent)
│              [⚲ pinch]   │  ← zoom hint, 2s then fades
├──────────────────────────┤
│        ──── grab          │
│  [Major draw]            │
│  June Mega Giveaway      │  ← ~41vh
│                          │
│  Winner       Won date   │
│  Sarah J.     12 Jun     │
│  ─────────────────────   │
│  [▣][▢][▢][▢][▢][▢]→   │  ← horizontal thumb strip
└──────────────────────────┘
```

- The grab handle lets the user drag the card down by up to ~20vh to reveal more of the photo (it snaps back on release).
- Single-row horizontal thumb strip, scrollable.
- The grab gesture must not conflict with embla-carousel's horizontal swipe — the card listens for vertical-only drags.

## Theme integration

### Dark/light mode (from `useTheme()`)

| Surface | Dark | Light |
|---|---|---|
| Modal backdrop | `#000` | `#f5f5f4` (stone-100) |
| Photo area background | `#0a0a0a` (lets photo pop) | `#fafaf9` |
| Info card surface | gradient: `theme.primary @ 18%` → `#0a0a0a` | gradient: `theme.primary @ 6%` → `#ffffff` |
| Top bar pills | `rgba(0,0,0,0.45)` + white text | `rgba(255,255,255,0.7)` + near-black text |
| Border tints | `rgba(255,255,255,0.08–0.15)` | `rgba(0,0,0,0.06–0.12)` |

### Brand color (from `usePromoTheme()`)

The promo theme color appears in **exactly three** places, total:
1. The badge background (`theme.primary`)
2. The active thumbnail's border + 1px ring
3. The faint tint at the top of the info card's gradient

No theme glow on the close button. No theme glow on the chevrons. No themed wrapper on the thumb strip.

## Behavior

- **Zoom:** `react-zoom-pan-pinch` wraps the active `<Image>` in each slide. Pinch on touch, double-tap to toggle 2×, mousewheel on desktop. Max zoom 4×, min 1× (snap back).
- **Zoom + carousel coexistence:** when zoomed in, carousel swipe is disabled (pan takes over). When zoomed back to 1×, swipe re-enables.
- **Zoom hint:** the "Pinch / double-tap to zoom" pill in the photo corner appears on first open of the viewer per session (sessionStorage flag), auto-hides after 2s or first user touch.
- **Navigation:** existing embla setup preserved — left/right chevrons, drag-to-navigate, arrow keys, thumb clicks. Chevrons keep their position but lose the themed border + glow.
- **Mobile grab gesture:** Pointer events on the grab handle and the info card's top 32px. Vertical-only — horizontal swipe falls through to the photo. Two snap positions: **resting** (info card at full ~41vh height, default) and **peek** (info card translated downward so only the badge + prize name remain visible, photo grows to ~75vh). Releases between snaps go to the nearest.
- **Keyboard:** `Esc` closes, `←/→` navigate, `+`/`-` and `0` zoom in/out/reset (new).
- **Focus management:** unchanged from current — last focused element restored on close. Initial focus on close button.

## Implementation notes

- **One file edit:** [src/components/ui/FullscreenImageViewer.tsx](../../../src/components/ui/FullscreenImageViewer.tsx) is rewritten in place. The exported component name, prop interface, and the `FullscreenTriggerButton` export are kept. Callsites do not change.
- **One new dependency:** `react-zoom-pan-pinch` (~14KB gzipped, MIT, well-maintained). Added via `npm install`.
- **Theme hooks:**
  - `useTheme()` from `@/contexts/ThemeContext` for light/dark
  - `usePromoTheme()` from `@/stores/usePromoThemeStore` for brand color (already used today)
- **Tailwind only.** No CSS-in-JS modules added. Theme-dependent classes via `dark:` variants where possible, inline style for `theme.primary` values that aren't compile-time.
- **No new components extracted.** The viewer stays a single self-contained file. If specific sub-pieces grow (e.g. info card) past ~120 lines they can be extracted later, but per the YAGNI rule we don't pre-split now.
- **Manifest:** file already covered by `shared-ui` domain (no manifest edit needed). `docs/shared-ui/` will get a doc update describing the new viewer.

## Out of scope

- Sharing / "view other wins" CTAs inside the info card (could be added later in a follow-up)
- Per-callsite info card variations (e.g. mini draws don't have winner names — the info card simply skips empty fields)
- Server-side image optimization changes — still using Next.js `<Image>` `fill` with the same `sizes`
- Animated open/close transitions — the existing `ModalContainer` open/close animation is fine
- Auto-hiding the info card on idle — the user can drag the handle if they want more photo

## Risks / things to watch in implementation

- `react-zoom-pan-pinch` and `embla-carousel` need to be wired together carefully — the carousel must own the slide gesture only when zoom is at 1×. The library exposes a `disabled` prop on the zoom wrapper we can flip, and embla exposes `mainApi.reInit({ watchDrag })`.
- The grab-handle gesture on mobile must not steal the photo's pinch — solve by listening only on the grab strip and the top 32px of the card.
- Existing tests: there's a stub at [src/components/modals/MembershipModal/__tests__/fullscreen-image-viewer-stub.cjs](../../../src/components/modals/MembershipModal/__tests__/fullscreen-image-viewer-stub.cjs) — confirm it still works.
