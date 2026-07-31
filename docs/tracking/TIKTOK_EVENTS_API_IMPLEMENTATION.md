# TikTok Pixel + Events API — Implementation

**Status:** Implemented 2026-05-22 (pending production enablement + staging verification). **Domain:** `tracking`.

TikTok conversion tracking runs through the same provider registry as Meta ([architecture.md](./architecture.md)): a browser **Pixel** and a server-side **Events API (v1.3)** call sharing one `event_id` so TikTok deduplicates them. This doc is the field-level reference; design rationale is in [`docs/superpowers/specs/2026-05-22-tiktok-events-api-design.md`](../superpowers/specs/2026-05-22-tiktok-events-api-design.md).

## 2026-07-24 hardening (panel review F-009 / F-020 / F-022 / F-025)

- **Transport.** `sendTikTokEvent` uses `resilientFetch` from [`src/lib/http/outbound.ts`](../../src/lib/http/outbound.ts) (keep-alive-bounded dispatcher + bounded retry — 5s per attempt, 2 retries), matching `src/lib/facebook.ts`. Retry is safe precisely because TikTok dedups on `event_id`. Transport failures now log `describeFetchError`'s undici cause code instead of an opaque `fetch failed`. It previously used raw `fetch`, exposing it to the frozen-serverless dead-socket race (`UND_ERR_SOCKET`) that `outbound.ts` exists to fix.
- **Guards are under test.** `npm run test:tiktok-capi-guards` ([tiktok-capi-guards.test.ts](../../src/lib/tracking/__tests__/tiktok-capi-guards.test.ts), zero-network — stubs `globalThis.fetch`) pins every refusal: missing creds · non-prod without `TIKTOK_TEST_EVENT_CODE` (would pollute PRODUCTION reporting) · missing/blank `event_id` (the dedup key — omitting it double-counts) · HTTP 200 with body `code !== 0` (**TikTok signals failure in the BODY, not the status**) · unparseable body · transport error returns `false` rather than throwing. Also pins that production sends WITHOUT a test code unless `TIKTOK_USE_TEST_EVENTS=true`.
- **Page views use `ttq.page()`, not `track("PageView")`.** TikTok's standard page view is `ttq.page()`; routing it through `ttq.track("PageView", …)` registers a *custom* event of that name instead. `tiktokProvider.pixelTrack` now translates the registry's canonical `PageView` into `ttq.page()`, so SPA route changes count as real page views (previously only the initial load did, via the `loadPixel` bootstrap). The translation lives in the provider so `ConversionPixels` stays provider-agnostic and nothing double-fires.
- **Renewals are never sent.** `trackPixelSubscriptionRenewal` ([pixel-purchase-tracking.ts](../../src/utils/tracking/pixel-purchase-tracking.ts)) is now an explicit, documented no-op. Its old body built a payload and called the browser-only `trackTikTokEvent` from a **server** context (Stripe webhook), so it never sent anything — while its docstring claimed renewals were "tracked to TikTok/Klaviyo for internal analytics". Renewals must not be reported as ad-platform conversions: that inflates revenue and corrupts ROAS. The function is kept as the seam for future first-party internal analytics; deleting it would mean editing the Stripe webhook handler for zero behavioral gain.

## 2026-07-31 Event Match Quality fixes

Events Manager reported **Click ID 0% on every server event** (while the browser pixel reported
82%), **External ID 1% on InitiateCheckout and 0% on AddPaymentInfo**, **Purchase IP/UA 85%**,
and browser page views at EMQ 46–47 with External ID 3%. Four independent causes:

- **The click-id cookie barely existed server-side.** Its only writer was a **post-hydration
  client effect** (`captureClickIds` → `captureTikTokClickId`), so every visitor who bounced,
  blocked JS, or converted before hydration produced requests with no click id at all. Meta's
  `_fbc` has three independent sources including a server-side URL fallback; TikTok had one.
  **[`src/middleware.ts`](../../src/middleware.ts) now mints the cookie on the landing document
  request**, with zero dependence on JS running, and `extractTikTokContext` gained a
  `?ttclid=`-on-`request.url` fallback. The client capture remains as the belt-and-braces path
  for client-side navigations that never hit middleware.
