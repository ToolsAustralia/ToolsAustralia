# Tracking — Gotchas

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

## Dedup id mapping

Each provider's dedup field has a different name. The canonical `eventId` maps to:
- Facebook: `event_id` (CAPI) / `eventID` (Pixel SDK 4th arg)
- TikTok: `event_id` (Events API) / `event_id` (Pixel SDK 3rd arg)
- Snapchat: `client_dedup_id` (both)

If you grep for `eventID` and find no hits in a provider's code, you're looking at the wrong field name.

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
