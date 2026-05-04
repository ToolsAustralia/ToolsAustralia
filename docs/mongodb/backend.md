# MongoDB — Backend

## Connection

[src/lib/mongodb.ts](../../src/lib/mongodb.ts) — singleton connection. All `import mongoose from "mongoose"` paths must be preceded by importing this module to ensure connection is established.

## Repositories

[src/repositories/](../../src/repositories/) abstracts non-trivial query patterns. When a query involves multi-collection joins or repeated complex aggregations, extract to a repository.

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
