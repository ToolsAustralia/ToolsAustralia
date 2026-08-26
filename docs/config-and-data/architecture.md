# Config & Data — Architecture

## Three folders

| Folder | Purpose | Examples |
|---|---|---|
| [src/config/](../../src/config/) | Runtime feature config | featureFlags, brand-theme, prizes, promo-landing-slugs, rewardsSettings |
| [src/constants/](../../src/constants/) | Truly fixed values | z-index, legal, promo-banner |
| [src/data/](../../src/data/) | Seed / reference data + fixtures | australianStates, professions, genders, sample{Products,Users,Winners,Orders,PartnerDiscounts,PrizeDraws,WhateverElse}, membershipPackages, miniDrawPackages, partnerBrandOffers, faqs, brandLogos, upsellPackages |

## Config

| File | Role |
|---|---|
| [src/config/attribution-channels.ts](../../src/config/attribution-channels.ts) | Display metadata for the canonical acquisition channels (`ConvertingPlatform`) — see below |
| [src/config/brand-theme.ts](../../src/config/brand-theme.ts) | Brand color tokens |
| [src/config/featureFlags.ts](../../src/config/featureFlags.ts) | Feature-flag values (currently env / static) |
| [src/config/prizes.ts](../../src/config/prizes.ts) | FULL prize catalog — deep spec sheets; server/lazy-chunk only (see Prize catalog split below) |
| [src/config/prize-summaries.ts](../../src/config/prize-summaries.ts) | Lightweight client prize catalog — the ONLY prize module client components may statically import |
| [src/config/promo-landing-slugs.ts](../../src/config/promo-landing-slugs.ts) | Slug allowlist for promo pages |
| [src/config/rewardsSettings.ts](../../src/config/rewardsSettings.ts) | Rewards-system settings |
| [src/config/dashboardFeatures.ts](../../src/config/dashboardFeatures.ts) | Dashboard coming-soon visibility switches (`DASHBOARD_FEATURES`) |

> **Feature toggles (2026-07-03):** `featureFlags.ts` gained **`partnerDiscountSsoEnabled()`** — env-driven
> (`PARTNER_DISCOUNT_SSO_ENABLED`, **default OFF** until partner-portal SSO ships) — gating the
> dashboard-hero "Partner portal" button + the Rewards-page "Open partner portal" button (which shows a
> muted "Coming soon" in its place). `DASHBOARD_FEATURES` gained **`loyaltyStreak: false`** (the home
> `LoyaltyStreak` card is hidden until the 6-month milestone-reward figures are confirmed and it's
> re-flagged in a later session — same convention as the other coming-soon switches).

### `attribution-channels.ts` — display metadata for `ConvertingPlatform` (2026-07-31)

`CHANNEL_DISPLAY: Record<ConvertingPlatform, ChannelDisplay>` — one row per channel, each
`{ key, label, kind, order }` — plus helpers `channelLabel` / `channelKind` / `channelOrder` and a
`CHANNEL_KEYS` tuple typed `[ConvertingPlatform, ...ConvertingPlatform[]]` so it can feed
`z.enum(...)` directly.

**Why it is config and not derived.** Channel labels used to be produced inside
`PromoAnalyticsRepository`, three separate times, as
`src.charAt(0).toUpperCase() + src.slice(1)`. That is presentation logic in a repository, tripled,
and on the values production actually carries it rendered `Tiktok`, `Ig`, `Chatgpt.com` and
`Facebook.com-WebsiteKeyInfo`. It also puts a vendor's name where the house rule wants it — in
config, not in domain logic.

- **`kind`** (`paid` / `owned` / `unattributed` / `unknown`) exists so the UI can style a chip
  without pattern-matching the label text. The admin campaign table previously branched on the
  literal string `"Direct"` and silently stopped working the moment the label moved here.
- **`order`** gives a stable table sort: paid spend first, then owned, then the two catch-alls.
- **`meta` is labelled "Facebook / Instagram", not "Meta"** — Instagram is a placement, and
  `MetaAdInsightsDaily` reports one spend figure across both, so splitting revenue while spend
  stays merged would make ROAS uncomputable for either half.
- **`CHANNEL_KEYS` closes the drill-down enum**, which is what removed a
  `new RegExp("^" + visitorSuppliedValue + "$")` built from an unvalidated `utm_source`.

**Adding a platform** is three edits and nothing else: the `ConvertingPlatform` union
(`src/types/attribution.ts`), its `utm_source` forms in `SOURCE_ALIASES`
(`src/services/attribution/normalizePlatform.ts`), and one row here. The Mongo `$switch`, the
drill-down predicate and the route enum are all generated from those. A missing row is a **compile
error** (`Record<ConvertingPlatform, …>`) and is also asserted by `npm run test:normalize-platform`.

