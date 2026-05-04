# Promo — Backend

## Services

| Service dir | Role |
|---|---|
| [src/services/promo/](../../src/services/promo/) | Promo evaluation: resolve which promo applies, compute multipliers/bonuses, validate codes. |
| [src/services/promo-analytics/](../../src/services/promo-analytics/) | Aggregate `PromoAnalyticsVisit` rows for admin dashboards. |

## Utilities

| Util dir | Role |
|---|---|
| [src/utils/promo/](../../src/utils/promo/) | Promo math + eligibility (pure helpers). |
| [src/utils/promo-analytics/](../../src/utils/promo-analytics/) | Helpers for analytics writes / reads. |
| [src/utils/promo-banner/](../../src/utils/promo-banner/) | Banner display logic (which banner to show, when to suppress). |

## Cross-domain payment integration

`src/utils/payment/upsell-promo-multiplier.ts` applies promo multipliers during upsell purchases. Lives in [payment](../payment/) but consumes promo state.

## Cron / jobs

- ScheduledPromo activation/expiration is time-driven. _TODO: locate the scheduler — likely cron or webhook-driven._
- AlternatingPromoMultiplier rotates on schedule. _TODO: locate rotation trigger._

## Repositories

[src/repositories/PromoAnalyticsRepository.ts](../../src/repositories/PromoAnalyticsRepository.ts) — abstracts promo-analytics queries.
