# Tracking — API

## Endpoints

- **`POST /api/tracking/conversion`** — funnel-event mirror (unauthenticated — it must accept guest traffic). Body is `CanonicalEvent`-shaped, but `eventName` is validated with `mirrorEventNameSchema` from [`src/utils/tracking/mirror-event-names.ts`](../../src/utils/tracking/mirror-event-names.ts) — only `ViewContent` / `AddToCart` / `InitiateCheckout` / `AddPaymentInfo` / `Lead` / `Search`. Value-bearing events (Purchase, Subscribe, …) are **not constructible** here — a forged Purchase would inflate Meta-only revenue; Purchases reach CAPI solely via the Stripe webhook. Client-supplied `eventTime` is untrusted: normalized via `normalizeEpochToUnixSeconds` (ms vs seconds) then clamped by `resolveEventTime` to Meta's accepted window (an out-of-range `event_time` rejects Meta's **entire** `/events` request). Response: `{ ok, results: { facebook, tiktok, snapchat } }`. See [`src/app/api/tracking/conversion/route.ts`](../../src/app/api/tracking/conversion/route.ts). The handler enriches `userData` server-side: session PII (when logged in), Meta `fbc`/`fbp`, TikTok `ttclid`/`ttp` (from cookies via `extractTikTokContext`), and IP/UA from request headers — so the browser mirror doesn't have to ship raw identifiers.
- ~~`POST /api/facebook/track`~~ — **removed 2026-05-12**. Use `POST /api/tracking/conversion`.
- `POST /api/tracking/promo-page-visit` — unchanged.
- **`POST /api/tracking/promo-prize-build`** (added 2026-07-27) — attaches the prize a visitor
  assembled in "Build your prize" (`PrizeShowcase`, via the
  [`usePrizeBuildTracking`](../../src/hooks/usePrizeBuildTracking.ts) beacon — see
  [promo/frontend.md](../promo/frontend.md#build-tracking-beacon--useprizebuildtracking-2026-07-27))
  to the `PromoAnalyticsVisit` row created on landing. No auth; keyed by the `ta_anon_id` cookie via
  `AnonymousIdService.extractAnonymousId`. Body (Zod, `promoPrizeBuildSchema`): `slug` (the LANDING
  page slug, 1–100 chars), `builtPrizeSlug` (the assembled prize, 1–100 chars), `toolboxSwitches` /
  `toolsetSwitches` (non-negative ints, capped at 10,000 at the boundary — the functional core
  clamps again to 1,000). Response is always `{ success: true, message: "Build tracked" }` on a
  structurally valid body; the actual DB outcome is invisible to the caller by design (fire-and-forget
  beacon).
  - **This is deliberately a SECOND beacon, not extra fields on `promo-page-visit`.** Visits must be
    recorded on landing regardless of whether anyone interacts with the builder; folding this into
    the landing beacon would mean waiting on a build before recording the visit, losing every
    bounced visitor.
  - **It UPDATES an existing visit row — it never creates one.** Inserting here would inflate the
    promo visit count, the metric this whole feature is measured against. The route delegates to
    [`recordPrizeBuild`](../../src/utils/promo-analytics/record-prize-build.ts) (the tested
    functional core; side effects injected, no DB in the test) →
    `PromoAnalyticsService.recordPrizeBuild` →
    `PromoAnalyticsRepository.updateVisitBuild`, which is a `findOneAndUpdate` with `$set` (never
    `$inc` — counts arrive from the client as cumulative totals, not deltas) and **no `upsert`**.
  - **`no_visit_row` is an expected, non-error outcome** — the visit row can be legitimately absent
    (dedup race on the landing beacon, TTL, or the build beacon firing before/without a landing
    beacon reaching the DB). The route only `console.error`s when `outcome.reason` is something
    else; `no_visit_row` and `duplicate`-style outcomes are silent.
  - **DB work runs in `after()`, not on the request path** — same rationale as
    `promo-page-visit`: this fires from the highest-traffic ad-landing surface, and a stalled Mongo
    connection must never 504 the beacon. `request` is read synchronously (the `anonymousId` cookie)
    before `after()` is scheduled, since `request` cannot be touched once the response has been
    sent. See the full note in
    [`promo-page-visit/route.ts`](../../src/app/api/tracking/promo-page-visit/route.ts).
  - Regression coverage: `npm run test:prize-build` →
    [`record-prize-build.test.ts`](../../src/utils/promo-analytics/__tests__/record-prize-build.test.ts)
    (validation, clamping, no-anonymous-id, no-matching-row, `$set`-never-`$inc` repository guard).

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
