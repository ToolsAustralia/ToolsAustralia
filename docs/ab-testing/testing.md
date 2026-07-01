# A/B Testing — Testing

> _TODO: enumerate test files under `services/ab-testing/__tests__/` or similar._

## Manual smoke

- Visit a page with an active experiment → verify deterministic variant
- Refresh repeatedly → verify same variant (sticky)
- Convert → verify single conversion row written (dedupe)
- Visit dashboard → verify metrics update

## Standalone tsx unit tests

Run these directly via the `test:<scope>` entries in `package.json` (see [infrastructure/testing.md](../infrastructure/testing.md) for the full list):

- `npm run test:variant-config-design` — validates `VariantConfig.packages.design` enum acceptance (`"promo"` / `"membership"`), rejects invalid values, and confirms the field survives `mergeVariantConfig` with the expected default behaviour.
- `npm run test:one-time-drawer-packages` — validates `selectOneTimeDrawerPackages` offer-parity logic: ensures that `includeAdditionalForMembers: true` surfaces `isAdditional` packs when the user `hasAdditionalAccess`, and that the default (`false`) suppresses them — confirming the promo A/B treatment and the standard `/membership` page both get the correct set.

## What's NOT well tested

- Statistical significance computation
- Bot filtering
- Materialized vs live metric divergence
