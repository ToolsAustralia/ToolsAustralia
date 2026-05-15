# Membership Section — Electric Card Redesign (Phase 1: isolated dev preview)

**Date:** 2026-05-15
**Branch context:** `claude/remapping-packages-upsells`
**Status:** Design approved, ready for implementation plan

## Goal

Elevate the membership/package cards to a premium "electric" look on par with the
post-purchase upsell hero images, add a `50% OFF` badge + regular-price
strikethrough on additional (member) packs, and remove the "Additional" framing
from displayed names. Build it as an **isolated, dev-only preview first** so the
design can be evaluated across guest / subscriber / major-draw-entry user states
before the revenue-critical live `MembershipSection` is touched.

This spec covers **Phase 1 only**. Swapping the live section to the new card is an
explicit, separate Phase 2 (see Out of Scope).

## Non-goals (explicitly out of scope for Phase 1)

- Modifying the live `src/components/sections/MembershipSection.tsx` rendering.
- Repointing the existing `ONE_TIME_TAB_COLOR_MAP` (live one-time cards keep
  their current colors this phase).
- Stripping `"- Member Exclusive"` from live package subtitles.
- A/B-variant wiring for the new card.
- Adopting the reference upsell *layout* (arrow `N → ×M → BIG TOTAL`, shield
  graphics). Phase 1 polishes the **existing card skeleton**; a fuller
  reference-layout rebuild is a later decision.
- Any data-model change to `membershipPackages.ts` (discount is computed, not stored).

## Background (verified against code)

- Packages are static in `src/data/membershipPackages.ts`. Additional
  (member-only, `isMemberOnly: true`) packs are priced at exactly **half** their
  matching non-member `{tier}-pack` with the **same** entries:
  - `additional-tradie-pack` $25 vs `tradie-pack` $50 (15 entries)
  - `additional-foreman-pack` $50 vs `foreman-pack` $100 (30 entries)
  - `additional-boss-pack` $125 vs `boss-pack` $250 (150 entries)
  - `additional-power-pack` $250 vs `power-pack` $500 (600 entries)
  - `additional-vip-pack` $500 vs `vip-pack` $1000 (1500 entries)
  - `additional-apprentice-pack` is `isActive: false` → only **5** active
    additional packs (Tradie→VIP).
- `getPackageDisplayName()` (`src/utils/membership/getDisplayName.ts`) already
  strips the `"Additional "` prefix from the display name.
- `SpecialPackagesModal/PromoBanner.tsx` already frames these as
  "you are entitled to 50% off today" — established product language.
- Card colors resolve through `packageColorScheme.ts`:
  `MEMBERSHIP_TAB_COLOR_MAP` (subscriptions) and `ONE_TIME_TAB_COLOR_MAP`
  (one-time/additional) → `SCHEMES` / `MEMBERSHIP_SECTION_GRADIENTS`.
- The promo multiplier badge pins to the card **top-right**
  (`-top-6 -right-8` mobile / `-top-10 -right-8` desktop). The `50% OFF` badge
  must therefore **not** use the top-right corner.

## Decisions

1. **Approach C** — additive shared color tokens + a new isolated card +
   dev harness. Live section untouched in Phase 1.
2. **Colors:** Membership-Packs tab subscriptions keep teal/yellow/red
   (untouched). One-time + additional packs get the new electric palette.
3. **Electric FX:** static neon/glow + hover intensify only. **No looping /
   auto animation.** Hover scale already respects `prefers-reduced-motion`.
4. **50% OFF badge + strikethrough:** only on the 5 active additional packs.
   Placed **in the price block**, beside the price — never the top-right corner.
5. **Discount is computed** from the additional↔non-member price pair. No data
   model change.

## Design

### 1. Color system extension — `src/utils/package-colors/packageColorScheme.ts`

Additive only; no existing map repointed.

- Add 6 `COLOR_KEYS`: `electric-blue`, `electric-lime`, `electric-cyan`,
  `electric-gold`, `electric-red`, `electric-black`.
