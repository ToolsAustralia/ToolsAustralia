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

### `PromoAnalyticsRepository.getAggregatedByPage` — `builds` / `topBuiltPrize` aggregation (2026-07-28)

A third per-page aggregation block (`1c`, alongside the existing `1` visits and `1b` cross-visits
blocks) computes built-prize engagement from the same `PromoAnalyticsVisit` collection:

- **`$match`** on the same `timestamp` date-range window plus `builtPrizeSlug: { $exists: true, $ne: "" }`
  — visitors who never touched the "build your prize" reels have no `builtPrizeSlug`, so they are
  excluded from the numerator by construction, not by a post-filter. Backed by the
  `{ builtPrizeSlug: 1, timestamp: -1 }` index already added for `updateVisitBuild`.
- **`$group`** by `{ pageType, slug, builtPrizeSlug }` with `visitorIds: { $addToSet: VISITOR_ID_EXPR }`
  — the SAME dedupe expression the `visits` and `crossVisits` blocks use (userId if set, else
  anonymousId, else a synthetic per-row id), so `builds` is directly comparable to `visits` as a
  ratio (both are unique-visitor counts, never raw row counts).
- In application code, the per-`{pageType, slug}` visitor-id sets from every `builtPrizeSlug`
  bucket are unioned into `buildVisitorIds` (→ `builds = size of the union`), while `topBuild`
  tracks the single `builtPrizeSlug` bucket with the largest visitor-id-set size per page
  (→ `topBuiltPrize`, or `null` when the page has no build rows at all).
- Adds `builds: number` and `topBuiltPrize: string | null` to `PromoPageMetrics`, alongside
  (not replacing) `crossVisits`. Does not touch the `visits` / `crossVisits` / `signups` /
  `conversions` / `revenue` maps or the `totalVisits`/`totalSignups`/`totalConversions`/
  `totalRevenue` accumulators — verified with a before/after `git stash` A/B run against the live
  dev DB (identical totals both sides: `totalVisits: 84, totalSignups: 53, totalConversions: 64,
  totalRevenue: 3249.89`).

**Cross-visits was NOT replaced.** An earlier draft of this feature assumed the `crossVisits`
aggregation (keyed on `referrerSlug`) was dead because nothing has written a new `referrerSlug`
since 2026-07-24. Live-DB re-verification found 174 of 712 visit rows (~24%) still carry
`referrerSlug`, so the column still renders real historical numbers for June/July date ranges —
removing it would have deleted a live view. `PromoAnalyticsVisit`'s 90-day TTL index means those
rows age out on their own; the column will read all-zero once the last one expires (~late October
2026), at which point dropping it is a one-line change. See
[docs/admin/frontend.md](../admin/frontend.md#promo-analytics-table--builds-column-added-cross-visits-deliberately-kept-2026-07-28).

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
