# Tracking — Architecture

## Provider registry

All conversion-tracking flows through a single provider registry at [`src/lib/tracking/`](../../src/lib/tracking/). Each platform implements one `ConversionProvider` module under `src/lib/tracking/providers/<platform>.ts`:

| Provider | Pixel id env | Access token env | CAPI status |
|---|---|---|---|
| **Facebook** | `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` | `FACEBOOK_ACCESS_TOKEN` | Live |
| **TikTok** | `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | `TIKTOK_ACCESS_TOKEN` | Pixel only — Events API stub returns `false` |
| **Snapchat** | `NEXT_PUBLIC_SNAPCHAT_PIXEL_ID` | `SNAPCHAT_ACCESS_TOKEN` | Pixel only — CAPI stub returns `false` |

## Dispatchers

Two entry points fan out to every enabled provider:

- **Server**: `sendConversion(event, ctx)` in [`src/lib/tracking/dispatch.ts`](../../src/lib/tracking/dispatch.ts) — calls every provider's `capiSend` where `enabled().capi` is true.
- **Browser**: `trackConversion(event)` in [`src/lib/tracking/dispatch-client.ts`](../../src/lib/tracking/dispatch-client.ts) — calls every provider's `pixelTrack` where `enabled().pixel` is true AND `window.location.hostname` matches the provider's `productionHostnames()`.

## Dual-fire + dedup contract

Every conversion event MUST be dual-fired (browser pixel + server CAPI) with a shared `eventId`. Each provider maps it:
- Facebook: `event_id` on CAPI; 4th arg `{ eventID }` on `fbq('track', ...)`.
- TikTok: `event_id` on Events API; 3rd-arg `{ event_id }` on `ttq.track(...)`.
- Snapchat: `client_dedup_id` on both sides.

The Provider interface does not allow opting out — if `enabled()` reports a surface live, both sides fire.

## Missing-credentials safety

When pixel id or access token is absent, the matching surface is a silent no-op: no script tag injection, no `fetch` call, no console-spam, no thrown errors. See [`docs/superpowers/specs/2026-05-11-tracking-provider-registry-design.md`](../superpowers/specs/2026-05-11-tracking-provider-registry-design.md) §8a for the full behavior matrix.

## Files

| Path | Role |
|---|---|
| [src/components/FacebookPixel.tsx](../../src/components/FacebookPixel.tsx) | FB Pixel loader |
| [src/components/GoogleTagManager.tsx](../../src/components/GoogleTagManager.tsx) | GTM loader |
| [src/components/KlaviyoPageTracker.tsx](../../src/components/KlaviyoPageTracker.tsx) | Klaviyo page-view tracking |
| [src/components/KlaviyoScriptLoader.tsx](../../src/components/KlaviyoScriptLoader.tsx) | Klaviyo SDK loader |
| [src/components/PixelTracker.tsx](../../src/components/PixelTracker.tsx) | Generic pixel tracker |
| [src/components/TikTokPixel.tsx](../../src/components/TikTokPixel.tsx) | TikTok Pixel loader |
| [src/components/tracking/](../../src/components/tracking/) | Other tracking components |
| [src/lib/facebook.ts](../../src/lib/facebook.ts) | Meta CAPI server-side |
| [src/lib/facebook-env.ts](../../src/lib/facebook-env.ts) | Env config |
| [src/lib/facebook-marketing.ts](../../src/lib/facebook-marketing.ts) | Marketing API (read insights) |
| [src/lib/gtm.ts](../../src/lib/gtm.ts) | GTM helpers |
| [src/lib/klaviyo.ts](../../src/lib/klaviyo.ts) | Klaviyo client |

## Server-side vs client-side events

Per `.cursor/agents/growth-integrations.md` boundary: **canonical** purchase / cancel events fire server-side via Meta CAPI + Klaviyo events API. Client-side pixels are best-effort (ad-blockers, browser privacy).

## UTM attribution

(Migrated from `docs/UTM_ATTRIBUTION.md`.)

UTM params captured on landing → persisted via `useUTMPersistence` → flow through to attribution data on signup / payment.

[src/lib/utm/](../../src/lib/utm/), [src/utils/utm/](../../src/utils/utm/) — implementation.

> _TODO: read `docs/UTM_ATTRIBUTION.md` and merge full content._

## Klaviyo flows

(Migrated from `src/docs/KLAVIYO_INTEGRATION.md`.)

> _TODO: read root file and merge full content. Brief: profile sync on signup, event firing on purchase, segment metadata for cycle resets._

## Meta CAPI fallback

(Migrated from `docs/FACEBOOK_TRACKING_IMPLEMENTATION.md`.)

> _TODO: read root file and merge full content. Brief: server-side CAPI is canonical; pixel is supplementary._

## Observability sampling

Speed Insights mounted globally in [`src/app/layout.tsx`](../../src/app/layout.tsx) with `sampleRate={0.1}` — beacons 10% of page views. Sufficient for stable Core Web Vitals trends; reduces Vercel Speed Insights data-point billing roughly 10×. Vercel Web Analytics (`<Analytics />`) is currently unsampled — see [`docs/superpowers/plans/2026-05-06-vercel-cost-optimization-tier-1.md`](../superpowers/plans/2026-05-06-vercel-cost-optimization-tier-1.md) for follow-up.

Contentsquare UX analytics is loaded via `next/script` with `strategy="afterInteractive"` from [`src/app/layout.tsx`](../../src/app/layout.tsx) — defers execution until after Next is hydrated so it never blocks LCP or competes with the critical render path. Klaviyo and GTM also use `next/script` ([`KlaviyoScriptLoader.tsx`](../../src/components/KlaviyoScriptLoader.tsx), [`GoogleTagManager.tsx`](../../src/components/GoogleTagManager.tsx)).