- Add matching entries to `SCHEMES` and `MEMBERSHIP_SECTION_GRADIENTS` using:

  | Tier | Color key | Primary → Dark | Glow rgba |
  |---|---|---|---|
  | Apprentice | `electric-blue` | `#1E90FF` → `#0066CC` | `30,144,255,0.4` |
  | Tradie | `electric-lime` | `#CCFF00` → `#7FB800` | `204,255,0,0.4` |
  | Foreman | `electric-cyan` | `#00E5FF` → `#0099B8` | `0,229,255,0.4` |
  | Boss | `electric-gold` | `#FFD700` → `#B8860B` | `255,215,0,0.45` |
  | Power | `electric-red` | `#FF1F1F` → `#A30000` | `255,31,31,0.45` |
  | VIP | `electric-black` | `#FFD700` on `#0A0A0A` | `255,215,0,0.35` |

  Each `PackageColorScheme` entry is built to the existing interface
  (bgGradient, gradient, text, badgeStyle, glow, accentHex, etc.). VIP/
  `electric-black` follows the existing `black` pattern (gold gradient text +
  `cardBorderGradient`), tuned to the spec glow.
- Add `ELECTRIC_TAB_COLOR_MAP` (apprentice→electric-blue, tradie→electric-lime,
  foreman→electric-cyan, boss→electric-gold, power→electric-red,
  vip→electric-black) and an opt-in resolver
  `getElectricPackageColorScheme(planId): PackageColorScheme` (normalizes
  `additional-*`/`*-pack` ids to a tier slot the same way the existing
  `planIdToSlotKey` does).
- **Do not** modify `ONE_TIME_TAB_COLOR_MAP`, `MEMBERSHIP_TAB_COLOR_MAP`,
  `getPackageColorSchemeForPromo`, or any existing export's behavior.

### 2. Discount pairing utility — `src/utils/membership/additional-pack-discount.ts`

```ts
getAdditionalPackDiscount(planId: string):
  { regularPrice: number; discountedPrice: number; percentOff: number } | null
```

- `null` for any non-additional pack (regular one-time, subscription) → no
  badge/strike for those.
- For `additional-{tier}-pack`: find non-member `{tier}-pack` in
  `membershipPackages`; return
  `{ regularPrice: pack.price, discountedPrice: additional.price,
     percentOff: Math.round((1 - additional.price / pack.price) * 100) }`.
- Returns `null` if the pair can't be resolved or `regularPrice <= discounted`
  (defensive; never render a fake discount).
- Pure; reads only the existing static data.

### 3. `ElectricPackageCard` — `src/components/sections/membership/ElectricPackageCard.tsx`

`"use client"`, **pure presentational** — no data fetching, no Stripe, no
context reads, no access computation. All decisions arrive as props:

```ts
interface ElectricPackageCardProps {
  plan: LocalMembershipPlan;            // name, price, period, features, metadata
  colorScheme: PackageColorScheme;      // caller passes electric or retained scheme
  state: {
    locked: boolean;                    // e.g. additional pack but no access
    lockReason?: string;                // CTA label when locked
    isCurrent: boolean;                 // current subscription
  };
  discount?: { regularPrice: number; percentOff: number } | null;
  onSelect: (plan: LocalMembershipPlan) => void;
}
```

Renders the existing skeleton, elevated:

- Package icon (`getPackageIcon`), title via `getPackageDisplayName`.
- Entries block — preserves the existing `original → ×M displayEntries`
  strikethrough when `plan.metadata.promoMultiplier > 1`.
- **Price block** (the "prize section"):
  - `discount` present → struck `$regularPrice`, bold `$price`, then a
    compact `{percentOff}% OFF` shield/pill beside it.
  - else → bold `$price` only.
  - The `% OFF` badge lives **here**, not the card corner.
- CTA: `Enter Now` (calls `onSelect`), or disabled `state.lockReason` when
  `state.locked`, or `Current Plan` when `state.isCurrent`.
- **Static electric treatment**: tier `bgGradient` + neon edge glow
  (`accentHex`-derived box-shadow) + inner sheen. Hover → increased brightness
  + slightly stronger glow + `scale-[1.02]`. No `@keyframes`/looping animation;
  hover transition only.
- One responsive component (Tailwind responsive classes), not duplicated
  mobile/desktop branches.

### 4. Dev harness

