# Promo — Frontend

## /promotions — "Spotlight" showroom (2026-07-22) — SUPERSEDES the filter-grid gallery

Rewritten to the design handoff at `claudeDesign/design_handoff_prize_gallery_spotlight/`. The
filter-pill grid is **gone**; `/promotions` is now a **cinematic configurator**: one large LIVE
PREVIEW beside a grouped rail of every combination, and picking one recolours the whole stage.

| File | Role |
|---|---|
| [`page.tsx`](../../src/app/promotions/page.tsx) | Server: metadata, promo chrome, stage, winner testimonies, permit fine print |
| [`_components/PrizeGallerySpotlight.tsx`](../../src/app/promotions/_components/PrizeGallerySpotlight.tsx) | Client: the ONLY state on the page + stage layout |
| [`_components/SpotlightPreview.tsx`](../../src/app/promotions/_components/SpotlightPreview.tsx) | Left column — eyebrow, H1, case, meta row, stat tiles |
| [`_components/ComboRail.tsx`](../../src/app/promotions/_components/ComboRail.tsx) | Right column — toolset groups, thumbs, cash tile |
| [`_components/GalleryDrawStamp.tsx`](../../src/app/promotions/_components/GalleryDrawStamp.tsx) | The case pill: live draw stamp + countdown |
| [`_components/gallery-spotlight-model.ts`](../../src/app/promotions/_components/gallery-spotlight-model.ts) | All derivations, no React (`npm run test:prize-gallery`) |

**Deleted:** `GiveawayGalleryClient.tsx` (filter pills + grid + `ComboCard`) and
`GalleryCountdown.tsx` (the red countdown-chip row). The featured-lead card, the brand marquee, the
sticky filter dock and the closing gold cash band went with them — the rail's cash tile is now the
cash entry point.

