# A/B Testing domain

Purpose-built A/B testing infrastructure with deduplication, DB optimization, and metrics calculation. Used for landing-page conversion experiments.

## Index

- [architecture.md](./architecture.md) — assignment, dedup, metrics
- [frontend.md](./frontend.md) — components, hooks
- [backend.md](./backend.md) — services, repositories
- [api.md](./api.md) — `/api/ab-testing/`
- [rules.md](./rules.md) — sticky assignment, dedup invariants, metrics rigour
- [patterns.md](./patterns.md) — assignment-once, server-resolved variants
- [gotchas.md](./gotchas.md) — flicker, late-assignment, dedupe edge cases
- [models.md](./models.md) — `models/ab-testing/`
- [testing.md](./testing.md) — test scripts
- [promo-packages-design-runbook.md](./promo-packages-design-runbook.md) — promo package-design experiment: what it tests, seeding, reading results, winner-swap runbook

## Migrated from

- `docs/AB_TESTING_FEATURE.md` → architecture.md
- `docs/AB_TESTING_BEST_PRACTICES.md` → patterns.md / rules.md
- `docs/AB_TESTING_DEDUPLICATION.md` → architecture.md / gotchas.md
- `docs/AB_TESTING_DATABASE_OPTIMIZATION.md` → patterns.md
- `docs/AB_TESTING_METRICS_CALCULATION.md` → backend.md

> _TODO: read all five and merge._
