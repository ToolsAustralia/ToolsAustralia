# Tracking — Backend

## Lib

| File | Role |
|---|---|
| [src/lib/tracking/dispatch.ts](../../src/lib/tracking/dispatch.ts) | `sendConversion(event, ctx)` — server fan-out (CANONICAL) |
| [src/lib/tracking/dispatch-client.ts](../../src/lib/tracking/dispatch-client.ts) | `trackConversion(event)` — browser fan-out |
| [src/lib/tracking/canonical-event.ts](../../src/lib/tracking/canonical-event.ts) | `buildPurchaseEvent`, `hashPII`, `assertValidEvent`, `normalizeEpochToUnixSeconds` (ms-or-seconds epoch → Unix seconds, deterministic `> 1e11` cutoff), `resolveEventTime` (clamps to Meta's accepted event_time window, falls back to "now") |
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

**Purchase `event_time` = payment-success time, not send time (2026-07-08).** `BuildPurchaseEventInput` and `PixelPurchaseParams` accept optional `eventTimeUnixSeconds` (Unix SECONDS the payment actually succeeded); [`buildPurchaseEvent`](../../src/lib/tracking/canonical-event.ts) now sets `eventTime: resolveEventTime(input.eventTimeUnixSeconds)` instead of unconditionally "now". The webhook path ([`payment-processing.ts`](../../src/utils/payment/payment-processing.ts)) passes `normalizeEpochToUnixSeconds(paymentMetadata?.chargedAt ?? paymentMetadata?.created)`: `chargedAt` (ms) is Stripe `event.created` on the `payment_intent.succeeded` paths and invoice `paid_at` on the membership path — deliberately NOT `paymentIntent.created`, which is the PI's creation time and can precede payment (deferred confirm → back-dated conversion). The `created` fallback is **ms** at the webhook call sites but seconds in the legacy default, and the normalizer handles both. `resolveEventTime` clamps to Meta's accepted window (≤7 days past minus a 1h safety margin, +60s future skew) and falls back to "now", so a bad timestamp can only degrade to the pre-fix behavior — never reject the request. Test: `npm run test:purchase-event-time`. See [gotchas.md](./gotchas.md) → "Meta books Purchase at `event_time`".

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

**TikTok parity for tier changes (2026-07).** Both helpers fire `MembershipUpgrade` / `MembershipDowngrade` to Meta as **custom** events — Meta's `Subscribe` standard event is reserved for the *initial* paid start, so firing it on tier changes would pollute the Subscribe optimization signal. TikTok previously received nothing for these: the browser-only `trackTikTokEvent` helper no-ops server-side (`window` undefined). They now also call `sendTikTokServerCustomEvent` ([`pixel-purchase-tracking.ts`](../../src/utils/tracking/pixel-purchase-tracking.ts)), which sends the real TikTok Events API custom event via `tiktokProvider.capiSend` with the **same `event_id`** as the Meta custom event (`upgrade-{subscriptionId}-{pi|ts}` / `downgrade-{subscriptionId}-{ts}`). It no-ops cleanly when TikTok CAPI creds are unset and never throws. The legacy `trackTikTokEvent("Subscribe", …)` call is retained after it purely for the shared param shape (still a server-side no-op).

## CompleteRegistration helper

The pure helper `userDataForRegistration(u)` at `src/utils/tracking/registration-user-data.ts` builds the input passed to `prepareUserData` for `CompleteRegistration` CAPI events. It includes `state` and `birthdate` from the user document so the resulting `user_data` carries hashed `st` and `db` whenever populated. Used by all four `prepareUserData` call sites in `src/app/api/auth/register/route.ts`.

## Routes

- `/api/facebook/**` — Meta-specific endpoints (likely conversions API endpoint or pixel proxy)
- `/api/tracking/**` — generic tracking endpoints

> _TODO: read each handler._

## Server-side attribution resolution (`resolveAtEdge`)

[src/services/attribution/resolveAtEdge.ts](../../src/services/attribution/resolveAtEdge.ts) — single-call glue used by every create-* route handler to resolve the converting platform at request time:

```ts
resolveAttributionAtEdge(request: NextRequest): { decision: ResolveResult; metadata: Record<string, string> }
```

1. Calls `extractClickIdsFromRequest` → paid click signals from request cookies/headers.
2. Calls `readAttributionCookieFromRequest` → UTM data from the attribution cookie.
3. Passes both into `resolveConvertingPlatform` → `ResolveResult`.
4. Converts to Stripe-safe metadata via `buildResolvedAttributionMetadata`.

**Error contract:** if anything throws, returns `{ platform: "direct", confidence: "utm_only" }` with minimal fallback metadata — never propagates an exception into the payment handler.

**Where it is called:** at the top of each create-* route's `POST` handler (or, for routes that fan out into sub-handler functions, at the point where `request` is in scope in `POST` before delegation). The returned `metadata` is spread into the same Stripe metadata object that already contains `buildAttributionMetadata(...)`. This means every subscription, one-time purchase, upsell, mini-draw, and payment-intent creation stamps resolved attribution.

## Historical backfill derivation (`deriveBackfillAttribution`)

[src/services/attribution/deriveBackfillAttribution.ts](../../src/services/attribution/deriveBackfillAttribution.ts) — pure function used by the PaymentEvent historical backfill to assign a `convertingPlatform` to rows that predate click-ID capture.

```ts
deriveBackfillAttribution(row: BackfillSourceRow): {
  convertingPlatform: ConvertingPlatform;
  attributionConfidence: "inferred_backfill";
  isRenewal: boolean;
}
```

**Signal priority:**
1. `utmSource` / `utmMedium` — passed through `normalizeUtmToPlatform`; Klaviyo splits by medium (`email` vs `sms`); unknown sources resolve to `"other"`.
2. `hasMetaAdAttribution` — set when any indexed Meta-shaped ad-id field (attributionAdId / AdsetId / CampaignId) is present on the row; resolves to `"meta"`.
3. No signal → `"direct"`.

**Confidence is always `"inferred_backfill"`** — these rows predate click-ID capture, so live resolver confidence levels (`click`, `utm_only`) never apply.

**`isRenewal`** is derived via `classifyIsRenewal({ billingReason })` — `true` only for `subscription_cycle` without an upgrade/resubscribe flag.

## Persisted-UTM reconciliation (`reconcilePersistedAttribution`)

[src/services/attribution/reconcilePersistedAttribution.ts](../../src/services/attribution/reconcilePersistedAttribution.ts) — pure function that bridges the edge-resolved decision (cookie-only) with the UTM **persisted on the PaymentEvent / user signup** before the converting platform is stamped on the ledger.

```ts
reconcilePersistedAttribution(input: {
  edgePlatform: ConvertingPlatform | null;     // resolveAtEdge result (Stripe `attr_platform`), null when none stamped
  edgeConfidence: AttributionConfidence | null;
  persistedUtmSource?: string;                 // merged session → signup utm_source
  persistedUtmMedium?: string;
  persistedTouchAt?: number | null;            // epoch ms the owned-channel touch happened (session → now, signup → user.createdAt)
  now?: number;                                // epoch ms of the conversion; when provided, enforces the owned-channel recency window
}): { platform: ConvertingPlatform; confidence: AttributionConfidence }
```

**Problem it fixes:** `resolveAtEdge` only sees the request's `_ta_attr` / `_ta_attr_last` cookies. An **owned-channel** (Klaviyo email/SMS) touch captured at **SIGNUP** and persisted on the user (`User.signupAttribution.utmSource/utmMedium`) is structurally invisible to it — so those conversions were stamped `convertingPlatform="direct"` and leaked. That is the exact leak [`scripts/backfill-klaviyo-attribution-cycle.ts`](../../scripts/backfill-klaviyo-attribution-cycle.ts) kept correcting per-cycle.

**Resolution order:**
1. **No edge decision at all** (`edgePlatform` null) → fall back to any recognised persisted UTM via `normalizeUtmToPlatform`, else `direct` (preserves the prior no-metadata fallback).
2. **Edge produced a positive signal** (`!== "direct"`) → trust it (a paid click, OR a recency-winning Klaviyo last-touch — both now win the edge recency race).
3. **Edge `=== "direct"`** → recover a persisted **OWNED-channel** (`klaviyo_email`/`klaviyo_sms`) touch via `normalizeUtmToPlatform` + `isOwnedChannel` — **but only when the touch is within the channel's recency window** (see below). **Paid sources are intentionally NOT recovered** — any in-window paid click OR cookie-visible Klaviyo last-touch already won the recency race at the edge, so an edge `direct` genuinely means "no in-window signal the cookies could see"; we do not resurrect a stale paid UTM.

**Owned-channel recency window (added 2026-06-30):** the recovered owned touch is only credited when it is recent enough to plausibly have driven the purchase, using `windowDaysFor(platform)` from [`platformPriority.ts`](../../src/services/attribution/platformPriority.ts) — **5 days for Klaviyo email/SMS**, the SAME single source of truth the cookie resolver enforces. Recency is checked against the touch's capture time, which the caller supplies:
- UTM captured at **this checkout** (`data.attributionSource === "session"`) → `persistedTouchAt = now` (always in-window).
- UTM carried from **signup** → `persistedTouchAt = user.createdAt`.

Fallbacks: `now` omitted → windowing disabled (legacy / back-compat, always counts); `persistedTouchAt == null` → recency unknown → credited rather than buried; a future touch (`age < 0`, clock skew) → out-of-window → `direct`.

**Why it matters (truthfulness):** a user who signed up via a Klaviyo click months ago, returns with no fresh click, and buys is now correctly `direct` — not Klaviyo. Real prod impact this cycle: the window moved **10 stale-signup rows ($309.99)** from `klaviyo_email` back to `direct`, leaving **3 genuinely-recent Klaviyo conversions ($77.50)**; the earlier non-windowed approach over-credited Klaviyo ~4×.

**Effect:** the LIVE path now matches the backfill's logic, so the per-cycle Klaviyo backfill is **no longer needed going forward** (it remains for correcting already-saved historical rows — see note under "Where it is called"). Tests: `npm run test:reconcile-attribution` ([`reconcilePersistedAttribution.test.ts`](../../src/services/attribution/__tests__/reconcilePersistedAttribution.test.ts)) now covers within / at-boundary / outside-window, session-now, null-touchAt, future-skew, and legacy-no-window.

**Where it is called:** [`payment-processing.ts`](../../src/utils/payment/payment-processing.ts) `processPaymentBenefitsInternal` — it replaced the old `if (!convertingPlatform) normalizeUtmToPlatform(...)` fallback with a `reconcilePersistedAttribution` call fed the edge decision + the persisted signup/checkout UTM (and the `persistedTouchAt` / `now` pair that drives windowing).

**Historical reconcile:** [`scripts/backfill-klaviyo-attribution-cycle.ts`](../../scripts/backfill-klaviyo-attribution-cycle.ts) applies the **same windowed function bidirectionally** to already-saved rows — promoting in-window owned touches to Klaviyo and demoting now-stale ones back to `direct`.

**Domain/referrer-form `utm_source` (data-driven, 2026-06-01):** `normalizeUtmToPlatform` (shared by the live resolver's utm fallback AND this backfill) maps the domain forms real ad traffic actually carries — notably `facebook.com` (7,303 historical paid-CPC rows) plus `m./l./lm./web./business.facebook.com`, `fb.com`, `instagram.com`/`m.`/`l.`, `ig.com` → `meta`; `tiktok.com`/`www.`/`vm.` → `tiktok`; `snapchat.com` → `snapchat`; `googleadservices.com` → `google`. Without these, Meta acquisition revenue was silently bucketed to `other` and understated ROAS. **Organic `google.com` is intentionally NOT mapped** — it would credit organic search to the reserved paid-Google channel.
