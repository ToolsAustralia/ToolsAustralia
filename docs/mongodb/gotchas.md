# MongoDB — Gotchas

## Connection pool exhaustion in serverless

Each lambda has its own pool. If you don't reuse the singleton, every cold-start spawns a new pool → Atlas connection-pool warnings. Always `import` from `lib/mongodb.ts`.

## Hot-reload double-registers models

Without the global cache, hot-reload in dev creates new Mongoose models (clashing with cached ones). The cache prevents this. If you see `OverwriteModelError`, you've bypassed the singleton.

## Schema cache invalidation

If you modify a schema and the model is already registered, Mongoose uses the OLD schema. The `ChargeJobLock` model deliberately does `delete mongoose.models[modelName]` to force re-registration in dev — apply this trick when iterating on a schema.

## Migrated from `docs/MONGODB_CONNECTION_BEST_PRACTICES.md`

> _TODO: read root file and merge full content._

## Index pollution

Indexes survive across deploys. If you remove an index from the schema, the existing one stays in Atlas. Use the migration scripts to drop unused indexes explicitly.

**Worked example (2026-07-31):** `PromoAnalyticsVisit.referrerSlug` and its
`{ referrerSlug: 1, slug: 1, timestamp: -1 }` declaration were removed from the schema; the index
itself is dropped by `scripts/migrations/2026-07-31-promo-analytics-cleanup.ts`
(`npm run migrate:promo-analytics-cleanup[:dry]`, dry-run by default, `IndexNotFound` treated as a
no-op). Until that runs against an environment, the index is still live there and still paying
write amplification on the highest-write collection in the app.

## `major-draw-queries.ts` sums `entriesBySource` twice, by hand (2026-08-17)

[`major-draw-queries.ts`](../../src/utils/database/queries/major-draw-queries.ts) derives
`oneTimeEntries` by **hardcoding an addition over named `entriesBySource` keys** — and it does so in
**two byte-identical blocks**, one in `getUserMajorDrawStats` and one in
`getUserCurrentMajorDrawStats`. There is no shared helper and no key iteration, so a new bucket
added to only one block, or to neither, compiles clean and silently under-reports. (The
`entriesByPackage` list beside them *does* iterate `Object.entries(...)`, so it picks up new buckets
for free — which is exactly why the hand-written sums are easy to forget.)

The load-bearing invariant is that `oneTimeEntries + membership + streak` agrees with
`userEntry.totalEntries`, which is read straight off the document rather than recomputed. A bucket
missing from the sum makes the wallet's breakdown not add up to the total beside it — a discrepancy
users notice before we do.

Grouping rule: every **non-membership, non-streak** source folds into `oneTimeEntries`
(`one-time-package`, `upsell`, `mini-draw`, `referral`, `bonus-entry-promo`, `cancellation-upsell`,
`promo-link`, and now `shop`). `streak` stays a distinct bucket so the wallet can render it as its
own line. The `shop` addition (merchandise orders) followed that rule rather than claiming a new
bucket — note that **nothing writes a `shop` entry yet**, so the term contributes 0 on every row
today; it is wired ahead of a grant that is gated on a trade-promotion permit variation.

When adding a bucket: update **both** blocks, keep them identical, and confirm the sum still
reconciles with `totalEntries`.

## Aggregation cost

Heavy aggregations on hot-path requests can starve the pool. Consider:
- Materialised collections (e.g. `LandingPageMetricsDaily`)
- `maxTimeMS` ceiling
- Read-only secondary preference

## Do not `hint` a non-partial index for an `$exists` filter (2026-07-29, panel F-020/F-021)

`PromoAnalyticsRepository`'s two build aggregations briefly passed
`{ hint: { builtPrizeSlug: 1, timestamp: -1 } }` to force the index added for them. Both hints were
**removed** after measurement:

| run | index used | keysExamined | docsExamined | returned |
|---|---|---|---|---|
| no hint | `promo_analytics_visits_ttl` | 764 | 764 | 7 |
| with the hint | `builtPrizeSlug_1_timestamp_-1` | **764** | **764** | 7 |

Identical. The index is **non-sparse**, so `$exists: true` spans its entire key range — the explain
bounds come back `"builtPrizeSlug":["[MinKey, \"\")","(\"\", MaxKey]"]`. Only 8 of 764 rows carried
the field, and the scan read all 764 either way.

Two lessons, both general:

1. **A hint is not free.** MongoDB does **not** fall back when a hint names an index that is not
   present — it rejects the command outright. So a hint converts "slower query" into "500 for the
   whole route" on a fresh deploy before the background index build finishes, after a restore, or
   if anyone drops the index. The admin promo route wraps three services in one `Promise.all`, so
   that took the visits/signups/revenue tables down with the build tables.
