# A/B Testing — Testing

> _TODO: enumerate test files under `services/ab-testing/__tests__/` or similar._

## Manual smoke

- Visit a page with an active experiment → verify deterministic variant
- Refresh repeatedly → verify same variant (sticky)
- Convert → verify single conversion row written (dedupe)
- Visit dashboard → verify metrics update

## Standalone tsx unit tests

Run these directly via the `test:<scope>` entries in `package.json` (see [infrastructure/testing.md](../infrastructure/testing.md) for the full list):

- `npm run test:one-time-drawer-packages` — validates `selectOneTimeDrawerPackages` pack-selection logic: ensures that `includeAdditionalForMembers: true` surfaces `isAdditional` packs when the user `hasAdditionalAccess`, and that the default (`false`) suppresses them. The my-account membership page (`src/app/(site)/my-account/membership/page.tsx`) passes `includeAdditionalForMembers`; the standard `/membership` page uses the default.

> `test:variant-config-design` was removed 2026-07-06 along with the `VariantConfig.packages.design` field when the promo packages-design experiment concluded (control won) — see [promo-packages-design-runbook.md](./promo-packages-design-runbook.md).

## Seed scripts

`npm run seed:promo-theme[:dry]` seeds the "Promo landing — default theme (light
vs dark)" draft experiment (sentinel slug `__promo-theme__`). Full details,
including the mandatory pre-activation `/assign` probe (which requires the admin
**preview cookie** — a bare unauthenticated `curl` cannot target a specific arm),
live under [infrastructure/testing.md](../infrastructure/testing.md#ab-seed-promo-landing-default-theme-light-vs-dark)
per the seed-script documentation precedent (see also
[seed-static-vs-video-hero-experiment](../infrastructure/testing.md#ab-seed-static-image-vs-video-hero-experiment)).

## What's NOT well tested

- Statistical significance computation
- Bot filtering
- Materialized vs live metric divergence
