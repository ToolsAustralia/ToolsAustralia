# Tracking — Testing

## Suites

| Script | Covers |
|---|---|
| `npm run test:klaviyo-canonical` | Canonical Klaviyo event-shape fence ([canonical-events-shape.test.ts](../../src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts)) — the `CANONICAL_KEYS` allowlist plus a snapshot per canonical builder: `Viewed Giveaway`, `Started Checkout`, `Bonus Code Issued`, and (2026-08-26) `Subscription Cancellation Requested`. The cancellation snapshot asserts a **real** `package_name`/`tier` (`"Tradie"`/`"tradie"`, explicitly *not* `"Subscription"`/`"tradie-subscription"`) so the legacy formatter can never creep back in, and a second case proves an unresolvable package **omits** the whole package block instead of emitting a sentinel. Expected values are hardcoded literals, never expressions borrowed from the builder. Also (2026-08-26, fix round 1) pins `had_active_subscription` on `One-Time Package Purchased` — true and false, plus key PRESENCE — deliberately WITHOUT `assertCanonicalShape`, because that event is legacy-shaped (`purchase_date` / `timestamp` / `points_earned`) and re-shaping a live event is banned. Before it, the emit line could be deleted with `tsc` and every suite still green, permanently losing a point-in-time value for every one-time purchase in the gap. Also (2026-09-02) three `is_renewal` fences on `Placed Order`: **(a)** the shop payload from `trackShopPlacedOrder` carries `is_renewal: false` plus key PRESENCE — this suite is what would have caught the 2026-08-27 regression where merchandise shipped with the flag absent, silently excluding every merch sale from the `is_renewal = 0` "Marketing Revenue" metric; **(b)** `createPlacedOrderEvent` emits `true` when told and `false` when the arg is omitted, never `undefined` — before this, `grep is_renewal` over `*.test.ts` returned **zero hits**, so the original flag was as deletable as the shop one; **(c)** a deliberately crude source-read asserting `finalizeShopOrder` still *calls* `trackShopPlacedOrder`, because every other assertion pins the payload built *inside* the function and none of them notices if the call disappears. The shop case stubs the `@/lib/klaviyo` singleton via `require.cache` (`require`, never `await import` — under tsx a dynamic import bypasses the cache) and asserts stub identity as a hard gate before emitting, so a failed stub install can never become a live write to production Klaviyo. All three were mutation-tested on the way in. |
| `npm run test:facebook-capi` | Meta CAPI event sender (lives in [src/lib/__tests__/](../../src/lib/__tests__/)) — now also asserts the canonical provider hashes `birthdate` → `db` (`YYYYMMDD` format). |
| `npm run test:tracking-dispatch` | Provider-registry dispatch fan-out + hostname gating ([src/lib/tracking/__tests__/dispatch.test.ts](../../src/lib/tracking/__tests__/dispatch.test.ts)) |
| `npm run test:advanced-matching` | `buildAdvancedMatching` PII hashing + normalization parity with server `hashPII` ([src/lib/tracking/__tests__/advanced-matching.test.ts](../../src/lib/tracking/__tests__/advanced-matching.test.ts)) |
| `npm run test:purchase-event-time` | Purchase `event_time` = charge time: `eventTimeUnixSeconds` passthrough, ms-epoch normalization (`normalizeEpochToUnixSeconds`), out-of-window fallback to "now" (`resolveEventTime`) ([src/lib/tracking/__tests__/purchase-event-time.test.ts](../../src/lib/tracking/__tests__/purchase-event-time.test.ts)) |
| `npm run test:purchase-pixel-fired` | Success-page localStorage re-fire guard — mark/has, storage-failure degradation, 30-day prune ([src/utils/tracking/__tests__/purchase-pixel-fired-storage.test.ts](../../src/utils/tracking/__tests__/purchase-pixel-fired-storage.test.ts)) |
| `npm run test:mirror-event-names` | Funnel-mirror `eventName` allowlist (`MIRROR_EVENT_NAMES` / `mirrorEventNameSchema`) ([src/utils/tracking/__tests__/mirror-event-names.test.ts](../../src/utils/tracking/__tests__/mirror-event-names.test.ts)) |
| `npm run test:tiktok-capi` | Pure mapping/shaping: `normalizePhoneE164`, `mapCanonicalToTikTokEvent`, `buildTikTokRequestBody` ([src/lib/tracking/__tests__/tiktok-capi.test.ts](../../src/lib/tracking/__tests__/tiktok-capi.test.ts)) |
| `npm run test:tiktok-capi-guards` | **`sendTikTokEvent`'s refusals** (2026-07-24, panel F-009) — zero-network, stubs `globalThis.fetch` and asserts no request escapes: missing creds · non-prod without `TIKTOK_TEST_EVENT_CODE` (would pollute PRODUCTION reporting) · missing/blank `event_id` (the browser↔CAPI dedup key) · HTTP 200 with body `code !== 0` (**TikTok reports failure in the BODY**) · unparseable body · transport error returns `false` not a throw · prod omits the test code unless `TIKTOK_USE_TEST_EVENTS=true` ([tiktok-capi-guards.test.ts](../../src/lib/tracking/__tests__/tiktok-capi-guards.test.ts)) |

