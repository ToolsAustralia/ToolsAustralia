# Facebook Pixel + Conversions API Implementation

This doc describes how Meta tracking actually works in this codebase. Keep it in sync with code.

## Architecture: hybrid Pixel + CAPI

Purchase events fire from **both** the browser Pixel and the server-side Conversions API, deduplicated by `event_id` per Meta's [dedup spec](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/). All other events (CompleteRegistration, AddToCart, ViewContent, Lead, InitiateCheckout, AddPaymentInfo) fire from the browser Pixel only, except CompleteRegistration which also has a server-side CAPI path.

```
Payment success (Stripe webhook)
    ↓
processPaymentBenefits() → grantBenefits()
    ↓
trackPixelPurchase()  ──→  Meta CAPI       (server, event_id = paymentIntentId)
                       ──→  TikTok Pixel    (client only, fires from useEffect)
                       ──→  Klaviyo         (client only, "Placed Order")

3DS / payment success UI
    ↓
trackPurchaseWithEventId()  ──→  Meta Pixel  (browser, eventID = paymentIntentId, 4-arg fbq)
```

Browser Pixel and CAPI Purchase share `paymentIntentId` as the deduplication key. Meta merges them in Events Manager.

## Graph API version

Set in one place — `src/lib/facebook.ts` as `FB_GRAPH_API_VERSION`. Currently `v23.0`.

Meta deprecates Graph API versions ~2 years after the next version is released. When a version expires, calls are auto-routed to the next available version, which is unstable. Track Meta's [versioning changelog](https://developers.facebook.com/docs/graph-api/changelog/versions) and bump when the current version is within 6 months of its expiry date.

Note: `src/lib/facebook-marketing.ts` uses Graph API `v21.0` for the Marketing Insights API (ad spend / ROAS reporting). That is a separate concern — bumping it can change response shapes for the `actions` field. Currently safe through ~Oct 2026. Bump separately and verify ROAS reporting still matches before/after.

The Marketing API client now requests `inline_link_clicks` on the daily (`fetchFacebookAdInsightsDaily`), account/campaign/adset (`fetchFacebookInsights`), and hourly (`fetchFacebookInsightsHourly`, `fetchHourlyInsightsForEntity`) insight endpoints. The parsed value is exposed as `linkClicks: number` in `ProcessedInsightMetrics` and `HourlyInsightData`. Derived `linkCtr` (linkClicks/impressions×100) and `linkCpc` (spend/linkClicks) are computed alongside the existing `ctr`/`cpc` (which use Clicks All).

The hourly endpoints (`fetchFacebookInsightsHourly`, `fetchHourlyInsightsForEntity`, `fetchFacebookInsightsHourlyFiltered`) also request `actions` and parse `landing_page_view` from the actions array. This is exposed as `lpv: number` on `HourlyInsightData` and `HourlyInsightItem`. If Meta returns an empty actions array for a given hour, `lpv` defaults to 0 (graceful degradation).

The legacy "Ads" view in `FacebookAdsManagement.tsx` surfaces **Link Clicks / Link CTR / Cost per Link Click** (based on `inline_link_clicks`) instead of Clicks(All)/CTR/CPC in the Hourly Breakdown table, the Campaign/Ad Set/Ad Breakdown table, and the summary MetricCards. The `clicks` (Clicks All) field is still fetched and stored but no longer displayed in this view. The Hourly Breakdown table also shows an **LPV** column (immediately after Impressions) sourced from the `landing_page_view` action type.

## Event inventory

Standard Meta events and where they fire:

| Event | Browser Pixel | CAPI | Dedup key | Notes |
|---|---|---|---|---|
| `PageView` | ✓ (init script + route effect) | ✗ | n/a | Gated off internal routes via `shouldTrackRoute()`. Pixel-only by design — per-page CAPI hit isn't worth the load. |
| `ViewContent` | ✓ (4-arg fbq) | ✓ (via `/api/tracking/conversion` mirror) | per-fire UUID (hybrid) | Product / mini-draw pages. Hybrid via `usePixelTracking().trackViewContent` → `fireMetaHybridEvent`. |
| `AddToCart` | ✓ (4-arg fbq) | ✓ | per-fire UUID (hybrid) | Hybrid via same hook + helper. |
| `InitiateCheckout` | ✓ (4-arg fbq) | ✓ | per-fire UUID (hybrid) | Fires on `MembershipModal` checkout intent. `/checkout` mock page does NOT fire (shop not live). |
| `AddPaymentInfo` | ✓ (4-arg fbq) | ✓ | per-fire UUID (hybrid) | Currently no caller — wired in the hook ready for the real shop launch. |
| `Lead` | ✓ (4-arg fbq) | ✓ | per-fire UUID (hybrid) | Contact form. |
| `CompleteRegistration` | ✓ (4-arg fbq) | ✓ | `pixelEventId` (server-generated, round-tripped) | Server CAPI in `register/route.ts`, client Pixel in `MembershipModal.tsx`. |
| `Purchase` | ✓ (4-arg fbq, `action_source=website`) | ✓ (`action_source=system_generated`) | `paymentIntentId` | Hybrid via dedicated Purchase path (not the hook). CAPI `event_time` = actual Stripe charge time via `eventTimeUnixSeconds` (see Hard rule 6). |