### Winner testimonies (added 2026-07-23)
Directly below the configurator stage (and above the permit fine print), `page.tsx` mounts the shared
winner-testimonies section via `<Suspense><WinnerTestimoniesClientLazy /></Suspense>` — the exact
self-fetching, near-viewport-deferred pattern the `/promotions/[slug]` brand pages use. It is the
**draws-domain** `WinnersTestimony` component (the "speech bubble" redesign — see
[docs/draws/frontend.md](../draws/frontend.md#winner-testimony-display--winnerstestimony-the-one-hear-from-our-winners-section)),
which self-fetches `useWinnersFeed` **client-side** and returns null when there are no winners — so it
never makes this ISR page dynamic and never blocks render on an empty feed. It auto-themes with the
promo guest light/dark toggle through its own `.winner-testimonies` `.dark`-keyed token scope (no JS
theme read), independent of the page's `--pgs-*` layer.

### Scales by data, never by layout
Nothing in the gallery enumerates a brand. The rail's groups are `TOOLSETS` and each group's thumbs
are `TOOLBOXES` from [`prize-selection/constants.ts`](../../src/components/sections/promo/prize-selection/constants.ts)
— the SAME registries the prize builder turns — and the thumb grid's column count is
`repeat(TOOLBOXES.length, …)`. Adding a brand is one record there plus its art; there is no edit in
this folder and no grid rewrite. Combo art, alt text and the accent come from the builder's own
`getComboPresentation` / `resolveAccent`, so the two surfaces can never point at different art for
the same combination. `npm run test:prize-gallery` asserts every combination resolves to a real
catalog prize, a render **on disk**, and a working `/promotions/<slug>` link.

`ToolboxOption` gained **`brandName`** ("Milwaukee" / "Kincrome" / "Sidchrome") — the bare brand the
`<Toolset> × <Toolbox>` title and the Storage stat need. `name` stays the full product name
("Monster Milwaukee Toolbox") and `shortName` the chip form ("Milwaukee box").

### Selection + links
State is `{toolset, toolbox, isCash}` (the builder's `PrizeSelection`), opening on
**`DEFAULT_PRIZE_SLUG`** via `fromPrizeSlug` — derived, so the showroom and the rest of the site
always headline the same combination. **Deliberately NOT mirrored into the URL:** every option
already deep-links to its own `/promotions/<toolset>-<toolbox>` prize page (the prerendered `[slug]`
route, so the destination's hero art and OG metadata match exactly what was previewed), and cash to
`/promotions/cash-prize`. A `?combo=` param would be a second, weaker address for the same thing.

### Accent
`--pgs-accent` is set inline **once** on the stage root from the selected toolset (cash green in
cash mode) and inherited by the glow, case ring, CTA, active thumb border and check — so browsing to
another brand recolours the column in one .5s transition from a single source. Everything else is
the `.prize-gallery` token layer in globals.css (see [shared-ui/frontend.md](../shared-ui/frontend.md)).

### Rail height — fills the preview, no fixed cap
The handoff caps the rail at `max-height: 640px`, which stopped it well short of the taller preview
column and left visible dead space (owner). The rail is now a grid item with **`lg:h-0
lg:min-h-full`**: contributing ZERO intrinsic height lets the preview column size the row, then
`min-height:100%` stretches the rail back to exactly that. Its scroll area is `flex-1 min-h-0
overflow-y-auto` (the `min-h-0` is what allows a flex child to shrink below its content and actually
scroll). Measured flush — rail bottom equals preview bottom at 1280/1440/1920. Below `lg` the rail
is a plain stack so the page keeps ONE vertical scroll.

### Mobile: the floating "Enter draw"
Below `lg` the rail sits UNDER the preview, so by the time a visitor picks a combination the inline
CTA has scrolled off and acting on it meant scrolling back up (owner). `SpotlightPreview` mounts a
**floating twin** on `lg:hidden`, shown by an `IntersectionObserver` on the real CTA — when the
inline one leaves the viewport the floating one fades in, and it carries the SAME accent, ink and
live `href`, so it re-points as the selection changes. Same contract as the `[slug]` pages'
`FloatingGetEntriesButton`: `data-floating-widget="true"` (so the Cobber launcher dodges it — see
[shared-ui/frontend.md](../shared-ui/frontend.md)), `bottom-[calc(env(safe-area-inset-bottom)+1rem)]`,
centered, `pointer-events-none` wrapper with a `pointer-events-auto` pill. It is a **CSS**
transition, not framer — this page ships no motion library otherwise — and it takes `tabIndex={-1}`
while hidden so it is never a phantom tab stop.

### Accessibility
The rail is ONE `role="radiogroup"` whose 16th option is the cash tile, with a **roving tabindex** —
16 tab stops would bury the fine print, so Tab reaches the rail once and Left/Right walk the flat
option order while Up/Down jump a whole toolbox row (matching the visual grouping). Focus follows
selection. Each thumb carries an explicit `aria-label` ("Makita × Kincrome") with its art and
wordmark `aria-hidden`, otherwise the accessible name assembled to "Makita Kincrome Kincrome". The
preview's meta block is `aria-live="polite"` — the rail lives elsewhere in the DOM, so without it a
screen-reader user hears only "checked" and never what the preview became.

### CTA contrast — the handoff's ink list was wrong
The handoff hard-codes dark CTA ink for "DeWalt/Ryobi/cash". Measured, that list is both incomplete
and unnecessary: `accentInk()` in [`prize-brand-colors.ts`](../../src/utils/prize-brand-colors.ts)
now picks whichever of white / near-black has the better **WCAG 2.1** contrast, using real
gamma-corrected relative luminance. The naive `(0.2126R + 0.7152G + 0.0722B)/255` shortcut the older
Winner components use skips sRGB gamma and puts saturated mid-tones on the wrong side of the line —
it returns WHITE for Makita teal (2.4:1), HiKOKI green (2.9:1) and cash green (3.1:1), all of which
fail AA. Derived means a future brand is covered with no code change; the test asserts **≥ 4.5:1 on
every accent**, which is what caught it. `contrastRatio()` is exported alongside it.

### Deliberate deviations from the handoff (all verified in-browser at 375/768/1440, both themes)
- **No top bar.** The handoff opens with a wordmark + draw line + "Enter now" row; the page already
  mounts `PromoBanner` as its header, so a second bar was duplicate chrome (owner). The draw line
  moved INTO the case pill — `GalleryDrawStamp` replaces the static "Live preview" / "Cash option"
  tag with "DRAWN 31 JUL · 9:59AM AEST · 08D 19H LEFT", falling back to that tag until the draw
  resolves (it is a client query, and the pill has a fixed slot). The clock half is hidden on phones
  where the full string overflows the pill. Ticks every 30s, not 1s — the line only resolves to days
  and hours. Its date half is `formatMajorDrawChipUtc`, the same AEST/AEDT stamp the builder's hero
  prints, so the two can never disagree.
- **Thumb height** — the handoff's flat `106px` is kept at `lg`, but below it the rail is full-width
  rather than a third of the stage, so 106px letterboxed the render into a 245×106 strip at 768px.
  Under `lg` the thumb takes the handoff's own 128×106 **ratio** and scales with its column.
- **Case aspect** — `4/3` (handoff phone framing) only under `md`; from `md` the single-column stage
  is wide enough that 4/3 made the case taller than the viewport.
- **H1** — 28px under `sm`. At the handoff's 32px, "YOU ACTUALLY WANT." needs ~370px and breaks to a
  third line in a 375px viewport (the prototype's mobile frame is 440px).
- **Meta row** — the text block is `flex-1` and drops its `max-w-[420px]` at `lg`. With plain
  `justify-between` it sat at content width and the CTA at the far edge, leaving a wide gap while the
  longest description wrapped to two lines (owner).
- **Rail head + stat labels** stack / tighten under `sm`; at the handoff's spacing both wrap. The
  head also carries a derived **"{n} combos"** count chip (owner), same vocabulary as the builder's
  "{n} options" lane header.
- **Group wordmarks** are sized by HEIGHT (a % of the plate) and pinned left-centre, reproducing the
  prototype's `background-size: auto N%` + `background-position: left center`. `object-contain` plus
  a `transform: scale()` instead scales a width-fitted mark about its centre, which let Milwaukee and
  Ryobi creep out both sides of their plate and misaligned the five group headers.
- **Low-contrast wordmarks** (DeWalt, Ryobi, Makita — under 3:1 on white) get a hairline shadow in
  light mode via `needsMarkOutline()`, measured not listed. The handoff flagged this and suggested a
  plate; a plate would box some brands and not others.
- **Dark product stage** — see `.ta-product-stage` in [shared-ui/frontend.md](../shared-ui/frontend.md).
  The handoff's white case is light-mode only.
- **Permit** is `NTP_NUMBER` from `@/constants/legal` (NTP/17494 for draw 9), not the prototype's placeholder.
  The handoff's "Open to Australian residents; not available in ACT or SA." sentence was dropped
  (owner); the fine print is now "Government-certified draws · randomdraws.com.au · Permit NTP/…".

**Chrome:** unchanged from the previous gallery, and it still matters — `PromoBanner` needs BOTH a
`<Suspense>` (it reads `useSearchParams`) and a `<VariantProvider … isLoading={false}>` (with no
provider the default context is `isLoading: true` forever and the banner sticks in its logo
skeleton). `followOnScroll={false}` keeps it in-flow. `PromoThemeInitializer slug={DEFAULT_PRIZE_SLUG}`
themes it like the `[slug]` pages. Ancestors use `overflow-x-clip`, never `overflow-hidden`. The
fine print carries `pb-28 sm:pb-36 lg:pb-44` so the layout's absolutely-positioned
`NewsletterSection` floats over empty ground.

**Analytics caveat (unchanged):** the bare `/promotions` path has no promo slug, so
`usePromoPageTracking` fires NO PromoAnalyticsVisit for gallery views; extend the validator +
pageType deliberately if gallery tracking is wanted.

### Entry points — the showroom is deliberately unlinked except from the footer (2026-07-22)
Owner call, and it **reverses the 2026-07-08 routing**: the two prominent CTAs now land on the
**default prize page**, which is the page that actually sells, and the showroom is a browse
destination you opt into.

| Entry | Goes to |
|---|---|
| Navbar → Giveaways → **Major Draw** | `/promotions/${DEFAULT_PRIZE_SLUG}` via `MAJOR_DRAW_HREF` in [`Header.tsx`](../../src/components/layout/Header.tsx) |
| `FloatingCountdownBanner` **"Enter Now"** | `/promotions/${DEFAULT_PRIZE_SLUG}` (`?aff` still preserved) |
| Footer → Quick Links → **Promotions** | `/promotions` — **the ONLY in-app link to the showroom** |

`MAJOR_DRAW_HREF` is declared once at the top of `Header.tsx` because the desktop dropdown and the
mobile menu both render that item — two literals would drift. `isGiveawaysActive()` still matches on
`pathname.startsWith("/promotions")`, so the nav item highlights on the prize page, its siblings AND
the showroom. **The footer link was repointed from the default slug to `/promotions` as part of this**
— without that the showroom would have had zero in-app links. If you repoint it again, give the
showroom an entry somewhere else first.

### Route loader
[`src/app/promotions/loading.tsx`](../../src/app/promotions/loading.tsx) renders the shared
**`DashboardLoader`** — the same branded loader the member / admin / affiliate dashboards use — so
navigating into any promotions page shows brand chrome instead of a blank frame. Sitting at the
`promotions` segment it covers the showroom, `[slug]` and the per-toolset routes, including
navigation between them. It passes an **explicit label**: with none, `DashboardLoader` cycles its
dashboard-flavoured lines ("Counting your entries"), which read as nonsense to a visitor off an ad.
Theme follows `html.dark`, so it matches the promotions guest theme toggle. (These routes are
prerendered, so on a fast connection the boundary may not paint at all — that is the intended
behaviour, not a bug.)

## Prize builder — "Build your prize" configurator (2026-07-21)

The major-draw prize showcase was rewritten to the design handoff at
`claudeDesign/design_handoff_prize_showcase/`. [`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx)
is now a thin owner (~420 LOC, was 1429) around **[`PrizeBuilderCard`](../../src/components/sections/promo/prize-selection/PrizeBuilderCard.tsx)** —
a configurator where the visitor assembles the prize from **two independent lanes**:

| Lane | Options | Source |
|---|---|---|
| 1 — Toolbox | Milwaukee / Kincrome / Sidchrome | `TOOLBOXES` in [`prize-selection/constants.ts`](../../src/components/sections/promo/prize-selection/constants.ts) |
| 2 — Power toolset | Milwaukee / DeWalt / Makita / Ryobi / HiKOKI | `TOOLSETS`, same file |

Any toolbox × any toolset. The chosen pair resolves to the catalog slug `{toolset}-{toolbox}`
(`toPrizeSlug` / `fromPrizeSlug`), plus `cash-prize` for the cash opt-out.

**The gallery is gone.** The Embla main-image + thumbs carousel, `FullscreenImageViewer`, the
`enhancedGallery` landing-hero injection and the highlights grid were all deleted with the
rewrite — the prize is now shown as one live combo hero plus a thumbnail preview strip. The
notes further down this file about those mechanisms are historical.

### Files

| File | Role |
|---|---|
| `PrizeBuilderCard.tsx` | Public surface. Controlled — takes `{toolbox, toolset, isCash}` + callbacks; owns no state. |
| `SelectorReel.tsx` | One coverflow lane (generic over `{id, accent, isNew?}`), arrows + Left/Right/Home/End keys. |
| `ReelCards.tsx` | The two card bodies (`ToolboxReelCard`, `ToolsetReelCard`) + the masked `BrandMark`. |
| `ComboHero.tsx` | The composite render, "✓ THIS IS WHAT YOU WIN", "+ $5,000 CASH INCLUDED", "DRAWN …". |
| `PrizeContentsStrip.tsx` | "What's in this prize" thumbnails + "View full details →". |
| `PrizeBuilderCta.tsx` | "Enter now →", the bundle ⇄ cash toggle, the inline-SVG secure-checkout bar. |
| `prize-builder-model.ts` | **All** pure derivations — reel geometry, accent, hero/caption copy, preview grid. No React. |

`ToolboxSelector.tsx`, `PowerToolsetCarousel.tsx` and `StaticToolsetHighlight.tsx` were **deleted**.

### Adding a brand is one data entry

`TOOLBOXES` / `TOOLSETS` are the single source of truth: everything a card, chip, hero caption
or details modal needs lives on those two records, and array order **is** reel order. Reel cards
are absolutely centred and placed purely by their signed distance from the focused card
(`offsetFromFocus` → `getReelCardGeometry`), so a fourth toolbox or a sixth toolset is a data
entry, **never a layout change**. The legacy public maps (`POWERSET_IMAGES`, `POWERSET_LABELS`,
`POWERSET_BRAND_TEXT`, `TOOLBOX_IMAGES`, `TOOLBOX_LABELS`) are now **derived** from the two
registries with `Object.fromEntries`, so they can't fork. `TOOLBOX_SIZES`, `TOOLBOX_UNIFIED_FRAME`
and `POWERSET_SIZES` were removed (the reel sizes cards in CSS).

**GearWrench is deliberately absent.** It is slated for **draw 9** and has no product render,
composite art or catalog entry yet. Adding it later is one `TOOLBOXES` record plus its
`{toolset}-gearwrench` catalog entries; `isNew: true` lights the red "New" badge the design
specifies (HiKOKI carries it today).

### Accent = the selected POWER TOOLSET (not the toolbox)

`resolveAccent(toolset, isCash)` returns the toolset's brand colour, or `CASH_OPTION.accent`
(`#18a94d`, cash green) in cash mode. The card root sets it as the **single** CSS variable
`--pbc-accent`, which drives the CTA gradient, focus rings, card glows, chips and the details
modal's tabs. The toolset is the visual hero of a combination, so switching toolbox re-frames the
hero but does not re-colour the card. The CTA's gradient bottom stop is computed from that one
value by `darken()` — no second colour to keep in sync.

### `--pbc-*` tokens are CSS, not a JS theme read

The card's surface palette (`--pbc-panel`, `--pbc-text`, `--pbc-border`, `--pbc-box-bg`,
`--pbc-chip-*`, …) is declared in [`globals.css`](../../src/app/globals.css) under `.prize-builder`
with a `.dark .prize-builder` override, keyed off the `html.dark` class — **not** read from the
Zustand theme store. This section is always visible on the homepage and every promo page, so a JS
theme read would paint the light palette server-side and flash to dark during hydration. Keying
off the class means the correct palette is in the **first server-rendered frame**. Cash green
(`--pbc-cash`) is semantic, so it is theme-independent. `--pbc-accent` is deliberately *not*
declared in that block — it is per-selection and set inline, so adding a brand never touches the
token layer.

### Reel geometry is CSS variables — and `REEL_METRICS` mirrors it

Same reasoning, per-breakpoint: `.prize-builder` declares `--pbc-reel-card-w/-h`,
`--pbc-reel-stage-h`, `--pbc-reel-step`, `--pbc-reel-depth`, `--pbc-reel-rotate`,
`--pbc-reel-side-scale/-opacity/-filter`, with a **`@media (min-width: 768px)`** block swapping in
the desktop *card* tuning (independent of the layout breakpoint below — the reel gets its larger
cards before the card switches to two columns). `.pbc-reel-card` does the transform maths in CSS; each card supplies only its
own `--pbc-off` (signed distance from focus), `--pbc-off-abs` and `--pbc-scale`. A
`useMediaQuery` hook would render mobile geometry on the server and snap to desktop after
hydration, which on a 3D stage reads as the whole reel jumping.

> **Keep in sync:** `REEL_METRICS` in
> [`prize-builder-model.ts`](../../src/components/sections/promo/prize-selection/prize-builder-model.ts)
> holds the **same numbers** for the `desktop` / `mobile` breakpoints — it is what the unit tests
> assert against, and the component still reads `offset` / `isFocused` / `isHidden` from
> `getReelCardGeometry`. Change one, change the other. `npm run test:prize-builder` locks the
> derivations and, since 2026-07-21, **parses globals.css and asserts the two agree** — so the
> duplication is a guarded mirror rather than a silent drift hazard.

`getReelCardGeometry` returns **only** `offset` / `isFocused` / `isHidden` — the transform,
z-index, opacity and filter are CSS's job, and computing them in JS as well would be a second
source of truth for the same numbers.

Cards `REEL_VISIBLE_RADIUS` (3) or more positions from focus get `data-offstage="true"` →
`opacity: 0; pointer-events: none`, `aria-hidden` and `tabIndex={-1}`, so an off-stage card can
never steal a tap or a Tab stop. Cash mode sets `data-dimmed` on the stage: the reels fade to 0.4 but stay
**interactive**, because picking a brand is exactly how the visitor leaves cash mode.
`.pbc-reel-card` transitions and the `.pbc-fade` combo cross-fade are both disabled under
`prefers-reduced-motion`.

### `.pbc-brand-mark` — toolbox wordmarks via CSS mask

The toolbox wordmarks are **SVG**, served from `/images/brands/name/` alongside the toolset
wordmarks — vector, so the plate stays crisp at any card size:

| brand | mark file | origin |
|---|---|---|
| Milwaukee | `milwaukeeText.svg` | the SAME file the Milwaukee **toolset** card renders — the two lanes can never show different art, and it costs no extra download |
| Kincrome | `kincromeText.svg` | traced from `brands/kincrome.webp` |
| Sidchrome | `sidchromeText.svg` | traced from `brands/sidchrome.webp` |

The two traced marks were vectorised with `potrace` (installed `--no-save`, build-time only —
it is NOT a dependency) from the white silhouettes, which stay in `brands/` for the partner
strips that display them at full size. Trace settings were chosen by rasterising each candidate
back and measuring silhouette drift against the source; the shipped ones sit near ~2% (edge
pixels only, visually identical at plate size) at ~6 KB each — no bigger than the bitmaps they
replaced. The interim `brands/mark/*.webp` downscales were deleted.

A CSS mask reads only the source's **alpha**, so the SVG's own `fill` is irrelevant — which is
exactly why a mask is used rather than an `<img>`: a fixed-colour wordmark cannot be both
legible on the light card (`#f6f5f2`) and on the dark one. So
`BrandMark` renders an empty `<span class="pbc-brand-mark">` with the asset as
`mask-image` and paints it with `background-color`, supplying `--pbc-mark-l` / `--pbc-mark-d`
inline from the record's `markColor` pair; `.pbc-brand-mark` / `.dark .pbc-brand-mark` in
globals.css pick the right one. One asset, both themes, each at the brand's own colour — and the
theme swap is pure CSS, so no hydration flash here either.

**`markScale` equalises LETTER size, not box size.** Milwaukee is a 2.23:1 stacked lockup
(script over a lightning bolt); Kincrome is 5.76:1 and Sidchrome 4.38:1 single-line wordmarks.
Fit to a common box height their ink heights match (23.1 / 22.7 / 23.2px measured) but
Milwaukee's *letters* render about half the size, because most of its box is bolt — that is
what "Milwaukee looks unfairly small" was. Milwaukee therefore takes the full plate (`1.0`)
and the wide wordmarks are scaled back to meet it (Kincrome `0.62`, Sidchrome `0.72`).
Levelling DOWN is deliberate: bringing Milwaukee up needs ~1.4x, which overflows the plate
into the piece-count eyebrow above it. Re-tune by rendering the three marks at the plate
geometry and comparing — box maths alone will mislead you here.

**Mark colours are the brands' real colours, not the handoff's tints.** The handoff paired
each mark with a lightened dark-mode variant (`#ff5a5a` Milwaukee, `#ff6058` Sidchrome) which
rendered salmon/pink next to the genuine brand art. Today:

| Brand | light | dark | source |
|---|---|---|---|
| Milwaukee | `#c92a28` | `#c92a28` | the exact fill of `brands/name/milwaukeeText.svg` — the Milwaukee **toolset** card sits right below the toolbox card, so the two must be the same red |
| Kincrome | `#0047BB` | `#4A7ED4` | the site's canonical `kincrome-blue` ramp (`LANDING_PAGE_BRAND` in [packageColorScheme.ts](../../src/utils/package-colors/packageColorScheme.ts)) |
| Sidchrome | `#d21f2a` | `#d21f2a` | its own registry `accent` — a true red, where the handoff's `#c41230` carries a magenta cast |

Only **Kincrome** keeps a per-theme pair: blue is perceptually much darker than the two reds,
so the deep official blue disappears against the `#191b21` card. `npm run test:prize-builder`
asserts the Milwaukee pairing against the SVG and rejects any washed dark variant. To move a brand to a full-colour wordmark later, ship the new
`markImage` with a neutral `markColor`; no component change. (The **toolset** wordmarks are
already brand-coloured SVGs and render as `<Image unoptimized>` — see "Brand wordmark logos"
below.)

### Mobile is compressed to fit one viewport (2026-07-22)

On `/promotions/*` the two reels **and** the combo hero have to clear one phone viewport.
The handoff's canvas had no page chrome above it, so its mobile numbers do not survive
contact with a real page. Mobile is therefore tighter than the handoff on purpose:

| | handoff | now |
|---|---|---|
| reel card | 138 × 168 | **124 × 140** |
| reel stage | 192 | **156** |
| reel step / depth | 126 / 95 | **112 / 84** |
| brand plate (`--pbc-mark-h`) | 30 | **22** |

Two reels + hero went 793px → **703px**. Where the height came from, in order of value:

- the reel stages (−84px), with `--pbc-mark-h` shrinking alongside the card so the plate
  keeps its proportion instead of eating the product render;
- the per-card `TOOLBOX` sub-label is **hidden below `sm`** — the lane header directly above
  already reads "1 TOOLBOX", so repeating it only cost the render ~9px;
- the reel head lost its `mt-1`, and the card gaps/paddings step down a notch on mobile;
- the lead paragraph was cut from three lines to two.

> **The hero stage stays `aspect-[4/3]` on mobile — do not shorten it.** Every combo render
> is natively 1600×1200 (4:3), so a 3/2 or 16/10 box does not crop to fit: `object-contain`
> letterboxes it, the product gets *smaller*, and dead space appears left and right. 4:3
> fills the box exactly. Height is cheaper to find in the reels.

### Section background — no texture, and no black strips beside the card (2026-07-22)

The section carries the `prize-builder` class too (not just the card), so the `--pbc-*`
tokens resolve there and it can paint `--pbc-panel` below `sm`. Without that, the card runs
edge-to-edge inside the container's 16px gutter and the gutter showed the PAGE background —
reading as black strips down both sides of the card in dark mode. Painting the section makes
card + gutter one continuous surface; at `sm`+ the card becomes a bordered panel that is
meant to sit on the page background, so the fill stops there.

The dark-mode `background/promo/FX/crack.webp` texture overlay was **removed** in the same
change — it was what made those strips read as a different material, and it cost an ~82 KB
full-bleed image on every dark-mode visit. Nothing under `src/` references it any more; the
asset is left in `public/` in case another surface wants it.

### The card is full-bleed below `sm` (do not re-add a gutter)

Every surface renders `PrizeShowcase` inside a `px-4 sm:px-6 lg:px-8` section container
([`SECTION_CONTAINER_CLASSES`](../../src/components/ui/SectionContainer.tsx), or the page's own
`SectionContainer` on `/` and `/my-account`). The card also carries its own `px-4` body gutter,
so on a phone the content was paying **32px a side** — enough to clip the neighbouring reel
cards out of the 3D stage. The card root therefore carries `max-sm:-mx-4`, cancelling the
container's 16px so its own `px-4` is the only gutter. That also matches the handoff, where the
mobile shell is edge-to-edge (`borderRadius: 0`, `border: none`); at `sm`+ it becomes a bordered,
rounded panel and sits inside the container normally.

> If the section container's mobile padding ever changes from `px-4`, update this negative
> margin with it — they are a matched pair.

### Layout switches at `lg`, not the handoff's ~768px

The handoff derives desktop from a ~768px breakpoint. In production the reel lane is a fixed
~470px tall while the hero column is fluid, so between 768 and ~1000px `align-items: start` left a
100–180px dead band under the hero caption. The 2×2 grid therefore switches at **`lg`** (1024px),
where the two columns balance the way they do on the handoff's own 1080px canvas; 640–1023px gets
the full-width stacked order (reels → hero → contents → CTA), and the 440px card cap applies only
below `sm`. The hero stage follows the same switch (`aspect-[4/3]` → `lg:aspect-[16/10]`).

### Behaviour change: `/promotions/*` selection is now IN PLACE

Previously, picking a combination on an evergreen `/promotions/{prize-slug}` page **navigated** to
another prize page (and `PromotionsLayoutShell` scrolled to top). It no longer does — the card
updates in place on every surface. What is retained:

- **`?toolbox=` sync on toolset landing pages** (`/promotions/makita` etc., i.e. `toolsetMode`).
  The toolbox lane and the cash opt-out are persisted to the query string via
  `buildToolsetLandingHref` (a `router.replace(…, { scroll: false })`) and hydrated back from
  `parseToolboxQueryParam`, so a refresh or a shared link keeps the choice. Milwaukee (the
  default) omits the param for a clean canonical URL.
- **`toolsetMode` no longer locks the power-toolset lane.** A toolset landing page OPENS on its
  brand (via `slug={defaultPrizeSlug}`) but the reel still offers all five, so the visitor can
  switch brand in place. This replaced BOTH the deleted `StaticToolsetHighlight` **and** the
  `OtherToolsetsCarousel` "explore other toolsets" strip that used to sit below the card —
  the reel does that job, so the strip was deleted on 2026-07-22.
- **Toolbox preference** — evergreen surfaces (`/`, `/my-account`) remember the last toolbox in
  `localStorage["prizeToolboxType"]` and reopen on it. Skipped where the page names the prize.

> **Analytics gap to be aware of:** `tools-aus:from-promo-slug` (the cross-visit promo referrer
> read by [`usePromoPageTracking`](../../src/hooks/usePromoPageTracking.ts)) now has **no writer**.
> PrizeShowcase stopped writing it when selection went in-place, and `OtherToolsetsCarousel` —
> its only other writer — was deleted. The reader is retained, so `fromPromoSlug` simply stays
> null until a writer is reintroduced. See [PROMOTION_ANALYTICS.md](../../src/docs/PROMOTION_ANALYTICS.md).

### Details sheet — mobile drawer, landing art, scroll affordance

- **Mobile presentation is a right-edge DRAWER**, not a bottom sheet: the handoff animates the
  panel in from `translateX(100%)`. Delivered by the shared `presentation="drawer"` added to
  [`ModalContainer`](../../src/components/modals/ui/ModalContainer.tsx) (see
  [shared-ui/gotchas.md](../shared-ui/gotchas.md)); at `lg`+ it is the normal centered dialog,
  overridden to the handoff's `min(960px,97%)` / radius 20 / 92% height.
- **The feature rail shows the LANDING-PAGE DESKTOP art**, not the card's combo render —
  `getLandingHeroImagePaths(activeSlug)` → `getImageForMode(..., "desktop")`, resolved in
  `PrizeShowcase` and passed down. That is the composed marketing shot (model + full setup);
  the cut-out composite belongs on the card, not in the sheet. Prizes with no landing art fall
  back to the composite.
- **The tab row signals overflow with floating chevrons**, not a scrollbar rail. `TabBar`
  measures `scrollLeft` / `scrollWidth` (plus a `ResizeObserver` for the drawer ⇄ dialog swap)
  and renders a gradient-backed chevron button at whichever edge still has tabs past it. They
  are real buttons that page the row by ~80%, and the selected tab is scrolled into view on open.
- **Footer is three facts, not a sentence**: `NTP/xxxxx · randomdraws.com.au · Drawn {stamp}`.

### Draw stamp

`useCurrentMajorDraw()` feeds **`formatMajorDrawChipUtc()`**
([`src/utils/common/timezone.ts`](../../src/utils/common/timezone.ts)) — a compact all-caps stamp
for the hero's 8px pill (`27 JUL · 8PM AEST`; minutes only when not `:00`, DST-aware abbreviation).
The long `formatMajorDrawLiveDateLineUtc` form does not fit. The chip renders nothing until the
draw resolves, and the same label is passed to the details modal's permit line.

### Contents preview

`buildContentsPreview(gallery, toolset, comboImage)` derives the "What's in this prize" tiles from
the **active prize's own gallery** — the combo composite and the toolset collection shot are
skipped (both already headline the card), the grid is capped at `PREVIEW_COLUMNS × PREVIEW_MAX_ROWS`
(6×2) and the last cell is surrendered to a truthful "+N more" tile when it overflows. Captions come
from `toShortToolLabel()`, which squeezes a gallery `alt` to two words — derived, not authored, so a
new brand's tiles read correctly the moment its gallery lands. On mobile the strip collapses to
header + button (CSS-only `max-sm:hidden`; sub-40px thumbnails are unreadable and the modal is one
tap away). The tiles are lazy `next/image`s inside that hidden container, so mobile never
**downloads** them either — a CSS-hidden eager image still would (CLAUDE.md perf footgun 4).

### Copy rule

Every string here is customer-facing and bound by CLAUDE.md §11 — "Enter now", "free entries",
"includes $5,000 cash". No odds/chance/lottery framing, and entries are never priced per unit.

### Regression guard

`npm run test:prize-builder` →
[`prize-selection/__tests__/prize-builder-model.test.ts`](../../src/components/sections/promo/prize-selection/__tests__/prize-builder-model.test.ts).
Covers reel wrap-around (`offsetFromFocus`, `stepReel`), card geometry + the hidden/dimmed states,
slug round-tripping, accent resolution, `darken`, combo copy, the derived-map ↔ registry equality,
and the preview-grid cap/overflow. Pure — no DB, no env. See also the details-modal write-up in
[shared-ui/frontend.md](../shared-ui/frontend.md#prizespecificationsmodal).

## Promo-banner surface: compositor-friendly animation stack (2026-07-20, perf Tier-2 Task 1)

The always-on repaint stack on the promo-banner surface was rewritten to transform/opacity-only, tier-gated animations (full rule + `.fire` layer contract: [shared-ui/gotchas.md](../shared-ui/gotchas.md#always-on-animations-transformopacity-only-and-tier-gate-them)). Promo-side specifics:

- **PromoBanner fire effect**: the `.fire` overlay div now renders one child — `<div className="fire-glitter" />` — which is the second (parallax) glitter field; `globals.css` positions/animates it and the two pseudo-elements. Don't remove the child or add other children to `.fire` (the old `.fire > *` z-index rule is gone). The glitter layers carry a 16px-per-edge blur bleed (`top: -16px`, height `+32px`) so the blur-feathered edges never enter the clip. The `--glitter` texture is now **first-party** (`public/images/effects/glitter.png`, 800×534 quantized PNG ~244KB) — it previously hotlinked a ~1.4MB image from `assets.codepen.io` (third-party SPOF on ad landing pages); `img-src 'self'` already covers it.
- **UrgencyClockIcon** (rendered in PromoBanner's `static_urgency` right-tile): pure CSS now — subtle scale pulse + 60s `steps(60)` second hand, static on mobile/tablet/save-data. Note it does NOT hook into `PromoBannerCountdownTickLeaf` (the icon's render site is outside that leaf); the CSS tick costs one style update per second.
- **FloatingCountdownBanner**: `backdrop-blur-[var(--ta-blur)]` **removed** from the pill — its `from-gray-900 via-gray-800 to-black` gradient is opaque, so the blur was invisible GPU cost. The collapsed pill's status dot is now **static** (no `animate-pulse`/`animate-ping` — the collapsed state persists for the whole scroll session). The mobile-expanded dots keep their ping/pulse but carry `ta-countdown-dot`, which the globals.css tier-gate cluster freezes on mobile/tablet/save-data (they still animate in narrow desktop-tier windows). Dismissed = unmounted, so nothing runs.
- **Gallery filter bar + CTAs**: `GiveawayGalleryClient` filter bar (**deleted 2026-07-22** with the Spotlight rewrite — the showroom has no blurred surface), `PromoHero` CTA and `FloatingGetEntriesButton` swapped literal `backdrop-blur-xl|lg` for `backdrop-blur-[var(--ta-blur)]` (desktop 12px, tablet 4px, mobile 0px).

## Landing page — new design assets, full replace (2026-06-23)

The promo landing hero **images + videos were fully replaced** with the new
"WIN A … TOOLBOX … $10,000 CASH" design (one version — the desktop variant whose design
matches the mobile set). Each of the 15 combos (5 brands × `milTB`/`sidTB`/`kinTB`) has a
desktop + mobile static (`.webp`) under `images/background/promo/landing/{brand}/` and a
desktop + mobile clip (`.mp4`) under `videos/landing/{brand}/`. **HiKOKI is now a full
landing brand** (its art shipped; the `getLandingHeroImagePaths` `hikoki` null-guard was
removed and `hikoki-*` added to `LANDING_HERO_MAP`). Notes:
- **No dark variants** — the new design has none, so the old `-dark`/`-dark-mobile` webps were
  deleted and `resolveLandingHeroImage` falls back to the light file (existing behaviour).
- **WebM-first, MP4 fallback; drawn tier falls back to base (2026-07-19, supersedes the
  2026-06-27 mp4-only note below)** — every clip now ships **both** a `.webm` (VP9, ~25-40% of
  the `.mp4` size in practice) and its `.mp4` twin (H.264, universal fallback). `getLandingHeroVideoPaths`
  returns an **ordered `LandingVideoSource[]` list** (`{ sources: Array<{ src, type: "video/webm"
  | "video/mp4" }> }`, was `{ srcs: string[] }`): for each clip tier, WebM precedes its MP4 twin;
  on the `drawn-tonight` / `drawn-tomorrow` tier the drawn pair is first with the **base pair
  appended as a fallback**, so a brand that ships no drawn *clip* still animates via its base clip
  instead of dropping to the still — the browser advances to the
  next `<source>` natively both when a format is unsupported AND when a drawn-tier file 404s. This
  mirrors the image resolver, which already drops a missing drawn still back to the base image.
  `LandingHeroVideo` renders `sources.sources.map(s => <source key={s.src} src={s.src}
  type={s.type} />)` — the browser plays the first `<source>` it both supports and can load, so
  WebM-capable browsers (Chrome/Firefox/Edge) never fetch the MP4 at all. **Regenerate a missing
  WebM twin** with `ffmpeg -i <clip>.mp4 -c:v libvpx-vp9 -crf 36 -b:v 0 -an -row-mt 1 -deadline
  good -cpu-used 4 <clip>.webm` (matches `scripts/convert-drawn-tonight-tomorrow-videos.ts`'s own
  WebM encode step, which additionally handles the numbered art-team export layout for the drawn
  tiers specifically — see that script's header comment before reusing it for a new asset drop).
  Regression test: `npm run test:landing-video-resolver`.

  <details><summary>Historical: mp4-only note (2026-06-27, no longer accurate)</summary>

  Only `.mp4` shipped (H.264 plays in every supported browser), so the `webm` `<source>` was
  removed from `LandingHeroVideo` to avoid base-clip 404s. `getLandingHeroVideoPaths` returned an
  ordered mp4 list (`srcs: string[]`). Superseded by the WebM-first entry above — do not follow
  this note for new work.

  </details>
- Source PNG statics were converted to webp (format only); manifest regenerated via
  `build:landing-manifest` (32 entries = 30 combos + all-prizes).

## Power toolset carousel — 5-up on desktop (2026-06-22) — HISTORICAL

> **Superseded 2026-07-21.** `PowerToolsetCarousel` was **deleted** with the prize-builder
> rewrite; the power-toolset lane is now a `SelectorReel` that scales to any brand count with no
> per-`n` special cases. Kept for changelog context only.

<details><summary>Original note</summary>

With 5 toolset brands, `PowerToolsetCarousel` showed **2 neighbours each side + the active
centre** (a full 5-up) on `sm+`: `leftNeighbor2` / `rightNeighbor2` (computed only when
`n >= 5`, since at n≤4 the `i±2` indices duplicate) were rendered in `hidden sm:block` wrappers.
Mobile stayed 3-up to avoid overflow.

</details>

## Prize combo-render display normalised (2026-06-22)

The 15 "toolset + toolbox" prize card renders (`<toolset>-<toolbox>.webp`, e.g.
`dewalt-sidchrome.webp`) were normalised to a uniform **1600×1200 (4:3)** canvas — subject
trimmed, scaled to a common inner frame, bottom-anchored + centred — so every combination shows
the setup at the same size without cut-off. That normalisation is still what makes the prize
builder's combo hero read consistently: `getComboPresentation` points straight at
`{toolset}-set/{toolset}-{toolbox}.webp` and renders it `object-contain` in a fixed
`aspect-[4/3]` (`lg:aspect-[16/10]`) stage.

> **Removed 2026-07-21:** the per-image `getPrizeGalleryImageLayout` helper (which had
> intercepted these combos to undo a legacy `scale-150` rule) went with the gallery — there is
> one uniform stage now, so there is nothing to special-case.

## Brand wordmark logos — SVG takeover + uniform sizing (2026-06-22)

`POWERSET_BRAND_TEXT` (`prize-selection/constants.ts`) now serves **SVG** wordmarks from
`public/images/brands/name/*.svg` for milwaukee / dewalt / makita / ryobi / hikoki (HiKOKI
is now the 5th selectable toolset — see below); the old `*.webp` wordmarks were
deleted. Each SVG is normalised to a uniform `700×200` viewBox with the artwork centred and
Milwaukee optically up-scaled (×1.4 — its lightning bolt makes the script read small), so
every brand renders at **equal visual size** in any container. Because equal sizing is now
baked into the assets, the former per-brand scale hacks were removed: makita's smaller
container in the (since-deleted) `PowerToolsetCarousel` / `StaticToolsetHighlight`, the milwaukee
side-badge scale (both since deleted), and — today — the `wordmarkScale` field on each `TOOLSETS`
record. Wordmarks render via
`<Image unoptimized>` (Next serves the SVG as-is; no `dangerouslyAllowSVG` config change).

> **2026-07-21:** the wordmark path now lives on the `TOOLSETS` registry as `wordmark`, with
> `POWERSET_BRAND_TEXT` derived from it; a small per-brand `wordmarkScale` was reintroduced on
> that record purely to equalise the reel card's fixed 20px wordmark slot. The prize builder's
> **toolbox** marks are a different mechanism — white silhouettes painted through a CSS mask
> (`.pbc-brand-mark`), see the prize-builder section at the top of this file.

## HiKOKI — 5th power toolset (2026-06-22)

HiKOKI is a fifth selectable toolset alongside milwaukee / dewalt / makita / ryobi in
`prize-selection/constants.ts`. As of the 2026-07-21 rewrite it is a **`TOOLSETS` record** (with
`isNew: true`, so it carries the red "New" badge on its reel card) and `POWERSET_LABELS.hikoki`
is derived from it. The `getToolsetColorKey` helpers that mapped `hikoki → "hikoki-green"` went
with `PowerToolsetCarousel.tsx` / `StaticToolsetHighlight.tsx` — the reel reads the record's own
`accent` (`#0aa06e`) instead of a shared colour-key table.
Like the other toolsets it pairs with the **3 toolboxes** (Sidchrome / Milwaukee / Kincrome);
its included **Multi Cruiser is HiKOKI's storage system** (analogous to Makita MAKTRAK / Ryobi
LINK), **not** a 4th toolbox.

`POWERSET_IMAGES.hikoki` now points at the real composite hero
[`hikoki-set/HIKOKI.webp`](../../public/images/majordraws/hikoki-set/HIKOKI.webp) (transparent
HiKOKI toolset render, converted from the supplied PNG). One asset is still a placeholder:
- `/promotions/hikoki` ([`src/app/promotions/hikoki/page.tsx`](../../src/app/promotions/hikoki/page.tsx))
  renders via the shared `<ToolsetLandingPage toolsetSlug="hikoki" />` like the other brand
  pages, but currently **falls back to the standard promo hero** — no bespoke landing art yet.

## Components

- [src/components/promo/](../../src/components/promo/) — promo display components
- [src/components/banners/](../../src/components/banners/) — site-wide banner components

## Pages

- `src/app/promotions/` — admin / setup-style promo pages
- `src/app/(site)/promotion/` — public promo landing pages

### Klaviyo `Viewed Giveaway` event mount (added 2026-05-28)

[`PromoViewTracking.tsx`](../../src/app/promotions/_components/PromoViewTracking.tsx) is a zero-render client component that fires the canonical Klaviyo `Viewed Giveaway` event once per route change. It is mounted in two places to cover every `/promotions/*` route with a single client-side fire:

- [`src/app/promotions/[slug]/page.tsx`](../../src/app/promotions/[slug]/page.tsx) — covers all dynamic-slug promo pages.
- [`src/app/promotions/_components/ToolsetLandingPage.tsx`](../../src/app/promotions/_components/ToolsetLandingPage.tsx) — covers the five brand pages (`/promotions/dewalt`, `/makita`, `/milwaukee`, `/ryobi`, `/hikoki`) which all render through this shared component.

Both mounts pass the resolved `prize` from [src/config/prizes.ts](../../src/config/prizes.ts) — `title` prefers `prize.heroHeading` falling back to `prize.label`, `prizeName` is `prize.label`, `prizeImageUrl` is `prize.gallery?.[0]?.src` (omitted when absent, per the canonical no-sentinel rule). Mirrors the established pattern in [`MiniDrawViewTracking.tsx`](../../src/app/(site)/mini-draws/[id]/components/MiniDrawViewTracking.tsx) and [`ProductViewTracking.tsx`](../../src/app/(site)/shop/[slug]/components/ProductViewTracking.tsx). The event coexists with the existing `Viewed Page` (`PageType: "promotion"`) — does not replace it. Schema + snapshot test live under [docs/tracking/](../tracking/KLAVIYO_INTEGRATION.md).

### Default-theme A/B gate wired into both promo landing pages (2026-07-28)

[`src/app/promotions/[slug]/page.tsx`](../../src/app/promotions/[slug]/page.tsx) and
[`ToolsetLandingPage.tsx`](../../src/app/promotions/_components/ToolsetLandingPage.tsx) each
now resolve a **fourth** parallel lookup alongside their existing three (`effectivePromos`,
`majorDraw`, the slug-targeted `activeExperiment`):

```ts
ExperimentService.getActiveExperimentForSentinelSlug(PROMO_THEME_SLUG).catch(() => null)
```

This is the **sentinel** method, not `getActiveExperimentForSlug` — it exact-matches
`PROMO_THEME_SLUG` (`"__promo-theme__"`, exported from
[`usePromoThemeExperiment.ts`](../../src/hooks/ab-testing/usePromoThemeExperiment.ts)) and
never matches a `"*"` wildcard experiment. `themeExperimentId` is derived from the result
with the same ObjectId-vs-string dance as the existing `experimentId`, and is baked into the
ISR snapshot — identical for every visitor of the current 60s window, same as
`experimentId`. It's derived earlier in the function than `experimentId` (right after the
`Promise.all`) because the hero preload guard below needs it.

**Gate mount point.** [`PromoThemeExperimentGate`](../../src/components/ab-testing/PromoThemeExperimentGate.tsx)
(Task 8) is mounted **inside** `VariantAssignmentWrapper`, wrapping all of that wrapper's
existing children (`PromoThemeInitializer`, `PromoViewTracking`, the full page `<div>`) in
their original order:

```tsx
<VariantAssignmentWrapper experimentId={experimentId}>
  <PromoThemeExperimentGate experimentId={themeExperimentId}>
    <PromoThemeInitializer ... />
    {/* ...existing children, unchanged order... */}
  </PromoThemeExperimentGate>
</VariantAssignmentWrapper>
```

`VariantAssignmentWrapper` itself is untouched — the slug-targeted experiment context is
unaffected by the theme gate. The gate is an **overlay** (children always render; see its
own doc comment), so this nesting does not change what the CDN-cached HTML contains — see
the preload-skip rule below and [gotchas.md](./gotchas.md) for why the overlay property
matters for the hero specifically.

**Preload-skip rule.** Both files' `heroImagePreload` guard now also skips when
`themeExperimentId` is non-null (previously it skipped only when `heroVideo` was truthy):

```ts
const heroImagePreload =
  heroVideo || themeExperimentId
    ? null
    : { mobile: ..., desktop: ... };
```

Rationale: `heroImagePreload` is computed from `heroImagePaths.desktop/.mobile` — always the
**light** paths, since the server has no theme and never consults the `*Dark` fields. With
the gate wired in, a dark-arm visitor would preload the light hero, discard it once the
client resolves their arm, then fetch the dark one — a systematic bandwidth/LCP handicap on
exactly one arm. That would read as "dark converts worse" in the experiment's metrics and
corrupt the result, which is the entire point of the feature. Skipping the preload while the
sentinel experiment is active costs both arms equally (neither gets a preloaded hero), which
is the only fair option. This mirrors the existing `heroVideo` skip rule immediately above it
in both files — same reasoning, different trigger.

## Hooks

| Hook | Purpose |
|---|---|
| `usePromoLink()` | Resolve a `PromoLink` from URL params |
| `usePromoPageTracking()` | Write `PromoAnalyticsVisit` rows on promo-page visits |
| `usePromoWelcomeModal()` | Welcome modal for first-time promo visitors |

## Stores

- [src/stores/usePromoThemeStore.ts](../../src/stores/usePromoThemeStore.ts) — Zustand store for promo-driven theming overrides

## Static banner left-visual (SpecialPromo, 2026-06)

The PromoBanner left image is resolved by [`resolvePromoBannerLeftVisual`](../../src/utils/promo-banner/resolve-promo-banner-left-visual.ts) (Holiday art → variant `leftImageUrl` → scheduled `imageUrl` → static brand art). The static family is now one of three states (`build-static-promo-banner-paths.ts`):

- `drawn-tonight` — draw calendar date is today
- `drawn-tomorrow` — ≤48h to freeze
- `special-promo` — **everything else** (any active/scheduled promo + default)

The old `last-chance` / `ends-tonight` families and their `LastChance/` `EndsTonight/` image folders were removed; every non-draw state now uses `{Brand}/SpecialPromo/special-promo-{3|5|10}x.webp` (art reads "SPECIAL PROMO — {N}x ENTRIES ACTIVATED"). SpecialPromo ships only 3×/5×/10× — [`specialPromoMultiplierFileKey`](../../src/utils/promo-banner/banner-multiplier-file-key.ts) maps 2×/unknown/null to 10×, so keep 2× out of promos. Full behaviour: [docs/PROMO_BANNER_BEHAVIOUR.md](../PROMO_BANNER_BEHAVIOUR.md).

## State conventions

- Banner text reads via TanStack Query (rarely changes)
- Per-page promo state via `usePromoLink()` hook
- Theme overrides via Zustand (synchronous client-side decisions)

## className conventions (2026-05-08)

Promo components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Interaction smoothness (Phase 1, 2026-05-09)

Countdown timers in promo components — `FloatingCountdownBanner`, `FreezePeroidBanner` (and, until it was deleted on 2026-07-22, `GiveawayCountdownTimer`) — are leaf-isolated via [`<CountdownLeaf>`](../../src/components/ui/CountdownLeaf.tsx) / [`useLeafTimer`](../../src/hooks/useLeafTimer.ts) so the parent promo section / banner host doesn't re-render on every tick. (`OtherToolsetsCarousel` did the same via [`useInViewportAnimation`](../../src/hooks/useInViewportAnimation.ts) until it too was deleted on 2026-07-22.) `FloatingPromoBanner` / `FloatingGetEntriesButton` consume the device-tier CSS tokens (`--ta-blur`, `--ta-shadow-card`, `--ta-transition-dur`) so visual cost scales down on mobile / `Save-Data`. Floating elements set `data-floating-widget="true"` so the print stylesheet hides them. The new [`FloatingPromoBannerHost`](../../src/components/banners/FloatingPromoBannerHost.tsx) is mounted once in `providers.tsx` and orchestrates promo banner visibility globally instead of per-page mounting. See [shared-ui/patterns.md](../shared-ui/patterns.md#site-wide-interaction-smoothness--phase-1-2026-05-09) for the helpers.

## PromoPackages — packages-design experiment concluded, control won (2026-07-06)

[`src/components/sections/promo/PromoPackages.tsx`](../../src/components/sections/promo/PromoPackages.tsx) always renders the control block: `<section id="packages">` + `SectionContainer` + `MembershipSection` (`title="Choose Your Entry Package"`), still passing `variantConfig?.packages` through for `hidePackages` / `displayOrder`.

Historical: from 2026-07-01 to 2026-07-06 it branched on `variantConfig?.packages.design` for the packages-design A/B test — `"membership"` rendered a `PromoMembershipDesign` treatment (the `/membership` tier + one-time-packs design). The control won (3.11% vs 2.65% conversion), so the treatment component, the `packages.design` config key, and the branch were removed. The generic experiment plumbing (`VariantAssignmentWrapper`, `getActiveExperimentForSlug`, `getServerVariantAssignment`) stays for future experiments. Historical operational details: [docs/ab-testing/promo-packages-design-runbook.md](../ab-testing/promo-packages-design-runbook.md).

## FloatingPromoBanner — removed (2026-07-01)

The floating "ENTRY BOOST ENDING SOON" promo banner (`FloatingPromoBanner` + its path-gated `FloatingPromoBannerHost` mount in `providers.tsx`) was **removed** — no longer needed. Its shared helpers (`PromoBadge`, `countdown-mode.ts`) and the `membershipTabChanged` window event stay, since `PromoBanner` still consumes them. (The Phase-1 note above references the old mount; it's historical.)

## Cobber support widget on promotions (2026-06-26)

The promotions route group (`src/app/promotions/`) is **outside** `(site)`, so it never inherited the AI support widget mounted in `(site)/layout.tsx`. It is now mounted in [`src/app/promotions/layout.tsx`](../../src/app/promotions/layout.tsx) via `<SupportChatWidgetMount side="left" />` — **docked bottom-LEFT** because the promotions pages already use bottom-right for the guest theme toggle ([`PromotionsGuestThemeToggle`](../../src/components/ui/ThemeToggle.tsx), `fixed bottom-4 right-4`) and the account FAB. The widget bubble sits at `z-9000` (above the promo floating banner/toggle), so it floats over any `fixed bottom-0` promo banner rather than being hidden. Corner is controlled by the `SupportChatWidget` `side?: "left" | "right"` prop (default `"right"` everywhere else). See [ai-chatbot/README.md](../ai-chatbot/README.md) row 5.

## PrizeShowcase — prize-summaries split + click-gated viewers (perf Tier-2, 2026-07-20)

[`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx) does not static-import the ~170 KB deep catalog; the landing graph carries only [`@/config/prize-summaries`](../../src/config/prize-summaries.ts) (see [config-and-data architecture](../config-and-data/architecture.md) "Prize catalog split"). Still live after the 2026-07-21 prize-builder rewrite:

1. **Summary catalog** — `getPrizeSummaryBySlug` / `listPrizeSummaries` / `usePrizeCatalog` all serve `PrizeSummary` (no `specSections` / `detailedDescription`). Everything the card renders — including the gallery that feeds `buildContentsPreview` — lives on the summary.
2. **Click-gated specs modal** — `PrizeSpecificationsModal` is a `next/dynamic` (`ssr: false`) component rendered only after the `specsEverOpened` **first-open latch** (the [LazyMembershipModal](../../src/components/modals/MembershipModal/LazyMembershipModal.tsx) pattern — rendering a `dynamic()` component fetches its chunk even with `isOpen=false`, so it renders `null` until first open, then stays mounted for close animations).
3. **Deep specs on demand** — an effect keyed on `isSpecsModalOpen && activeSlug` runs `await import("@/config/prizes")` (its own chunk, cached after first open) and resolves the full `PrizeCatalogEntry` into `specsPrize` state; the modal shows its built-in "Prize information is loading" placeholder until it lands. The `PrizeCatalogEntry` import in PrizeShowcase is **type-only** (erased at compile). The effect resets a stale `specsPrize` when the active slug changed (no previous-prize flash on reopen), and a chunk-load failure is caught + `console.error`-logged, leaving the loading state — reopening re-runs the effect, which retries the chunk.

> **Changed 2026-07-21:** the second click-gated viewer, `FullscreenImageViewer`, is **gone** —
> the rewrite deleted the image gallery it opened, so the `fullscreenEverOpened` latch and the
> eager local `FullscreenTriggerButton` stand-in no longer exist in this component.

Chunk proof (cold build 2026-07-20): the deep-spec chunk (~139 KB) went from 27 prerendered pages (incl. `/`) to **zero** HTML references; `/` First Load JS 606 → 562 kB, `/promotions/*` 600 → 556 kB.

## PrizeShowcase gallery — Embla migration (Phase 1.5, 2026-05-10) — HISTORICAL

> **Superseded 2026-07-21.** The main-image + thumbs gallery this note describes was **removed**
> with the prize-builder rewrite, along with `enhancedGallery` and the `.main-swiper` /
> `.thumbs-swiper` blocks in [`globals.css`](../../src/app/globals.css). Nothing below still
> exists in `PrizeShowcase`; kept because the **column-grouping** trick it introduced is still
> the reference pattern for 2-row thumb strips (see
> [shared-ui/patterns.md](../shared-ui/patterns.md)), and `MiniDrawImageGallery` still uses the
> inline two-Embla shape.

<details><summary>Original note</summary>

`PrizeShowcase`'s main image + thumbs gallery migrated from Swiper (`EffectFade` + `Grid` modules) to Embla (`embla-carousel-react`) with `embla-carousel-fade` and `embla-carousel-class-names` plugins. Two user-reported bugs fixed by the migration:

1. **Click-snapback on second-page thumbs.** Swiper combined `slideToClickedSlide` with `slidesPerGroup: 12`, causing a click on a second-page thumb to jump back to the first page. Embla has no equivalent — thumb click only calls `mainApi.scrollTo(i)`; the thumbs viewport stays put unless the active item leaves the visible window.
2. **Last 2 of 18 items unreachable on mobile.** Swiper Grid (`rows: 2`, `slidesPerView: 4`, `slidesPerGroup: 8`) refused to advance to a partial third page (remainder < `slidesPerView`). Embla replaced this with a **column-grouping** approach: `enhancedGallery` was grouped into pairs of 2 — each Embla slide one column holding 2 stacked thumbs (`flex flex-col gap-2`). With 18 items → 9 columns; mobile showed 4 columns at a time, all reachable. Slide widths used responsive Tailwind: `flex-[0_0_25%] sm:flex-[0_0_20%] lg:flex-[0_0_16.66%]`.

Other migration notes: prev/next buttons rewired from `mainSwiperRef.current.slidePrev/Next()` to `mainApi.scrollPrev/Next()`; `mainCanSlidePrev/Next` and `thumbCanSlidePrev/Next` derived from `canScrollPrev()` / `canScrollNext()`; the viewport divs kept the `main-swiper` / `thumbs-swiper` classNames for pre-migration shared CSS; `touch-action: pan-y pinch-zoom` per viewport for iOS Safari; `data-carousel="true"` for the print stylesheet.

</details>

## PromoTrustBar — Workshop Caution Plaque redesign (2026-05-14)

[`PromoTrustBar`](../../src/components/sections/promo/PromoTrustBar.tsx) renders the thin strip at the top of promo pages. This bar is intentionally **static** — no animation, no countdown numbers. Urgency is signalled by typography, material, and a hazard-stripe channel that escalates per tier.

**Shell** (shared across every state, via the internal `WorkshopShell` helper):
- Brushed-steel body (`STEEL_BG` + `STEEL_GRAIN` CSS gradients)
- Brass rivets in the four inset corners (`<Rivet />`)
- Top + bottom edge bands:
  - **Default state (no urgency)** — 2 px brass rule gradient. Hazard yellow is *absent* so it retains urgency meaning when it appears.
  - **Urgency states** — diagonal hazard stripe band whose thickness escalates: `finalHours` 6 px → `drawnTomorrow` 8 px → `drawnTonight` / `frozen` 10 px. Frozen swaps the yellow+black hazard for a red+yellow `HAZARD_STRIPE_FROZEN` variant.

**Default state content**: three trust items (Trophy / Shield-link / Calendar) on the steel substrate. Icons use `theme.primary` from [`usePromoTheme`](../../src/stores/usePromoThemeStore.ts); text is white stencil (Oswald/Bebas Neue family). The cert link host is intentionally **not themed** — kept white at every breakpoint so the attribution link reads cleanly on dark steel regardless of brand colour.

The cert item is **visible at every breakpoint** in the normal state. Mobile + tablet render just the link host (`randomdraws.com.au`); desktop (`≥lg`) prepends the `Govt-certified draws · ` prefix. Text items also swap their compact (`lineMobile`) vs verbose (`lineDesktop`) variants at the same `lg:` breakpoint, so the 640 px tablet width fits all three items without overlap. The urgency state replaces the entire trust-items layout with the brass-plaque deadline strip, so the cert is implicitly hidden during `finalHours` / `drawnTomorrow` / `drawnTonight` / `frozen` without an explicit `hidden` rule.

**Urgency state content**:
- **Desktop**: brass nameplate on the left containing a `Clock`/`Lock` icon (tinted with `theme.primary`) and an engraved tier label (`FINAL HOURS` / `DRAWN TOMORROW` / `DRAWN TONIGHT` / `ENTRIES CLOSED`), followed by the deadline text (preLine + `formatDeadlineLabel`), followed by the existing urgency image pinned right. The plaque sits on a 3 px theme-coloured "shelf" (a brand-tinted `box-shadow`) so the brand reads underneath the brass surface.
- **Mobile (<sm)**: the brass nameplate is **dropped** — the urgency image already carries the tier label visually. Layout becomes: standalone timer icon + deadline text on the left, image on the right.
- **Frozen**: brass plaque swaps to a red gradient (`RED_BG`), engraved text uses the darker `ENGRAVED_TEXT_RED` tone, icon swaps from `Clock` to `Lock`, hazard band swaps to the red variant. The brand-coloured shelf is intentionally **dropped** — the red "STOP, entries closed" signal must not be muddied by brand colour.

**Theme integration** — three surfaces accept `theme.primary` / `theme.primaryLight` from `usePromoTheme()`:
1. **Default-state brass rule** (`buildBrassRule(themePrimary)`): the 2 px brass edge gradient blends the brand colour into its middle stop, so the chassis itself reads brand-tinted without losing the brass feel.
2. **Brass plaque underglow** (urgency, non-frozen): a 3 px theme-coloured drop-shadow below the plaque.
3. **Icons** (default & urgency): trust-item icons, the small icon inside the brass plaque, and the mobile standalone timer icon all use `theme.primary`. The cert link host stays white (readability over brand expression).

Hazard yellow, brushed steel, brass rim, and rivets stay constant across themes — these define the workshop substrate and are not branded. Frozen overrides everything to red.

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.

Also: `FloatingCountdownBanner` (a landing-path component) migrated framer-motion `motion.*` → LazyMotion `m.*`. See docs/shared-ui/patterns.md P7.
