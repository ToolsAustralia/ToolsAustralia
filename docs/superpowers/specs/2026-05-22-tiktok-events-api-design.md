# Spec — TikTok Events API + match-quality (Spec B)

**Date:** 2026-05-22 · **Status:** Draft (awaiting user review) · **Domain:** `tracking`

This is **"Spec B"** anticipated by [`2026-05-11-tracking-provider-registry-design.md`](2026-05-11-tracking-provider-registry-design.md) §"What this unlocks": replace the TikTok provider's stub `capiSend` with a real TikTok **Events API** integration, and add the browser-side match-quality signals that make it worth sending. The pixel side, the dispatcher fan-out, the admin shell, and the insights model already exist.

The goal is parity with what we did for Meta (Pixel ↔ CAPI dual-fire, deduped, high match quality) — without repeating the Meta pain of low Event Match Quality from missing identity signals.

---

## 1. Current state

The unified provider registry (`src/lib/tracking/`) already fans every `CanonicalEvent` out to each provider's pixel (browser) and `capiSend` (server). TikTok is **~70% wired**:

| Piece | Status |
|---|---|
| `loadPixel` — hostname-gated, CSP-nonce, idempotent ([providers/tiktok.ts](../../../src/lib/tracking/providers/tiktok.ts)) | ✅ Done |
| `pixelTrack` with `event_id` dedup (3rd-arg `{ event_id }`) | ✅ Done |
| Pixel mounted in prod via [ConversionPixels.tsx](../../../src/components/tracking/ConversionPixels.tsx) when `NEXT_PUBLIC_TIKTOK_PIXEL_ID` is set | ✅ Done |
| Admin shell + [TikTokAdInsightsDaily.ts](../../../src/models/TikTokAdInsightsDaily.ts) | ✅ Shell only |
| **`capiSend`** | ❌ **Stub returns `false`** — no server call |
| **TikTok env vars** in [.env.example](../../../.env.example) | ❌ Missing |
| **Browser identity (`ttq.identify`)** | ❌ Only Meta has post-login Advanced Matching |
| **`ttclid` / `_ttp` capture** | ❌ `userData.ttclid` exists in the type but nothing populates it; no `ttp` field |

TikTok is currently **fully dark** (no `NEXT_PUBLIC_TIKTOK_PIXEL_ID` in any env). Setting that env var alone lights up the pixel; the Events API additionally needs `TIKTOK_ACCESS_TOKEN` + this spec's `capiSend`.

---

## 2. Verified API reference (TikTok Events API v1.3, 2026)

Authoritative facts this implementation is built on. Verified against TikTok help-center articles + multiple validated partner integrations (Tealium, Amplitude, Adobe, mParticle, Hightouch) on 2026-05-22. The advertiser's setup email matches this (its `callback` field = `ttclid`; its `timestamp` = `event_time`).

- **Endpoint:** `POST https://business-api.tiktok.com/open_api/v1.3/event/track/`. "Events API 2.0" is marketing for this same v1.3 endpoint — there is no separate `/v2.0/` path. Batching = multiple objects in `data[]`.
- **Auth:** header `Access-Token: <token>` + `Content-Type: application/json`. The token is **not** a body field.
- **Body shape:**
  ```jsonc
  {
    "event_source": "web",
    "event_source_id": "<PIXEL_ID>",      // replaces the old top-level pixel_code
    "test_event_code": "<TEST_CODE>",     // top-level, testing only — omit in prod
    "data": [{
      "event": "Purchase",
      "event_time": 1747872000,           // Unix SECONDS (ms => rejected / mis-bucketed)
      "event_id": "<deterministic id>",   // dedup key
      "user": {
        "email": "<sha256>",              // hashed: lowercase+trim then SHA-256 hex
        "phone_number": "<sha256>",       // hashed: E.164 then SHA-256 hex
        "external_id": "<sha256>",        // hashed
        "ttclid": "<raw>",                // NOT hashed
        "ttp": "<raw _ttp cookie>",       // NOT hashed
        "ip": "<raw>",                    // NOT hashed
        "user_agent": "<raw>"             // NOT hashed
      },
      "properties": {
        "value": 149.99, "currency": "AUD",
        "content_type": "product", "order_id": "...",
        "contents": [{ "content_id": "...", "content_type": "product",
                       "content_name": "...", "quantity": 1, "price": 149.99 }]
      },
      "page": { "url": "https://...", "referrer": "https://..." }
    }]
  }
  ```