Custom events (Meta accepts any name; they show up in Events Manager and are usable for audiences):

| Event | Browser Pixel | CAPI | Dedup key | Fired by |
|---|---|---|---|---|
| `MembershipUpgrade` | ✗ (server-only) | ✓ (`action_source=website`) | `upgrade_<paymentIntentId>` | `/api/stripe/upgrade-subscription-payment` |
| `MembershipDowngrade` | ✗ (server-only) | ✓ (`action_source=website`) | `downgrade_<subscriptionId>_<epochSec>` | `/api/stripe/downgrade-subscription` |

**Why not `Subscribe` for tier changes:** Meta's [standard event spec](https://www.facebook.com/business/help/402791146561655) defines `Subscribe` as the *initial* paid subscription start. Firing it on every tier change pollutes the Subscribe optimization signal.

**Why not `Unsubscribe`:** it's not a Meta standard event. Cancellation tracking isn't currently wired — if you need it, build a Custom Event (e.g. `MembershipCancellation`) following the same pattern as `sendMembershipTierChangeEvent` in `pixel-purchase-tracking.ts`.

**Renewals (Stripe `billingReason: "subscription_cycle"`):** explicitly NOT sent to Meta. See `trackPixelSubscriptionRenewal`.

## EventID (deduplication) format

For Purchase: `event_id = paymentIntentId`. Used identically on browser (4-arg fbq) and server (CAPI `event_id` top-level field).

For CompleteRegistration: `event_id = generateEventID("registration", userId)` — the server generates it and returns it as `pixelEventId` in the API response so the client can use the same value.

Per Meta's spec, the client MUST pass eventID as the **4th argument** to `fbq.track`:

```ts
window.fbq("track", "Purchase", customData, { eventID: paymentIntentId });
```

Embedding `eventID` inside the 3rd-arg customData object does **not** participate in dedup. This is enforced in `trackPurchaseWithEventId()` and (as of Phase 2) `trackFacebookEvent()`.

## Renewal handling

Subscription renewals (Stripe `billingReason === "subscription_cycle"`) are **excluded** from Meta tracking entirely. Renewals are not new conversions and should not pollute the Purchase optimization signal. See `trackPixelSubscriptionRenewal()` in `src/utils/tracking/pixel-purchase-tracking.ts` — it tracks only TikTok and Klaviyo, never Meta.

This is a deliberate policy choice (Meta does not explicitly forbid renewals as Purchase events). The trade-off: Meta sees first-month revenue only, not LTV. We chose this to keep the conversion signal aligned with new-customer acquisition.

## Match Quality (EMQ)

Hashed user_data sent to CAPI (server-side only):
- `em` (email), `ph` (phone, digits-only), `fn`, `ln`, `ct`, `st`, `zp`, `country`, `external_id` — all SHA-256 hashed via `prepareUserData()` in `src/utils/tracking/facebook-helpers.ts`.

Plaintext fields (do NOT hash):
- `client_ip_address`, `client_user_agent`, `fbc`, `fbp`.

`extractRequestContext()` in the same file pulls these from the incoming `NextRequest`. Always pass `requestContext` through to `trackPixelPurchase()` from API routes / webhooks.

## Routes that do NOT fire ambient PageView events

`PageView` / `ttq.page()` / Klaviyo `"Viewed Page"` are suppressed on:
- `/admin/**` — internal staff use
- `/my-account/**` — authenticated dashboard
- `/affiliate/**` — affiliate portal
- `/test-pixels`, `/dev/**` — internal tooling

