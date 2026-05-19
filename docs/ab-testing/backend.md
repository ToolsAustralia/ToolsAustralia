# A/B Testing — Backend

## Services

[src/services/ab-testing/](../../src/services/ab-testing/) — assignment service, conversion-tracking service, metrics aggregation.

## Repositories

[src/repositories/ab-testing/](../../src/repositories/ab-testing/) — data access. Per `docs/AB_TESTING_DATABASE_OPTIMIZATION.md`, this layer has DB-optimized queries (indexes, projections) for dashboard performance.

## Metrics calculation

(Migrated from `docs/AB_TESTING_METRICS_CALCULATION.md` — _TODO: read root and merge._)

Brief: dedupe-aware aggregations compute conversion rates per variant; statistical significance computed at read time.

## Routes

[src/app/api/ab-testing/](../../src/app/api/ab-testing/) — assignment endpoint, conversion tracking endpoint, dashboard data.

> _TODO: read each handler._

### VariantConfig.membershipTheme

`VariantConfig` (src/models/ab-testing/Variant.ts) has an optional
`membershipTheme?: { forceLight?: boolean }`. `VariantConfigService`
defaults it to `{ forceLight: false }`, merges it, and validates that
`forceLight` is a boolean. Treatment variant sets `forceLight: true` to force
the membership section to light mode.
