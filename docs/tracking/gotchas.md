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
