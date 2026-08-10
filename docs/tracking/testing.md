# Tracking — Testing

## Suites

| Script | Covers |
|---|---|
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
