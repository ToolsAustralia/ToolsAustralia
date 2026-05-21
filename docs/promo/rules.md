# Promo — Rules

## R1. One active banner at a time

`PromoBannerText` displays one banner site-wide. When activating a new banner, deactivate the previous (or use scheduled activation/deactivation via `ScheduledPromo`).

## R2. Multiplier resolution is deterministic

When multiple multipliers could apply (e.g. an `AlternatingPromoMultiplier` plus a code-based promo), the resolution rule is:

> _TODO: document the exact precedence — pull from `src/utils/promo/` resolver._

Don't stack multipliers without explicit rule support; they compound dangerously.

## R3. Schedule conflicts resolve to most-specific

Two `ScheduledPromo` rows targeting overlapping windows: the more-specific wins (date range tighter, or explicit user-segment vs broad).

## R4. Analytics writes are non-blocking

`PromoAnalyticsVisit` writes are fire-and-forget — failures must not break the promo-page render.

## R5. Welcome modal once per session

`usePromoWelcomeModal()` shows the modal once per browser session, tracked in localStorage. Don't re-show on every navigation within the session.

## R6. Comeback promo respects unsubscribe

Cancelled members who have unsubscribed from marketing must not receive comeback emails. The Klaviyo flow respects suppression — don't bypass.

## R7. PromoLink UTMs persist via UTMPersistence hook

When a user clicks a PromoLink, the UTM params are captured by `useUTMPersistence` ([tracking](../tracking/)) and survive across navigation for attribution.
