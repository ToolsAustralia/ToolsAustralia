# MongoDB — Rules

## R1. Single connection via `lib/mongodb.ts`

Every server-side path that touches Mongo MUST import from `src/lib/mongodb.ts`. Don't `mongoose.connect()` directly anywhere else, including scripts.

## R2. `mongoose` is `serverExternalPackages`

Don't import Mongoose / Mongo models in client components. They're server-only.

## R3. Migrations are idempotent

Migration scripts under `scripts/migrations/` must be idempotent — running twice produces the same end state. Use `findOneAndUpdate(..., upsert: true)` patterns.

## R4. Dry-run before live

Operational scripts (migrate / backfill / sync / stripe / find) almost all support `--dry-run`. **Always** run dry first; review output; then run live.

## R5. Use repositories for non-trivial queries

If a query has multiple stages, joins, or is repeated across services, extract to a repository in `src/repositories/`. Single-step finds can stay inline.

## R6. Index every query field

If a query uses `.find({ foo: bar })` and `foo` is not indexed, you'll table-scan at scale. Verify indexes when adding new query patterns.

## R7. `maxTimeMS` for hot-path queries

Long-running queries can starve the connection pool. Use `maxTimeMS` on queries that run on the request path. See [draws transition service](../draws/architecture.md#three-atomic-ops-in-parallel) for an example.
