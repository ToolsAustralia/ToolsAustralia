# Tracking — Testing

## Suites

| Script | Covers |
|---|---|
| `npm run test:facebook-capi` | Meta CAPI event sender (lives in [src/lib/__tests__/](../../src/lib/__tests__/)) |

## Pixel testing guide

(Migrated from `src/docs/PIXEL_TESTING_GUIDE.md` — _TODO: read root file and merge._)

Brief: use Facebook Pixel Helper (browser extension), GTM debug mode, and Meta Events Manager Test Events tab to verify pixel + CAPI parallel firing.

## Manual smoke

- Visit `/test-pixels/` (dev page) — fires test events for each provider
- Verify in:
  - Facebook Events Manager (test events tab)
  - GTM debug mode
  - Klaviyo profile activity
  - TikTok Events Manager
