# Metrics & Analytics domain

Member metrics dashboard, daily aggregations, landing-page analytics, dashboard-comparison views.

## Index

- [architecture.md](./architecture.md) — data flows, daily aggregation, dashboard reads
- [frontend.md](./frontend.md) — hooks for metric reads
- [backend.md](./backend.md) — services/metrics, services/analytics
- [api.md](./api.md) — _TODO: enumerate_
- [rules.md](./rules.md) — confidence levels (stripe vs backfill), aggregation freshness
- [patterns.md](./patterns.md) — daily aggregation, materialised metrics
- [gotchas.md](./gotchas.md) — backfill rows, data-source explanation
- [models.md](./models.md) — `LandingPageMetricsDaily`
- [testing.md](./testing.md) — _TODO_

## Migrated from

- `docs/METRICS_DATA_SOURCES.md`
- `docs/DATA_SOURCES_EXPLANATION.md`
- `docs/dashboard-redesign-implementation.md`
- `docs/spend-by-url-feature.md`

> _TODO: read all four root files and merge._
