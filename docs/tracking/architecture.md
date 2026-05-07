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

## Shop analytics payloads

Shop event payloads are built by [src/services/shop/shopAnalytics.ts](../../src/services/shop/shopAnalytics.ts) for both Meta (Pixel + CAPI) and Klaviyo. Schema matches Shopify's official Klaviyo integration (`Items`, `RowTotal`, `SubTotal`, `ShippingTotal`, `TaxTotal`, `GrandTotal` keys; `$event_id` set to `orderNumber` for dedup).

## Shop Klaviyo events

Server-side `Placed Order` (one event per order) and `Ordered Product` (one event per line item, deduped via `$event_id = "{orderNumber}-{productId}"`) are fired from [finalizeShopOrder.service.ts](../../src/services/shop/finalizeShopOrder.service.ts) → [src/lib/klaviyo.ts](../../src/lib/klaviyo.ts) helpers `trackKlaviyoShopPlacedOrder` / `trackKlaviyoShopOrderedProducts`. Both run as background jobs so the webhook stays under Stripe's 5-second SLA.

## Shop Meta CAPI Purchase

Server-side `Purchase` event for shop orders fires from [finalizeShopOrder.service.ts](../../src/services/shop/finalizeShopOrder.service.ts) → [src/lib/facebook.ts](../../src/lib/facebook.ts) helper `sendCapiShopPurchase`. `event_id` is set to the Stripe PaymentIntent id so the client-side Pixel `Purchase` fired from `/checkout/success` (Task 40) can dedupe. CAPI user_data (`fbc`, `fbp`, `client_ip_address`, `client_user_agent`, `event_source_url`) is captured at PI-create time and stored on `paymentIntent.metadata` (`capi_*` keys), then read here.

## Shop client-side tracking

| Event | Where | Pixel | Klaviyo | Server CAPI |
|---|---|---|---|---|
| `ViewContent` / `Viewed Product` | [ProductViewTracking](../../src/app/(site)/shop/[slug]/components/ProductViewTracking.tsx) on product detail mount | ✅ | ✅ | (available via `/api/facebook/track`; not wired from client) |
| `AddToCart` / `Added to Cart` | [CartContext.addToCart](../../src/contexts/CartContext.tsx) for shop products only | ✅ | ✅ | (available via `/api/facebook/track`; not wired from client) |
| `Purchase` | `/checkout/success` page (Task 40) — deduped via `event_id = paymentIntentId` | ✅ | (Klaviyo "Placed Order" fires server-side) | ✅ from `finalizeShopOrder` |

The generic [`POST /api/facebook/track`](../../src/app/api/facebook/track/route.ts) endpoint accepts all standard event names (`AddToCart`, `ViewContent`, `InitiateCheckout`, `Purchase`, etc.) and is available for future client→CAPI mirroring. Today, only `Purchase` runs server-side (canonical for ad attribution); the rest are client Pixel + Klaviyo only.