- `npm run test:facebook-emq` — `src/utils/tracking/__tests__/facebook-emq.test.ts`. Stubs `global.fetch` and asserts that `trackPixelSubscriptionUpgrade`, `trackPixelSubscriptionDowngrade`, and `trackPixelSubscription` all emit `user_data` containing hashed `st`/`db` plus raw `client_ip_address`/`client_user_agent` when the helpers receive populated user fields + requestContext. Also tests the pure `userDataForRegistration` helper from `src/utils/tracking/registration-user-data.ts`, and the cookie-first behavior of the browser `getFBCFromURL`.

## Pixel testing guide

(Migrated from `src/docs/PIXEL_TESTING_GUIDE.md` — _TODO: read root file and merge._)

Brief: use Facebook Pixel Helper (browser extension), GTM debug mode, and Meta Events Manager Test Events tab to verify pixel + CAPI parallel firing.

## Manual smoke

- Visit `/test-pixels/` (dev page) — fires test events for each provider
- Verify in:
  - Facebook Events Manager (test events tab)
  - GTM debug mode
  - Klaviyo profile activity
  - TikTok Events Manager

## `npm run test:utm-storage` (2026-08-10)

Pins the split between the two UTM reads in
[`utm-storage.ts`](../../src/utils/tracking/utm-storage.ts), because they answer different
questions and confusing them is silent and expensive:

| Read | Source | Answers | Feeds |
|---|---|---|---|
| `getStoredUTMParams()` | prefers the 90-day **first-touch** `_ta_attr` cookie | "which campaign originally won this customer" | purchase attribution (`MembershipModal`), `useAttribution`, affiliate, Klaviyo |
| `getSessionUTMParams()` | sessionStorage **only**, 30-min expiry | "what drove **this** visit" | Contentsquare `traffic_source` dynamic variable |

The load-bearing assertion sets the cookie to `facebook.com` and sessionStorage to `tiktok`,
then requires `getStoredUTMParams` to still say **facebook.com** and `getSessionUTMParams` to
say **tiktok**. If that ever flips, purchase attribution starts crediting the wrong campaign,
or the Contentsquare channel comparison over-credits whichever campaign ran first — neither
fails loudly.

Also covers expiry (a 31-minute-old entry is dropped *and* removed), malformed JSON, a missing
`capturedAt`, empty-input writes, and that a tampered `packages_focus` is validated rather than
passed through.

Written when `getSessionUTMParams` was extracted out of `getStoredUTMParams` — that function is
on the revenue path and had no test at all, so these assertions exist mainly to prove the
extraction did not change what the purchase flow sees.