- **Cookie-name collision.** TikTok's own pixel SDK writes a first-party cookie **also named
  `ttclid`**, at host scope, while ours was `Domain=.toolsaustralia.com.au` — two different
  cookies of one name, both sent on every request, with `cookies.get()` returning whichever the
  browser happened to list first. Ours is now **`ta_ttclid` / `ta_ttclid_ts`** (matching the
  repo's `ta_anon_id` / `_ta_attr` vocabulary); the bare names are still **read** as a fallback
  so in-flight cookies and the SDK's own copy still count. TTL 7d → **90d** (TikTok recommends
  ≥28d; internal attribution is unaffected — the resolver independently caps TikTok clicks at
  7 days via `windowDays` in `platformPriority.ts`).
- **Guest events had no stable identifier.** `external_id` was only ever `User._id`, set inside
  the session block — but InitiateCheckout fires before registration logs anyone in, and
  AddPaymentInfo fires from a card form with no user id at all.
  [`/api/tracking/conversion`](../../src/app/api/tracking/conversion/route.ts) now falls back to
  the **existing** `ta_anon_id` anonymous visitor id (`anon_<uuidv4>`, minted per visitor in
  middleware, 90-day TTL) — reusing that id rather than minting a second visitor identity.
  `User._id` still wins whenever a session exists. TikTok explicitly sanctions a first-party
  cookie id as `external_id`. The visitor's `external_id` therefore changes at signup
  (`anon_<uuid>` → `User._id`); the existing `/api/ab-testing/merge-user` bridge already links
  the two, so the identities do not fragment.
- **The browser pixel never identified anyone anonymous.** `ttq.identify` only ran for
  authenticated users, and even for members it ran long after `loadPixel` had already fired
  `ttq.page()`. `loadPixel` now calls `ttq.identify({ external_id })` with the anonymous id
  **before** the initial `ttq.page()` (the deferred-queue proxies are FIFO, so ordering holds).
  It reads **`ta_anon_id_pub`** — a browser-readable **mirror** of the same value; `ta_anon_id`
  itself stays `httpOnly` because it is the authoritative A/B assignment identity.

**Structural fix that closes the whole bug class:** `RequestContext` carried `ttclid`/`ttp` at
runtime (every payment route spreads `extractTikTokContext` into it) but
`mapCanonicalToTikTokEvent` read them **only** from `event.userData`, so they were silently
discarded — invisible to `tsc`. `RequestContext` now declares optional `fbc`/`fbp`/`ttclid`/
`ttp`/`scid`/`referrer`, and providers resolve `userData.X ?? ctx.X` (the same `??` pattern
already used for `ip`/`user_agent`).

### What "Click ID 0%" actually means — read this before chasing it again

Verified against **production** on 2026-07-31, and it is not what it looks like. The `ttclid`
cookie **does** reach the server; it is not dead. Last 30 days:

| Signal | Meta | TikTok |
|---|---|---|
| `PaymentEvent` resolved by **click id** (`attributionConfidence: "click"`) | 2,020 | **29** |
| Signups with `signupAttribution.clickPlatform` | 251 | **6** |

29 click-attributed TikTok payments against the ~45 purchases TikTok itself reported for the same
window is roughly 65–70% capture — a working cookie, not a broken one.

**The 0% is a denominator effect.** We send `Purchase` / `InitiateCheckout` / `AddPaymentInfo` /
`CompleteRegistration` for **all** traffic, and TikTok is ~0.5% of conversions (29 of 5,719
payments in 30d). A Meta visitor and a direct visitor have **no TikTok click id in existence** —
nothing in this codebase can manufacture one. 29/5,719 displays as 0%.

**So click-id coverage on server events cannot be driven to 90% by code** while Meta dominates
spend. It rises only if TikTok's share of traffic rises. The fixes above are still worth having —
they make sure a TikTok-sourced conversion reliably *carries* its click id — but they move the
**count**, not the **percentage**.

The levers that genuinely move the displayed EMQ on those four events are **External ID**
(0–1% → ~100%, applies to every visitor regardless of source) and **IP / user agent**
(85% → ~100% on Purchase). Those are the ones to watch.

> Browser events show a much higher click-id figure (82% on `Pageview`) than server events. The
> two denominators evidently differ — 82% of all page views could not possibly be TikTok-sourced
> at this spend level. TikTok does not document how the browser figure is computed, so **do not
> compare the browser and server percentages directly**; they are not the same measurement.

**Two cookie-encoding invariants** — get these wrong and the value silently corrupts:
Next's `ResponseCookies.set` percent-**encodes** on write and `RequestCookies` **decodes** on
parse. So middleware passes the value **raw**, the client writer **must** encode (because
`document.cookie` is raw), the server read **must not** decode, and only `document.cookie`
readers decode. Both writers also share `TTCLID_COOKIE_DOMAIN` — a host-scoped and a
`Domain=`-scoped cookie of one name are two cookies, which is the exact bug the rename removed.

