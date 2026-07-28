# A/B Testing — Gotchas

## Late assignment

If assignment runs server-side but a component depends on it client-side BEFORE hydration completes, you get a brief default-state render. Pattern: pass the resolved variant down via props from the server component; don't fetch client-side.

## Dedup edge cases

(Migrated from `docs/AB_TESTING_DEDUPLICATION.md`.)

> _TODO: read full root content and merge. Brief: same user from two browsers can produce two assignment rows under different sessions; dedupe must reconcile._

## Bot traffic

Bots can pollute conversion data — implement a "is this a bot?" filter before counting. _TODO: confirm whether this is in place._

## Variant ratio drift

If you change `threshold` mid-experiment, half the assigned users may flip variants. Don't.

## Membership dark-mode experiment (winner shipped — light)

The "no theme" arm won, so `MembershipSection` now passes `theme="light"`
unconditionally and `ElectricPackageCard`'s default theme is `"light"`. The
hook (`useMembershipThemeExperiment`), API route, and `VariantConfig.membershipTheme`
field are still in the codebase but no production component reads from them —
they're dormant and can be reused for future tests, or cleaned up later.

Historical notes (still apply for anyone reviving this pattern):

- Never reuse the `__membership-theme__` sentinel slug for an unrelated
  experiment, and never give the membership dark-mode experiment `slugTargets`
  of a real prize slug or `*` (`*` collides with promo experiments).
- The sentinel slug only guarantees a real prize slug can never collide with
  it — it is NOT zero collision overall. `ExperimentRepository.findActiveBySlug`
  matches `slugTargets: { $in: [slug, "*"] }` and returns a single `findOne`
  newest-`createdAt` document, so an active **wildcard** ("All Pages")
  experiment created after the sentinel one would still be returned for
  `__membership-theme__` (or `__promo-theme__`) and silently hijack it — no
  amount of post-filtering can recover once `findOne` has already picked the
  wrong document. Site-wide sentinel lookups MUST use
  `ExperimentRepository.findActiveBySentinelSlug` /
  `ExperimentService.getActiveExperimentForSentinelSlug` instead of the
  `*Slug` variants — those build their query with
  `buildActiveExperimentQuery(slug, { allowWildcard: false }, now)`, an exact
  match that never matches `"*"`.
- The membership dark-mode test is diluted, not biased: control differs from
  treatment only during dark hours, so it needs more samples for significance.
  This was an accepted product trade-off.
- Stray `dark:` Tailwind in `MembershipSection` edge UI (e.g. "no packages"
  fallback, promo header) is NOT driven by the `theme` prop and stays
  schedule-driven. Out of scope by design.
- The hook caches its result in sessionStorage for 5 min under a fixed key
  (`ab_membership_theme_v1`, not experiment-scoped); a server-side experiment
  swap is invisible for up to 5 min. Bump the `_v1` suffix to force-bust.

## Attribution priority for purchase tracking

When a user is in multiple active experiments (e.g. a slug-targeted promo
experiment AND the site-wide `__membership-theme__`), `getUserActiveExperimentAssignment`
(and the cookie-fallback loops in `/api/stripe/create-one-time-purchase[-existing-user]`)
prefer **page-targeted experiments over wildcard `*`** and **completely
exclude cosmetic site-wide sentinels** like `__membership-theme__` from
purchase attribution. See `NON_CONVERSION_SENTINEL_SLUGS` in
`src/utils/ab-testing/get-user-experiment-assignment.ts`. If you ever add a
new site-wide cosmetic experiment, add its sentinel slug to that set.

## Subscription-renewal attribution

The legacy guard (`isInitialSubscriptionInvoice` in
`src/services/stripe-webhook-handlers/index.ts`) tried to keep renewals
(`subscription_cycle`) from crediting the experiment by gating what gets stamped
onto the PaymentEvent. **The 2026-06 measurement redesign no longer relies on
that stamping.** `ExperimentMetricsService` / `experiment-metrics-core` separate
first-purchase from recurring revenue at READ time using the durable
`PaymentEvent.isRenewal` flag **and** the 14-day conversion window — so a renewal
can never be counted as a conversion or as first-purchase revenue regardless of
how (or whether) it was stamped. Renewals surface only as a separate
`recurringRevenue` line. This makes renewal separation robust even if a renewal
inherits the subscription's `experimentId/variantId`.

## Engagement rollup is diagnostics-only + self-healing (v2)

`/api/cron/ab-testing-aggregate-metrics` no longer feeds conversion/revenue
(those come live from durable tables). It rolls **page_view/click volume** into
`ExperimentDailyMetrics` for engagement history only, and now:
(1) is **auth-gated** by `CRON_SECRET`; (2) **self-heals** by re-aggregating the
last 7 days every run with idempotent `$set` upserts (a missed/failed day is
repaired on the next run, well inside the 30-day event TTL); (3) **excludes admin
preview** events (`metadata.isPreview`). Unique visitors are NOT taken from this
rollup — they come from the durable assignment table.

## Migrated stubs

Read all five `docs/AB_TESTING_*.md` root files and merge in next refresh:
- `AB_TESTING_FEATURE.md`
- `AB_TESTING_BEST_PRACTICES.md`
- `AB_TESTING_DEDUPLICATION.md`
- `AB_TESTING_DATABASE_OPTIMIZATION.md`
- `AB_TESTING_METRICS_CALCULATION.md`