### Prize catalog split — prizes.ts vs prize-summaries.ts (2026-07-20)

`prizes.ts` (~170 KB source; also runs the `applySpecItemImages()` top-level side effect) used to sit in every page's client graph via `usePrizeCatalog` / `DEFAULT_PRIZE_SLUG` imports in Footer, LatestWinnerHero, HorizontalCountdown, etc. It is now split:

- **[`prize-summaries.ts`](../../src/config/prize-summaries.ts)** — `PrizeSummary` = every catalog field EXCEPT `specSections` + `detailedDescription`. Owns the shared types (`PrizeSlug`, `PrizeMedia`, `PrizeHighlight`, `LucideIconName`), `DEFAULT_PRIZE_SLUG`, `getPrizeSummaryBySlug` / `listPrizeSummaries` / `getPrizeLabel`. Pure literal data, no side effects; within a brand the three toolbox variants share every gallery shot except the first hero image, so each brand's tail is a shared `<BRAND>_GALLERY_SHOTS` const (that factoring is what keeps the module inside its size budget). **MUST NOT import from `./prizes`.**
- **[`prizes.ts`](../../src/config/prizes.ts)** — keeps the deep spec-sheet arrays, `PRIZE_CATALOG` (`PrizeCatalogEntry extends PrizeSummary` + `detailedDescription` + `specSections`), `getPrizeBySlug` / `listPrizes`. It imports + re-exports the shared types/helpers from `prize-summaries`, so **server** consumers keep their single `@/config/prizes` import path. Client components must never static-import it — the specifications modal reaches it via a click-gated `await import("@/config/prizes")` (see [promo frontend](../promo/frontend.md)).

**Drift guard:** the two catalogs duplicate the light fields by design (summaries must stay literal + side-effect-free). `npm run test:prize-summaries` fails on ANY divergence — slug order, any shared field value, a deep field leaking into summaries, or the summaries source exceeding **40 KB**. When editing prize data, edit BOTH files and run that test.

### Prize spec-item photos

