# Upsell — Frontend

## Pages

- `src/app/(site)/upsell-success/` — post-purchase confirmation page

## Components

[src/components/upload/](../../src/components/upload/) — upload-related components used during upsell flows (e.g. uploading custom images). Per the manifest, this directory belongs to the upsell domain.

> _TODO: enumerate exact components and clarify if upload/ is upsell-specific or shared._

## Hooks

> _TODO: locate any upsell-specific hooks (likely in [src/hooks/](../../src/hooks/) but not currently mapped to this domain)._

## Display

- Upsell hero images from `src/generated/upsellImageManifest.ts` — DO NOT manually edit; regenerate via `npm run build:upsell-manifest`. The manifest covers both real rungs (variant and default); when neither is on disk the resolver returns `src: null` and the hero renders nothing (see `architecture.md` → Hero image resolution chain)

## Admin panel — UpsellMultiplierPanel (2026-05-14)

The admin UI for tuning upsell multipliers lives in the `admin` domain but reads static upsell data from this domain:

- The preview tables (`UpsellMultiplierPanel.preview.tsx`) import `upsellPackages` from `src/data/upsellPackages.ts` and `getPackageById` from `src/data/membershipPackages.ts` to compute `multiplier × base` entry counts.
- No changes were needed in `src/data/upsellPackages.ts` — the admin panel is purely read-only for this domain's data.

See `docs/admin/frontend.md#upsell-multiplier-panel` for the full admin-side description.

## className conventions (2026-05-08)

Upsell components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Conversion tracking (Purchase)

`UpsellSuccessClient.tsx` fires the browser Purchase pixel via `trackConversion(buildPurchaseEvent(...))` once the payment status resolves as processed, with `eventId = paymentIntentId` for browser↔server dedup. It passes `contentName: status.data.packageName` so the Purchase carries `content_name` on both the pixel and the server Events API/CAPI (same source as the server, so values match). Field-by-field reference: [docs/tracking/EVENT_PARAMETER_MATRIX.md](../tracking/EVENT_PARAMETER_MATRIX.md).

**Re-fire guard (2026-07-08).** The fire is double-guarded: a per-mount `firedRef` **plus** a persistent localStorage flag via `shouldSuppressPurchasePixel` / `markPurchasePixelFired` from [src/utils/tracking/purchase-pixel-fired-storage.ts](../../src/utils/tracking/purchase-pixel-fired-storage.ts) (key `purchasePixelFired_${paymentIntentId}` holding the first-fire time, pruned after 30 days; only re-fires older than 46h are suppressed — younger ones are merged by Meta's dedup and double as delivery recovery). `firedRef` alone only survives one mount, and Meta's `event_id` dedup lasts ~48h — so revisiting the success URL later than that used to count as a brand-new conversion and inflate Meta-reported ROAS. The first legitimate fire is unchanged, and server CAPI redundancy is unchanged. See `gotchas.md` for details.

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.
