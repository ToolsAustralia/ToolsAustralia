# Dev Tooling — Frontend

## Pages

- `src/app/dev/` — dev panel
- `src/app/dev/modals/` — interactive modal/overlay gallery
- `src/app/test-pixels/` — pixel testing

## Components

[src/components/dev/](../../src/components/dev/) — dev-only UI.

### ModalsGalleryClient

`src/components/dev/ModalsGalleryClient.tsx` — interactive gallery for all modals. Each modal entry has:
- A unique `id` string
- A `source` path (now updated to `src/components/modals/ReferFriendModal/index.tsx` for the decomposed folder structure)
- A label + category for the sidebar

When a modal is moved from a monolith `.tsx` file to a folder structure (`/index.tsx`), update the `source` path in the `MODAL_SOURCES` map inside this file.

## Examples

[src/examples/](../../src/examples/):
- `PixelTrackingExamples.tsx` — code samples for pixel-tracking integrations

## State conventions

- Direct `fetch()` is OK in dev pages (escape hatch for testing)
- TanStack Query optional for dev tools
