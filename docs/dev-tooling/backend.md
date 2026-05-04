# Dev Tooling — Backend

## Dev routes

| Path | Role |
|---|---|
| `/api/debug/**` | Read-only diagnostics (e.g. inspect a user, check Stripe state) |
| `/api/dev/**` | Mutation helpers (seed data, reset state) — strictly dev-only |
| `/api/test/**` | Misc test endpoints |
| `/api/test-db/**` | DB connection / schema verification |

> _TODO: enumerate exact routes._

## Test scripts

[scripts/test-*.ts](../../scripts/) — manual scenario scripts. Run via `npx tsx scripts/test-XYZ.ts`.

These DIFFER from the standalone test suite under `src/**/__tests__/`. The `scripts/test-*` are scenario setup tools; `__tests__/*.test.ts` are unit tests with `npm run test:*` runners.

## Operational fixes

Some `scripts/fix-*` scripts (e.g. `fix-database-once.mjs`, `fix-redemption-history-index.js`) are one-off operational fixes. After running, they're effectively dead code — but kept in version control for audit.
