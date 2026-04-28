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

## Migrated stubs

Read all five `docs/AB_TESTING_*.md` root files and merge in next refresh:
- `AB_TESTING_FEATURE.md`
- `AB_TESTING_BEST_PRACTICES.md`
- `AB_TESTING_DEDUPLICATION.md`
- `AB_TESTING_DATABASE_OPTIMIZATION.md`
- `AB_TESTING_METRICS_CALCULATION.md`