`?ttclid=` is length-validated (`isPlausibleTtclid`, 256 chars) before being persisted, because
it flows unvalidated into Stripe metadata as `capi_ttclid` and Stripe **fails the entire API
call** on any metadata value over 500 characters.

## Files

| File | Role |
|---|---|
| [src/lib/tiktok.ts](../../src/lib/tiktok.ts) | Events API v1.3 sender: `mapCanonicalToTikTokEvent`, `buildTikTokRequestBody`, `sendTikTokEvent`, `getTikTokTestEventCode`; re-exports `normalizePhoneE164` |
| [src/lib/tracking/providers/tiktok.ts](../../src/lib/tracking/providers/tiktok.ts) | Provider — `loadPixel` (incl. anonymous `ttq.identify` before the first `ttq.page()`), `pixelTrack`, `capiSend` (delegates to `src/lib/tiktok.ts`) |
| [src/utils/tracking/tiktok-helpers.ts](../../src/utils/tracking/tiktok-helpers.ts) | Client- AND edge-safe (no `node:`/crypto imports — middleware imports it): the `ta_ttclid` cookie contract, `normalizePhoneE164` (single source of truth), `captureTikTokClickId`, `extractTikTokContext`, `extractTikTokCapturedAt`, `readBrowserCookie`, `isPlausibleTtclid` |
| [src/middleware.ts](../../src/middleware.ts) | **Primary** writer of `ta_ttclid`/`ta_ttclid_ts` (from `?ttclid=` on the landing request) and of `ta_anon_id_pub` |
| [src/components/tracking/ConversionPixels.tsx](../../src/components/tracking/ConversionPixels.tsx) | Loads the pixel + fallback `ttclid` capture on mount |
| [src/components/tracking/ConversionPixelsAdvancedMatching.tsx](../../src/components/tracking/ConversionPixelsAdvancedMatching.tsx) | `ttq.identify` on login — overrides the anonymous `external_id` with `User._id` (independent of the FB block) |
| [src/app/api/tracking/conversion/route.ts](../../src/app/api/tracking/conversion/route.ts) | Enriches `userData.ttclid`/`ttp` from cookies; resolves `externalId` = session `User._id` else `ta_anon_id` |
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
        "email": "<sha256>", "phone": "<sha256>", "external_id": "<sha256>",
        "first_name": "<sha256>", "last_name": "<sha256>", "zip_code": "<sha256>",
        "city": "goldcoast", "state": "qld", "country": "au",   // PLAINTEXT, lowercased
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
- **Phone key is `phone`, NOT `phone_number`.** `phone_number` is the v1.2 name *and* the pixel's `ttq.identify` name; v1.3 silently ignores unknown `user` keys, so sending it drops the parameter with no error anywhere except EMQ coverage. See [gotchas.md](./gotchas.md).
- **Hashing (SHA-256 hex, via the shared `hashPII`):** `email` (lowercase+trim), `phone` (E.164 first), `external_id`, `first_name` / `last_name` / `zip_code` (lowercase, all whitespace stripped). **Plaintext (lowercase, alphanumerics only):** `city`, `state`, `country`. **Never hash:** `ttclid`, `ttp`, `ip`, `user_agent`.
- **Success:** HTTP 200 **AND** body `code === 0`. `{ code, message, request_id, data }`. A 200 with non-zero `code` is a failure.
- **Dedup:** same `event` name + same `event_id` + same pixel, 48h window; first event wins (server fires after browser; TikTok merges within 5 min).
- **`event_time`:** Unix **seconds**; accepted up to ~7 days old.

## Event naming

