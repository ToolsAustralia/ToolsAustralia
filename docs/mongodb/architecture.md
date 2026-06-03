# MongoDB — Architecture

## Connection pattern

[src/lib/mongodb.ts](../../src/lib/mongodb.ts) — the **single** entry point for Mongo connections. Implements the standard Next.js singleton pattern (cache the connection promise on the global) so hot-reload in dev doesn't spawn N connections.

Per CLAUDE.md:
> Use `src/lib/mongodb.ts`; do not open ad hoc connections in scripts (the `scripts/*.ts` already follow this).

## Repositories

[src/repositories/](../../src/repositories/):
- `index.ts` — re-exports
- `PaymentEventRepository.ts` — payment-event queries (used by [billing-stripe](../billing-stripe/)). Includes `aggregateRevenueByHourAndPlatform(startUTC, endUTC)` — hour-of-day (0–23, Australia/Sydney) revenue + conversions grouped by `convertingPlatform`, on the **same acquisition basis as the daily snapshot aggregator** (renewals + refunds excluded, null→`direct`, exclusive `$lt`); reconciles bit-for-bit with `attributedRevenue[*].newRevenue` (test: `npm run test:hourly-revenue`). Powers the per-platform + aggregate hourly breakdowns ([admin](../admin/)).
- `PromoAnalyticsRepository.ts` — promo analytics queries (used by [promo](../promo/))
- `ab-testing/` — AB-testing repositories (used by [ab-testing](../ab-testing/))

Repositories abstract data-access patterns where the query is non-trivial.

## Jobs

[src/lib/jobs/](../../src/lib/jobs/) — background job primitives. Likely uses `ChargeJobLock` ([subscription models](../subscription/models.md#chargejoblock)) for distributed locking.

> _TODO: enumerate exact files in `src/lib/jobs/`._

## Database utilities

[src/utils/database/](../../src/utils/database/) — pure helpers (e.g. ObjectId conversion, query builders).

## Index management — deploy-time, NOT request-path

Core index creation (`ensureCriticalIndexes()` in
[src/utils/database/ensure-indexes.ts](../../src/utils/database/ensure-indexes.ts))
runs **out-of-band as a deploy-time migration**, never on the request path. Run
it via `npm run migrate:ensure-core-indexes` (`:dry` to preview) — script
[scripts/migrate-ensure-core-indexes.ts](../../scripts/migrate-ensure-core-indexes.ts).
It must run on every index-affecting deploy and before deploying webhook
receiver changes (it owns `paymentIntentId_1_eventType_1_unique` on
`PaymentEvent`, which is dedup layer 4).

The old runtime `ensureIndexesOnce()` wrapper was deleted: it ran ~25–30
serialized Atlas DDL ops in the synchronous webhook pre-ack path and caused the
**2026-05-15 504 storm** under a bulk-charge burst. See
[billing-stripe/gotchas.md](../billing-stripe/gotchas.md) (2026-05-15 504 storm).

## `serverExternalPackages`

Per CLAUDE.md: `mongoose` is `serverExternalPackages` in `next.config.ts`. Don't try to bundle it into client code.
