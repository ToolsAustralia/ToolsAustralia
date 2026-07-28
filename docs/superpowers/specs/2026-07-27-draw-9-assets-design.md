# Draw 9 landing assets + GearWrench toolbox — design

**Date:** 2026-07-27 · **Branch:** `feature/draw-9`

Replace every promo landing hero (still + animated, desktop + mobile, base +
`drawn-tomorrow` + `drawn-tonight`) with the Draw 9 export, which for the first time ships
**both a light and a dark variant**, and add **GearWrench** as the fourth toolbox — reel
card, prize slugs, catalog entries and `/promotions/{toolset}-gearwrench` URLs. Finish with
a narrated video proof covering every resulting hero state on mobile and desktop.

---

## 1. What the source actually is (verified, not assumed)

`C:\Users\Genesis\Downloads\DRAW 9 ASSETS` — 460 files in 8 folders, 726 MB.

### 1.1 Filename grammar

Every file is `<Toolbox>-<Toolset>-<A|B>[ (n)].{png,mp4}`.

| Segment | Values | Maps to |
|---|---|---|
| Toolbox (1st) | `GW` `Kin` `Mil` `Sid` | gearwrench, kincrome, milwaukee, sidchrome |
| Toolset (2nd) | `Dew` `HiK`/`Hik` `Mak` `Mil` `Ryo` | dewalt, hikoki, makita, milwaukee, ryobi |
| Variant (3rd) | `A` / `B` | **A = dark, B = light** |

**The toolbox comes FIRST in the source and SECOND in our slugs.** `GW-Dew` is the
DeWalt toolset with the GearWrench toolbox → prize slug `dewalt-gearwrench`, asset stem
`dewalt-gwTB`. Getting this backwards silently files every asset under the wrong brand.

`A = dark` was verified visually, not inferred — `Kin-Mil-A` is the black-background
treatment, `Kin-Mil-B` the white one. It is the opposite of the intuitive reading.

Within the two `DRAWN TONIGHT TOMORROW` folders the countdown tier is encoded by the
Windows duplicate suffix, not the name: for the pair sampled, `X.png` = **drawn-tomorrow**
and `X (2).png` = **drawn-tonight**. This is a one-sample finding and **must not be applied
blind** — `scripts/convert-drawn-tonight-tomorrow-to-webp.ts` carries an explicit warning
that ordering has already changed between drops. Phase 1 verifies the badge on every file.

### 1.2 Dimensions

Desktop 2560×1044, mobile 1080×1164. Desktop aspect (2.452) matches the shipped
1920×783 art exactly, so nothing re-crops; the source is simply larger.

### 1.3 Coverage and gaps (full programmatic inventory)

The still and animated sets mirror each other exactly — the same combos are present,
short and duplicated in both. Against a full 4 toolboxes × 5 toolsets × 2 modes grid:

| Folder | Complete | Gaps |
|---|---|---|
| Desktop base | 36/40 | `ryobi-gearwrench` A+B, `dewalt-kincrome` A |
| Mobile base | 38/40 | `ryobi-gearwrench` A+B |
| Desktop drawn | 31/40 full pairs | `ryobi-gearwrench` A+B absent; `dewalt-kincrome-A`, `ryobi-kincrome-A`, `ryobi-milwaukee-A`, `ryobi-sidchrome-A` have only one of the two tiers; 3 combos ship 3 files |
| Mobile drawn | 37/40 full pairs | `ryobi-gearwrench` A+B absent; 1 combo ships 3 files |

**Ryobi × GearWrench does not exist anywhere.** Per your decision the code ships the full
5×4 cross-product now and those 16 files drop in when you export them; until then that one
page has no hero of its own.

The `(2)` / `(3)` duplicates in the **base** folders are re-exports, not tiers — Phase 1
picks the correct one by inspection rather than by filename order.

---

## 2. Target naming (existing convention — unchanged)

Already implemented by `buildLandingUrl()` in `src/utils/promo/landing-image-resolver.ts`:

```
/images/background/promo/landing/{brand}/{brand}-{toolbox}[-dark][-mobile][-{urgency}].webp
```

