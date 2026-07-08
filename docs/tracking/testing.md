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
