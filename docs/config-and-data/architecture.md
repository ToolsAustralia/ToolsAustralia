# Config & Data — Architecture

## Three folders

| Folder | Purpose | Examples |
|---|---|---|
| [src/config/](../../src/config/) | Runtime feature config | featureFlags, brand-theme, prizes, promo-landing-slugs, rewardsSettings |
| [src/constants/](../../src/constants/) | Truly fixed values | z-index, legal, promo-banner |
| [src/data/](../../src/data/) | Seed / reference data + fixtures | australianStates, professions, sample{Products,Users,Winners,Orders,PartnerDiscounts,PrizeDraws,WhateverElse}, membershipPackages, miniDrawPackages, partnerBrandOffers, faqs, brandLogos, upsellPackages |

## Config

| File | Role |
|---|---|
| [src/config/brand-theme.ts](../../src/config/brand-theme.ts) | Brand color tokens |
| [src/config/featureFlags.ts](../../src/config/featureFlags.ts) | Feature-flag values (currently env / static) |
| [src/config/prizes.ts](../../src/config/prizes.ts) | Prize catalog config (see Prize spec-item photos below) |
| [src/config/promo-landing-slugs.ts](../../src/config/promo-landing-slugs.ts) | Slug allowlist for promo pages |
| [src/config/rewardsSettings.ts](../../src/config/rewardsSettings.ts) | Rewards-system settings |
| [src/config/dashboardFeatures.ts](../../src/config/dashboardFeatures.ts) | Dashboard coming-soon visibility switches (`DASHBOARD_FEATURES`) |

> **Feature toggles (2026-07-03):** `featureFlags.ts` gained **`rewardsPortalEnabled()`** — env-driven
> (`NEXT_PUBLIC_REWARDS_PORTAL_ENABLED`, **default OFF** until partner-portal SSO ships) — gating the
> dashboard-hero "Reward portal" button + the Rewards-page "Open partner portal" button (which shows a
> muted "Coming soon" in its place). `DASHBOARD_FEATURES` gained **`loyaltyStreak: false`** (the home
> `LoyaltyStreak` card is hidden until the 6-month milestone-reward figures are confirmed and it's
> re-flagged in a later session — same convention as the other coming-soon switches).

### Prize spec-item photos

`PrizeSpecItem` has an optional `image?: PrizeMedia`. Photos are assigned from a single map, `SPEC_ITEM_IMAGE_BY_NAME` (keyed by the item's exact `name`), applied to the shared spec arrays (`MILWAUKEE_POWER_TOOLS`, `DEWALT_SIDCHROME_POWER_TOOLS`, `MAKITA_SIDCHROME_POWER_TOOLS`, `RYOBI_POWER_TOOLS`, `HIKOKI_POWER_TOOLS`, + the per-brand `*_POWER_SYSTEM`) at module load via `applySpecItemImages()`. Because prize-combo entries reference those arrays by reference, every combo inherits the image. Matches were produced by **visually scanning** each brand's `/public/images/majordraws/{brand}-set/Tools_Aust_Feb26_*.jpg` photos against the tool list (the gallery `alt` labels were unreliable). Items with no clean single-tool photo (most storage pieces, some batteries/chargers) are simply absent from the map and render without a photo. To re-point a photo, edit one entry in the map. Consumed by `SpecCard` in the [PrizeSpecificationsModal](../shared-ui/frontend.md#prizespecificationsmodal).

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
| [src/data/dev/](../../src/data/dev/) | Dev fixtures |
| [src/data/faqs.ts](../../src/data/faqs.ts) | FAQ content |
| [src/data/index.ts](../../src/data/index.ts) | Re-exports |
| [src/data/membershipPackages.ts](../../src/data/membershipPackages.ts) | **Static** package definitions (subscription packages keyed by string id) |
| [src/data/miniDrawPackages.ts](../../src/data/miniDrawPackages.ts) | **Static** mini-draw package definitions. Exports `getMiniDrawPackagesForViewer(hasAccess)` for tier-aware catalog (guests → Mini Pack 1–3; access holders → additional-*-pack-mini). Untiered `getMiniDrawPackages()` kept for admin/lookup callers. |
| [src/data/partnerBrandOffers.ts](../../src/data/partnerBrandOffers.ts) | Partner offer reference |
| [src/data/professions.ts](../../src/data/professions.ts) | Profession dropdown options |
| [src/data/sampleOrders.ts](../../src/data/sampleOrders.ts) | Dev fixture |
| [src/data/samplePartnerDiscounts.ts](../../src/data/samplePartnerDiscounts.ts) | Dev fixture |
| [src/data/samplePrizeDraws.ts](../../src/data/samplePrizeDraws.ts) | Dev fixture |
| [src/data/sampleProducts.ts](../../src/data/sampleProducts.ts) | Dev fixture |
| [src/data/sampleUsers.ts](../../src/data/sampleUsers.ts) | Dev fixture |
| [src/data/sampleWinners.ts](../../src/data/sampleWinners.ts) | Dev fixture |
| [src/data/upsellPackages.ts](../../src/data/upsellPackages.ts) | **Static** upsell package definitions. Each record's `stripeDescription` is the literal label that flows into the Stripe PaymentIntent (transactions tab); membership upsells use the ` — Membership Upsell` suffix — see [billing-stripe backend.md](../billing-stripe/backend.md#upsell-stripe-descriptions) |

The "static package" data files are the source of truth for package configuration that the rest of the app references via string ids. See [subscription models.md](../subscription/models.md#membershippackage) for the dual-source caveat.
