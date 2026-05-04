# Tracking domain

Marketing analytics: Facebook Pixel + Meta CAPI, Google Tag Manager, Klaviyo, TikTok Pixel, UTM attribution.

## Index

- [architecture.md](./architecture.md) — provider stack, server vs client events, UTM persistence
- [frontend.md](./frontend.md) — pixel components, Klaviyo hooks
- [backend.md](./backend.md) — `lib/facebook.ts` (CAPI), `lib/gtm.ts`, `lib/klaviyo.ts`
- [api.md](./api.md) — `/api/facebook/`, `/api/tracking/`
- [rules.md](./rules.md) — server-side events for paid conversions, no PII without consent
- [patterns.md](./patterns.md) — pixel-component pattern, Meta CAPI fallback
- [gotchas.md](./gotchas.md) — pixel double-fire, UTM expiry
- [models.md](./models.md) — MetaAdDestination, MetaAdInsightsDaily
- [testing.md](./testing.md) — `npm run test:facebook-capi`

## Migrated from

- `docs/FACEBOOK_TRACKING_IMPLEMENTATION.md`
- `docs/GTM_INTEGRATION.md`
- `docs/UTM_ATTRIBUTION.md`
- `src/docs/KLAVIYO_INTEGRATION.md`
- `src/docs/PIXEL_INTEGRATION.md`
- `src/docs/PIXEL_TESTING_GUIDE.md`

> _TODO: read all six and merge content._
