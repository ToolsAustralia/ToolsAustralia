# Tracking — Backend

## Lib

| File | Role |
|---|---|
| [src/lib/tracking/dispatch.ts](../../src/lib/tracking/dispatch.ts) | `sendConversion(event, ctx)` — server fan-out (CANONICAL) |
| [src/lib/tracking/dispatch-client.ts](../../src/lib/tracking/dispatch-client.ts) | `trackConversion(event)` — browser fan-out |
| [src/lib/tracking/canonical-event.ts](../../src/lib/tracking/canonical-event.ts) | `buildPurchaseEvent`, `hashPII`, `assertValidEvent` |
| [src/lib/tracking/registry.ts](../../src/lib/tracking/registry.ts) | `getAllProviders()` |
| [src/lib/tracking/providers/facebook.ts](../../src/lib/tracking/providers/facebook.ts) | Facebook provider — wraps `sendFacebookEvent` and `fbq` |
| [src/lib/tracking/providers/tiktok.ts](../../src/lib/tracking/providers/tiktok.ts) | TikTok provider — pixel works; CAPI stub |
| [src/lib/tracking/providers/snapchat.ts](../../src/lib/tracking/providers/snapchat.ts) | Snapchat provider — pixel works; CAPI stub |
| [src/lib/facebook.ts](../../src/lib/facebook.ts) | Underlying Meta CAPI implementation (wrapped by facebookProvider) |
| [src/lib/facebook-env.ts](../../src/lib/facebook-env.ts) | Env / config |
| [src/lib/klaviyo.ts](../../src/lib/klaviyo.ts) | Klaviyo server client (NOT a CAPI provider) |

## Utils

[src/utils/tracking/](../../src/utils/tracking/), [src/utils/integrations/](../../src/utils/integrations/), [src/utils/meta/](../../src/utils/meta/), [src/utils/utm/](../../src/utils/utm/) — pure helpers.

## Services

[src/services/meta/](../../src/services/meta/) — Meta-specific service code (likely insights aggregation).

[src/services/facebook-ads/FacebookAdsInsightsService.ts](../../src/services/facebook-ads/FacebookAdsInsightsService.ts) — orchestrates Facebook Marketing API insight fetches for the admin dashboard. Resolves AEST date range (today / yesterday / custom), calls `fetchFacebookInsights` (from `src/lib/facebook-marketing.ts`), aggregates per-row metrics into a summary, and converts monetary fields from cents to dollars before returning the response payload for `/api/admin/facebook-ads/insights`. The fetcher is injectable via the constructor for testing — see `__tests__/FacebookAdsInsightsService.test.ts` (npm: `test:facebook-ads-insights-service`).

## Repositories

> _TODO: locate any tracking-specific repositories under `src/repositories/`._

## Profile sync (Klaviyo)

`ensureUserProfileSynced(user)` from `klaviyo` lib. Called:
- After signup
- After subscription state changes
- After cancellation (in `CancelSubscriptionService` step 4 of side effects, non-blocking)
- After refund (`trackRefundedOrder` + sync, after a 500ms barrier)

## Post-draw profile reset (Klaviyo)

When a new MajorDraw activates, draw-specific user properties on the Klaviyo side need to be reset and recomputed. The orchestration lives in [src/utils/integrations/klaviyo/klaviyo-draw-reset.ts](../../src/utils/integrations/klaviyo/klaviyo-draw-reset.ts) (it predates the services layer and is also called from cron / migrations). Read-side access — for the admin preview UI and for Norm's `klaviyo.draw-reset.*` tools — goes through the thin wrapper [src/services/klaviyo/klaviyoDrawResetService.ts](../../src/services/klaviyo/klaviyoDrawResetService.ts):

- `getKlaviyoDrawResetPreview()` — returns `{ targetDraw, cutoffDate, totalUsers, totalParticipants, skippedUsers, reductionPercentage, sampleUsers }`. Does not perform a sync.
- `getKlaviyoDrawResetProgress()` — returns the in-memory progress object for an in-flight manual sync, or `null` when none is running. **Per-process**: on Vercel, a different Lambda will see `null` even while a sync is running on another instance.

The actual reset (`resetDrawPropertiesForAllUsers`) is still invoked from the existing trigger flows and is not wrapped by the read-tier service.

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

## Subscribe-family helpers thread `requestContext`

`trackPixelSubscriptionUpgrade` and `trackPixelSubscriptionDowngrade` both accept an optional `requestContext?: { client_ip_address?; client_user_agent?; fbc?; fbp?; event_source_url? }` parameter. Route handlers in `src/app/api/stripe/upgrade-subscription-payment/` and `src/app/api/stripe/downgrade-subscription/` build this via `extractRequestContext(request)` (from `@/utils/tracking/facebook-helpers`) and pass it through. The helpers attach `client_ip_address` and `client_user_agent` raw onto `user_data` so Meta receives the request-time IP and UA.

Both helpers also accept `userPhone`, `userFirstName`, `userLastName`, `userState`, `userBirthdate`, `userZipCode` so the resulting CAPI event carries hashed `ph`/`fn`/`ln`/`st`/`db`/`zp`. Pass them from the in-scope User document fields (`user.mobile`, `user.firstName`, `user.lastName`, `user.state`, `user.birthdate`). Note: the User model has no `postCode`/`zipCode` field today, so `userZipCode` is unused in practice.

## CompleteRegistration helper

The pure helper `userDataForRegistration(u)` at `src/utils/tracking/registration-user-data.ts` builds the input passed to `prepareUserData` for `CompleteRegistration` CAPI events. It includes `state` and `birthdate` from the user document so the resulting `user_data` carries hashed `st` and `db` whenever populated. Used by all four `prepareUserData` call sites in `src/app/api/auth/register/route.ts`.

## Routes

- `/api/facebook/**` — Meta-specific endpoints (likely conversions API endpoint or pixel proxy)
- `/api/tracking/**` — generic tracking endpoints

> _TODO: read each handler._
