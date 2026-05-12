# PrizeSpecifications Modal Redesign — Design Spec

**Date:** 2026-05-12
**Author:** DJ (brainstormed with Claude)
**Status:** Drafted, pending user approval before plan

## Problem

The current [PrizeSpecificationsModal](../../../src/components/modals/PrizeSpecificationsModal.tsx) is functional but feels like an admin form next to the polish of the [CancellationUpsellModal](../../../src/components/modals/CancellationUpsellModal/index.tsx). Visually, it leads with a solid brand-colour title bar and dumps the user into tabs and bullet lists. There is no hero moment, no use of `gallery[0]` photography, and no closing trust signal — even though the modal exists specifically to convince users a prize is real and well-spec'd.

We have `gallery`, `summary`, `prizeValueLabel`, and `highlights` in the `PrizeCatalogEntry` data model that the current modal does not use.

## Goals

1. **Match the visual quality of CancellationUpsellModal** — same dark cinematic hero, same Anton headline treatment, same trust-bar closer.
2. **Lead with the prize photo** — use the landscape `gallery[0].src` as the centrepiece of the hero.
3. **Keep all current content** — tabs, spec cards, descriptions, "what's included" boxes, per-prize brand colour theming.
4. **Mobile parity** — the same `max-xs:` Tailwind pattern used in CancellationUpsell; landscape photo on both widths (no portrait swap).
5. **No new dependencies, no new shared primitives** — reuse the existing `upsell-shell/UpsellHero` and `upsell-shell/TrustBar` components.

## Non-goals

- Restructuring the data model in `src/config/prizes.ts`.
- Changing how the modal is triggered or wired into [PrizeShowcase.tsx](../../../src/components/sections/promo/PrizeShowcase.tsx) / [MajorDrawSection.tsx](../../../src/components/sections/MajorDrawSection.tsx).
- Adding feature flags or rollout gating (per CLAUDE.md rule 4).
- Adding tests (current modal has none; this is a presentational change with no business logic).

## Visual design

Four stacked sections inside the modal frame:

```
┌─────────────────────────────────────────────┐
│ HERO (dark gradient)                  [✕]   │
│   ━ ◆ Featured prize ◆ ━                    │
│   MILWAUKEE COMBO                           │
│   + $5K CASH                                │
│   sub-copy, 1-2 lines                       │
│   [ landscape gallery[0] photo, 16:6 ]      │
├─────────────────────────────────────────────┤
│ TAB BAR (Power Tools · Tool Storage · Cash) │
├─────────────────────────────────────────────┤
│ SUMMARY (left-rule, neutral fill)           │
│ SPEC CARDS (Lucide Package icon, bullets)   │
│   ...repeated per item in active tab        │
├─────────────────────────────────────────────┤
│ TRUST BAR (Verified specs · NTP · Photos)   │
└─────────────────────────────────────────────┘
```

### Hero

- Re-uses [`upsell-shell/UpsellHero`](../../../src/components/modals/upsell-shell/UpsellHero.tsx) with `tone="neutral"` (dark gradient + gold accent variable).
- `eyebrow` — two horizontal hairlines flanking a `Trophy` icon + `Featured prize` label + `Trophy` icon, in `#d4af37` premium gold. Same construction as CancellationUpsell `Hero.tsx`.
- `title` — uses the `font-acumin` Tailwind class (Anton type family), matching the CancellationUpsell hero. The prize label is split on `' + '`: the part before the plus goes on line 1, the part after (e.g. `"$5k cash"`) on line 2 in `text-[var(--upsell-accent)]`. If `label` has no `+`, render as one line.
- `sub` — `prize.summary` (already in catalog).
- `infographic` slot — the landscape photo. A `next/image` component pointing at `prize.gallery[0].src` (the `gallery` array is always non-empty in `PRIZE_CATALOG`, so no fallback needed), sized `aspect-ratio: 16 / 6`, `border-radius: 10px`, with a subtle inner brand-tint overlay so the photo blends into the dark hero. `gallery[0].mobileSrc` is deliberately ignored — the landscape image is used on both widths, just rendered narrower at the same aspect ratio on mobile.
- Close button — `absolute top-3 right-3`, `bg-black/55`, `backdrop-blur`, `border-white/20`, matches CancellationUpsell exactly.

