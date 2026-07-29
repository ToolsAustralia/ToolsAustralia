# TikTok Pixel + Events API — Implementation

**Status:** Implemented 2026-05-22 (pending production enablement + staging verification). **Domain:** `tracking`.

TikTok conversion tracking runs through the same provider registry as Meta ([architecture.md](./architecture.md)): a browser **Pixel** and a server-side **Events API (v1.3)** call sharing one `event_id` so TikTok deduplicates them. This doc is the field-level reference; design rationale is in [`docs/superpowers/specs/2026-05-22-tiktok-events-api-design.md`](../superpowers/specs/2026-05-22-tiktok-events-api-design.md).

## 2026-07-24 hardening (panel review F-009 / F-020 / F-022 / F-025)

- **Transport.** `sendTikTokEvent` uses `resilientFetch` from [`src/lib/http/outbound.ts`](../../src/lib/http/outbound.ts) (keep-alive-bounded dispatcher + bounded retry — 5s per attempt, 2 retries), matching `src/lib/facebook.ts`. Retry is safe precisely because TikTok dedups on `event_id`. Transport failures now log `describeFetchError`'s undici cause code instead of an opaque `fetch failed`. It previously used raw `fetch`, exposing it to the frozen-serverless dead-socket race (`UND_ERR_SOCKET`) that `outbound.ts` exists to fix.
- **Guards are under test.** `npm run test:tiktok-capi-guards` ([tiktok-capi-guards.test.ts](../../src/lib/tracking/__tests__/tiktok-capi-guards.test.ts), zero-network — stubs `globalThis.fetch`) pins every refusal: missing creds · non-prod without `TIKTOK_TEST_EVENT_CODE` (would pollute PRODUCTION reporting) · missing/blank `event_id` (the dedup key — omitting it double-counts) · HTTP 200 with body `code !== 0` (**TikTok signals failure in the BODY, not the status**) · unparseable body · transport error returns `false` rather than throwing. Also pins that production sends WITHOUT a test code unless `TIKTOK_USE_TEST_EVENTS=true`.
- **Page views use `ttq.page()`, not `track("PageView")`.** TikTok's standard page view is `ttq.page()`; routing it through `ttq.track("PageView", …)` registers a *custom* event of that name instead. `tiktokProvider.pixelTrack` now translates the registry's canonical `PageView` into `ttq.page()`, so SPA route changes count as real page views (previously only the initial load did, via the `loadPixel` bootstrap). The translation lives in the provider so `ConversionPixels` stays provider-agnostic and nothing double-fires.
- **Renewals are never sent.** `trackPixelSubscriptionRenewal` ([pixel-purchase-tracking.ts](../../src/utils/tracking/pixel-purchase-tracking.ts)) is now an explicit, documented no-op. Its old body built a payload and called the browser-only `trackTikTokEvent` from a **server** context (Stripe webhook), so it never sent anything — while its docstring claimed renewals were "tracked to TikTok/Klaviyo for internal analytics". Renewals must not be reported as ad-platform conversions: that inflates revenue and corrupts ROAS. The function is kept as the seam for future first-party internal analytics; deleting it would mean editing the Stripe webhook handler for zero behavioral gain.

## Files

| File | Role |
|---|---|
| [src/lib/tiktok.ts](../../src/lib/tiktok.ts) | Events API v1.3 sender: `mapCanonicalToTikTokEvent`, `buildTikTokRequestBody`, `sendTikTokEvent`, `getTikTokTestEventCode`; re-exports `normalizePhoneE164` |
| [src/lib/tracking/providers/tiktok.ts](../../src/lib/tracking/providers/tiktok.ts) | Provider — `loadPixel`, `pixelTrack`, `capiSend` (delegates to `src/lib/tiktok.ts`) |
| [src/utils/tracking/tiktok-helpers.ts](../../src/utils/tracking/tiktok-helpers.ts) | Client-safe: `normalizePhoneE164` (single source of truth), `captureTikTokClickId`, `extractTikTokContext` |
| [src/components/tracking/ConversionPixels.tsx](../../src/components/tracking/ConversionPixels.tsx) | Loads the pixel + captures `ttclid` on mount |
| [src/components/tracking/ConversionPixelsAdvancedMatching.tsx](../../src/components/tracking/ConversionPixelsAdvancedMatching.tsx) | `ttq.identify` on login (independent of the FB block) |
| [src/app/api/tracking/conversion/route.ts](../../src/app/api/tracking/conversion/route.ts) | Enriches `userData.ttclid`/`ttp` from cookies |
| [src/lib/tracking/__tests__/tiktok-capi.test.ts](../../src/lib/tracking/__tests__/tiktok-capi.test.ts) | Unit test — `npm run test:tiktok-capi` |

## Verified API reference (v1.3, 2026-05-22)

Triangulated from working code (Stape GTM tag, a Python wrapper, mParticle, Adobe, Benly) + TikTok's help center. TikTok's portal API reference is a JS SPA and not machine-readable, so these are corroborated by ≥3 independent sources each.

