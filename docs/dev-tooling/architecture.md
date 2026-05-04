# Dev Tooling — Architecture

## Routes

| Path | Purpose |
|---|---|
| [src/app/api/debug/](../../src/app/api/debug/) | Debug endpoints (read-only diagnostics) |
| [src/app/api/dev/](../../src/app/api/dev/) | Dev-mode helpers (e.g. seed data, reset) |
| [src/app/api/test/](../../src/app/api/test/) | Test endpoints |
| [src/app/api/test-db/](../../src/app/api/test-db/) | DB connection / schema test endpoints |

## Pages

| Path | Purpose |
|---|---|
| [src/app/dev/](../../src/app/dev/) | Dev panel (admin-only or env-gated) |
| [src/app/test-pixels/](../../src/app/test-pixels/) | Pixel/CAPI testing page |

## Components & examples

[src/components/dev/](../../src/components/dev/) — dev-only components.
[src/examples/](../../src/examples/) — code examples (e.g. `PixelTrackingExamples.tsx`).

## Test scripts

[scripts/test-*.ts](../../scripts/) — manual scenario test scripts (not the standalone test suite, which lives next to source files under `__tests__/`).

Examples:
- `scripts/test-1-draw-ending-60mins.ts` — sets up draw scenario
- `scripts/test-dst-transitions.ts` — DST regression
- `scripts/test-anchor-billing-*.ts` — anchor billing scenarios

## Env gating

All dev routes / pages should be env-gated (`process.env.NODE_ENV !== "production"`) and/or session-gated to admin role.
