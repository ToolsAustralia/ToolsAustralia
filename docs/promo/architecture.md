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

## Landing hero image resolution (2026-05-12)

[`landing-image-resolver.ts`](../../src/utils/promo/landing-image-resolver.ts) builds URLs for promo-landing heroes under `public/images/background/promo/landing/{brand}/`. Filename grammar: `{brand}-{milTB|sidTB|kinTB}{-dark}?{-mobile}?{-final-hours|-drawn-tomorrow|-drawn-tonight}?.webp`.

Not every variant ships. To avoid 404s when one mode is missing (currently: `{brand}-sidTB.webp` / `{brand}-sidTB-mobile.webp` light bases for all four brands), the resolver consults a build-time manifest at [`src/generated/landingImageManifest.ts`](../../src/generated/landingImageManifest.ts) — emitted by [`scripts/build-landing-image-manifest.ts`](../../scripts/build-landing-image-manifest.ts) during `prebuild`/`predev`.

Resolution order inside [`resolveLandingHeroImage`](../../src/utils/promo/landing-image-resolver.ts):

1. Build the requested URL. If it's in the manifest → return.
2. Build the opposite-mode URL (light↔dark). If it's in the manifest → return that.
3. Neither shipped → return the originally-requested URL so the 404 surfaces visibly.

`kinTB` urgency tiers always collapse to the base file (no per-tier kinTB art ships). Evergreen (`all-prizes/`) uses the same path for both modes by design.

Regenerate the manifest after dropping in new assets:

```bash
npm run build:landing-manifest
```

Regression test: `npm run test:landing-image-resolver`.

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
