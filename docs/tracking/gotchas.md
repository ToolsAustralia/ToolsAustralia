# Tracking — Gotchas

## Tracking beacons must not block the response (promo-page-visit 504s)

`POST /api/tracking/promo-page-visit` records the visit inside `after()` (Next 15), not on the request's critical path. It previously `await`ed a dedup `findOne` + `recordVisit` inline; under ad-burst traffic, fresh serverless instances racing for Mongo connections (small pool + Atlas new-connection rate limit) stalled long enough to blow the function `maxDuration` → **504** on the beacon (observed in prod, ~4/day). `after()` returns the response immediately and Vercel keeps the function alive for the deferred work — unlike the floating-promise `executeBackgroundJob` helper (`src/utils/webhook/background-jobs.ts`), which can be dropped when the instance freezes, exactly the high-load moment we need the attribution write to survive. **Two limits still apply, so don't over-promise when copying this pattern:** (1) `after()` work is killed at the function's `maxDuration` (10s here via the vercel.json catch-all) — it is *not* unbounded post-response execution; (2) `.maxTimeMS(5000)` on the dedup read bounds **server-side query execution only**, not connection acquisition / server selection (those are bounded by `connectDB`'s own 10s timeouts). Two hardening details that are part of the pattern: the deferred path must call `connectDB()` **before** its first query (mongoose never auto-connects; a bare `findOne` on a cold instance just buffers ~10s and the visit dies silently), and the dedup read **fails open** (a dedup error records the visit anyway — worst case one duplicate row in the 60s window, instead of a silently lost visit). The orchestration (dedup → attribution → persist) is extracted into `recordPromoVisit` (`src/utils/promo-analytics/record-promo-visit.ts`) with its side effects injected as deps, so the route stays a thin shell and the logic is unit-tested without a DB (`npm run test:promo-visit`).

## Adding a new Klaviyo event? Use the canonical schema, not the legacy helper

New Klaviyo events (added after 2026-05-27) use a **canonical property schema** — `price` as a number (not string), `tier` (not `package_tier`), ISO `*_at` timestamps (not locale strings like `"December 22, 2025"`), and properties omitted entirely when absent (no `""` / `"unknown"` sentinels). See the "Canonical property names — new events only (drift containment)" section of [KLAVIYO_INTEGRATION.md](./KLAVIYO_INTEGRATION.md) for the full table and rationale.

**Two helpers, one rule:**
- Legacy events in [klaviyo-events.ts](../../src/utils/integrations/klaviyo/klaviyo-events.ts) (Subscription Started, Placed Order, Subscription Renewal Failed, etc.) — keep using `formatPackageDataForKlaviyo`. They are **frozen** because active Klaviyo flows / templates / segments / campaigns reference their exact property names; renaming silently breaks production.
- NEW events — use `formatCanonicalPackageData`. The snapshot test at `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts` will fail CI if you drift to legacy aliases. Run via `npm run test:klaviyo-canonical`.

If you find yourself wanting to "clean up" legacy property names, **don't**. Read the no-refactor policy in KLAVIYO_INTEGRATION.md first — refactors require explicit user authorization + ads-team confirmation + a dual-write plan.

## Pixel double-fire

If the root-layout pixel fires AND a feature component also fires the same event, you get duplicates in Meta / Klaviyo. Convention: root-layout fires the standard PageView; feature components fire conversion events on user action.

## Pixel-blocked clients

Up to 30%+ of users have ad-blockers / ITP suppressing pixels. Server-side events catch these. Don't trust pixel-only metrics for revenue.

## CSP gotcha

Adding a new pixel requires CSP updates. Otherwise the pixel SDK fails silently. See [security-csp](../security-csp/).

## Stripe metadata 500-char cap on `capi_event_source_url`

Facebook ad referer URLs (long UTMs + `fbclid` + `_aem_` + `brid`) regularly exceed 500 chars. Stripe metadata values are capped at 500 chars per key, so passing the raw `referer` directly into a `subscriptions.create` / `paymentIntents.create` call would reject the entire request with `Metadata values can have up to 500 characters` — meaning the user cannot complete checkout.

