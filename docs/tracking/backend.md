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

## Repositories

> _TODO: locate any tracking-specific repositories under `src/repositories/`._

## Profile sync (Klaviyo)

`ensureUserProfileSynced(user)` from `klaviyo` lib. Called:
- After signup
- After subscription state changes
- After cancellation (in `CancelSubscriptionService` step 4 of side effects, non-blocking)
- After refund (`trackRefundedOrder` + sync, after a 500ms barrier)

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
