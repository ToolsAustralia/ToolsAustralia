# Promo — Testing

> _TODO: enumerate test files under `src/services/promo/__tests__/` and `src/utils/promo/__tests__/` (if any) and matching `npm run test:*` scripts._

## Manual smoke

- Visit a `/promotion/<slug>` page; verify a `PromoAnalyticsVisit` row is written.
- Apply a promo code; verify multiplier resolution in `BenefitsGranted.data.grants`.
- Schedule a future promo; verify it activates at the right time.
- Cancel a sub; verify the comeback Klaviyo flow fires (in staging only).

## What's NOT well tested

- Multiplier stacking edge cases (multiple promos colliding)
- Banner timezone behaviour (UTC vs AEST schedule resolution)
- ScheduledPromo activation race conditions
