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

## Pixel consent (auto-accept mode)

`PixelTracker` is currently in **auto-accept mode**: on mount it unconditionally calls `localStorage.setItem("pixel-consent", "accepted")`, fires `fbq("consent","grant")` / `ttq.grantConsent()`, and exposes `hasPixelConsent()` returning `true`. `revokePixelConsent()` is a no-op. The `PixelConsentModal` UI exists but is gated to `process.env.NODE_ENV === "production"` inside `usePixelConsent()` and is wired into `UnifiedModalManager` with a hardcoded `isOpen={false}` — it cannot be reached through normal user flow. Treat the modal as inert until consent is re-introduced.

### E2E test IDs

| Component | Testid | Notes |
|---|---|---|
| `PixelConsentModal` (`src/components/modals/PixelConsentModal.tsx`) | `pixel-consent-modal`, `pixel-consent-accept`, `pixel-consent-decline` | Reserved in `e2e/utils/selectors.ts`; not currently rendered visible. The spec at `e2e/consent/pixel-consent.spec.ts` instead asserts auto-grant behaviour: the modal does NOT appear on `/`, and `localStorage["pixel-consent"]` is set to `"accepted"` on first render and persists across reload. |
