# Config & Data — Rules

## R1. Choose the right folder

- **`config/`** — runtime-tunable settings (feature flags, brand theme, prize catalog)
- **`constants/`** — values that never change without a deploy (z-index, legal disclaimers)
- **`data/`** — reference data (states, professions) AND seed/fixture data (`sample*.ts`)

Wrong placement = confusion when someone tries to "tweak the constant" but it's actually a runtime config.

## R2. Don't ship `sample*.ts` data as production fallback

`sampleProducts`, `sampleUsers`, `sampleOrders` etc. are **fixtures**. Don't reference them as a default in production code paths. Always read from Mongo for real data.

## R3. Static package data is dual-source

`membershipPackages.ts`, `miniDrawPackages.ts`, `upsellPackages.ts` exist BOTH in code AND in Mongo (`MembershipPackage` collection). Adding a new package = update both places. See [subscription models.md](../subscription/models.md#membershippackage).

## R4. Z-index from constants only

Reference [src/constants/z-index.ts](../../src/constants/z-index.ts), never hardcode `z-50`. See [shared-ui R3](../shared-ui/rules.md#r3-use-z-index-constants).

## R5. Legal text from constants

[src/constants/legal.ts](../../src/constants/legal.ts) holds legal copy (NSW licence `TP/05113`, NT permit `NTP_NUMBER` — currently `NTP/17494`, updated for draw 9). Don't inline T&C / licence / permit strings in components — **import the constant** (`NTP_NUMBER`, `NSW_LICENSE`, `MAJOR_GIVEAWAY_NOTIFICATION`, `LEGAL_COMPLIANCE_TEXT`). Hardcoded copies once drifted to two different permit numbers (`NTP/16264` vs `NTP/16579`) showing inconsistently across the app; every display now reads from the single constant so the permit only ever changes in one place.

## R6. Feature flags are static today

`featureFlags.ts` is currently env-driven / hardcoded. If you need runtime-toggleable flags, that's a new system — discuss before adding.
