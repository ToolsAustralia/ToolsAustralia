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
renders and the per-brand toolset hero renders (exposed as `POWERSET_IMAGES`, derived from
`TOOLSETS[].image`) were also normalised to a uniform canvas (subject trimmed, scaled to a common
frame, bottom-anchored) for consistent sizing — this is what lets the prize builder show every
combination in one fixed `object-contain` stage. The **HiKOKI per-tool spec photos** (`hikoki-gallery-NN.webp`) were matched
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
  `getPrizeLabel`. Gallery uses converted `hikoki-set/hikoki-gallery-NN.webp` photos. _(The
  "HiKOKI hero image is still a placeholder" caveat is resolved — `hikoki-set/HIKOKI.webp` is the
  real composite; see `docs/promo/frontend.md` "HiKOKI — 5th power toolset".)_
- `promo-landing-slugs.ts` — `hikoki` added to `TOOLSET_LANDING_SLUGS` and
  `TOOLSET_TO_PRIZE_SLUGS` (`["hikoki-sidchrome","hikoki-kincrome","hikoki-milwaukee"]`).
  `getLandingHeroImagePaths` returns `null` for `brand === "hikoki"` (no bespoke landing hero
  art yet → standard promo hero).

## P0d. GearWrench — 4th toolbox prize (2026-07-27, draw 9)

Grid went 5×3 = 15 → **5×4 = 20** combos; `PRIZE_CATALOG` / `PRIZE_SUMMARIES` 16 → 21 entries.
Business detail is in BUSINESS.md §3c. What matters for this domain:

**The five catalog entries are DERIVED, not restated.** `fromSummary(slug, deep)` in
`prizes.ts` takes every shared field straight from `PRIZE_SUMMARIES` and adds only
`detailedDescription` + `specSections`. The rest of the catalog restates shared fields
longhand — which is exactly why `npm run test:prize-summaries` exists as a drift guard. For
these five, that class of drift is impossible rather than merely detected. **Prefer
`fromSummary` for new entries.** (The longhand entries were left alone rather than churned
during an asset change.)

**Source-size budget raised 40 KB → 48 KB.** It is a tripwire against heavy DEEP data
creeping into the client half, not a cap on prize count — the picker was designed so "adding
a brand is one more data entry". A prize costs ~1.2 KB. Raise it only for MORE PRIZES; if it
trips because per-entry cost grew, that is the leak it is watching for.

**Combo composites — four of five, and why the gap is keyed per COMBINATION.** The shoot
landed 2026-07-28 for Milwaukee, DeWalt, Makita and HiKOKI (`{toolset}-set/{toolset}-gearwrench.webp`,
wired to both `cardBackgroundImage` and the gallery hero). **Ryobi was not shot** — the same
combination absent from every other part of the draw 9 drop — so it keeps the standalone
`toolbox/gearwrenchTB.webp` behind the "combo photo coming" state.

`COMBOS_AWAITING_COMBO_ART` in `prize-builder-model.ts` therefore holds `"ryobi-gearwrench"`,
not `"gearwrench"`. It was briefly toolbox-level, when GearWrench had no combo art at all; had
it stayed that way, the four combinations that now HAVE art would still be showing the
standalone box. **When a partial shoot lands, move the flag down a level rather than deleting
it.**

The sources were 1080×1080 square while every existing composite is 1600×1200; they are
`fit: "contain"`-padded onto that canvas so the subject renders at the same scale as its
siblings (BUSINESS.md records the deliberate uniform-framing normalisation).

