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

- `npm run seed:promo-theme:dry` — preview the "Promo landing — default theme (light vs dark)" experiment seed. Writes nothing.
- `npm run seed:promo-theme` — create the draft Experiment + two Variants (`Light (control)` 50%, `Dark` 50%), targeting the sentinel slug `__promo-theme__` (never a real prize slug, so it cannot shadow a slug-targeted promo experiment — `findActiveBySlug` is a `findOne`). Status is always `draft`; activation is a separate, deliberate step in admin → A/B Testing.
- `npm run seed:promo-theme -- --force` — repopulate an existing draft's variants (deletes and recreates them). Re-running without `--force` on a draft that already has variants is a no-op skip. If the experiment exists in any status other than `draft` (active/paused/ended), the script refuses to touch it and exits 0.

### Pre-activation check — do not skip

Before flipping this experiment to `active` in the admin UI, POST to `/api/ab-testing/assign` for each of the two variant ids and assert the response's `variantConfig.promoTheme.defaultTheme` is present (`"light"` / `"dark"`):

```bash
curl -X POST /api/ab-testing/assign \
  -H "Content-Type: application/json" \
  -d '{"experimentId":"<id>","slug":"__promo-theme__"}'
```

`VariantConfigService.mergeVariantConfig` rebuilds variant config from an explicit key whitelist. If `promoTheme` were ever dropped from that whitelist, the config would be silently stripped between MongoDB and the browser — both arms would render light while the admin dashboard still shows a healthy, evenly-split experiment. That's a silent A/A producing confident, wrong conclusions, so this probe is mandatory before every activation, not just the first.

## What's NOT well tested

- Statistical significance computation
- Bot filtering
- Materialized vs live metric divergence
