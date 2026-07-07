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

## P0c. Adding a promotion brand — source of truth & the lists that derive from it

A "promotion brand" (Ryobi / Milwaukee / Dewalt / Makita / HiKOKI) surfaces under `/promotions/`
as **two URL shapes**: the **brand / toolset URL** `/promotions/<brand>` (e.g. `/promotions/hikoki`,
from `TOOLSET_LANDING_SLUGS`) and per-prize **evergreen URLs** `/promotions/<brand>-<toolbox>`
(e.g. `/promotions/hikoki-sidchrome`, from the `PrizeSlug` union in `prizes.ts`).

**Source of truth — add the brand here:**
- `promo-landing-slugs.ts` → `TOOLSET_LANDING_SLUGS` (+ `TOOLSET_TO_PRIZE_SLUGS` + `LANDING_HERO_MAP`) — the brand/toolset URL slugs.
- `prizes.ts` → `PrizeSlug` union + `PRIZE_CATALOG` + `getPrizeLabel` — the evergreen prize URLs.
- `brand-theme.ts` → `BrandKey` + `BRAND_THEMES` + `slugToBrandKey` / `getAllBrandKeys` — colours + the canonical brand enumeration.

**Derives automatically — NO edit needed** (these import the source of truth, so a new brand flows through):
- Admin Overview **"Prize performance"** ROAS-by-brand card ([`PrizePerformanceCard.tsx`](../../src/app/admin/component/overview/sections/PrizePerformanceCard.tsx)) — maps over `TOOLSET_LANDING_SLUGS`.
- Per-promotion analytics funnel (`PromoAnalyticsRepository.getAllPromoSlugs`) and promo-slug validation (`validate-promo-slug.ts`).
- **Klaviyo brand attribution** (`klaviyo/brand-extraction.ts` → the `brandInterest` profile property) — validates against `getAllBrandKeys()`.
- Brand colour/theme resolution (`prize-brand-colors.ts`, `packageColorScheme.ts`).

**Still needs a manual touch when adding a brand:**
1. Ship the wordmark `public/images/brands/name/<slug>Text.svg` (used by the ROAS card + promo carousel).
2. Add the `/promotions/<slug>` static route (`src/app/promotions/<slug>/page.tsx`).
3. Add a `BRAND_DISPLAY_NAME[slug]` entry in `PrizePerformanceCard.tsx` — **compile-enforced** (typed `Record<ToolsetLandingSlug, string>`, so `tsc` fails until you add it; this is the guardrail that replaced the silent fork).
4. Add the public-carousel maps in `prize-selection/constants.ts` (`POWERSET_IMAGES` / `POWERSET_BRAND_TEXT` / `POWERSET_LABELS`, keyed by `ToolsetType`).

**Cosmetic-only, NOT consistency-critical** (safe to skip; not part of admin tracking): the decorative login-page toolset rotator (`src/app/login/page.tsx` `TOOLSETS`) and the one-off `scripts/convert-drawn-tonight-tomorrow-*` asset converters.

**ROAS-card matching is by toolset segment, not substring (2026-06-30):** the card assigns each Meta spend row to a brand via `promotionsToolsetSlug(canonicalUrl)` — the first `/promotions/<segment>` path segment, taken up to the first `-` (the toolset). So `/promotions/ryobi-milwaukee` counts toward **Ryobi** (the toolset), never Milwaukee (the toolbox); the toolset landing `/promotions/<brand>` and every `/promotions/<brand>-*` prize page roll up into that one brand row. The earlier `canonicalUrl.includes('/promotions/<slug>')` substring match produced the *same* result on today's URLs (the toolset is always the first segment, so no brand actually double-counted), but it relied on that implicit invariant; the explicit segment match makes "count by toolset" correct-by-construction.

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
