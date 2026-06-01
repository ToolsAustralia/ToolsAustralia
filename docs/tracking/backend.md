# Tracking — Backend

## Lib

| File | Role |
|---|---|
| [src/lib/tracking/dispatch.ts](../../src/lib/tracking/dispatch.ts) | `sendConversion(event, ctx)` — server fan-out (CANONICAL) |
| [src/lib/tracking/dispatch-client.ts](../../src/lib/tracking/dispatch-client.ts) | `trackConversion(event)` — browser fan-out |
| [src/lib/tracking/canonical-event.ts](../../src/lib/tracking/canonical-event.ts) | `buildPurchaseEvent`, `hashPII`, `assertValidEvent` |
| [src/lib/tracking/registry.ts](../../src/lib/tracking/registry.ts) | `getAllProviders()` |
| [src/lib/tracking/providers/facebook.ts](../../src/lib/tracking/providers/facebook.ts) | Facebook provider — wraps `sendFacebookEvent` and `fbq` |
| [src/lib/tracking/providers/tiktok.ts](../../src/lib/tracking/providers/tiktok.ts) | TikTok provider — pixel + Events API (`capiSend` delegates to `src/lib/tiktok.ts`) |
| [src/lib/tracking/providers/snapchat.ts](../../src/lib/tracking/providers/snapchat.ts) | Snapchat provider — pixel works; CAPI stub |
| [src/lib/facebook.ts](../../src/lib/facebook.ts) | Underlying Meta CAPI implementation (wrapped by facebookProvider) |
| [src/lib/tiktok.ts](../../src/lib/tiktok.ts) | Underlying TikTok Events API v1.3 sender (wrapped by tiktokProvider) — payload builders + `sendTikTokEvent` |
| [src/lib/facebook-env.ts](../../src/lib/facebook-env.ts) | Env / config |
| [src/lib/klaviyo.ts](../../src/lib/klaviyo.ts) | Klaviyo server client (NOT a CAPI provider) |

## Utils

[src/utils/tracking/](../../src/utils/tracking/), [src/utils/integrations/](../../src/utils/integrations/), [src/utils/meta/](../../src/utils/meta/), [src/utils/utm/](../../src/utils/utm/) — pure helpers.

## Services

[src/services/meta/](../../src/services/meta/) — Meta-specific service code:

- **MetaInsightsSyncService** — `syncDateRange()` downloads ad-level daily insights from Meta and bulk-upserts into `MetaAdInsightsDaily`. As of 2026-05-27 it also calls `fetchAdsetMetadata` once per ad-account per sync run and denormalizes `linkClicks`, `adsetBudgetCents`, `campaignObjective`, `learningStatus`, and `lastSignificantEdit` onto each upserted row.
- **runMetaSpendByUrlSync** — end-to-end orchestrator: insights → ad destinations → landing-page aggregates. Delegates to `MetaInsightsSyncService`, `MetaAdDestinationService`, and `SpendByUrlAggregationService` in sequence.
- **MetaAdDestinationService** — resolves landing-page URLs for each ad ID via the Graph API creative endpoint.

[src/services/facebook-ads-health/](../../src/services/facebook-ads-health/) — Facebook Ads Health diagnostic services:

- **accountTrueRoasService** (`computeAccountTrueRoas`) — computes account-level TRUE ROAS by comparing local `PaymentEvent` revenue (non-renewal `BenefitsGranted` events) against Meta Insights spend and purchase revenue for a given date range. Returns `localRevenueAud`, `metaSpendAud`, `metaPurchaseRevenueAud`, `metaPurchaseConversions`, `ratioLocalOverMetaSpend` (TRUE ROAS proxy), `ratioMetaOverLocal` (Meta attribution ratio), and an `error` field if Meta was unreachable. Called by `GET /api/admin/facebook-ads/purchase-audit` and available for reuse by future health-insight routes.

## Repositories

> _TODO: locate any tracking-specific repositories under `src/repositories/`._

## Profile sync (Klaviyo)

`ensureUserProfileSynced(user)` from `klaviyo` lib. Called:
- After signup
- After subscription state changes
- After cancellation (in `CancelSubscriptionService` step 4 of side effects, non-blocking)
- After refund (`trackRefundedOrder` + sync, after a 500ms barrier)

## Marketing preference sync (Klaviyo)

`syncKlaviyoEmailMarketingFromAdminPreference(user, wantsPromotionalEmail)` in `src/utils/integrations/klaviyo/klaviyo-profile-sync.ts` synchronises both email and SMS marketing consent to Klaviyo when an admin (or the cancellation flow via `applyMarketingUnsubscribe`) changes `User.acceptsPromotionalEmail`.

**Email path** — unchanged: `unsubscribeFromEmailList` / `subscribeToEmailList` keyed off `user.email`.