- **Hashing:** SHA-256 hex of normalized input for **exactly** `email` (lowercase+trim), `phone_number` (E.164 first), `external_id`. Never hash `ip`, `user_agent`, `ttclid`, `ttp`. (Same `hashPII` we use for Meta — identical normalization, so browser `ttq.identify` hashes and server hashes match.)
- **Event name:** CamelCase. **`Purchase`** is the official *web* standard event and the chosen order-completion event (TikTok recommends it when placing an order and paying are simultaneous — our Stripe checkout). Full set we use: `ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `Purchase`, `CompleteRegistration`, `Subscribe`, `Search`. The name **must be identical** on pixel and Events API or dedup fails.
- **Dedup:** TikTok collapses events with the **same event name + same `event_id` + same pixel** within a **48h window**; the server copy should arrive after the browser copy (TikTok merges field data within the first 5 min, then dedups; first event received wins).
- **Success:** HTTP 200 **and** body `code: 0`. A 200 with `code !== 0` is a failure — log `message` + `request_id`. Backoff on HTTP 429.
- **Limits:** `event_time` accepted up to ~7 days old; keep request bodies < ~1 MB.

### 2a. Verification round 2 (2026-05-22) — ambiguities resolved

A second pass confirmed the wire format against **actual code**: the open-source Stape GTM server template ([github.com/stape-io/tiktok-tag](https://github.com/stape-io/tiktok-tag), `template.tpl`), an open-source Python wrapper ([VictorValar/python-tiktok-events-api](https://github.com/VictorValar/python-tiktok-events-api)), mParticle, Benly's 2026 Node guide, Commanders Act, Adobe, plus TikTok's own help center. Findings:

- **`test_event_code` is top-level — CONFIRMED.** The Stape template builds `requestData.test_event_code = testEventCode` at the body root (next to `event_source`/`event_source_id`/`data`), not inside `data[]`. No longer an open question.
- **`data[].user` (NOT `context.user`) — CONFIRMED for v1.3.** The `context.user` + top-level `pixel_code` + `timestamp` shape that appears in some guides is the **deprecated v1.2** endpoint (`/open_api/v1.2/pixel/track/`). Our v1.3 endpoint uses `data[].user` + `event_time` + `event_source_id`. Stape v1.3 code, Benly, and Commanders Act all agree.
- **Phone field is `phone_number` — CONFIRMED.** Matches the pixel's `ttq.identify({ phone_number })`, mParticle, Tealium, Adobe, and the Python wrapper (`User(phone_number='+55...')`). Stape's template uses `phone` — treat that as an accepted alias / outlier; **we send `phone_number`** to match the pixel side exactly.
- **Click ID field is `user.ttclid` for v1.3.** The setup PDF's customer-info param **`callback`** is TikTok's *conceptual* name for the click ID and the **v1.2** key (`context.ad.callback`); the v1.3 `data[].user` key is **`ttclid`** (Stape v1.3 code, Benly, Commanders Act). We send `ttclid`. Do **not** also send `callback` — a possibly-unrecognized field risks rejection on a strict-validating call; verify ttclid capture in Test Events instead.
- **`ttq.identify` auto-hashes — CONFIRMED.** TikTok's pixel SDK SHA-256-hashes `email`/`phone_number` client-side before they leave the browser ([Advanced Matching for Web](https://ads.tiktok.com/help/article/advanced-matching-web)); phone must be international/E.164. We pass **normalized plaintext** (email lowercased/trimmed, phone E.164) to `identify` and let the SDK hash — so the SDK's hash equals our server-side `hashPII` of the same normalized string (dedup-safe). Do **not** pre-hash before `identify`.
- **Event name `Purchase` — CONFIRMED official.** TikTok's "Updated Standard Events" help article states *"CompletePayment renamed to Purchase"* and *"Any new Pixel setup should use … Purchase instead of the legacy names"*; `PlaceAnOrder` is sunset in 2027. `Purchase` and `Subscribe` are both in the current official standard-events list.

**Residual uncertainty (honest):** the only items not verifiable from primary rendered docs (TikTok's portal API reference is a JS SPA that automated fetchers can't read) are now low-risk and covered by the Test-Events staging check: (a) that an extra/unknown user field would be ignored vs rejected — mitigated by sending only confirmed keys; (b) exact `ttclid` key behavior — mitigated by verifying capture in Test Events before relying on it. Everything load-bearing is corroborated by ≥3 independent sources including working code. Confidence: **high**.

---

## 3. Design

### 3.1 Events API sender (mirrors `src/lib/facebook.ts`)

New **`src/lib/tiktok.ts`** — the canonical Events API sender, parallel to `facebook.ts`:

- `hashTikTokData(value)` → reuse `hashPII` (canonical-event) for email/external_id; phone normalized to E.164 first.
- `getTikTokTestEventCode()` → mirror `getFacebookTestEventCode()`; reuse `isProductionPixelEnv()` / `getPixelEnv()` from [facebook-env.ts](../../../src/lib/facebook-env.ts) so non-prod refuses to send without a test code (same guard as Meta).
- `interface TikTokEvent` + `sendTikTokEvent(event)`:
  - reads `NEXT_PUBLIC_TIKTOK_PIXEL_ID` + `TIKTOK_ACCESS_TOKEN`; returns `false` (no fetch) if either missing.
  - builds `{ event_source:"web", event_source_id: pixelId, test_event_code?, data:[event] }`.
  - strips `undefined`/empty fields (reuse the `removeUndefinedAndInvalidFields` helper pattern).
  - POSTs with `Access-Token` header; parses body; **success = `code === 0`**; on failure logs `code`/`message`/`request_id` via `console.error`; never throws.

`tiktokProvider.capiSend(event, ctx)` (in [providers/tiktok.ts](../../../src/lib/tracking/providers/tiktok.ts)) replaces the stub: short-circuit `false` if `!enabled().capi`, map `CanonicalEvent` → `TikTokEvent` (hash PII, pass raw `ttclid`/`ttp`/`ip`/`user_agent`, build `properties.contents` from `customData.contentIds`, `page.url` from `eventSourceUrl`), call `sendTikTokEvent`.

> **New-file justification (CLAUDE.md §4):** isolates payload/HTTP/`code:0` handling, gives a clean `test:tiktok-capi` target, and matches the established `facebook.ts` pattern. Keeps the provider thin. One new lib file + one new helper file (below) + one test.

### 3.2 Browser match quality

- **`ttq.identify` on login:** extend [ConversionPixelsAdvancedMatching.tsx](../../../src/components/tracking/ConversionPixelsAdvancedMatching.tsx) (already has `userData`, hostname gate, and the per-user re-fire guard) to also call `window.ttq.identify({ email, phone_number, external_id })` with normalized plaintext when TikTok is enabled and loaded. Guard on `window.ttq`.
- **`ttclid` + `_ttp` capture:** new **`src/utils/tracking/tiktok-helpers.ts`** (mirrors `facebook-helpers.ts`): `getTikTokClickIdFromURL()` reads `?ttclid=` and persists it to a first-party `ttclid` cookie (7-day, the click-id lifetime); `extractTikTokContext(request)` reads the `ttclid` and `_ttp` cookies server-side. The TikTok pixel SDK already sets `_ttp` and auto-captures `ttclid` for browser events; this exists so the **server** can attach both.
- **Canonical type:** add `ttp?: string` to `CanonicalEvent.userData` ([types.ts](../../../src/lib/tracking/types.ts)) — TikTok-only, read by the TikTok provider only (like `fbp`).
- **Conversion route enrichment:** [/api/tracking/conversion](../../../src/app/api/tracking/conversion/route.ts) calls `extractTikTokContext` and populates `userData.ttclid` / `userData.ttp` (alongside the existing fbc/fbp extraction).

**Why we don't persist `ttclid` on orders:** the money-event Purchase dual-fires — the **browser** copy carries `ttclid`/`ttp` (SDK), the **server** copy (Stripe webhook, no browser cookies) carries hashed PII + IP, and TikTok **merges them on the shared `event_id`**. So Purchase gets the full signal set without touching the Order model. (Persisting on orders is a documented optional follow-up if Purchase EMQ proves low.)

### 3.3 Property parity

Align both surfaces to send a `contents` array + top-level `value`/`currency`/`content_type`/`order_id`:
- `capiSend` builds `properties.contents` from `customData.contentIds`.
- `pixelTrack` ([providers/tiktok.ts](../../../src/lib/tracking/providers/tiktok.ts)) currently sends only singular `content_id` (first id) — extend it to send the same `contents` array so pixel/Events-API parameters match. (Safe: the pixel has never run in prod.) `num_items` is **not** a confirmed TikTok field — use `contents[].quantity`, not a top-level count.

### 3.4 Config, test, docs

- **`.env.example`:** add commented `NEXT_PUBLIC_TIKTOK_PIXEL_ID`, `TIKTOK_ACCESS_TOKEN`, `TIKTOK_TEST_EVENT_CODE` (placeholders only — real values go in Vercel env + a gitignored `.env.local`).
- **Test:** `src/lib/tracking/__tests__/tiktok-capi.test.ts` + `test:tiktok-capi` in package.json. Asserts: payload shape, PII hashing (email/phone/external_id hashed; ip/ua/ttclid/ttp raw), `event_source_id` = pixel id, `code:0` → true / non-zero → false. Stops at the network boundary (no live calls), same as `test:facebook-capi`.
- **Docs:** update `docs/tracking/{architecture,backend,api,gotchas,patterns}.md`; add a focused `docs/tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md`; add `src/lib/tiktok.ts` + `src/utils/tracking/tiktok-helpers.ts` to the CLAUDE.md `tracking` manifest paths; check README.md / BUSINESS.md for a "TikTok coming soon" line to flip to live (conversion tracking only — **not** insights sync).

---

## 4. Phases (each independently shippable + verifiable)

1. **Phase 1 — Events API live.** `src/lib/tiktok.ts`, `capiSend`, env vars, test. *Win:* server-side TikTok Purchase appears in Events Manager → Test Events with the same `event_id` as the browser pixel.
2. **Phase 2 — Match quality.** `ttq.identify` on login, `ttclid`/`_ttp` capture, conversion-route enrichment, `ttp` type. *Win:* EMQ for browser + server events climbs (target 7+).
3. **Phase 3 — Parity + docs.** `contents` parity on both surfaces, all docs, manifest, README/BUSINESS. *Win:* no parameter-mismatch warnings; the integration is documented for the next maintainer.

---

## 5. Out of scope

- TikTok Marketing API **insights/ROAS sync** (lighting up the admin dashboard) — separate follow-up; the shell + model already exist.
- Persisting `ttclid`/`ttp` onto the Order model (covered by the dual-fire merge; revisit only if Purchase EMQ is low).
- Refactoring the legacy `trackPixelSubscription` Subscribe/Unsubscribe path — keeps working as-is; its TikTok renewal fire uses `CompletePayment` intentionally (browser-only, not deduped).
- Snapchat Conversions API (its `capiSend` is also a stub — that's "Spec C").

---

## 6. Verification plan

Per phase, against staging (`TIKTOK_TEST_EVENT_CODE` set + staging host added to `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES`):

1. Trigger one Purchase with a real test card.
2. TikTok **Events Manager → Test Events**: confirm browser + Events-API Purchase appear with the **same `event_id`**, deduped to one, `code:0` on the server send.
3. After Phase 2: confirm EMQ climbs and `ttclid`/`ttp` are present on events from an ad-clicked session (`?ttclid=` in the URL).
4. `npm run test:tiktok-capi`, `npm run test:tracking-dispatch`, `npm run type-check`, `npm run lint` all pass.

**Security:** the access token shared in chat must be **rotated** in Events Manager after go-live (it's in the transcript). It is never written to a committed file.
