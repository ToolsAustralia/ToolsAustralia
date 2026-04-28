# A/B Testing — Architecture

## What this domain does

Run experiments on landing pages and key flows. Each user is sticky-assigned to one variant per experiment. Conversions are tracked via dedupe-aware aggregation.

## Layers

| Layer | Path |
|---|---|
| Services | [src/services/ab-testing/](../../src/services/ab-testing/) — assignment, conversion tracking |
| Components | [src/components/ab-testing/](../../src/components/ab-testing/) — variant rendering |
| Hooks | [src/hooks/ab-testing/](../../src/hooks/ab-testing/) — variant resolution in React |
| Repositories | [src/repositories/ab-testing/](../../src/repositories/ab-testing/) — data access (DB-optimized) |
| API | [src/app/api/ab-testing/](../../src/app/api/ab-testing/) — assignment endpoints |
| Models | [src/models/ab-testing/](../../src/models/ab-testing/) — experiment, assignment, conversion |

## Migrated from `docs/AB_TESTING_*.md`

> _TODO: read all five root files and merge full content. Brief outline:_
> - Server-resolved variants to avoid flicker
> - Sticky assignment per (experimentId, userId)
> - Dedup at conversion-tracking level
> - Materialised metrics for fast dashboards
