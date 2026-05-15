# Dev Tooling — Frontend

## Pages

- `src/app/dev/` — dev panel
- `src/app/dev/modals/` — interactive modal/overlay gallery
- `src/app/dev/membershipsection/` — electric package card preview (returns 404 in production)
- `src/app/test-pixels/` — pixel testing

## Components

[src/components/dev/](../../src/components/dev/) — dev-only UI.

### MembershipSectionDevClient

`src/components/dev/MembershipSectionDevClient.tsx` — electric package card preview harness. Controls:
- **User state**: `guest` | `subscriber` | `entries` — drives which one-time tab shows (regular vs member-only packs)
- **Tab**: `one-time` | `membership` — switches between `ElectricPackageCard` with `getElectricPackageColorScheme` (one-time) and `getMembershipSectionColorScheme` (membership)
- **Multiplier**: `1x` / `2x` / `5x` / `10x` — simulates promo multiplier in plan metadata
- **Theme toggle**: wraps output in a `.dark` class div
- **Reduced-motion**: adds `[&_*]:!transition-none [&_*]:!animate-none` to disable animations
- **Old-vs-new**: shows a reminder label to open the live section in another tab for comparison
- **Locked-preview**: forces the member-only (additional) packs to render in their locked state regardless of access, so the locked card UI can be previewed from a no-access user state

The harness computes and passes `showBestValue` (boss tier for membership tab; power/vip tiers for one-time tab via `isOneTimeBestValuePlanId`) and `ribbon` ("MOST POPULAR" for foreman tier) to each `ElectricPackageCard`; the multiplier badge renders automatically when a 2x/5x/10x multiplier is selected. The dark/light toggle now also passes `theme={dark ? "dark" : "light"}` to every `ElectricPackageCard` so the light-mode variant is exercised from the preview harness.

No Stripe, no providers, no real purchase. Mock data sourced from `src/data/membershipPackages.ts`.

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
