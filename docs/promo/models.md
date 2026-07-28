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

## `PromoAnalyticsVisit` — prize-build fields (2026-07-27)

Three optional fields record the "build your prize" configurator's result on top of the existing
visit row: `builtPrizeSlug` (the assembled prize, e.g. `makita-kincrome`), `toolboxSwitches` /
`toolsetSwitches` (reel-engagement counts). `slug` is unchanged and still means the **landing
page** the visitor arrived on — `builtPrizeSlug` is additive, not a replacement, and the two can
name different brands (e.g. landed on `/promotions/makita`, built the DeWalt combo). All three
are optional, so the change needed **no migration and no backfill**: pre-existing rows stay valid
with the fields simply absent.

Indexed by `{ builtPrizeSlug: 1, timestamp: -1 }` for the Phase 4 prize-popularity breakdown. See
[backend.md](backend.md#prize-build-core--recordprizebuild-2026-07-27) for how the fields get written, and
[docs/mongodb/backend.md](../mongodb/backend.md#promoanalyticsrepositoryupdatevisitbuild--never-insert-update)
for the never-insert update that persists them.

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
