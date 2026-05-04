# Dev Tooling — Frontend

## Pages

- `src/app/dev/` — dev panel
- `src/app/test-pixels/` — pixel testing

## Components

[src/components/dev/](../../src/components/dev/) — dev-only UI.

## Examples

[src/examples/](../../src/examples/):
- `PixelTrackingExamples.tsx` — code samples for pixel-tracking integrations

## State conventions

- Direct `fetch()` is OK in dev pages (escape hatch for testing)
- TanStack Query optional for dev tools
