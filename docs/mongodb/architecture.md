# MongoDB — Architecture

## Connection pattern

[src/lib/mongodb.ts](../../src/lib/mongodb.ts) — the **single** entry point for Mongo connections. Implements the standard Next.js singleton pattern (cache the connection promise on the global) so hot-reload in dev doesn't spawn N connections.

Per CLAUDE.md:
> Use `src/lib/mongodb.ts`; do not open ad hoc connections in scripts (the `scripts/*.ts` already follow this).

## Repositories

[src/repositories/](../../src/repositories/):
- `index.ts` — re-exports
- `PaymentEventRepository.ts` — payment-event queries (used by [billing-stripe](../billing-stripe/))
- `PromoAnalyticsRepository.ts` — promo analytics queries (used by [promo](../promo/))
- `ab-testing/` — AB-testing repositories (used by [ab-testing](../ab-testing/))

Repositories abstract data-access patterns where the query is non-trivial.

## Jobs

[src/lib/jobs/](../../src/lib/jobs/) — background job primitives. Likely uses `ChargeJobLock` ([subscription models](../subscription/models.md#chargejoblock)) for distributed locking.

> _TODO: enumerate exact files in `src/lib/jobs/`._

## Database utilities

[src/utils/database/](../../src/utils/database/) — pure helpers (e.g. ObjectId conversion, query builders).

## `serverExternalPackages`

Per CLAUDE.md: `mongoose` is `serverExternalPackages` in `next.config.ts`. Don't try to bundle it into client code.
