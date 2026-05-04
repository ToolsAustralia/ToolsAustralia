# Tracking — Frontend

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
