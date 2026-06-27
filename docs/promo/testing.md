# Promo — Testing

## Landing hero resolvers (`src/utils/promo/__tests__/`)

| Test file | npm script | Covers |
|---|---|---|
| `landing-image-resolver.test.ts` | `npm run test:landing-image-resolver` | kinTB drawn tiers resolve to real art; `final-hours` collapses to base; light↔dark fallback |
| `landing-draw-day-urgency.test.ts` | `npm run test:landing-draw-day-urgency` | `getLandingHeroUrgencyFromDrawDay` — calendar-day AEST `drawn-tonight` / `drawn-tomorrow` / `null`, DST-safe |

## Manual smoke

- Visit a `/promotion/<slug>` page; verify a `PromoAnalyticsVisit` row is written.
- Apply a promo code; verify multiplier resolution in `BenefitsGranted.data.grants`.
- Schedule a future promo; verify it activates at the right time.
- Cancel a sub; verify the comeback Klaviyo flow fires (in staging only).

## What's NOT well tested

- Multiplier stacking edge cases (multiple promos colliding)
- Banner timezone behaviour (UTC vs AEST schedule resolution)
- ScheduledPromo activation race conditions