All server-side metadata builders run the URL through [`safeEventSourceUrl`](../../src/utils/tracking/event-source-url.ts) before storing it. When the URL is over 500 chars, the helper drops the query/fragment and keeps `origin + pathname` only. That is sufficient for Facebook CAPI's `event_source_url` field; the dropped attribution (fbc, UTMs) is already captured separately under `capi_fbc` and `attr_utm_*` metadata keys.

Anyone wiring a new endpoint that stores a referer / location URL into Stripe metadata must use the same helper. Do not push raw `request.headers.get("referer")` into metadata.

## UTM expiry

`useUTMPersistence` keeps UTMs for the session. _TODO: confirm exact TTL — likely localStorage with stale-after-N-days._ Don't expect UTMs to survive a multi-day signup gap.

## Webhook + API double-fire

(Reinforces [billing-stripe R2](../billing-stripe/rules.md#r2).) Don't fire tracking events from BOTH API path AND webhook for the same conversion. Pick the webhook.

## Migrated stubs

- [Facebook Tracking](../tracking/architecture.md) → _TODO: read root `docs/FACEBOOK_TRACKING_IMPLEMENTATION.md`_
- [GTM Integration](../tracking/architecture.md) → _TODO: read `docs/GTM_INTEGRATION.md`_
- [UTM Attribution](../tracking/architecture.md) → _TODO: read `docs/UTM_ATTRIBUTION.md`_
- [Klaviyo Integration](../tracking/architecture.md) → _TODO: read `src/docs/KLAVIYO_INTEGRATION.md`_
- [Pixel Integration](../tracking/architecture.md) → _TODO: read `src/docs/PIXEL_INTEGRATION.md`_

Read all five and merge content during a refresh pass.

## Both browser and server fbc read `_fbc` cookie first; URL fallback uses `Date.now()`

[`extractFBCFromRequest`](../../src/utils/tracking/facebook-helpers.ts) (server) and [`getFBCFromURL`](../../src/utils/tracking/facebook-helpers.ts) (browser) both read the Facebook Pixel `_fbc` cookie first. Only when no cookie is present do they fall back to building `fb.1.{Date.now()}.{fbclid}` from a URL `?fbclid=…` parameter.

The fallback's timestamp is **the request time, not the click time** — Meta's spec calls for click time. We prefer it over rejecting fbc entirely so cookie-blocked first-touch visitors still contribute partial attribution.

The browser helper was previously *only* using the URL fallback, even when the SDK had already written a canonical `_fbc` cookie. That produced a different `fbc` on every call and caused pixel↔CAPI mismatches. Fixed 2026-05-14.

Important: the fallback is non-deterministic across calls. Any code path that uses the returned fbc in a Stripe idempotency-keyed request body (subscription create) must wrap the call with the [billing-stripe P10 pattern](../billing-stripe/patterns.md#p10-one-shot-idempotency-retry-on-key-collisions). For other CAPI flows (the standard `/api/facebook/*` event endpoints), the drift is harmless.

## Production-hostname gate

Every browser pixel refuses to fire on any hostname not listed in `productionHostnames()`. For all three current providers that means **only** `toolsaustralia.com.au` and `www.toolsaustralia.com.au`. To test pixels in dev/preview, set `NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true` (which `<ConversionPixels disabled />` reads) **and** mock the hostname in your test — there is no global "ignore hostname" override; this is intentional.

## Meta Events Manager: keep "Automatic Advanced Matching" and "Track events automatically" OFF

In Events Manager → Pixel `794467123372847` → Settings, two toggles must stay **Off**:

1. **Automatic Advanced Matching** ("Automatic website matching" — the master toggle plus every per-field sub-toggle: Email, Phone, First/last name, Gender, City/State/ZIP, Country, Date of birth, External ID).
2. **Track events automatically without code** (under "Event setup" — Meta's auto button/form click harvester that emits `SubscribedButtonClick`, `Lead`, etc. from page DOM heuristics).

**Why off, not on:**

- **AM is supplied manually in code.** [ConversionPixelsAdvancedMatching.tsx](../../src/components/tracking/ConversionPixelsAdvancedMatching.tsx) calls `fbq('init', pixelId, AM)` with `buildAdvancedMatching(userData)` after the user authenticates. Every subsequent `fbq('track', …)` automatically carries the nine hashed identity fields (em/ph/fn/ln/ct/st/zp/country/db/external_id) — controlled, post-consent, with the fields we choose. CAPI `user_data` is built server-side in [providers/facebook.ts](../../src/lib/tracking/providers/facebook.ts) the same way. Leaving auto-AM on means Meta *also* scrapes whatever happens to be in form inputs on the page — duplicate, uncontrolled, and active on pages like `/my-account/settings`, `/support`, `/reset-password` that aren't conversion contexts.
- **Auto events pollute event quality.** `SubscribedButtonClick` fires on *every* `<button>` tap (state-tile picks, profession-tile picks, reset, navigation) and ships the button's `innerText` + hashed identity to Meta. It doesn't replace properly modeled funnel events; it just adds noise that depresses EMQ and inflates volume. Our explicit `trackConversion()` calls already cover the events that matter (`Purchase`, `Lead`, `CompleteRegistration`, etc.).
- **Compliance.** Both auto features are the pattern EU/AU regulators have repeatedly flagged as undisclosed data sharing because the user never consented to having form-field PII or button labels exfiltrated on every page interaction.

**What you'd notice if either gets re-enabled:**

Outbound requests to `https://www.facebook.com/privacy_sandbox/pixel/register/trigger/?…&ev=SubscribedButtonClick&cd[buttonText]=…&ud[em]=…&ud[ph]=…` firing on routine clicks across non-conversion pages, including `/my-account/*`. If you see that pattern in DevTools Network, the toggle flipped on the Meta side — fix it in Events Manager, not in code.

**Don't try to compensate in code.** There is no client-side switch to suppress Meta's auto features once they're enabled at the Pixel level; the only off-switch lives in Events Manager.

## Dedup id mapping

Each provider's dedup field has a different name. The canonical `eventId` maps to:
- Facebook: `event_id` (CAPI) / `eventID` (Pixel SDK 4th arg)
- TikTok: `event_id` (Events API) / `event_id` (Pixel SDK 3rd arg)
- Snapchat: `client_dedup_id` (both)

If you grep for `eventID` and find no hits in a provider's code, you're looking at the wrong field name.

## TikTok Events API: easy ways to silently lose data

All verified 2026-05-22 against working code (Stape/mParticle/Adobe) + TikTok help center — see [TIKTOK_EVENTS_API_IMPLEMENTATION.md](./TIKTOK_EVENTS_API_IMPLEMENTATION.md).

- **Success is `code: 0`, not HTTP 200.** TikTok returns 200 with a non-zero `code` on logical failures. `sendTikTokEvent` treats `code !== 0` as failure and logs `code`/`message`/`request_id`. Don't "fix" it to key off `res.ok` alone.
- **`event_time` is Unix SECONDS.** Milliseconds put the event ~50,000 years in the future → dropped. `eventTimeNow()` already returns seconds; don't pass `Date.now()`.
- **Event name must be identical on pixel + Events API**, or dedup double-counts. We use `Purchase` on both. `CompletePayment`/`PlaceAnOrder` are legacy aliases (`PlaceAnOrder` sunsets 2027) — TikTok officially renamed `CompletePayment` → `Purchase`; use `Purchase` for new work.
- **v1.3 uses `data[].user`, NOT `context.user`.** The `context.user` + top-level `pixel_code` + `timestamp` shape is the deprecated v1.2 endpoint. v1.3 is `event_source` + `event_source_id` + `data[].user` + `event_time`.
- **Phone field is `phone_number`** (E.164, then SHA-256) — matches the pixel's `ttq.identify({ phone_number })`. (Some third-party samples use `phone`; we use `phone_number` to match the pixel exactly.)
- **`ttclid`/`ttp`/`ip`/`user_agent` are sent RAW.** Only `email`/`phone_number`/`external_id` are hashed. Hashing the click id breaks matching.
- **`test_event_code` is top-level** (next to `event_source`/`event_source_id`/`data`), not inside `data[]`. Without it, non-prod refuses to send (same guard as Meta).
- **`ttq.identify` auto-hashes.** Pass normalized plaintext (lowercased email, E.164 phone via `normalizePhoneE164`) — do NOT pre-hash, or the SDK double-hashes and the hash won't match the server's.

## Browser-side Purchase pixel must fire from success pages

Historically, only `PaymentSuccessHandler.tsx` fired the browser Purchase pixel — and only on the 3DS-redirect code path. Most purchases skipped that path, so Meta Events Manager saw Purchase as Conversions API only. The success-page clients (`PurchaseSuccessClient`, `UpsellSuccessClient`, `MiniDrawSuccessClient`, `CheckoutSuccessClient`) now each fire `trackConversion` on mount with `eventId === paymentIntentId` so the browser-side fires for every purchase path.

If a new success page is added, it MUST do the same — see `PurchaseSuccessClient.tsx` for the pattern.

## Debug logs are invisible on staging unless you use `console.error`

`next.config.ts` `compiler.removeConsole` strips `console.log` / `info` / `debug` / `warn` from production builds. **Vercel preview / staging deploys are production builds**, so any `console.log("[DEBUG] ...")` you add to diagnose a live tracking issue (like "is my dispatcher being called?", "what does fbq receive?") is stripped from the bundle and never appears in the browser console.

If you've ever stared at a clean staging console wondering why your debug logs aren't appearing, this is why.

**Always use `console.error` for ad-hoc debug logging on staging.** `console.error` is preserved (it's listed in `removeConsole.exclude`). Once you've finished diagnosing, remove the debug logs — they shouldn't ship.

```ts
// ❌ silent on staging (stripped at build time)
console.log("[DEBUG] fb.pixelTrack entered", { eventName, hostname });

// ✅ visible on staging
console.error("[DEBUG] fb.pixelTrack entered", { eventName, hostname });
```

## Provider modules must NOT have `"use client"`

The three provider files — [facebook.ts](../../src/lib/tracking/providers/facebook.ts), [tiktok.ts](../../src/lib/tracking/providers/tiktok.ts), [snapchat.ts](../../src/lib/tracking/providers/snapchat.ts) — are **isomorphic**: server code (Stripe webhook → `trackPixelPurchase` → `sendConversion` → `dispatch.ts`) imports them to call `capiSend()`, and browser code (`ConversionPixels.tsx`) imports them to call `loadPixel()` / `pixelTrack()`.

Tagging these files with `"use client"` **breaks the server-side path silently in production builds.** Next.js's bundler treats `"use client"` modules as client-references when imported from server code — it replaces the actual exports with proxy objects. `provider.enabled` becomes a Reference token instead of a function, and `dispatch.ts:38`'s `provider.enabled()` call throws:

```
TypeError: r.enabled is not a function
  at Array.map (dispatch.ts:36)
```

The bug doesn't surface in dev because Next's RSC boundary is loose in dev mode; it only manifests on Vercel preview / production. We hit this on 2026-05-12 and lost every server-side Purchase event for the staging branch until the directive was removed.

**Rule:** No `"use client"` on `src/lib/tracking/providers/*.ts`. The browser-only branches inside `loadPixel` / `pixelTrack` already guard with `typeof window === "undefined"`, so the modules are safely bundled into both runtimes without the directive.

## Subscription Purchase event_id must override `invoicePaymentId`

The subscription webhook path ([handleInvoicePaymentSucceeded](../../src/app/api/stripe/webhook/route.ts)) keys storage on `invoicePaymentId = "invoice_" + invoice.id` for PaymentEvent idempotency, ledger dedup, and A/B tracking. But the browser-side Purchase pixel fires from [MembershipModal.tsx](../../src/components/modals/MembershipModal.tsx) with the real PaymentIntent id (`pi_…`) as its `event_id`. If the server CAPI sent `invoice_in_…` as `event_id`, Meta would see two distinct Purchase events with the same parameters — its dedup mechanism would not collapse the pair, EMQ would suffer, and the Diagnostics panel would flag "Event deduplication: Not meeting best practices."

Fix: the webhook extracts `expandedInvoice.payment_intent` (string or expanded id) and passes it as `paymentMetadata.trackingOrderId`. [processPaymentBenefitsInternal](../../src/utils/payment/payment-processing.ts) reads that field as a one-off override for the Facebook `orderId` parameter only — every other use of `paymentIntentId` (PaymentEvent storage, ledger writes, retry locks) still sees `invoice_${invoice.id}` and stays idempotent.

**If you add a new subscription-billing webhook path** (e.g., a recovery cron, a backfill script), and you call `processPaymentBenefits` with `invoice_…` as the first arg, you MUST also resolve the underlying PaymentIntent and set `trackingOrderId` on the metadata. Otherwise browser↔server dedup silently breaks for that flow.

## MembershipModal browser Purchase pixel uses `lastChargedStaticPackageIdRef`, not `activePlan.id`

`activePlan.id` is the tier slug ("tradie", "boss", "foreman"). The server CAPI sends `packageId` from the MembershipPackage document ("tradie-subscription", "boss-subscription", …) — these are NOT the same string. Browser-side `content_ids` must use [`lastChargedStaticPackageIdRef.current`](../../src/components/modals/MembershipModal.tsx) (the canonical static package id assigned during `handlePurchaseClick`) for the values to match the server, with `activePlan.id` only as a last-resort fallback.

Both `handlePaymentProcessingSuccess` (existing-user flow) and `handlePaymentSuccess` (new-user autologin flow) must read the same ref. We shipped a Phase 3 regression on 2026-05-12 where `handlePaymentSuccess` used `activePlan.id` directly — browser sent `["tradie"]`, server sent `["tradie-subscription"]`, Meta flagged the dedup mismatch.

## CAPI user_data: raw vs hashed field matrix

Meta's CAPI accepts some `user_data` fields **raw** and others as SHA-256 hashes. Mixing them up silently degrades Event Match Quality with no error.

| Field | Format | Examples |
|---|---|---|
| `em`, `ph`, `fn`, `ln`, `ct`, `st`, `zp`, `country`, `external_id`, `db` | SHA-256 lowercased | `hashPII("nsw")` |
| `fbp`, `fbc`, `client_ip_address`, `client_user_agent` | Raw | `fb.1.1700000000000.AbC123` |

`hashPII` and `prepareUserData` both lowercase-trim before hashing. Pass `"NSW"` and the helper handles normalization. Do not pre-hash any field — that double-hashes it.

## `db` (birthdate) format is `YYYYMMDD`, not ISO

The `db` parameter must be hashed `YYYYMMDD` digits (e.g. `hashPII("19900615")`), **not** ISO `YYYY-MM-DD`. Use `toYYYYMMDD()` from `facebook-helpers.ts` — it accepts `Date` objects, ISO strings, and pre-formatted 8-digit strings, and returns `null` for unparseable input so the caller can skip the field. Wrong format produces no error but silently drops match quality.

## Funnel CAPI events only carry PII if a caller passes `userData`

`fireFunnelEvent` (and `trackInitiateCheckout` / `trackAddPaymentInfo`) forward an optional `userData: MirrorUserData` **only to the CAPI mirror** ([meta-capi-mirror.ts](../../src/utils/tracking/meta-capi-mirror.ts)) — never to the browser pixel. If no caller passes `userData`, the funnel event reaches CAPI with no identity params beyond what the server route enriches from the session/request (so guest/anonymous funnel events have low EMQ until a caller supplies PII). Empty fields are stripped (`stripEmpty` drops `undefined` / `null` / `""`) so a partially-filled `userData` never clobbers the session enrichment the route layers in.