`Purchase` is TikTok's current official **web** standard event. TikTok renamed `CompletePayment → Purchase` and recommends `Purchase` for new setups; `PlaceAnOrder` is sunset in 2027. We send `Purchase` on **both** pixel and Events API (identical name + `event_id` is required for dedup). Other standard events we use: `ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `CompleteRegistration` (server-side on all four register branches since 2026-07, sharing the Meta `pixelEventId`), `Subscribe`, `Search`. We also send two **custom** event names server-only (no browser twin): `MembershipUpgrade` / `MembershipDowngrade` (via `sendTikTokServerCustomEvent` in `pixel-purchase-tracking.ts`, same `event_id` as the Meta custom event). ⚠️ TikTok's acceptance of non-standard event names is **unverified against the live API** — on go-live, confirm in Events Manager that these arrive (they are reporting-only signals; TikTok can't optimize on custom names the way it does standard ones).

> The legacy `trackPixelSubscriptionRenewal` still fires TikTok `CompletePayment` (browser-only, renewals are intentionally not deduped/sent to CAPI). Out of scope for this work.

## Match quality — how `ttclid` reaches the webhook-fired Purchase

The money-event Purchase **dual-fires**: the **browser** copy carries `ttclid`/`ttp` (the SDK auto-attaches them), and the **server** copy fires from the Stripe webhook, which has **no browser cookies**. TikTok does merge the two on the shared `event_id` — but relying on that alone meant the server copy went out with no click id whenever the browser copy was blocked or lost, which is exactly the case CAPI exists to cover. TikTok's own EMQ panel flagged it ("increase your click ID coverage to over 90%").

So the click id rides through **Stripe metadata**, on the same channel Meta's already used:

1. Payment-creation routes read the cookies at request time — `{ ...extractRequestContext(request), ...extractTikTokContext(request) }` — and write `capi_ttclid` / `capi_ttp` into the PaymentIntent/Subscription metadata beside `capi_fbc` / `capi_fbp`.
2. The webhook's `extractRequestContextFromMetadata` reads them back into `requestContext`.
3. `trackPixelPurchase` puts them on `userData.ttclid` / `userData.ttp`, where only the TikTok provider reads them (same way `fbc`/`fbp` are Meta-only).

Routes wired: `create-subscription`, `create-subscription-existing-user`, `create-one-time-purchase`, `create-one-time-purchase-existing-user`, `upsell/purchase`, `mini-draw/purchase`, and — added 2026-07-31 — `renew-subscription`, `create-payment-intent`, `upgrade-subscription-payment`, `downgrade-subscription`. **A new payment-creation route must add those metadata keys** or its Purchase loses the click id *and* its IP/user agent. Nothing is persisted on the Order/User model — Stripe metadata is the whole hand-off. Funnel events via `/api/tracking/conversion` still read `ttclid`/`ttp` straight from cookies server-side.

The last four were the **Purchase IP/UA 85%** gap: `trackPixelPurchase` runs only from the Stripe
webhook (`actionSource: "system_generated"`), where there is no live request, so IP/UA can *only*
arrive through metadata. `renew-subscription`'s create-new branch mints a fresh subscription whose
first invoice is `subscription_create`, so it does produce a Purchase — the route's own comment
calls it "a conversion, not a renewal".

> **Caveat on `create-payment-intent`:** it passes an `idempotencyKey`. Added metadata applies to
> new intents; a replayed key returns the *original* object, metadata included.
> **Caveat on `_ttp`:** the SDK writes it asynchronously, so a fast checkout can stamp
> `capi_ttclid` without `capi_ttp`. Conditional spreads mean absent values are omitted, never
> stamped as the string `"undefined"`.

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
4. Watch Event Match Quality climb over the following days — but read the denominator note above before judging click-id coverage.

## Dashboard settings (confirmed ON, 2026-07-31)

Events Manager → **Privacy and safety**:

- **Automatic Advanced Matching (AAM)** — enabled, sharing Email, Phone number, Name, Address,
  External ID. AAM harvests identity from **form fields the visitor actually fills in**, so it
  cannot lift email/phone coverage on anonymous page views — a visitor who never types an email
  has nothing to harvest. This is why `Pageview` / `LandingPageView` / `EngagedSession` sit at
  ~4% email / ~4% phone: **that is the structural ceiling for anonymous traffic, not a defect.**
  The one lever that *does* apply to every anonymous visitor is `external_id`, which is why the
  pixel now identifies them with the `ta_anon_id` value before the first `ttq.page()`.
- **Allow first-party cookies** — enabled. Required for the pixel's own `_ttp` / click-id storage.
- **Allow enhanced data postback** — enabled.

Because AAM is already on, it is **not** an available remedy for the low top-of-funnel scores.
Don't re-recommend it.

## Security

The Events API access token is a secret. It is never written to a committed file. The token shared during this integration's setup should be **rotated** in Events Manager once live (it appeared in a chat transcript).

## Out of scope (follow-ups)

- TikTok **Marketing API insights/ROAS sync** (the admin dashboard) — shell + `TikTokAdInsightsDaily` model exist; sync is a separate spec.
- Persisting `ttclid`/`ttp` on the Order model (covered by the dual-fire merge today).
- Snapchat Conversions API (`capiSend` still a stub — "Spec C").
