# Tracking — Architecture

## Provider registry

All conversion-tracking flows through a single provider registry at [`src/lib/tracking/`](../../src/lib/tracking/). Each platform implements one `ConversionProvider` module under `src/lib/tracking/providers/<platform>.ts`:

| Provider | Pixel id env | Access token env | CAPI status |
|---|---|---|---|
| **Facebook** | `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` | `FACEBOOK_ACCESS_TOKEN` | Live |
| **TikTok** | `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | `TIKTOK_ACCESS_TOKEN` | Pixel + Events API (v1.3) — `capiSend` delegates to [`src/lib/tiktok.ts`](../../src/lib/tiktok.ts). See [TIKTOK_EVENTS_API_IMPLEMENTATION.md](./TIKTOK_EVENTS_API_IMPLEMENTATION.md) |
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
| [src/lib/tiktok.ts](../../src/lib/tiktok.ts) | TikTok Events API (v1.3) server-side |
| [src/utils/tracking/tiktok-helpers.ts](../../src/utils/tracking/tiktok-helpers.ts) | TikTok `ttclid`/`_ttp` capture + `normalizePhoneE164` (client-safe; shared by pixel `identify` and server sender) |
| [src/lib/facebook-env.ts](../../src/lib/facebook-env.ts) | Env config |
| [src/lib/facebook-marketing.ts](../../src/lib/facebook-marketing.ts) | Marketing API (read insights) |
| [src/lib/gtm.ts](../../src/lib/gtm.ts) | GTM helpers |
| [src/lib/klaviyo.ts](../../src/lib/klaviyo.ts) | Klaviyo client |
| [src/lib/tracking/advanced-matching.ts](../../src/lib/tracking/advanced-matching.ts) | `buildAdvancedMatching` — hashes user PII for Meta Advanced Matching using the same `hashPII` helper as server CAPI, guaranteeing identical browser ↔ server hashes |

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

## Single-platform payment attribution (2026-06-01)

### Send ≠ Count principle

The CAPI fan-out (dispatching a purchase event to Meta, TikTok, Snap simultaneously) is **unchanged**. Every enabled platform still receives its pixel/CAPI event. "Send to all platforms" is the signal layer; "attribute to one platform" is the analytics/ledger layer. These two concepts are deliberately decoupled — do not conflate them.

### Durable first-party attribution cookie `_ta_attr`

On landing, the client writes a `_ta_attr` cookie (JSON) to `sessionStorage` with a **90-day** effective TTL (replacing the old 30-minute sessionStorage-only window). The cookie is SameSite=Lax and first-party. It stores the first detected click ID and the UTM tuple captured at landing:

```json
{
  "fbclid": "...",       // or null
  "ttclid": "...",       // or null
  "ScCid": "...",        // or null
  "_fbc": "...",         // Meta-format click reference
  "utm_source": "...",
  "utm_medium": "...",
  "utm_campaign": "...",
  "captured_at": 1748736000000
}
```

The capture registry at `src/lib/tracking/` reads `fbclid` / `_fbc`, `ttclid`, `ScCid` from the landing URL and persists them into `_ta_attr` client-side. Server-side routes read the cookie (and also accept click IDs from the request body for cases where the cookie isn't yet written).

### Click ID capture registry

| Signal | Cookie / param | Platform |
|---|---|---|
| `fbclid` URL param → stored as `_fbc` format | `_ta_attr._fbc` | Meta |
| `ttclid` URL param | `_ta_attr.ttclid` | TikTok |
| `ScCid` URL param | `_ta_attr.ScCid` | Snapchat |
| UTM tuple | `_ta_attr.utm_*` | Klaviyo email / SMS (see note) |

Klaviyo attribution is identified via the UTM tuple `utm_source=klaviyo` + `utm_medium=email|sms` — NOT via `_kx` (see [KLAVIYO_INTEGRATION.md](./KLAVIYO_INTEGRATION.md) attribution section).

### Attribution resolver — priority ladder + recency windows

The resolver lives at `src/services/attribution/`. At the `create-*` route edge (subscription creation, one-time purchase, etc.), it reads the cookie / request body and resolves exactly **one** `convertingPlatform` per payment:

**Priority (highest to lowest):**
1. Paid clicks — click ID present + within recency window: Meta (7d), TikTok (7d), Snapchat (7d)
2. Klaviyo owned — UTM tuple `utm_source=klaviyo` + `utm_medium=email` (5d window) or `utm_medium=sms` (5d window)
3. Google — `utm_source=google` (any medium)
4. Direct — no attribution signals
5. Other — UTM source present but unrecognised

Recency tiebreak: if two click IDs are present (e.g. a user clicked a TikTok ad then a Meta ad), the **most recent** `captured_at` wins.

`attributionConfidence` is set to:
- `click` — a click ID (fbclid / ttclid / ScCid) was the winning signal
- `utm_only` — UTM tuple resolved the platform but no click ID
- `inferred_backfill` — assigned by a backfill script for historical events without signals

### PaymentEvent ledger fields

Three new fields are stamped on every `PaymentEvent` document by the webhook handler after the resolver runs:

| Field | Values | Set by |
|---|---|---|
| `convertingPlatform` | `meta\|tiktok\|snapchat\|klaviyo_email\|klaviyo_sms\|google\|direct\|other` | attribution resolver → Stripe metadata → webhook |
| `attributionConfidence` | `click\|utm_only\|inferred_backfill` | resolver |
| `isRenewal` | `boolean` | `billingReason === "subscription_cycle"` |

### Sticky renewals

The resolver stamps the resolved `convertingPlatform`, `attributionConfidence`, and the click ID / timestamp into Stripe subscription metadata (`attr_platform` / `attr_confidence` / `attr_click_id` / `attr_click_ts`) at subscription creation. The webhook handler reads these from `subscription.metadata` for all subsequent renewal invoices, making attribution sticky across the subscription lifetime — no client-side signal is needed on renewal. The first-purchase attribution carries forward automatically.

## Observability sampling

Speed Insights mounted globally via the [`SpeedInsightsClient`](../../src/components/tracking/SpeedInsightsClient.tsx) Client-Component wrapper, which is itself mounted once from the root layout [`src/app/layout.tsx`](../../src/app/layout.tsx). `sampleRate={0.1}` — beacons 10% of page views. Sufficient for stable Core Web Vitals trends; reduces Vercel Speed Insights data-point billing roughly 10×. A `beforeSend` filter parses each beacon URL and drops any whose pathname starts with `/admin`, so the admin app does not pollute real-user Core Web Vitals percentiles or consume data points (admin perf is not a user-facing concern, and admin traffic is unrepresentative of the public site). Substring matching is deliberately avoided per [Standing Rule R4](../superpowers/plans/2026-05-13-speed-insights-best-practice.md) — query strings, hash fragments, or future public paths containing the literal string `/admin` would otherwise produce false-positive drops. The wrapper file pattern exists per [Standing Rule R7](../superpowers/plans/2026-05-13-speed-insights-best-practice.md): `<SpeedInsights>` is a Client Component, root layout is a Server Component, and React Server Components cannot serialize function props across the boundary — so the `beforeSend` callback has to live inside a `"use client"` file to avoid a runtime error. Vercel Web Analytics (`<Analytics />`) is currently unsampled — see [`docs/superpowers/plans/2026-05-06-vercel-cost-optimization-tier-1.md`](../superpowers/plans/2026-05-06-vercel-cost-optimization-tier-1.md) for follow-up.

Contentsquare UX analytics is loaded via `next/script` with `strategy="afterInteractive"` from [`src/app/layout.tsx`](../../src/app/layout.tsx) — defers execution until after Next is hydrated so it never blocks LCP or competes with the critical render path. Klaviyo and GTM also use `next/script` ([`KlaviyoScriptLoader.tsx`](../../src/components/KlaviyoScriptLoader.tsx), [`GoogleTagManager.tsx`](../../src/components/GoogleTagManager.tsx)).

The same `<head>` also carries a tiny nonce'd inline **theme pre-paint script** (owned by the [theme](../theme/) domain, not tracking): it reads `localStorage` and applies the `dark` class before hydration only for a user-chosen dark — light is the default. It is not a tracking pixel and carries no `data-tracking-pixel` marker; mentioned here only because it shares the nonce and the `<head>` script budget.
