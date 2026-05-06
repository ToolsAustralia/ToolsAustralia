# Tracking — Architecture

## Provider stack

| Provider | Purpose | Client | Server |
|---|---|---|---|
| **Facebook Pixel** | Browser events | Yes | — |
| **Meta CAPI** (Conversions API) | Server-side conversion events | — | Yes (canonical for purchases) |
| **GTM** | Tag manager wrapping multiple pixels | Yes | — |
| **Klaviyo** | Marketing automation, profile sync | Yes (web tracking) | Yes (events / profile) |
| **TikTok Pixel** | TikTok ads tracking | Yes | — |

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
