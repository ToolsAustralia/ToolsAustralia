# Promo — Gotchas

## Banner behaviour

(Migrated from `docs/PROMO_BANNER_BEHAVIOUR.md` — _TODO: read root file and merge full content._)

Brief: banner displays `PromoBannerText.text`; gets suppressed on certain admin pages; respects schedule via `ScheduledPromo`; can be themed via `usePromoThemeStore`.

## Page analytics

(Migrated from `docs/PROMO_PAGE_ANALYTICS.md` — _TODO: read root file and merge._)

Brief: `PromoAnalyticsVisit` rows track every visit; aggregations roll up per promo / per day. Can desync if Klaviyo / GTM event firing fails — analytics is best-effort.

## Comeback promo

(Migrated from `docs/CANCELLED_MEMBERSHIP_COMEBACK_PROMO.md` — _TODO: read root file and merge._)

Brief: triggered by Klaviyo flow watching `MembershipStatusHistory` for cancellation rows. Respects unsubscribe; gates on prior promo eligibility.

## UTM persistence interplay

PromoLinks rely on `useUTMPersistence` ([tracking](../tracking/)) to keep UTM params across the session. If UTM persistence is broken, promo attribution breaks silently — analytics rows lack source data.

## Multiplier stacking

When a code-based promo is applied while an alternating multiplier is active, the stacking rule isn't always intuitive. Document the resolver decision before changing it. _TODO: add concrete example._

## Scheduled promo timezone

ScheduledPromo dates: are they stored as UTC or AEST? _TODO: confirm and document. If UTC, the helper that compares "now" to range must convert AEST cycles correctly._
