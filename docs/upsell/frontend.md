# Upsell — Frontend

## Pages

- `src/app/(site)/upsell-success/` — post-purchase confirmation page

## Components

[src/components/upload/](../../src/components/upload/) — upload-related components used during upsell flows (e.g. uploading custom images). Per the manifest, this directory belongs to the upsell domain.

> _TODO: enumerate exact components and clarify if upload/ is upsell-specific or shared._

## Hooks

> _TODO: locate any upsell-specific hooks (likely in [src/hooks/](../../src/hooks/) but not currently mapped to this domain)._

## Display

- Upsell hero images from `src/generated/upsellImageManifest.ts` — DO NOT manually edit; regenerate via `npm run build:upsell-manifest`

## Admin panel — UpsellMultiplierPanel (2026-05-14)

The admin UI for tuning upsell multipliers lives in the `admin` domain but reads static upsell data from this domain:

- The preview tables (`UpsellMultiplierPanel.preview.tsx`) import `upsellPackages` from `src/data/upsellPackages.ts` and `getPackageById` from `src/data/membershipPackages.ts` to compute `multiplier × base` entry counts.
- No changes were needed in `src/data/upsellPackages.ts` — the admin panel is purely read-only for this domain's data.

See `docs/admin/frontend.md#upsell-multiplier-panel` for the full admin-side description.

## className conventions (2026-05-08)

Upsell components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.
