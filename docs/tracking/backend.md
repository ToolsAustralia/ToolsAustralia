# Tracking — Backend

## Lib

| File | Role |
|---|---|
| [src/lib/facebook.ts](../../src/lib/facebook.ts) | Meta CAPI server-side event sender |
| [src/lib/facebook-env.ts](../../src/lib/facebook-env.ts) | Env / config split |
| [src/lib/facebook-marketing.ts](../../src/lib/facebook-marketing.ts) | Meta Marketing API (read ad insights) |
| [src/lib/gtm.ts](../../src/lib/gtm.ts) | GTM helpers |
| [src/lib/klaviyo.ts](../../src/lib/klaviyo.ts) | Klaviyo server client (events, profile) |
| [src/lib/utm/](../../src/lib/utm/) | UTM parsing/persistence helpers |

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
