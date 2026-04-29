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

## Aggregation cost

Heavy aggregations on hot-path requests can starve the pool. Consider:
- Materialised collections (e.g. `LandingPageMetricsDaily`)
- `maxTimeMS` ceiling
- Read-only secondary preference
