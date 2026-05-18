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

## Membership dark-mode experiment

- Never reuse the `__membership-theme__` sentinel slug for an unrelated
  experiment, and never give the membership dark-mode experiment `slugTargets`
  of a real prize slug or `*` (`*` collides with promo experiments).
- The membership dark-mode test is diluted, not biased: control differs from
  treatment only during dark hours, so it needs more samples for significance.
  This was an accepted product trade-off.
- Stray `dark:` Tailwind in `MembershipSection` edge UI (e.g. "no packages"
  fallback, promo header) is NOT driven by the `theme` prop and stays
  schedule-driven even for the treatment variant. Out of scope by design.
- The hook caches its result in sessionStorage for 5 min under a fixed key
  (`ab_membership_theme_v1`, not experiment-scoped); a server-side experiment
  swap is invisible for up to 5 min. Bump the `_v1` suffix to force-bust.

## Migrated stubs

Read all five `docs/AB_TESTING_*.md` root files and merge in next refresh:
- `AB_TESTING_FEATURE.md`
- `AB_TESTING_BEST_PRACTICES.md`
- `AB_TESTING_DEDUPLICATION.md`
- `AB_TESTING_DATABASE_OPTIMIZATION.md`
- `AB_TESTING_METRICS_CALCULATION.md`
