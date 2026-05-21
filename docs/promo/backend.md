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

## Promo multipliers STACK with upsell multipliers

The promo multiplier (set per promo campaign, applies to package purchase entry counts) and the upsell category multiplier (set in `UpsellMultiplierConfig`, applies to upsell entry counts) **stack** in the upsell formula:

```
upsellEntries = activePromoMultiplier × upsellCategoryMultiplier × baseEntries
```

- Promo multiplier: applied at package purchase as `baseEntries × promoMultiplier`. Resolved by `getEffectivePromoType` / `PromoMultiplierResolverService` (Scheduled > Toggle > Alternating > 1×).
- Upsell multiplier: stacks on top of the promo for the upsell grant. Defaults: `membership=10`, `oneTime=2`, `additional=2`. Mini upsells use a fixed `1×`.

**Example.** A subscriber buying a Tradie subscription during a `5×` membership promo gets `15 × 5 = 75` entries on the subscription. If they accept the Apprentice Pack upsell (admin Membership upsell multiplier = `10×`), they get an *additional* `5 × 10 × 3 = 150` free entries from the upsell.

> Prior to 2026-05-15 this was a "no stacking" system (upsell ignored promo). The change was made on user request so promo seasons amplify upsell value automatically. Watch for stale docs / code that still claim "do not stack" — those are bugs.

## Cross-domain payment integration

`src/utils/payment/upsell-promo-multiplier.ts` resolves the promo factor used by **both** the hero image selector (`Nx-*.webp` variant) **and** the entry calculator (as `activePromoMultiplier` in the formula above). Single source of truth, dual consumer.

## Cron / jobs

- ScheduledPromo activation/expiration is time-driven. _TODO: locate the scheduler — likely cron or webhook-driven._
- AlternatingPromoMultiplier rotates on schedule. _TODO: locate rotation trigger._

## Repositories

[src/repositories/PromoAnalyticsRepository.ts](../../src/repositories/PromoAnalyticsRepository.ts) — abstracts promo-analytics queries.
