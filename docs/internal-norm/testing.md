# Internal Norm — Testing

## Prerequisites

Before any Norm endpoint will respond `200`, the local DB needs the Norm User + Role and `.env.local` needs both Norm secrets:

```
NORM_BEARER_TOKEN=<32+ random bytes, hex or base64>
NORM_SIGNING_SECRET=<independent 32+ bytes>
```

Seed the User + Role (idempotent — re-run-safe):

```
npm run migrate:create-norm
```

Without this, `withNorm`'s permission step returns 403 `permission_denied` for every call (Norm User exists but has no permissions). Without the env vars, you get 500 `misconfigured` from the auth verifier.

## Smoke against a live endpoint

[scripts/internal-norm-smoke.ts](../../scripts/internal-norm-smoke.ts), exposed as `npm run norm:smoke`. It signs the request the same way Norm does (Mac mini side) and prints the response. Usage:

```
npm run norm:smoke -- GET  /api/internal/norm/v1/health
npm run norm:smoke -- GET  /api/internal/norm/v1/manifest
npm run norm:smoke -- GET  '/api/internal/norm/v1/roas/summary?dateRange=today'
npm run norm:smoke -- GET  '/api/internal/norm/v1/dashboard/stats?dateRange=yesterday'
npm run norm:smoke -- POST /api/internal/norm/v1/some/write '{"key":"value"}'
```

Set `NORM_SMOKE_BASE=http://localhost:3000` (default) or a deployed URL to hit prod / staging. The dev server must be running for localhost.

When debugging a 401, copy the smoke client's signing-string assembly into your own client — most "bad signature" failures are a missing `\n` or an unsorted query.

## tsx test suite

Tests are standalone `tsx` scripts under `src/**/__tests__/*.test.ts`. Each Norm-related test has its own `package.json` script (no jest/vitest):

| Script | Covers |
|---|---|
| `npm run test:norm-user-service-account` | `User.serviceAccount` boolean default + filter behaviour |
| `npm run test:norm-call-log` | `NormCallLog` schema + TTL + indexes |
| `npm run test:norm-receipt` | `NormTriggerReceipt` schema + single-use atomic flip |
| `npm run test:norm-pending` | `NormPendingAction` schema + status transitions |
| `npm run test:norm-classification` | Registry boot-time validation; permission catalog round-trip |
| `npm run test:norm-auth` | Bearer + HMAC + replay nonce + clock-skew + canonicalisation |
| `npm run test:norm-permissions` | `getNormPermissions` cache, `hasNormPermission` 30s TTL |
| `npm run test:norm-kill-switch` | Mongo flag + env override precedence + 30s cache |
| `npm run test:norm-rate-limits` | Tier caps + per-endpoint overrides + minimum-of |
| `npm run test:norm-with-norm` | End-to-end `withNorm` orchestration, all 7 steps |
| `npm run test:facebook-ads-insights-service` | Service-layer numbers match admin route |
| `npm run test:dashboard-stats-service` | Service-layer numbers match admin route |
| `npm run test:resolve-norm-date-range` | All 6 range tokens, including DST edges |

`npm test` only runs the anchor-billing suite (legacy default). Run Norm tests individually or sequence them in a shell loop.

## Adding a tsx test for a new endpoint

1. Co-locate the test with the source: `src/lib/internal-norm/__tests__/<thing>.test.ts` or `src/models/__tests__/<Model>.test.ts`.
2. Use the existing tests as templates — they exercise the public API (no internal mocks), and they pretty-print their `✓` lines via console for the test runner harness.
3. Wire it into `package.json` — add a `test:<scope>` entry. The CLAUDE.md commands section is explicit: if you skip this, the script is undiscoverable.
4. Run it: `npm run test:<scope>`. It should print `✓` lines and exit 0.

For end-to-end coverage (signing → permission → handler → audit row), prefer extending [withNorm.test.ts](../../src/lib/internal-norm/__tests__/withNorm.test.ts) over writing a parallel harness.
