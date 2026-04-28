# Metrics-Analytics — Backend

## Services

| Service dir | Role |
|---|---|
| [src/services/metrics/](../../src/services/metrics/) | Metrics computation (per-user, per-day) |
| [src/services/analytics/](../../src/services/analytics/) | Cross-domain analytics aggregation |

## Utils

[src/utils/metrics/](../../src/utils/metrics/) — pure helpers.

## Schemas

[src/schemas/metrics/](../../src/schemas/metrics/) — Zod schemas for metric API contracts.

## Daily aggregation

`LandingPageMetricsDaily` rows are written by a daily aggregation job (likely cron-driven). The job reads raw events and produces a per-day per-page summary.

> _TODO: locate the aggregation cron entry and document._

## Spend-by-URL

(Migrated from `docs/spend-by-url-feature.md` — _TODO: read & merge._)

Brief: cross-references Meta ad insights with landing-page conversion data to compute spend per URL.

## Dashboard redesign

(Migrated stub from `docs/dashboard-redesign-implementation.md` — _TODO: read root._)
