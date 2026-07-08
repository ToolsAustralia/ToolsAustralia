# Tracking — API

## Endpoints

- **`POST /api/tracking/conversion`** — funnel-event mirror (unauthenticated — it must accept guest traffic). Body is `CanonicalEvent`-shaped, but `eventName` is validated with `mirrorEventNameSchema` from [`src/utils/tracking/mirror-event-names.ts`](../../src/utils/tracking/mirror-event-names.ts) — only `ViewContent` / `AddToCart` / `InitiateCheckout` / `AddPaymentInfo` / `Lead` / `Search`. Value-bearing events (Purchase, Subscribe, …) are **not constructible** here — a forged Purchase would inflate Meta-only revenue; Purchases reach CAPI solely via the Stripe webhook. Client-supplied `eventTime` is untrusted: normalized via `normalizeEpochToUnixSeconds` (ms vs seconds) then clamped by `resolveEventTime` to Meta's accepted window (an out-of-range `event_time` rejects Meta's **entire** `/events` request). Response: `{ ok, results: { facebook, tiktok, snapchat } }`. See [`src/app/api/tracking/conversion/route.ts`](../../src/app/api/tracking/conversion/route.ts). The handler enriches `userData` server-side: session PII (when logged in), Meta `fbc`/`fbp`, TikTok `ttclid`/`ttp` (from cookies via `extractTikTokContext`), and IP/UA from request headers — so the browser mirror doesn't have to ship raw identifiers.
- ~~`POST /api/facebook/track`~~ — **removed 2026-05-12**. Use `POST /api/tracking/conversion`.
- `POST /api/tracking/promo-page-visit` — unchanged.

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/facebook/**` | Meta-specific endpoints |
| _TODO_ | `/api/tracking/**` | Generic tracking |

> _TODO: read [src/app/api/facebook/](../../src/app/api/facebook/) and [src/app/api/tracking/](../../src/app/api/tracking/) and document each handler._

## CAPI user_data field coverage by event

| Event | em | ph | fn/ln | st | db | external_id | ip | ua | fbp | fbc |
|---|---|---|---|---|---|---|---|---|---|---|
| Purchase | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subscribe (initial) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subscribe (upgrade) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subscribe (downgrade) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CompleteRegistration | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

All fields above flow when the corresponding user document has the data populated and the request reaches the helper with a `requestContext`. Empty values are skipped null-safely.

Last verified: 2026-05-14.
