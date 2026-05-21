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

## Codemods

[scripts/codemods/](../../scripts/codemods/) — TypeScript codemod scripts for mechanical code sweeps. Part of the UI/Tailwind cleanup plan.

Structure:
- `lib/codemod-runner.ts` — shared CLI harness (dry-run by default, `--apply` to write)
- `lib/replace-classname.ts` — regex-based className rewriters (`rewriteHexArbitraries`, `rewriteArbitrarySizes`, `rewriteExactArbitrary`)
- `lib/walk-tsx.ts` — file walker with extension + exclude filtering
- `sweep-brand-red.ts` — Phase 1a: converts brand-red hex arbitraries (e.g. `bg-[#ee0000]`) to tokens (`bg-red-600`)
- `sweep-micro-text.ts` — Phase 1b: converts micro-text pixel arbitraries (`text-[8px]`/`text-[9px]` → `text-3xs`, `text-[10px]`/`text-[11px]` → `text-2xs`); 605 replacements across 108 files
- `sweep-header-offsets.ts` — Phase 1c: converts header-offset magic numbers to CSS vars (`pt-[86px]` → `pt-[var(--app-header-h)]`, `pt-[106px]` → `pt-[var(--app-header-h-lg)]`); 34 replacements across 16 files

Run pattern: `npm run sweep:<name>:dry` (preview), then `npm run sweep:<name>` (apply).

## Env gating

All dev routes / pages should be env-gated (`process.env.NODE_ENV !== "production"`) and/or session-gated to admin role.