2. **To make `$exists` cheap, the index must be partial**, not merely present:
   `{ partialFilterExpression: { builtPrizeSlug: { $exists: true } } }`. Give it a **new name** when
   you do — mongoose cannot alter an index in place; `createIndex` with changed options throws
   an error — **measured as code 86** (`An existing index has the same name as the requested index`);
   this is commonly cited as `IndexOptionsConflict` (85), so expect either — and `autoIndex`
   swallows it, so the index silently never builds. Drop the superseded one in
   a `scripts/migrations/` one-off.

**Done 2026-07-29 (F-021).** Both indexes are now declared partial, under new names:

| model | key pattern | new name |
|---|---|---|
| `PromoAnalyticsVisit` | `{ builtPrizeSlug: 1, timestamp: -1 }` | `builtPrizeSlug_ts_partial` |
| `User` | `{ "signupAttribution.builtPrizeSlug": 1, createdAt: 1 }` | `signupBuiltPrize_createdAt_partial` |

Re-measured on the dev DB with the partial indexes in place, running the two aggregations'
`$match` stages verbatim. Both are now **chosen by the planner unprompted** — no `hint`, so F-020's
500-on-missing-index failure mode is not reintroduced — and `totalDocsExamined` equals the number
of rows that actually carry the field, which is the assertion F-021 asked for:

| collection | docs | carry the field | plain index (forced) | **partial index (chosen)** |
|---|---|---|---|---|
| `promoanalyticsvisits` | 764 | 8 | 764 keys / 764 docs | **8 keys / 8 docs** |
| `users` | 895 | 1 | 128 keys / 127 docs | **1 key / 1 doc** |

The superseded `builtPrizeSlug_1_timestamp_-1` and `signupAttribution.builtPrizeSlug_1_createdAt_1`
are dropped by `scripts/migrations/2026-07-29-partial-build-prize-indexes.ts`
(`npm run migrate:partial-build-prize-indexes[:dry]` — **dry-run is the default**; the bare script
reports and writes nothing, `--live` drops). It is idempotent: an already-absent index is a
reported no-op, and `IndexNotFound` (code 27) from a concurrent drop is caught and counted as
success rather than thrown.

**Deploy order does not matter.** A *differently named* partial index may coexist with the old
non-partial one on the same key pattern — probed directly, creating `builtPrizeSlug_ts_partial`
while `builtPrizeSlug_1_timestamp_-1` still existed succeeded, and the planner preferred the
partial one. So the app can deploy before or after the migration runs; there is never a window
with no usable index.

**The conflict error is on the NAME, and the code is 86 here.** Probed on this deployment,
re-declaring the same name (`builtPrizeSlug_1_timestamp_-1`) with an added `partialFilterExpression`
returns **code 86** — _"An existing index has the same name as the requested index."_ The conflict
is widely cited as `IndexOptionsConflict` (85); 86 (`IndexKeySpecsConflict`) is what MongoDB
actually returned. Either way the create fails and `autoIndex` swallows it, so match on the
behaviour ("a same-name re-declaration silently never builds"), not on the number.

## `signupTouchWindowMatch` returns a top-level `$or` — combine with `$and`, not a spread

A `$match` helper that returns a top-level operator key is a landmine for the spread idiom this
codebase uses everywhere (`{ ...sourceMatch(field), timestamp: {...} }`). Two helpers each
contributing an `$or` into one object literal means **the second silently overwrites the first** —
no error, no warning, just a query missing half its predicate. In
`PromoAnalyticsRepository.getChannelDetail` that would have dropped the date window entirely and
returned all-time numbers under a "today" label.

```ts
// WRONG — if either helper ever returns $or, one of them vanishes
{ ...signupTouchWindowMatch(start, end), ...signupWhere }

// RIGHT
{ "signupAttribution.promotionSlug": { $exists: true, $ne: "" },
  $and: [signupTouchWindowMatch(start, end), signupWhere] }
```

`channelMatch` returns a top-level `$expr` (safe to spread beside an `$or` today), but the call
sites use `$and` for both anyway — explicit combination survives either helper later gaining an
`$or`. General rule: **a helper that may return a top-level logical operator must be combined, not
spread.**

## Renaming an index is a TWO-step change, and only one half is automatic

The schema half (`Schema.index(..., { name })`) is picked up by mongoose's `autoIndex` — which
`src/lib/mongodb.ts` leaves at its default `true` — so the **new** index builds itself on the next
app start. The **old** index does not go anywhere: indexes survive deploys, and nothing in mongoose
drops an index just because the schema stopped declaring it. Every rename therefore needs a
`scripts/migrations/` one-off to drop the superseded name, or the collection quietly carries both
and pays double the write amplification forever.

Two practical consequences when writing that migration:

- **Use the raw driver collection (`mongoose.connection.db.collection(name)`), not the model.**
  Importing a Mongoose model *after* `connectDB()` triggers `autoIndex`, so a "dry run" that
  imports the model would build indexes — a write. The 2026-07-29 migrations use the driver
  handle for exactly this reason.
- **Drop-then-let-autoIndex-rebuild is only safe when the old index is not load-bearing.** It was
  safe here because the index being dropped provably narrowed nothing. When the old index *is*
  serving queries, create the new one first and drop second.