`{toolbox}` ∈ `milTB` `sidTB` `kinTB` **`gwTB`** (new). `{urgency}` ∈ `drawn-tomorrow`
`drawn-tonight`. So `GW-Dew-A` (desktop, drawn-tonight) → `dewalt/dewalt-gwTB-dark-drawn-tonight.webp`.

`gwTB` breaks the "first three letters" habit of the other three, but `GW` is GearWrench's
own mark and the art team's own abbreviation, so it is the one term already in use for this
concept.

**The dark half of this grammar has never had a file behind it.** `PromoHero` already calls
`getImageForMode(paths, themeMode, viewport)`; the resolver's light↔dark fallback has been
silently absorbing the absence. Draw 9 is the first export to actually populate it, so dark
mode changes behaviour on every promo landing page the moment these land.

---

## 3. Work

### Phase 1 — Verify and ingest the stills

1. **Verification pass.** Build labelled contact sheets (full-banner thumbnail + badge
   crop, ~12 per sheet) over all 230 static sources and read every one. One look confirms
   four things at once: the headline names the right toolbox, the sub-headline names the
   right toolset, the badge reads the right tier, and the background is the right mode.
   Mode is additionally checked numerically by mean luminance so it cannot be eyeballed
   wrong. Output: a source→target mapping table, plus a resolution for every duplicate.
2. **`scripts/ingest-draw9-landing-assets.ts`** — dry-run-default, reads that table,
   converts PNG→WebP (quality 82, effort 5, matching the existing converter), writes to the
   brand folders, appends a CSV audit log, prints total/progress/ETA per the ops-script rule.
3. `npm run build:landing-manifest`.
4. Update `scripts/check-landing-hero-assets.mjs`: its expected set is currently
   hard-coded to "light only, 3 toolboxes" with a header explaining that dark art has never
   shipped. Both facts change here.

### Phase 2 — Video ingest + light/dark in the video resolver

1. Same verification pass over the 230 clips, using an extracted badge frame.
2. **`scripts/ingest-draw9-landing-videos.ts`** — MP4 remux (`-c:v copy -an
   -movflags +faststart`) + VP9 WebM (`-crf 34`), mirroring
   `convert-drawn-tonight-tomorrow-videos.ts`. ~446 output files.
3. **`getLandingHeroVideoPaths` gains a `mode` argument.** Its doc comment currently states
   "no manifest and no light/dark fallback: the hero ships one clip pair for both themes" —
   that stops being true.
4. **New `src/generated/landingVideoManifest.ts`** + `scripts/build-landing-video-manifest.ts`,
   wired into `prebuild`/`predev` beside the image manifest. This earns its place: with a
   known-absent combo (`ryobi-gearwrench`) and four short drawn pairs, the existing
   "let the browser 404 past a missing `<source>`" trick would emit up to 6 console 404s per
   page load on those pages. A manifest makes the resolver exact instead.

### Phase 3 — GearWrench as a first-class toolbox

Governed by the design handoff at `Downloads\Toolbox Selection Redesign (5)\
design_handoff_prize_showcase\README.md`. That handoff is the design the current
`prize-selection/` folder was built from, with GearWrench deliberately deferred
(`constants.ts` says so in as many words) — so taking its GearWrench rows is completing
the original design, not importing a new one.

**Not adopted from that handoff:** its rows for the existing three marks
(`kincromeText.png` dark variant, `markScale` .96/.96 vs our shipped .62/.72). The
codebase already diverged there deliberately, with the reasoning written into
`constants.ts`. Out of scope here.

