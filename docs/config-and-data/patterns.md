# Config & Data — Patterns

## P0. Prize spec/gallery images — descriptive webp names (2026-06-22)

`prizes.ts` references product photos under `public/images/majordraws/<brand>-set/`. These
were migrated from the camera-roll `Tools_Aust_Feb26_NNN.jpg` files to **webp** with
**descriptive, product-accurate filenames** (~86% smaller). Single-product shots are named
from `SPEC_ITEM_IMAGE_BY_NAME` (e.g. `milwaukee-18v-fuel-13mm-hammer-drill-driver.webp`,
including the model code where the product data has one); general kit shots that map to no
single product are named `<brand>-gallery-NN.webp`. The originals were deleted. When adding
a new product photo, follow the same scheme and reference the webp path here.

**Combo card renders (2026-06-22):** every one of the 15 tool combos has a composite
"toolset + toolbox" render at `<toolset>-set/<toolset>-<toolbox>.webp` (e.g.
`milwaukee-set/milwaukee-sidchrome.webp`, `hikoki-set/hikoki-kincrome.webp`), wired into that
prize's `cardBackgroundImage` + first gallery image. These replaced the old
`<toolset>Set-<toolbox>Tb.webp` renders (now deleted), and the kincrome combos — which
previously fell back to the bare toolbox photo — now have real combo art too. Source PNGs
were delivered in a `newstatic/` folder that was converted to webp and removed. The combo
renders and the per-brand `POWERSET_IMAGES` hero renders were also normalised to a uniform
canvas (subject trimmed, scaled to a common frame, bottom-anchored) for consistent carousel /
prize-card sizing. The **HiKOKI per-tool spec photos** (`hikoki-gallery-NN.webp`) were matched
to each tool and added to `SPEC_ITEM_IMAGE_BY_NAME` (the modal spec cards showed placeholder
icons before).

**Landing assets (2026-06-23):** `promo-landing-slugs.ts` now wires HiKOKI as a full landing
brand — `hikoki-sidchrome` / `hikoki-milwaukee` added to `LANDING_HERO_MAP` and the
`getLandingHeroImagePaths` `hikoki` null-guard removed (its hero images + videos now exist on
disk). The whole landing hero set (images + videos) was replaced with a new design; see
`docs/promo/frontend.md`.

## P0b. HiKOKI — 5th power-toolset prize (2026-06-22)

`brand-theme.ts` `BrandKey` / `BRAND_THEMES` include **`hikoki`** with the official HiKOKI
brand green ramp (primary `#007749` — "Fun Green" / Pantone 3415 C; white text);
`slugToBrandKey` and `getAllBrandKeys` recognise it. HiKOKI is now **fully wired** as a 5th
toolset, so the prize grid is `5 × 3 = 15` tool combos + cash:

- `prizes.ts` — three spec arrays (`HIKOKI_POWER_TOOLS` = 15 tools: 13-piece MultiVolt Mega
  Combo + 2 nailers; `HIKOKI_POWER_SYSTEM` = 5× BSL36A18X batteries, 2× UC18YSL3 chargers,
  402094 site bag; `HIKOKI_CRUISER_STORAGE` = Multi Cruiser 3-piece set), all registered in
  the `applySpecItemImages` passes. Three catalog entries (`hikoki-sidchrome` /
  `hikoki-milwaukee` / `hikoki-kincrome`) added to `PRIZE_CATALOG`, the `PrizeSlug` union, and
  `getPrizeLabel`. Gallery uses converted `hikoki-set/hikoki-gallery-NN.webp` photos; the
  HiKOKI hero image in `POWERSET_IMAGES` is still a **placeholder**.
- `promo-landing-slugs.ts` — `hikoki` added to `TOOLSET_LANDING_SLUGS` and
  `TOOLSET_TO_PRIZE_SLUGS` (`["hikoki-sidchrome","hikoki-kincrome","hikoki-milwaukee"]`).
  `getLandingHeroImagePaths` returns `null` for `brand === "hikoki"` (no bespoke landing hero
  art yet → standard promo hero).

## P1. Re-export through `index.ts`

`src/data/index.ts` re-exports common data files for clean imports:
```ts
import { AUSTRALIAN_STATES, professions } from "@/data";
```

## P2. Fixture data prefixed with `sample`

`sampleProducts`, `sampleUsers`, etc. — naming convention to make it obvious this is fixture data, not production reference.

## P3. Package data as `Record<string, PackageDef>`

Static package files export keyed objects so lookups by id are O(1):
```ts
export const membershipPackages: Record<string, MembershipPackage> = {
  bronze: { name: "Bronze", entriesPerMonth: 5, ... },
  silver: { name: "Silver", entriesPerMonth: 15, ... },
};
```

## P4. Constants in SCREAMING_SNAKE_CASE

`Z_INDEX`, `LEGAL_DISCLAIMER` — consistent with TS convention.

## P5. Brand assets via `brandLogos.ts` map

Don't hardcode image paths in components — go through the map so renames are central.

The `name` field is the human-readable label rendered as visible text in shop / mini-draw filters / partner sections (and as image `alt`). Use **Title Case** (e.g. `"Sidchrome"`, `"Milwaukee"`, `"Kincrome"`), not all-caps — capitalised wordmark styling, if needed, is achieved at render time with `uppercase` Tailwind classes, not by baking caps into the data. Several legacy entries (`DEWALT`, `KINCROME`) still use all-caps; normalise on touch.
