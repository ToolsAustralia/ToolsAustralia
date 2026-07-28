# MongoDB — Backend

## Connection

[src/lib/mongodb.ts](../../src/lib/mongodb.ts) — singleton connection. All `import mongoose from "mongoose"` paths must be preceded by importing this module to ensure connection is established.

## Repositories

[src/repositories/](../../src/repositories/) abstracts non-trivial query patterns. When a query involves multi-collection joins or repeated complex aggregations, extract to a repository.

### `PromoAnalyticsRepository.updateVisitBuild` — never-insert update

Attaches the "build your prize" configurator's result (`builtPrizeSlug`, `toolboxSwitches`,
`toolsetSwitches`) to a visitor's most recent `PromoAnalyticsVisit` row, matched on
`{ anonymousId, slug, pageType }` and sorted `{ timestamp: -1 }`.

- **`upsert: false`, and it returns `false` when nothing matched.** This must never create a
  document. The visit row is created exactly once, on landing, by the separate
  `/api/tracking/promo-page-visit` beacon; if this method could insert, an engaged visitor would
  be counted twice and corrupt the visit-count denominator the whole feature is built not to
  disturb.
- **`$set` with absolute totals, never `$inc`.** The client sends cumulative switch counts and
  can redeliver (a debounce landing plus a `pagehide` flush) — `$set` makes redelivery
  idempotent; `$inc` would double-count.

`PromoAnalyticsVisit` gained three optional fields for this (`builtPrizeSlug`,
`toolboxSwitches`, `toolsetSwitches`) plus an index on `{ builtPrizeSlug: 1, timestamp: -1 }`.
All three are optional, so existing documents stay valid — no migration or backfill required.

## Jobs / locks

`ChargeJobLock` (in [subscription models](../subscription/models.md#chargejoblock)) is a distributed lock pattern using a Mongo doc with TTL.

[src/lib/jobs/](../../src/lib/jobs/) — additional job-runner code.

## Migrations

[scripts/migrations/](../../scripts/migrations/) — date-prefixed migration scripts. Run via `npm run migrate:*` per `package.json`.

## Operational scripts

Per CLAUDE.md, naming conventions:
- `scripts/migrate-*.ts` → `migrate:*` npm script
- `scripts/backfill-*.ts` → `backfill:*`
- `scripts/sync-*.ts` → `sync:*`
- `scripts/stripe-*.ts` → `stripe:*`
- `scripts/find-*.ts` → `find:*`

Most accept `--dry-run`; prefer the `:dry` variant first.

## Database utilities

[src/utils/database/](../../src/utils/database/) — pure helpers.