- **Endpoint:** `POST https://business-api.tiktok.com/open_api/v1.3/event/track/`. ("Events API 2.0" = marketing name for this same v1.3 endpoint; batching = multiple objects in `data[]`.)
- **Auth:** header `Access-Token: <token>` + `Content-Type: application/json`. Token is **not** a body field.
- **Body:**
  ```jsonc
  {
    "event_source": "web",
    "event_source_id": "<PIXEL_ID>",   // replaces old top-level pixel_code
    "test_event_code": "<CODE>",        // TOP-LEVEL, testing only — omit in prod
    "data": [{
      "event": "Purchase",
      "event_time": 1747872000,         // Unix SECONDS
      "event_id": "<deterministic id>", // dedup key — same on pixel + server
      "user": {
        "email": "<sha256>", "phone_number": "<sha256>", "external_id": "<sha256>",
        "ttclid": "<raw>", "ttp": "<raw>", "ip": "<raw>", "user_agent": "<raw>"
      },
      "properties": {
        "value": 49.99, "currency": "AUD", "content_type": "product", "order_id": "...",
        "contents": [{ "content_id": "...", "content_type": "product", "quantity": 1 }]
      },
      "page": { "url": "https://..." }
    }]
  }
  ```
- **Hashing (SHA-256 hex, via the shared `hashPII`):** `email` (lowercase+trim), `phone_number` (E.164 first), `external_id`. **Never hash:** `ttclid`, `ttp`, `ip`, `user_agent`.
- **Success:** HTTP 200 **AND** body `code === 0`. `{ code, message, request_id, data }`. A 200 with non-zero `code` is a failure.
- **Dedup:** same `event` name + same `event_id` + same pixel, 48h window; first event wins (server fires after browser; TikTok merges within 5 min).
- **`event_time`:** Unix **seconds**; accepted up to ~7 days old.

## Event naming

`Purchase` is TikTok's current official **web** standard event. TikTok renamed `CompletePayment → Purchase` and recommends `Purchase` for new setups; `PlaceAnOrder` is sunset in 2027. We send `Purchase` on **both** pixel and Events API (identical name + `event_id` is required for dedup). Other standard events we use: `ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `CompleteRegistration` (server-side on all four register branches since 2026-07, sharing the Meta `pixelEventId`), `Subscribe`, `Search`. We also send two **custom** event names server-only (no browser twin): `MembershipUpgrade` / `MembershipDowngrade` (via `sendTikTokServerCustomEvent` in `pixel-purchase-tracking.ts`, same `event_id` as the Meta custom event). ⚠️ TikTok's acceptance of non-standard event names is **unverified against the live API** — on go-live, confirm in Events Manager that these arrive (they are reporting-only signals; TikTok can't optimize on custom names the way it does standard ones).

> The legacy `trackPixelSubscriptionRenewal` still fires TikTok `CompletePayment` (browser-only, renewals are intentionally not deduped/sent to CAPI). Out of scope for this work.

## Match quality — why we don't persist `ttclid` on orders

The money-event Purchase **dual-fires**: the **browser** copy carries `ttclid`/`ttp` (the SDK auto-attaches them) and the **server** copy (Stripe webhook — no browser cookies) carries hashed `email`/`phone_number`/`external_id` + IP. TikTok **merges** the two on the shared `event_id`, so Purchase gets the full signal set without touching the Order model. Funnel events via `/api/tracking/conversion` get `ttclid`/`ttp` directly from cookies server-side.

## Environment variables

In Vercel env (prod) + a gitignored `.env.local` (local). Placeholders are in [`env.example`](../../env.example).

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | Pixel ID — browser pixel + Events API `event_source_id` |
| `TIKTOK_ACCESS_TOKEN` | Events API token (**secret** — never commit) |
| `TIKTOK_TEST_EVENT_CODE` | Routes events to Events Manager → Test Events |
| `TIKTOK_USE_TEST_EVENTS=true` | Use the test code on staging/preview (Vercel runs those as `NODE_ENV=production`) |

Setting `NEXT_PUBLIC_TIKTOK_PIXEL_ID` alone lights up the browser pixel; the Events API additionally needs `TIKTOK_ACCESS_TOKEN`. Both are read lazily per request — no redeploy needed to flip them on.

## Staging verification

1. Set `TIKTOK_TEST_EVENT_CODE` + `TIKTOK_USE_TEST_EVENTS=true` and add the staging host to `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES`.
2. Land with `?ttclid=TEST` → complete a Purchase with a Stripe test card.
3. TikTok Events Manager → **Test Events**: confirm browser + Events-API `Purchase` with the **same `event_id`**, deduped to one, server send `code:0`, and `ttclid`/`ttp` present.
4. Watch Event Match Quality climb toward 7+ over the following days.

## Security

The Events API access token is a secret. It is never written to a committed file. The token shared during this integration's setup should be **rotated** in Events Manager once live (it appeared in a chat transcript).

## Out of scope (follow-ups)

- TikTok **Marketing API insights/ROAS sync** (the admin dashboard) — shell + `TikTokAdInsightsDaily` model exist; sync is a separate spec.
- Persisting `ttclid`/`ttp` on the Order model (covered by the dual-fire merge today).
- Snapchat Conversions API (`capiSend` still a stub — "Spec C").
