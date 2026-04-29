# Metrics-Analytics — Backend

## Services

| Service dir | Role |
|---|---|
| [src/services/metrics/](../../src/services/metrics/) | Metrics computation (per-user, per-day) |
| [src/services/analytics/](../../src/services/analytics/) | Cross-domain analytics aggregation |

### UserMetricsService

`getUserMetrics(query: UserMetricsQuery)` — accepts an optional `asOfDate?: Date | null` in the query.

- **Live mode** (`asOfDate` is `null`/omitted): `membershipStatus.active`, `.cancelled`, `.pastDue` are computed by walking every User's `subscription` field for users created in the date range.
- **Snapshot mode** (`asOfDate` is set): after the User-loop, standing counts are overridden from `MembershipDailySnapshot` rows for the matching date key (formatted in `Australia/Sydney` tz as `yyyy-MM-dd`). `cancelledCount + scheduledCancelCount` are merged into the `cancelled` bucket. If no snapshot rows exist for the date, the live User-loop values survive (graceful degradation).
- `membershipStatus.renewed` is always a range-driven delta from `PaymentEvent` (`subscription_cycle` events) — never overridden by snapshot.

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
