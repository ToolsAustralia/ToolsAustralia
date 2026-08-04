# Package card surface — unify the modal package cards with the membership section

**Date:** 2026-08-04
**Branch:** `feature/membership-brand-showcase`
**Status:** approved, implementing

## Problem

Four surfaces render a package card. Colour *resolution* is already shared (both
`getMembershipSectionColorScheme` and `getElectricPackageColorScheme` are used everywhere,
per the 2026-05-18 pattern note). The **card chrome is not** — there are three different
bodies plus a hardcoded selection ring:

| Surface | Body treatment |
| --- | --- |
| `sections/membership/ElectricPackageCard` | vivid tier `bgGradient`, 2px accent border, inner sheen, `rounded-3xl`, accent bloom |
| `modals/PackageSelectionModal/PlanCard` | slate `#0f172a→#1e293b`, `ring-4 ring-yellow-400 ring-offset-slate-900`, `rounded-2xl` |
| `modals/SpecialPackagesModal/PackagesGrid` | electric-black `#0b0c0f→#060607` + accent radial rim, `rounded-2xl` |
| `modals/MembershipModal/PlanSummaryCard` | `bg-gray-50` / `border-gray-200` wrapper around a slate inner card |

The result reads as older, unrelated UI next to the section. The selection ring is the same
yellow on every tier regardless of accent.

### Why this is not just "swap three gradients"

`ElectricPackageCard` holds the entire light-theme derivation **inline** (lines 66–90):

- `blackText` / `lightInk` — `#0A0A0A` on lime + amber tiers, `#FFFFFF` elsewhere.
- `isPremium` — the VIP (`electric-black`) path, keyed off `textGradientStyle`.
- Three **cross-tier background remaps**: membership Tradie renders `foreman-pack`'s body,
  one-time Boss renders `foreman-subscription`'s, membership Boss renders `power-pack`'s.

Any modal that hand-rolls a vivid body will silently disagree with the section on exactly
those three tiers. Extraction has to take that logic with it, or the fork returns.

## Design

### One new file

`src/utils/package-colors/packageCardSurface.ts` — a pure token function, **not** a wrapper
component. The three modal cards have genuinely different internals (vertical tile, compact
row, summary strip); a shared component would fight all three, while shared *tokens* fit
each. Lands under `src/utils/package-colors/**`, already covered by the `shared-ui` domain,
so no Domain Manifest edit is needed.

```ts
getPackageCardSurface(planId, {
  isMembershipTab,           // plan.period !== "one-time"
  theme = "light",
  colorScheme,               // optional pre-resolved override
}): PackageCardSurface
```

Returns: `body`, `border`, `sheen`, `inset`, `bloom`, `bloomSelected`, `ring`, `ink`,
`inkMuted`, `inkFaint`, `divider`, `title`, `bigNumber`, `pricePanel`, `cta`, `accentHex`,
`isPremium`, `blackText`, `theme`.

Naming follows the existing vocabulary in this folder (`PackageColorScheme`,
`getCardBorderStyle`, `getMembershipSectionColorScheme`) — no new word is coined for an
existing concept.

The optional `colorScheme` override exists because `ElectricPackageCard` takes `colorScheme`
as a public prop resolved by its caller. Passing it through keeps that component's contract
and rendered output unchanged; the modals omit it and get the standard resolution.

### Consumers

1. **`ElectricPackageCard`** — inline derivation replaced by the surface call. Rendered
   output must stay identical. Doing this first is what proves the tokens are right before
   three modals depend on them.
2. **`PackageSelectionModal/PlanCard` + `FeaturesPreview`** — vivid tier body replaces the
   slate gradient; title / price / entries move to `title` + `ink`, so lime and amber tiers
   get black ink instead of white-on-yellow.
3. **`SpecialPackagesModal/PackagesGrid`** — vivid body replaces electric-black; keeps its
   existing no-shift rim technique; `SELECT` uses `surface.cta`.
4. **`MembershipModal/PlanSummaryCard`** — the `bg-gray-50` wrapper drops so the card reads
   as one piece; body and title come from the surface.

### Selection state — one rule for all three

- **Identical box model in both states** (2px transparent border + `bg-clip` rim, the trick
  `PackagesGrid` already uses) so selecting causes **zero layout shift**.
- Unselected: `bloom`. Selected: `bloomSelected` — a stronger tier-accent halo plus a
  contrast `ring` inset, both derived from the accent.
- `ring-4 ring-yellow-400 ring-offset-slate-900` is removed.

## Non-goals

- `MiniDrawPackageModal` and `PackageInclusionsSlideUp` also render package cards. They are
  outside the request and are not touched; afterward they become one-line consumers of the
  same function.
- No change to colour *values*, tier mapping, badges, ribbons, the discount swing tag, promo
  multiplier badges, or any copy. This is chrome only.
- No change to selection *behaviour* (the 200 ms tap→glow→select in `PackageSelectionModal`
  is untouched).

## Risks

- **`PackagesGrid` is the biggest visual jump** — it currently reads fine in electric-dark;
  going vivid is a real change, not a cleanup. Applied anyway because forking it rebuilds
  the inconsistency this work removes. Because the function takes `theme`, reverting that
  one surface is a one-word edit.
- **`ElectricPackageCard` is the highest-traffic surface on the site.** Its refactor is
  behaviour-preserving by construction (same expressions, moved), and is covered by a new
  token test plus the existing modal tests.

## Verification

- `npm run test:package-card-surface` (new) — asserts the three cross-tier remaps, `lightInk`
  polarity per tier, the VIP premium path, and light/dark divergence.
- `npm run test:package-selection`, `npm run test:special-packages`,
  `npm run test:membership-modal`, `npm run test:electric-scheme` — all must stay green.
- `npm run lint`, `npm run type-check`.

## Rule-11 check

No customer-facing copy changes. Existing strings (`FREE ENTRIES`, `One Time Payment`,
`Per Giveaway`, `free entries`) are preserved verbatim — all already free-entry framed.