- `src/app/dev/membershipsection/page.tsx` — server component, returns
  `notFound()` when `process.env.NODE_ENV !== "development"`,
  `robots: { index: false, follow: false }`, `export const dynamic =
  "force-dynamic"`. Mirrors the existing `src/app/dev/modals/page.tsx`
  convention. Renders the client below.
- `src/components/dev/MembershipSectionDevClient.tsx` — `"use client"`,
  config panel + preview grid. No providers, no Stripe.

Config controls:

| Control | Options | Effect |
|---|---|---|
| User state | Guest / Subscriber / Major-draw-entry user | Selects the mocked pack set + lock states. Subscriber & entry-user both unlock additional packs (mirrors `hasAdditionalPackageAccess`). |
| Tab | One-Time / Membership | One-Time → electric cards (regular packs for Guest, 5 additional packs for unlocked states). Membership → 3 subscription cards rendered with their **retained** teal/yellow/red scheme for comparison. |
| Promo multiplier | off / 2× / 5× / 10× | Applies multiplier to mocked `plan.metadata` so the entries `N→×M` strike shows alongside the price strike. |
| Old vs New | toggle | Side-by-side: a current-style card vs `ElectricPackageCard`. |
| Theme | light / dark | Wrap preview in `dark` class. |
| Reduced motion | toggle | Wrap preview in a container forcing the reduced-motion code path to verify hover behavior. |

Mock data derives from `membershipPackages` filtered exactly as the live
section filters per state (subscription vs one-time vs member-only).
`onSelect` shows a toast/console line — no purchase flow.

### 5. Data flow

```
membershipPackages (static)
  ├─ filtered per dev "User state" + "Tab"  → LocalMembershipPlan[] (mocked)
  ├─ getAdditionalPackDiscount(planId)      → discount | null
  ├─ getElectricPackageColorScheme(planId)  → PackageColorScheme  (one-time/additional)
  │  or getMembershipSectionColorScheme(..)  → retained scheme     (subscription tab)
  └─ ElectricPackageCard(plan, colorScheme, state, discount, onSelect)
```

### 6. Error / edge handling

- `getAdditionalPackDiscount` returns `null` (no badge) rather than throwing on
  any unresolved pair or non-discount case.
- Missing package icon → icon block omitted (existing `getPackageIcon` returns
  `null`; card handles absence).
- Promo multiplier and discount strike are independent and may both show.
- VIP/`electric-black` uses gradient text; card guards the same way existing
  code does (`textGradientStyle ? "" : colorScheme.text`).

### 7. Testing

- `tsx` test for `getAdditionalPackDiscount`: all 5 active additional packs
  resolve to a `{regularPrice, discountedPrice, percentOff: 50}` pair;
  `additional-apprentice-pack`, every regular `{tier}-pack`, and every
  subscription return `null`. Wire a `test:additional-pack-discount` script in
  `package.json`.
- Manual: dev page across all User state × Tab × promo combinations, light/dark,
  reduced-motion on/off.
- `npm run lint` + `npm run type-check` clean.

### 8. Docs

Touched source lives under the `upsell` / `subscription` domains and
`packageColorScheme.ts` (shared-ui). Update the matching `docs/<domain>/`
entries per the doc-sync hook (note the new color keys, the discount util, the
dev harness, and that Phase-1 changes are additive/dev-only).

## Phase plan (each phase = a user-visible win)

1. **Color tokens + resolver** — electric keys in `packageColorScheme.ts` +
   `getElectricPackageColorScheme`. Win: palette exists, nothing else changes.
2. **Discount util + test** — `getAdditionalPackDiscount` + tsx test green.
3. **ElectricPackageCard** — the redesigned card (electric look, entries,
   price+badge, CTA, hover). Win: the card exists and renders.
4. **Dev harness** — `/dev/membershipsection` with all config controls. Win:
   you can evaluate every state live.
5. **Docs + verification** — domain docs, lint/type-check, doc-sync green.

## Open follow-ups (Phase 2, not now)

- Decide whether to adopt the fuller reference layout.
- Swap live `MembershipSection` to `ElectricPackageCard` + repoint
  `ONE_TIME_TAB_COLOR_MAP`; strip `"- Member Exclusive"` subtitles; A/B wiring.