**SMS unsubscribe path** — when `wantsPromotionalEmail === false`:
- If `User.mobile` is present the E.164 phone is derived locally (fast path, unchanged).
- If `User.mobile` is absent the function calls `klaviyo.findProfilePhoneByEmail(user.email)` to resolve the phone Klaviyo holds on the profile (same `/profiles/?filter=equals(email,…)` endpoint), then calls `unsubscribeFromSMSList` with that phone. This fixes a pre-existing bug (authored 2026-04-08) where SMS unsubscribe silently no-oped when no local mobile existed, leaving Klaviyo-side SMS consent as "Subscribed".
- If neither source yields a phone, the function logs a `console.error` and performs a graceful no-op for SMS — email unsubscribe still completes and no exception is thrown (best-effort contract preserved for all callers).

**SMS subscribe path** — unchanged: only fires when local `phoneE164` is present.

**Callers unaffected**: `RetentionUnsubscribeService` (`applyMarketingUnsubscribe`), admin user route, and registration sync all call the same function with unchanged signatures and return shapes.

## Meta CAPI events

Fired server-side from purchase / cancel / signup paths. Parallel to client-side pixel for redundancy.

## TikTok Events API (v1.3)

`tiktokProvider.capiSend` maps the `CanonicalEvent` to a TikTok event and POSTs via [`sendTikTokEvent`](../../src/lib/tiktok.ts) to `https://business-api.tiktok.com/open_api/v1.3/event/track/`. Key rules (verified — see [TIKTOK_EVENTS_API_IMPLEMENTATION.md](./TIKTOK_EVENTS_API_IMPLEMENTATION.md)):

- **Auth header** `Access-Token`; body `{ event_source:"web", event_source_id:<pixelId>, test_event_code?, data:[{ event, event_time, event_id, user, properties, page }] }`. `event_time` is **Unix seconds**.
- **Success = HTTP 200 AND body `code === 0`** — a 200 with non-zero `code` is a failure. Never throws (returns `false`).
- **Hashed (SHA-256, via the shared `hashPII`)**: `user.email` (lowercase+trim), `user.phone_number` (E.164 first), `user.external_id`. **Raw**: `user.ttclid`, `user.ttp`, `user.ip`, `user.user_agent`.
- **Match signals**: the funnel route [`/api/tracking/conversion`](../../src/app/api/tracking/conversion/route.ts) reads `ttclid` (first-party cookie set on ad-click landing by [`captureTikTokClickId`](../../src/utils/tracking/tiktok-helpers.ts)) and `_ttp` (the pixel's own cookie) via `extractTikTokContext`. The browser pixel also auto-attaches both; on the dual-fired Purchase, TikTok **merges** the browser copy (ttclid/ttp) with the server copy (hashed PII + IP) on the shared `event_id`.
- **Identity**: [`ConversionPixelsAdvancedMatching`](../../src/components/tracking/ConversionPixelsAdvancedMatching.tsx) calls `ttq.identify({ email, phone_number, external_id })` on login; the SDK hashes client-side using the SAME normalization (`normalizePhoneE164`, lowercase email) as the server, so hashes match.
- **Event name**: `Purchase` (TikTok's current official web event — `CompletePayment` is the legacy alias). The pixel and Events API MUST send the identical name + `event_id` or dedup fails.

## Subscribe-family helpers thread `requestContext`

`trackPixelSubscriptionUpgrade` and `trackPixelSubscriptionDowngrade` both accept an optional `requestContext?: { client_ip_address?; client_user_agent?; fbc?; fbp?; event_source_url? }` parameter. Route handlers in `src/app/api/stripe/upgrade-subscription-payment/` and `src/app/api/stripe/downgrade-subscription/` build this via `extractRequestContext(request)` (from `@/utils/tracking/facebook-helpers`) and pass it through. The helpers attach `client_ip_address` and `client_user_agent` raw onto `user_data` so Meta receives the request-time IP and UA.

Both helpers also accept `userPhone`, `userFirstName`, `userLastName`, `userState`, `userBirthdate`, `userZipCode` so the resulting CAPI event carries hashed `ph`/`fn`/`ln`/`st`/`db`/`zp`. Pass them from the in-scope User document fields (`user.mobile`, `user.firstName`, `user.lastName`, `user.state`, `user.birthdate`). Note: the User model has no `postCode`/`zipCode` field today, so `userZipCode` is unused in practice.

## CompleteRegistration helper

The pure helper `userDataForRegistration(u)` at `src/utils/tracking/registration-user-data.ts` builds the input passed to `prepareUserData` for `CompleteRegistration` CAPI events. It includes `state` and `birthdate` from the user document so the resulting `user_data` carries hashed `st` and `db` whenever populated. Used by all four `prepareUserData` call sites in `src/app/api/auth/register/route.ts`.

## Routes

- `/api/facebook/**` — Meta-specific endpoints (likely conversions API endpoint or pixel proxy)
- `/api/tracking/**` — generic tracking endpoints

> _TODO: read each handler._