Conversion events (Purchase, CompleteRegistration) still fire even if triggered from one of these routes — the gate is for the ambient "every navigation = new event" loop only. If you add a new excluded prefix, update `src/utils/tracking/should-track-route.ts` AND the literal `excludedPrefixes` array inside the FB Pixel and TikTok Pixel inline init scripts (those run before React hydration and can't import the helper).

**GTM:** the GTM container script loads on every route (we can't easily gate the script itself without breaking the dataLayer for downstream tags). To suppress GTM tags on internal routes, configure a **trigger filter** in the GTM UI excluding pathnames matching `^/(admin|my-account|affiliate|test-pixels|dev)(/|$)`. This is operations work, not code.

Implementation: `shouldTrackRoute(pathname)` helper in `src/utils/tracking/should-track-route.ts`.

## Hard rules

1. **Use one constant for Graph API version** — `FB_GRAPH_API_VERSION` in `src/lib/facebook.ts`. Do not hardcode.
2. **EventIDs must be deterministic per logical event** — Purchase uses paymentIntentId; CompleteRegistration uses the server-generated id round-tripped via API response. Never use `Date.now()` for an event_id that needs to dedup with a different process.
3. **fbc must use click-capture time, not event-send time** — see `getFBCFromURL()` (Phase 4 fix).
4. **Server-initiated events use `action_source: "system_generated"`** — Stripe webhooks have no live browser session. Only checkout-flow client-side fires use `"website"`. (Phase 4 fix.)
5. **No new event without updating this doc** — every new event_name belongs in the inventory table above.
6. **Purchase `event_time` is the charge time, not the send time** — pass `eventTimeUnixSeconds` (Stripe charge `created` / invoice `paid_at`, Unix SECONDS) into `buildPurchaseEvent` / `trackPixelPurchase`. Meta books the conversion at `event_time`, so defaulting to "now" shifts pre-midnight purchases into the next day's reporting whenever the webhook lands after midnight. `resolveEventTime` clamps out-of-window values (Meta accepts ≤7 days past; out-of-range rejects the whole `/events` request) and falls back to "now". (2026-07-08 fix.)
7. **The `/api/tracking/conversion` mirror only accepts the funnel allowlist** — `MIRROR_EVENT_NAMES` in `src/utils/tracking/mirror-event-names.ts` (ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Lead, Search). The endpoint is unauthenticated; never add value-bearing events (Purchase / Subscribe / StartTrial) to the allowlist.

## Common bugs to watch for

- Adding `eventID` to the 3rd-arg customData instead of the 4th-arg options object → no dedup, doubled event counts.
- Hardcoding `v18.0` (or any version string) somewhere other than the constant → silent rollover to next-available version when Meta deprecates.
- Calling `trackFacebookEvent` server-side expecting it to fire → it's a no-op (checks `typeof window`). Use `sendFacebookEvent` instead.
- Hashing `fbc` or `fbp` → breaks click attribution. They must be sent plaintext.
- Putting `+`, spaces, or dashes in phone numbers before hashing → match fails.
- Passing a **millisecond** epoch (`Date.now()`, `paymentIntent.created * 1000`) as `event_time` → far-future value, Meta rejects the **entire** `/events` request. Route timestamps through `normalizeEpochToUnixSeconds` + `resolveEventTime` (`src/lib/tracking/canonical-event.ts`).

## The hybrid pattern (reusable for TikTok / Snapchat)

The Meta hybrid Pixel+CAPI flow converges on a single shape that every other ad platform integration should mirror:

```
1. Browser fires Pixel: fbq('track', 'EventName', customData, { eventID: STABLE_ID })
2. Browser POSTs to:    /api/tracking/conversion { eventName, eventId: STABLE_ID, customData }
                        (eventName must be in the MIRROR_EVENT_NAMES allowlist; /api/facebook/track was removed 2026-05-12)
3. Server enriches:     user_data (hashed PII from NextAuth session) + fbc/fbp/IP/UA from request
4. Server fires CAPI:   sendConversion → facebookProvider ({ event_id: STABLE_ID, ... action_source: "website" })
5. Meta dedupes browser + server events by event_name + event_id within 48h (first-received wins).
```

For TikTok and Snapchat, the same `STABLE_ID` flows:

- **TikTok**: `ttq.track('CompletePayment', { ..., event_id: STABLE_ID })` (already wired in `trackTikTokEvent` after Phase 5) + future TikTok Events API server call with same `event_id`.
- **Snapchat**: `snaptr('track', 'PURCHASE', { transaction_id: STABLE_ID })` + Snap CAPI with `event_id: STABLE_ID`.

The hook layer (`usePixelTracking`) is the single touchpoint — components call `trackViewContent(...)` etc. once, and the hook fans out to all platforms with the shared ID. To add Snapchat: extend the platforms array in the hook, add a Snap call site in each method.

## When to use `fireMetaHybridEvent` vs the existing Purchase / Registration paths

- **`fireMetaHybridEvent` (`src/utils/tracking/meta-hybrid.ts`)** — use for funnel events (ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Lead, Search). Generates a per-fire UUID. Already wired into `usePixelTracking` — components just call the hook.
- **`trackPurchaseWithEventId` + `trackPixelPurchase` (Purchase only)** — uses `paymentIntentId` as the deterministic event_id. Server-initiated via Stripe webhook with `action_source: "system_generated"`.
- **Register API + `MembershipModal`'s `trackFacebookEvent("CompleteRegistration", { eventID })`** — server generates `pixelEventId`, returns it in API response, client uses the same ID for Pixel fire.

Don't reach for `fireMetaHybridEvent` when there's a dedicated path with a real primary key. The Purchase and CompleteRegistration paths use stable IDs that are recoverable from data — UUIDs aren't.

## References

- [Meta Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Event Deduplication](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/)
- [Customer Information Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters/)
- [fbp / fbc Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc)
- [Graph API Versioning](https://developers.facebook.com/docs/graph-api/changelog/versions)
- [Pixel Standard Events](https://www.facebook.com/business/help/402791146561655)
