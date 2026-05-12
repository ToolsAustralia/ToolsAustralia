# Tracking — Frontend

## Conversion pixels

[`<ConversionPixels />`](../../src/components/tracking/ConversionPixels.tsx) is the canonical browser-side pixel loader, mounted once in [`src/app/layout.tsx`](../../src/app/layout.tsx). It iterates the provider registry and calls each provider's `loadPixel({ nonce })` for those whose `enabled().pixel` is true.

`<FacebookPixel />` and `<TikTokPixel />` remain in the codebase as backwards-compat re-exports of their helper functions, but should not be mounted directly.

To fire a conversion from a client component, use `trackConversion(buildPurchaseEvent(...))` from [`src/lib/tracking/dispatch-client.ts`](../../src/lib/tracking/dispatch-client.ts).

## Pixel components (top-level)

[src/components/](../../src/components/) directly:
- `FacebookPixel.tsx`
- `GoogleTagManager.tsx`
- `KlaviyoPageTracker.tsx`
- `KlaviyoScriptLoader.tsx`
- `PixelTracker.tsx` (generic)
- `TikTokPixel.tsx`

These are mounted in the root layout and load each provider's SDK.

## Tracking subdir

[src/components/tracking/](../../src/components/tracking/) — additional tracking components / wrappers.

## Hooks

| Hook | Purpose | Source |
|---|---|---|
| `useKlaviyoTracking()` | Fire Klaviyo events from components | [src/hooks/useKlaviyoTracking.ts](../../src/hooks/useKlaviyoTracking.ts) |
| `usePixelTracking()` | Fire arbitrary pixel events | [src/hooks/usePixelTracking.ts](../../src/hooks/usePixelTracking.ts) |
| `useAttribution()` | Read attribution data (UTM, referrer) | [src/hooks/useAttribution.ts](../../src/hooks/useAttribution.ts) |
| `useUTMPersistence()` | Persist UTM params across navigation | [src/hooks/useUTMPersistence.ts](../../src/hooks/useUTMPersistence.ts) |

## CSP considerations

Pixels load third-party scripts. CSP must allow these domains (Facebook, Google, Klaviyo, TikTok). See [security-csp](../security-csp/).

## className conventions (2026-05-08)

Tracking/pixel components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Print-stylesheet markers (2026-05-09)

Pixel `<Script>` tags are tagged with `data-tracking-pixel="true"` (`GoogleTagManager`, `KlaviyoScriptLoader`, the Contentsquare loader in `app/layout.tsx`). The print stylesheet in [src/app/globals.css](../../src/app/globals.css) hides any `[data-tracking-pixel]` element so they don't leak into printed pages. When wiring a new pixel script, add the same attribute. See [shared-ui/patterns.md](../shared-ui/patterns.md#print-stylesheet) for the full set of print-hidden markers.
