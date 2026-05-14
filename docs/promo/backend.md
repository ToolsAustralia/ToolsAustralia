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

## PromoMultiplier value range (expanded 2026-05-14)

`PromoMultiplier` (defined in [src/types/promo-multiplier.ts](../../src/types/promo-multiplier.ts)) accepts 17 values, exported as the `PROMO_MULTIPLIERS` constant:

```
2, 3, 5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100
```

- **`12` and `15`** are retained for backward compatibility with historical promos that used them; new promos should prefer the values in the table above.
- The Zod schema and Mongoose enum in the promo models auto-pick up new values via `PROMO_MULTIPLIERS` — no manual enum duplication needed.
- The **same `PROMO_MULTIPLIERS` list** is reused as the options for admin-configurable upsell category multipliers (`UpsellMultiplierConfig`). The two systems share values but operate independently.

## Promo vs upsell multiplier independence

The promo multiplier (set per promo campaign, applies to package purchase entry counts) and the upsell multiplier (set per category in `UpsellMultiplierConfig`, applies to upsell entry counts) are **completely separate** systems:

- Promo multiplier: governs `baseEntries × promoMultiplier` for package purchases. Resolved by `getEffectivePromoType`.
- Upsell multiplier: governs `baseEntries × categoryMultiplier` for upsell grants. Does NOT stack with the promo multiplier.

A subscriber buying a pack during a `10×` promo gets `10× base` entries from the purchase. If they also redeem an upsell, the upsell uses only `categoryMultiplier × upsellBase` — the `10×` promo does not factor in.

## Cross-domain payment integration

`src/utils/payment/upsell-promo-multiplier.ts` reads promo state for **hero image selection only** (e.g., `10x-tradie-package.webp`). It does not affect upsell entry counts. Lives in [payment](../payment/) but consumes promo state.

## Cron / jobs

- ScheduledPromo activation/expiration is time-driven. _TODO: locate the scheduler — likely cron or webhook-driven._
- AlternatingPromoMultiplier rotates on schedule. _TODO: locate rotation trigger._

## Repositories

[src/repositories/PromoAnalyticsRepository.ts](../../src/repositories/PromoAnalyticsRepository.ts) — abstracts promo-analytics queries.
