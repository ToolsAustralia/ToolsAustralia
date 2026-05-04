# Promo — Models

7 collections own this domain.

| Model | Path | Purpose |
|---|---|---|
| `Promo` | [src/models/Promo.ts](../../src/models/Promo.ts) | A promo offering (code, multiplier, bonus). |
| `PromoLink` | [src/models/PromoLink.ts](../../src/models/PromoLink.ts) | Trackable share link tied to a promo. |
| `ScheduledPromo` | [src/models/ScheduledPromo.ts](../../src/models/ScheduledPromo.ts) | A promo bound to a date range (auto-activate / auto-expire). |
| `AlternatingPromoMultiplier` | [src/models/AlternatingPromoMultiplier.ts](../../src/models/AlternatingPromoMultiplier.ts) | Multiplier that alternates between values on a schedule. |
| `PromoBannerText` | [src/models/PromoBannerText.ts](../../src/models/PromoBannerText.ts) | Site-wide banner text content. |
| `PromoAnalyticsVisit` | [src/models/PromoAnalyticsVisit.ts](../../src/models/PromoAnalyticsVisit.ts) | Per-visit analytics row. |
| `BonusEntryPromo` | [src/models/BonusEntryPromo.ts](../../src/models/BonusEntryPromo.ts) | Bonus draw-entries promo. |

> _TODO: pull exact schemas (fields, indexes, relationships) for each from source files. Currently inventoried only._

## Relationships

```
Promo ─┬─< PromoLink (one-to-many: a promo can have multiple share links)
       ├─< ScheduledPromo (date-range bindings)
       ├─< AlternatingPromoMultiplier (rotation config)
       └─< BonusEntryPromo (specific bonus-entry promos)

PromoLink ──< PromoAnalyticsVisit (each link has visit history)

PromoBannerText (independent — banner text doesn't reference Promo directly per current schema)
```

## Idempotency

`PromoAnalyticsVisit` writes are append-only (one row per visit). No dedup — if you want unique visitors, do it at the aggregation step.

`Promo`-issued benefits (multipliers, bonuses) flow through the [billing-stripe](../billing-stripe/) ledger pattern — `BenefitsGranted.data.grants.promoIds[]` records which promos contributed to a payment's grants.
