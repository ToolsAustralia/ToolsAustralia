# Promo — Architecture

## Promo types

| Model | What it represents |
|---|---|
| `Promo` | A promo offering (code, multiplier, bonus, etc.) |
| `PromoLink` | A trackable share link tied to a promo (UTM-style) |
| `ScheduledPromo` | A promo bound to a date range (auto-activate / auto-expire) |
| `AlternatingPromoMultiplier` | A multiplier that alternates between values on a schedule |
| `PromoBannerText` | Text content for the site-wide banner |
| `PromoAnalyticsVisit` | Per-visit analytics row for promo pages |
| `BonusEntryPromo` | Bonus draw-entries promo |

## Service layout

- [src/services/promo/](../../src/services/promo/) — promo evaluation, link tracking
- [src/services/promo-analytics/](../../src/services/promo-analytics/) — analytics aggregation

## Utilities

- [src/utils/promo/](../../src/utils/promo/) — promo math (multiplier resolution, eligibility)
- [src/utils/promo-analytics/](../../src/utils/promo-analytics/) — analytics helpers
- [src/utils/promo-banner/](../../src/utils/promo-banner/) — banner display logic

## Banner behaviour

(Migrated from `docs/PROMO_BANNER_BEHAVIOUR.md`.)

> _TODO: read root file and merge content. Brief: site-wide banner displays the active `PromoBannerText`; respects per-page suppressions; integrates with z-index ordering._

## Page analytics

(Migrated from `docs/PROMO_PAGE_ANALYTICS.md`.)

> _TODO: read root file and merge. Brief: each visit to a promo page writes a `PromoAnalyticsVisit` row with UTM, referrer, conversion linkage._

## Comeback promo

(Migrated from `docs/CANCELLED_MEMBERSHIP_COMEBACK_PROMO.md`.)

> _TODO: read root file and merge. Brief: cancelled members get a comeback offer triggered by Klaviyo flow, watching `MembershipStatusHistory` for `canceled` rows._

## Cross-domain integration

- **[draws](../draws/)** — `BonusEntryPromo` issues tickets via the same path as paid entries
- **[subscription](../subscription/)** — comeback promo
- **[tracking](../tracking/)** — Klaviyo flows fire on cancel events
- **[payment](../payment/)** — promo multipliers applied during purchase via [src/utils/payment/upsell-promo-multiplier.ts](../../src/utils/payment/upsell-promo-multiplier.ts)
