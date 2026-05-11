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

## Routes

- `/api/facebook/**` — Meta-specific endpoints (likely conversions API endpoint or pixel proxy)
- `/api/tracking/**` — generic tracking endpoints

> _TODO: read each handler._
