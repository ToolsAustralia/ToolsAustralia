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
| [src/config/business.ts](../../src/config/business.ts) | Business identity config (legal name, ABN, ACN, address, shop settings) |
| [src/config/featureFlags.ts](../../src/config/featureFlags.ts) | Feature-flag values (currently env / static) |
| [src/config/prizes.ts](../../src/config/prizes.ts) | Prize catalog config |
| [src/config/promo-landing-slugs.ts](../../src/config/promo-landing-slugs.ts) | Slug allowlist for promo pages |
| [src/config/rewardsSettings.ts](../../src/config/rewardsSettings.ts) | Rewards-system settings |

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
| [src/data/miniDrawPackages.ts](../../src/data/miniDrawPackages.ts) | **Static** mini-draw package definitions |
| [src/data/partnerBrandOffers.ts](../../src/data/partnerBrandOffers.ts) | Partner offer reference |
| [src/data/professions.ts](../../src/data/professions.ts) | Profession dropdown options |
| [src/data/sampleOrders.ts](../../src/data/sampleOrders.ts) | Dev fixture |
| [src/data/samplePartnerDiscounts.ts](../../src/data/samplePartnerDiscounts.ts) | Dev fixture |
| [src/data/samplePrizeDraws.ts](../../src/data/samplePrizeDraws.ts) | Dev fixture |
| [src/data/sampleProducts.ts](../../src/data/sampleProducts.ts) | Dev fixture |
| [src/data/sampleUsers.ts](../../src/data/sampleUsers.ts) | Dev fixture |
| [src/data/sampleWinners.ts](../../src/data/sampleWinners.ts) | Dev fixture |
| [src/data/upsellPackages.ts](../../src/data/upsellPackages.ts) | **Static** upsell package definitions |

The "static package" data files are the source of truth for package configuration that the rest of the app references via string ids. See [subscription models.md](../subscription/models.md#membershippackage) for the dual-source caveat.
