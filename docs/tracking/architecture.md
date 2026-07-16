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

Meta merges the pair on `event_name` + `event_id` within a **48h window** (first-received wins). Because that window is finite, the success pages persist a per-`event_id` "fired" flag in localStorage ([`purchase-pixel-fired-storage.ts`](../../src/utils/tracking/purchase-pixel-fired-storage.ts)) so a revisit >48h after purchase can't re-fire a counted browser Purchase. And because Meta books the conversion at `event_time` (Unix seconds, ≤7 days old — out-of-range rejects the whole `/events` request), Purchase events carry the actual Stripe charge time via `eventTimeUnixSeconds` → `resolveEventTime` ([canonical-event.ts](../../src/lib/tracking/canonical-event.ts)), not the webhook send time. See [gotchas.md](./gotchas.md) for both incidents.

## Missing-credentials safety

When pixel id or access token is absent, the matching surface is a silent no-op: no script tag injection, no `fetch` call, no console-spam, no thrown errors. See [`docs/superpowers/specs/2026-05-11-tracking-provider-registry-design.md`](../superpowers/specs/2026-05-11-tracking-provider-registry-design.md) §8a for the full behavior matrix.

## Files

| Path | Role |
|---|---|
| [src/components/FacebookPixel.tsx](../../src/components/FacebookPixel.tsx) | Legacy FB helper exports only (`trackFacebookEvent` etc.) — the dead never-mounted loader component was removed 2026-07; the live loader is `ConversionPixels` → `facebookProvider.loadPixel` |
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

#### Last-touch companion cookie `_ta_attr_last`

`_ta_attr` is **first-touch** (never overwritten for 90d) — correct for paid clicks, but wrong for **owned channels** (Klaviyo email/SMS). A Klaviyo recipient is a returning user whose first touch is some earlier acquisition source, so a first-touch-only model silently buries every Klaviyo conversion in `direct` (or that earlier source). [`useUTMPersistence`](../../src/hooks/useUTMPersistence.ts) therefore *also* writes a **`_ta_attr_last`** cookie (7-day TTL) on every UTM landing, **always overwriting** so it reflects the most-recent UTM touch. The resolver reads it for the owned-channel step below. (Regression history: live attribution shipped ~2026-06-01 with first-touch-only resolution; Klaviyo conversions leaked to `direct` until this last-touch cookie was added.)

### Click ID capture registry

| Signal | Cookie / param | Platform |
|---|---|---|
| `fbclid` URL param → stored as `_fbc` format | `_ta_attr._fbc` | Meta |
| `ttclid` URL param | `_ta_attr.ttclid` | TikTok |
| `ScCid` URL param | `_ta_attr.ScCid` | Snapchat |
| UTM tuple | `_ta_attr.utm_*` | Klaviyo email / SMS (see note) |

Klaviyo attribution is identified via the UTM tuple `utm_source=klaviyo` + `utm_medium=email|sms` — NOT via `_kx` (see [KLAVIYO_INTEGRATION.md](./KLAVIYO_INTEGRATION.md) attribution section).

### Attribution resolver — unified recency race + fallbacks

The resolver lives at `src/services/attribution/`. At the `create-*` route edge (subscription creation, one-time purchase, etc.), it reads the cookie / request body and resolves exactly **one** `convertingPlatform` per payment.

**Product decision (2026-07): ALL channels compete in ONE recency race — most-recent `capturedAt` wins**, regardless of paid vs owned. Klaviyo owned channels (`klaviyo_email` / `klaviyo_sms`) were **promoted out of the old lower tier** to race on recency at the SAME level as paid clicks, so a more-recent Klaviyo last-touch beats an *older* in-window Meta/TikTok/Snapchat paid click. This measures Klaviyo's true last-touch performance instead of always burying it beneath any in-window paid click. (Previously owned channels were Tier 2 — always outranked by any in-window paid click.)

**Candidates that enter the race** (`resolveConvertingPlatform`):
- **Paid clicks** — click ID present + within window (Meta 7d, TikTok 7d, Snapchat 7d), from the first-touch `_ta_attr` cookie. Confidence `click`.
- **Klaviyo owned — LAST-touch** — UTM tuple `utm_source=klaviyo` + `utm_medium=email|sms` (5d window) from the overwriting **`_ta_attr_last`** cookie, but only when it carries a trustworthy `capturedAt`. Confidence `utm_only`.

The most-recent `capturedAt` across all candidates wins. **On an exact recency TIE, the real paid click (has a click id, confidence `click`) outranks the owned utm-only touch.** A candidate with `capturedAt === null` cannot win the race (its recency can't be trusted) and degrades to the fallbacks below.

**Fallbacks, in order, when no candidate wins the race:**
1. Owned (Klaviyo) last-touch WITHOUT a trustworthy timestamp — still ranks above the durable first-touch cookie (a Klaviyo recipient is a returning user whose first touch is some earlier source), honoring the channel window.
2. First-touch UTM fallback — normalized `_ta_attr.utm_source` (Google `utm_source=google`; Meta domain-forms; or an owned channel that *was* the first touch), honoring its window.
3. Direct — recognised-but-expired, or no attribution signals at all.
4. Other — UTM source present but unrecognised.

Windows are unchanged (paid 7d, Klaviyo 5d) and confidence semantics are unchanged (paid `click`, Klaviyo `utm_only`). The only remaining paid-vs-owned distinction is confidence + resolution source. The `PlatformRule.tier` field was replaced by an `owned: boolean` flag in [`platformPriority.ts`](../../src/services/attribution/platformPriority.ts); `isOwnedChannel()` now reads `owned`.

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
