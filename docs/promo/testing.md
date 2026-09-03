# Promo — Testing

## Landing hero resolvers (`src/utils/promo/__tests__/`)

| Test file | npm script | Covers |
|---|---|---|
| `landing-image-resolver.test.ts` | `npm run test:landing-image-resolver` | every brand × toolbox × viewport resolves REAL `drawn-tomorrow` / `drawn-tonight` art (asserts the suffix survives, so a tier that collapsed to base fails); `final-hours` collapses to base; light↔dark fallback |
| `landing-draw-day-urgency.test.ts` | `npm run test:landing-draw-day-urgency` | `getLandingHeroUrgencyFromDrawDay` — calendar-day AEST `drawn-tonight` / `drawn-tomorrow` / `null`, DST-safe |

## Landing asset inventory

`npm run check:promo-landing-assets` verifies all 294 shipped landing WebPs are on disk
(6 brands × 4 toolboxes × 3 tiers {base, `drawn-tomorrow`, `drawn-tonight`} × 2 viewports × 2 modes
= 288, plus the 2 evergreen collages and the 4 `bg-*` stage backgrounds). It models a both-modes,
`final-hours`-free reality — see [architecture.md](architecture.md). `URGENCIES` there was cut to
`[null]` while the draw-9 tier art was withdrawn and restored on 2026-09-03; it and
`testKinTbDrawnTiersResolveAndFinalHoursCollapses` must move together or the tree half-ships.

## End-to-end

`e2e/specs/marketing/landing-drawn-states.spec.ts` (`@demo`) drives the real pages: it moves the
active major draw's `drawDate` and reloads to prove every one of the 15 prize combinations
(5 brands x 3 toolboxes) swaps to its own countdown hero, in both states and both viewports —
60 hero resolutions. It is **two tests, one per Playwright project**, because a video canvas
cannot be rescaled mid-recording (docs/e2e/proof-mode.md rule 4). Record and join with:

```bash
npm run e2e:proof -- --grep "on mobile, every prize combination"  --project mobile-chrome
npm run e2e:proof -- --grep "on desktop, every prize combination" --project chromium-desktop
npm run e2e:proof:join -- drawn-states-all-prize-combinations <mobile>.mp4 <desktop>.mp4
```

Since the 2026-07-27 mobile `kinTB` re-export, every one of the 60 heroes is the current design —
there is no held-back combination left to caveat (see [architecture.md](architecture.md)).

## Analytics beacon regression tests

| npm script | Covers |
|---|---|
| `npm run test:promo-visit` | `recordPromoVisit` orchestration with injected `hasRecentVisit`/`recordVisit` deps — see [gotchas.md](gotchas.md#promo-visit-recording-is-a-dep-injected-functional-core). |
| `npm run test:prize-build` | `recordPrizeBuild` orchestration — bogus landing/built slugs rejected before any write, no-op on a missing `anonymousId` or visit row, switch-count clamping — plus a repository-level guard that fails if `updateVisitBuild` is ever flipped to `upsert: true` or `$inc`. See [backend.md](backend.md#prize-build-core--recordprizebuild-2026-07-27) and [docs/mongodb/backend.md](../mongodb/backend.md#promoanalyticsrepositoryupdatevisitbuild--never-insert-update). |
| `npm run test:promo-analytics-range` | **Added 2026-07-31.** `resolvePromoAnalyticsRange` — 14 assertions, no DB/env (the resolver takes an injectable `now` for tests only). Pins the three things that each shipped broken: the requested range is HONOURED (every key reachable, none collapsing to today — the `range`/`dateRange` parameter-name drift), `yesterday` is DST-correct (an AEST day is 23/24/25 h, consecutive days abut with no gap or overlap), and the window is clamped to the visit-retention floor (`clampedToRetention` reported, an entirely-pre-floor window collapses instead of inverting). Also covers custom-range input validation. See [backend.md](backend.md#the-date-filter-was-inert--daterange-vs-range-2026-07-31). |
| `npm run test:promo-analytics-aggregation` | **F-002 closure (2026-07-28).** Proof-of-arithmetic regression suite for `PromoAnalyticsRepository.getAggregatedByPage`'s `buildDistribution` merge/sort and ALL of `getAggregatedByBuiltPrize` — the admin revenue/attribution maths, previously verified only by throwaway probe scripts. Stubs `PromoAnalyticsVisit`/`User`/`PaymentEvent`.aggregate` by call order and calls the real repository methods against canned, known inputs, asserting hard-coded expected outputs (e.g. `builders:10, signups:4, conversions:2` must give exactly `40 / 50 / 20`). Mutation-tested: flipping the tie-break comparator, weakening the `builders > 0` guard to `>= 0`, and breaking the per-slug merge into an overwrite were each confirmed to fail the suite before being reverted. See [docs/mongodb/backend.md](../mongodb/backend.md#promoanalyticsrepository-aggregation-tests--f-002-closure-2026-07-28). |

All are pure (deps injected or Mongoose statics stubbed — no live DB/env) — see [docs/infrastructure/testing.md](../infrastructure/testing.md).

> **`test:promo-analytics-aggregation` stubs `aggregate` BY CALL ORDER — re-order its queue
> whenever a pipeline is added or removed.** The 2026-07-31 rewrite changed
> `getAggregatedByPage`'s call sequence (the `crossVisits` + single `buildAgg` pair became a
> `buildByCombo` + `buildByPage` pair), which broke 3 of its 7 cases until the queue was updated —
> the assertions themselves were still correct. Call-order stubbing is the cheapest way to test a
> real repository method with no DB, but it couples the test to the *number and order* of
> aggregations, not just their results. Verified passing after the rewrite, alongside
> `test:promo-analytics-range`, `test:prize-build`, `test:promo-visit` and
> `test:normalize-platform`.

## Manual smoke

- Visit a `/promotion/<slug>` page; verify a `PromoAnalyticsVisit` row is written.
- Apply a promo code; verify multiplier resolution in `BenefitsGranted.data.grants`.
- Schedule a future promo; verify it activates at the right time.
- Cancel a sub; verify the comeback Klaviyo flow fires (in staging only).

## What's NOT well tested

- Multiplier stacking edge cases (multiple promos colliding)
- Banner timezone behaviour (UTC vs AEST schedule resolution)
- ScheduledPromo activation race conditions