### Tab bar

- Same `<button>`-with-pill markup we have today, but restyled:
  - Inactive: `bg-white` / `border-neutral-200` / `text-neutral-600` (light) and `bg-neutral-900` / `border-neutral-700` / `text-neutral-400` (dark).
  - Active: `bg-gradient-to-b` using the prize's brand gradient (driven by `getPrizeBrandColors(slug).gradient`), with `shadow` in the matching `brandColors.shadowColor`.
- Horizontal-scroll container with `brand-scrollbar` (kept from current implementation).
- Counter badge — `bg-black/6` inactive, `bg-white/20` active.

### Summary

- Replaces the current heavy red-wash summary with a softer treatment:
  - `bg-neutral-50` / `dark:bg-neutral-900` fill.
  - `border-l-2` in `brandColors.borderColor`.
  - `text-neutral-600` body copy.

### Spec card

- Card frame: `border` + soft gradient (`from-white to-neutral-50`), no left-rule (the brand colour now lives in the icon badge and bullet markers instead).
- Icon badge: 32×32 rounded square, `bg-gradient` in the brand-tinted soft colour, contains a Lucide [`Package`](https://lucide.dev/icons/package) icon at 18×18.
- Title — `font-poppins font-extrabold text-[13px]`.
- Model — small muted line with a brand-coloured dot prefix.
- Description — `text-neutral-500 text-[11px] leading-relaxed`.
- "Specifications" header — small uppercase eyebrow with a 3×12 brand-colour pill prefix.
- Bullets — circular brand-colour dots (not checkmarks) at 5×5, aligned with `leading-snug` body text.
- "What's included" sub-box (kept) — same dashed border around an inner `Package`-headed list.

### Trust bar (Payment / Prize set)

Same shell as [`upsell-shell/TrustBar`](../../../src/components/modals/upsell-shell/TrustBar.tsx) with three cells:

| Icon | Label | Sub |
|---|---|---|
| `ShieldCheck` | Secure payment | Powered by Stripe |
| `Award` | NTP/16264 | Govt-certified draw |
| `Truck` | Real prizes shipped | To every winner |

Icon colour: `brandColors.checkmarkColor` so the trust bar tints with the prize (red for Milwaukee, yellow for DeWalt, etc.).

## Per-prize brand colour integration

Reuse the existing helpers from [`src/utils/prize-brand-colors.ts`](../../../src/utils/prize-brand-colors.ts):

- `getPrizeBrandColors(slug, isDark)` — drives tab active gradient, icon badge tint, bullet dot colour, trust-bar icon colour.
- `getPrizeSpecificationsModalHeaderSolidFill(slug)` — no longer used (the solid header bar is gone). Will leave the helper in place since it's exported for other surfaces.
- `getPrizeSpecificationsModalTheme(slug, isDark)` — kept; drives card surface classes, body classes, etc.

For the hero specifically: the dark gradient is constant across all prizes (always neutral/gold) — only the inner sections re-tint. This is intentional: a uniform hero communicates "you're in the prize-spec modal," then the brand colour kicks in below to differentiate Milwaukee from DeWalt etc.

## File layout

The current single-file `PrizeSpecificationsModal.tsx` (~280 lines) will be promoted to a folder, mirroring CancellationUpsellModal's structure:

```
src/components/modals/PrizeSpecificationsModal/
  index.tsx          # orchestrator — sections, state, ModalContainer wiring
  Hero.tsx           # UpsellHero composition with prize-specific eyebrow/title/photo
  TabBar.tsx         # tab pills, horizontal scroll
  SpecCard.tsx       # one spec item — icon, title, model, description, specs, includes
  TrustBar.tsx       # 3-cell verification bar (wraps upsell-shell/TrustBar)
```

**Justification per CLAUDE.md rule 4 ("Justify every new file"):**

- `Hero.tsx` — non-trivial composition (eyebrow + title splitter + Image with art direction); inlining would push `index.tsx` past 350 lines.
- `TabBar.tsx` — meaningfully self-contained; isolating it makes the active-state styling auditable.
- `SpecCard.tsx` — the most internally-structured piece (title, model, description, specifications, includes box). Each `renderSpecItem` is already a 70-line function in the current code; extracting clarifies it.
- `TrustBar.tsx` — thin wrapper, but consistent with how CancellationUpsell's `TrustBar.tsx` wraps the shell version. Easier to swap copy later without touching the orchestrator.

The existing single file [PrizeSpecificationsModal.tsx](../../../src/components/modals/PrizeSpecificationsModal.tsx) will be deleted as part of the move. Imports in [PrizeShowcase.tsx](../../../src/components/sections/promo/PrizeShowcase.tsx), [MajorDrawSection.tsx](../../../src/components/sections/MajorDrawSection.tsx), and [ModalsGalleryClient.tsx](../../../src/components/dev/ModalsGalleryClient.tsx) continue to resolve since the module specifier (`@/components/modals/PrizeSpecificationsModal`) targets the folder's `index.tsx`.

## Data flow

```
PrizeShowcase / MajorDrawSection
  ↓ (prize: PrizeCatalogEntry, isOpen, onClose)
PrizeSpecificationsModal/index.tsx
  ├─→ Hero (prize.label, prize.summary, prize.gallery[0])
  ├─→ TabBar (sections, activeId, onSelect)
  ├─→ SpecCard[] (one per item in active section)
  └─→ TrustBar (no props — fixed copy)
```

State stays in `index.tsx`: `activeSectionId`, derived `sections` (with the cash-prize tab appended for non-cash prizes), derived `brandColors`, derived `surface` (theme). Theme reactivity via the existing `useThemeStore` selector.

## Responsive behaviour

All breakpoints use the existing Tailwind tokens already used by CancellationUpsell:

- `max-xs` (<540px) → tight padding, smaller Anton size (~19px), tab pill height -4px, hero photo aspect remains 16:6 (just narrower).
- `sm+` → full hero padding, Anton ~24px, comfortable card padding.

`ModalContainer size="4xl" height="auto"` is kept — same dimensions as today. `max-h-[88dvh] sm:max-h-[80vh]` on `ModalContent` is kept so the scroll behaviour matches today.

## Accessibility

- Hero `<h2 id="prize-specs-headline">` (matches `aria-labelledby` on the dialog).
- Close button retains `aria-label="Close"`.
- Tab pills retain `type="button"`; active state still communicated by colour + scale (no aria-selected change needed — they're buttons, not a real tablist semantically, and screen readers already get the active state from the heading change below).
- No animation that breaks `prefers-reduced-motion` — the hover transforms on tabs and cards already respect that via Tailwind defaults.

## Risks

- The Anton/font-acumin headline reads slightly differently across prize labels because lengths vary ("Milwaukee Combo + $5k Cash" vs "Custom Ryobi 18V ONE+ Kit with 36V Brushless Ryobi Lawn Mower"). The hero title splitter falls back to a single-line render when no `+` is present, but Ryobi's long label will still wrap to 2-3 lines. Acceptable — the dramatic typography handles this gracefully.
- Brand colour applied to bullets/icons depends on `getPrizeBrandColors` returning truthy. If `prize.slug` is unknown, the helper returns null and the modal falls back to default red — same fallback the current modal uses.

## Out of scope

- Animating the hero photo in (no `framer-motion`; CancellationUpsell doesn't animate either).
- Adding a "Share this prize" or "Add to favourites" action.
- Persisting the user's last-viewed tab across re-opens.
- A/B testing the redesign (CLAUDE.md rule 4 — no flags by default; commits are the rollback unit).