**Derive query-param allowlists from the registry.** `parseToolboxQueryParam` held a
hand-written set of three ids. Adding GearWrench to `TOOLBOXES` silently forked it: the card
wrote `?toolbox=gearwrench` but the value failed to parse on the way back, so a refresh or a
shared link dropped the visitor's choice. It now derives from `TOOLBOXES`.

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
4. Add **one `TOOLSETS` record** in [`prize-selection/constants.ts`](../../src/components/sections/promo/prize-selection/constants.ts) (add the id to `ToolsetType` first). One entry carries everything the public surfaces need — display name, `kitLabel` / `storageLabel` / `cardLabel`, `toolCount`, brand `accent`, kit `image`, `wordmark` (+ `wordmarkScale`), and `isNew: true` for the brand's first draw. (Storage copy is NOT held here — the details modal reads the catalog's own `specSections`, so `storeName`/`storeSpec`/`storeImage` were removed as duplicated data.) Array order **is** the prize-builder reel order. **Do not hand-write `POWERSET_IMAGES` / `POWERSET_BRAND_TEXT` / `POWERSET_LABELS`** — since 2026-07-21 those are *derived* from `TOOLSETS` and adding a row to them would fork the vocabulary. Ship the combination composites at `{toolset}-set/{toolset}-{toolbox}.webp` (one per toolbox) and the reel/hero art needs no further code. Guard: `npm run test:prize-builder` asserts the derived maps stay in step with the registry.
   - **Toolboxes work the same way** via `TOOLBOXES` in the same file (`TOOLBOX_IMAGES` / `TOOLBOX_LABELS` derived). A toolbox record also needs a **white-on-transparent silhouette** `markImage` plus a light/dark `markColor` pair — the reel card paints it through a CSS mask (see [promo/frontend.md](../promo/frontend.md#prize-builder--build-your-prize-configurator-2026-07-21)). GearWrench is intentionally absent until draw 9.

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

## supportChatFaqs — the corpus size is a deliberate assertion (2026-07-31)

`src/data/__tests__/faqs.test.ts` pins `entries.length`. Adding an FAQ **fails the suite on
purpose** — bump the number and leave a dated one-line note saying what the new ids cover,
so the corpus cannot grow by accident.

Entries 75 + 76 (2026-07-31) cover the partner portal's **own** UI, which is the vendor's
and not ours: its points/savings wallet (a currency Tools Australia does not operate, so it
reads zero for every member) and its editable profile copy (edits there never reach us).
Both were live to members with no grounded answer, so Cobber's nearest matches were the TA
rewards-points and TA profile entries — a confidently wrong answer rather than a gap.
After editing, re-run `npm run build:chat-knowledge-pack` **and** `npm run test:chat-faqs`.

## Brand-lane display registry (2026-08-19)

`src/config/promo-landing-slugs.ts` now owns the label + wordmark for **every** brand lane, both axes:

- `TOOLSET_LANE_DISPLAY: Record<ToolsetLandingSlug, BrandLaneDisplay>`
- `TOOLBOX_LANE_DISPLAY: Record<ToolboxLaneId, BrandLaneDisplay>`
- `getBrandLaneDisplay(laneId, lane)` — lookup with a titlecased fallback

This replaces a `BRAND_DISPLAY_NAME` map that lived **inside** the admin Prize Performance card and covered only the 5 toolset brands. That fork had already gone stale once (HiKOKI was missing from the ROAS table for its entire first run).

**The `Record<>` types are the guard, not decoration.** Adding a brand to `TOOLSET_LANDING_SLUGS` or `TOOLBOX_LANE_ORDER` fails compilation here until its label and wordmark are supplied — a new brand cannot silently render as an unlabelled row. `npm run test:brand-lane` additionally asserts every lane resolves to a non-empty label *and* wordmark at runtime.

⚠️ **Milwaukee appears in both maps** with identical label and artwork — it is genuinely both a power-toolset brand and a toolbox brand. Any UI rendering these must make the active lane unmistakable, because the wordmark alone cannot tell a Milwaukee-the-toolset row from a Milwaukee-the-toolbox one.

**Adding a promotion brand** — the checklist in this doc now also requires a `TOOLSET_LANE_DISPLAY` (or `TOOLBOX_LANE_DISPLAY`) entry and a `/images/brands/name/<slug>Text.svg` wordmark; without them the build fails rather than the admin table quietly under-reporting.
