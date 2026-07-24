# Promo — Testing

## Landing hero resolvers (`src/utils/promo/__tests__/`)

| Test file | npm script | Covers |
|---|---|---|
| `landing-image-resolver.test.ts` | `npm run test:landing-image-resolver` | every brand × toolbox × viewport resolves REAL `drawn-tomorrow` / `drawn-tonight` art (asserts the suffix survives, so a tier that collapsed to base fails); `final-hours` collapses to base; light↔dark fallback |
| `landing-draw-day-urgency.test.ts` | `npm run test:landing-draw-day-urgency` | `getLandingHeroUrgencyFromDrawDay` — calendar-day AEST `drawn-tonight` / `drawn-tomorrow` / `null`, DST-safe |

## Landing asset inventory

`npm run check:promo-landing-assets` verifies all 104 shipped landing WebPs are on disk
(5 brands × 3 toolboxes × 3 tiers × 2 viewports, plus the evergreen collage and the `bg-*`
stage backgrounds). It models light-only, `final-hours`-free reality — see
[architecture.md](architecture.md).

## End-to-end

`e2e/specs/marketing/landing-drawn-states.spec.ts` (`@demo`) drives the real pages: it moves the
active major draw's `drawDate` and reloads to prove each brand landing page swaps to its own
countdown hero. Record it narrated with
`npx tsx e2e/run.ts --proof --grep "drawn-state" --project chromium-desktop`.

## Manual smoke

- Visit a `/promotion/<slug>` page; verify a `PromoAnalyticsVisit` row is written.
- Apply a promo code; verify multiplier resolution in `BenefitsGranted.data.grants`.
- Schedule a future promo; verify it activates at the right time.
- Cancel a sub; verify the comeback Klaviyo flow fires (in staging only).

## What's NOT well tested

- Multiplier stacking edge cases (multiple promos colliding)
- Banner timezone behaviour (UTC vs AEST schedule resolution)
- ScheduledPromo activation race conditions