| Item | Status |
|---|---|
| `TOOLBOXES` entry in `prize-selection/constants.ts` | New. `isNew: true`, name "GearWrench Toolbox", eyebrow **"288 PIECE"**, accent **`#f0a500`** — all per handoff §Data model. (Earlier draft proposed pink off the banner art; the handoff supersedes that.) |
| `/images/majordraws/toolbox/gearwrenchTB.webp` | Derive from `Gearwrench TB (1).jpeg` — 1000×1000 JPEG on white, no alpha, while the other three renders are alpha-cut WebP. Handoff calls for "white background knocked out to transparent". Shipped as `.webp` to match its three siblings, not the handoff's `.png`. |
| `/images/brands/name/gearwrenchText.svg` + `-light.svg` | Built from `Downloads\gearwrench-logo-vector\gearwrench-logo-vector.svg`, whose 5 paths already separate along exactly the needed lines: WRENCH letters + gear swoosh + ® (orange `#EF8A00`), GEAR letters + inner "GW" (black). Crop `viewBox` to `-140 244 615 64` per handoff, recolour WRENCH to Molten Orange `#EB8900`, and emit GEAR as `#ffffff` (dark) / `#141414` (light). |
| **Two-tone render path** | `BrandMark` paints a CSS *mask*, which is single-colour by construction and cannot express GEAR-in-white + WRENCH-in-orange. GearWrench renders **plateless** from the two theme SVGs instead. Toggled by the existing `.dark` ancestor class (the same pure-CSS mechanism `.pbc-brand-mark` uses) so there is no JS theme read and no hydration flash. `ToolboxOption` gains an optional two-file variant; the other three keep the mask path untouched. |
| `markScale` | Handoff says .9. The cropped mark is 9.6:1 — far wider than Kincrome's 5.76:1 — and it is plateless, so the existing levelling maths does not carry over. Start at .9 and tune by eye against the live card; the Phase 5 recording shows the result. |
| `LandingHeroToolboxSuffix` + `landingToolboxSuffixFromPrizeSlug` | Add `gwTB` / `-gearwrench`. |
| `PrizeSlug` + `PRIZE_SUMMARIES` + `PRIZE_CATALOG` | 5 new slugs, in **both** files (`npm run test:prize-summaries` guards the drift). |
| `TOOLSET_TO_PRIZE_SLUGS` in `promo-landing-slugs.ts` | Currently a 3-tuple per toolset; becomes 4. |
| `{toolset}-gearwrench.webp` card composites | Absent for all 5. **The handoff designs for this**: a `comboMissing` state showing the standalone `gearwrenchTB` behind a "GEARWRENCH COMBO PHOTO COMING" placeholder. Implement that rather than faking a composite. |
| `src/app/sitemap.ts` | New prize URLs. |

### Phase 4 — Docs

`docs/promo/`, `docs/draws/`, `docs/config-and-data/`, `docs/e2e/` per the Domain Manifest;
`BUSINESS.md` + `README.md` (prize catalog changed — a toolbox family was added);
`CUSTOMER.md` (what a customer can win changed); Cobber's FAQ corpus + knowledge pack
(rule 5c — a new toolbox is customer-visible), then `npm run build:chat-knowledge-pack`
and `npm run test:chat-faqs`.

### Phase 5 — Video proof

Extend `e2e/specs/marketing/landing-drawn-states.spec.ts`, which already does exactly this
shape for 15 combos in one viewport-per-project pair and pipes through the existing proof
harness (`demo.step` captions → `narration.json` → en-AU neural TTS + burned SRT →
`e2e/proof/join.ts`).

Grid: **20 combos × 3 tiers × 2 modes × 2 viewports = 240 hero states**, each asserted
against the URL grammar and spotlighted with a caption naming toolset, toolbox, tier and
mode. Delivered as one joined, narrated MP4 with a mobile half and a desktop half. Ryobi ×
GearWrench is walked too and will visibly show its missing hero until you send the art —
that is the honest result, and the narration will say so rather than skip it.

---

## 4. Verification

- `npm run check:promo-landing-assets` (updated expected set) — no missing files.
- `npm run test:landing-image-resolver`, `test:landing-video-resolver`,
  `test:landing-draw-day-urgency`, `test:prize-summaries`, `test:prize-builder`,
  `test:chat-faqs`.
- `npm run lint` + `npm run type-check`.
- The Phase 5 recording is the end-to-end proof.

## 5. Risks

- **Mis-filed art is the main failure mode**, and it is invisible to every automated check —
  a `dewalt-gwTB.webp` containing Makita art passes lint, types, the manifest and the URL
  assertions. Only the Phase 1/2 visual verification and the Phase 5 recording catch it.
  This is why the badge pass reads every file rather than trusting the naming.
- **Repo weight.** `public/videos` goes ~286 MB → ~700 MB, into a `.git` already at 960 MB.
  You chose full light+dark clips knowing this; noting it here as the accepted cost.
- **Dark mode goes live implicitly.** No flag gates it — the moment the `-dark` files exist,
  every promo landing page starts serving different art to dark-mode users.