`PrizeSpecItem` has an optional `image?: PrizeMedia`. Photos are assigned from a single map, `SPEC_ITEM_IMAGE_BY_NAME` (keyed by the item's exact `name`), applied to the shared spec arrays (`MILWAUKEE_POWER_TOOLS`, `DEWALT_SIDCHROME_POWER_TOOLS`, `MAKITA_SIDCHROME_POWER_TOOLS`, `RYOBI_POWER_TOOLS`, `HIKOKI_POWER_TOOLS`, + the per-brand `*_POWER_SYSTEM`) at module load via `applySpecItemImages()`. Because prize-combo entries reference those arrays by reference, every combo inherits the image. Matches were produced by **visually scanning** each brand's `/public/images/majordraws/{brand}-set/Tools_Aust_Feb26_*.jpg` photos against the tool list (the gallery `alt` labels were unreliable). Items with no clean single-tool photo (most storage pieces, some batteries/chargers) are simply absent from the map and render without a photo. **Two footguns (2026-07-22):** (1) a name added to the map does nothing unless that item's array is also passed to one of the **two** `applySpecItemImages` sweeps — the workshop/toolbox storage arrays were missing, so the three toolbox renders could never attach and the Storage tab drew a placeholder for the single biggest item in the prize; (2) the toolbox entries deliberately point at the SAME `toolbox/*TB.webp` files the prize builder's reel uses (`TOOLBOXES[].image` in [prize-selection/constants.ts](../../src/components/sections/promo/prize-selection/constants.ts)), so the sheet and the picker never show different art for the same toolbox. To re-point a photo, edit one entry in the map. Consumed by `SpecCard` in the [PrizeSpecificationsModal](../shared-ui/frontend.md#prizespecificationsmodal), which since the 2026-07-21 restyle renders it as an **84×84** thumbnail beside a two-column Specifications / In the Box body (items without a photo fall back to a placeholder glyph).

**Storage systems:** the modular storage arrays (`MILWAUKEE_PACKOUT_STORAGE`, `DEWALT_TOUGHSYSTEM_STORAGE`, `MAKITA_MAKTRAK_STORAGE`, `RYOBI_LINK_STORAGE`, `HIKOKI_CRUISER_STORAGE`) are defined *after* the photo map, so they get a second `applySpecItemImages()` pass. Only Makita MAKTRAK (`makita-maktrak.webp`) and Ryobi LINK (`ryobi-link.webp`) have a composite system photo, attached to the primary rolling-base piece; Milwaukee PACKOUT, DeWalt ToughSystem, and HiKOKI Multi Cruiser have no storage photo on disk.

**Milwaukee PACKOUT piece count:** prize copy labels it an **8-piece** PACKOUT system, but only **6** pieces are detailed in `MILWAUKEE_PACKOUT_STORAGE` — details for the remaining 2 are pending (see the `NOTE` above the array). The `8pc`/`8-piece` wording was applied only to PACKOUT phrases (`Packout 8pc`, `PACKOUT™ 8pc`, `8-piece modular storage`) to avoid corrupting the Sidchrome `356-piece` / Kincrome `470pc` substrings.

## Constants

| File | Role |
|---|---|
| [src/constants/legal.ts](../../src/constants/legal.ts) | Legal text constants |
| [src/constants/promo-banner.ts](../../src/constants/promo-banner.ts) | Promo banner constants |
| [src/constants/z-index.ts](../../src/constants/z-index.ts) | Z-index values for stacking |

## Data

| File | Role |
|---|---|
| [src/data/australianStates.ts](../../src/data/australianStates.ts) | AU state codes + names (reference) |
| [src/data/brandLogos.ts](../../src/data/brandLogos.ts) | Brand logo asset paths |
| [src/data/dev/](../../src/data/dev/) | Dev fixtures. **`modal-reachability.json` is generated, not hand-edited** — run `npm run analyze:modals` after moving, adding or deleting a modal. Hand-patching it makes the report disagree with the tree; it had gone stale from 2026-03-31 until the draws-modal regroup regenerated it on 2026-07-30. |
| [src/data/faqs.ts](../../src/data/faqs.ts) | `/faq` **page** FAQ content (generic, owner-controlled) + the shared `FaqEntry` type |
| [src/data/supportChatFaqs.ts](../../src/data/supportChatFaqs.ts) | **Cobber chatbot** FAQ corpus (`getSupportChatFaqEntries`) — deflection + knowledge pack only, NOT the /faq page |
| [src/data/index.ts](../../src/data/index.ts) | Re-exports |
| [src/data/membershipPackages.ts](../../src/data/membershipPackages.ts) | **Static** package definitions (subscription packages keyed by string id) |
| [src/data/miniDrawPackages.ts](../../src/data/miniDrawPackages.ts) | **Static** mini-draw package definitions. Exports `getMiniDrawPackagesForViewer(hasAccess)` for tier-aware catalog (guests → Mini Pack 1–3; access holders → additional-*-pack-mini). Untiered `getMiniDrawPackages()` kept for admin/lookup callers. |
| [src/data/partnerBrandOffers.ts](../../src/data/partnerBrandOffers.ts) | Partner offer reference |
| [src/data/professions.ts](../../src/data/professions.ts) | Profession dropdown options |
| [src/data/genders.ts](../../src/data/genders.ts) | Gender dropdown options (`male`/`female` only) **plus the two mappers every consumer must share**: `genderBucketFor()` → admin/Norm bucket (`Male`/`Female`/`Not set`) and `genderToMetaGe()` → Meta `ge` (`"m"`/`"f"`, `undefined` when unknown). The field is optional; unset means unknown and covers both "declined" and "never asked". |
| [src/data/sampleOrders.ts](../../src/data/sampleOrders.ts) | Dev fixture |
| [src/data/samplePartnerDiscounts.ts](../../src/data/samplePartnerDiscounts.ts) | Dev fixture |
| [src/data/samplePrizeDraws.ts](../../src/data/samplePrizeDraws.ts) | Dev fixture |
| [src/data/sampleProducts.ts](../../src/data/sampleProducts.ts) | Dev fixture |
| [src/data/sampleUsers.ts](../../src/data/sampleUsers.ts) | Dev fixture |
| [src/data/sampleWinners.ts](../../src/data/sampleWinners.ts) | Dev fixture |
| [src/data/upsellPackages.ts](../../src/data/upsellPackages.ts) | **Static** upsell package definitions. Each record's `stripeDescription` is the literal label that flows into the Stripe PaymentIntent (transactions tab); membership upsells use the ` — Membership Upsell` suffix — see [billing-stripe backend.md](../billing-stripe/backend.md#upsell-stripe-descriptions) |

The "static package" data files are the source of truth for package configuration that the rest of the app references via string ids. See [subscription models.md](../subscription/models.md#membershippackage) for the dual-source caveat.
