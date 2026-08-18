# Tracking — API

## Endpoints

- **`POST /api/tracking/conversion`** — funnel-event mirror (unauthenticated — it must accept guest traffic). Body is `CanonicalEvent`-shaped, but `eventName` is validated with `mirrorEventNameSchema` from [`src/utils/tracking/mirror-event-names.ts`](../../src/utils/tracking/mirror-event-names.ts) — only `ViewContent` / `AddToCart` / `InitiateCheckout` / `AddPaymentInfo` / `Lead` / `Search`. Value-bearing events (Purchase, Subscribe, …) are **not constructible** here — a forged Purchase would inflate Meta-only revenue; Purchases reach CAPI solely via the Stripe webhook. Client-supplied `eventTime` is untrusted: normalized via `normalizeEpochToUnixSeconds` (ms vs seconds) then clamped by `resolveEventTime` to Meta's accepted window (an out-of-range `event_time` rejects Meta's **entire** `/events` request). Response: `{ ok, results: { facebook, tiktok, snapchat } }`. See [`src/app/api/tracking/conversion/route.ts`](../../src/app/api/tracking/conversion/route.ts). The handler enriches `userData` server-side: session PII (when logged in), Meta `fbc`/`fbp`, TikTok `ttclid`/`ttp` (from cookies via `extractTikTokContext`), and IP/UA from request headers — so the browser mirror doesn't have to ship raw identifiers.
- ~~`POST /api/facebook/track`~~ — **removed 2026-05-12**. Use `POST /api/tracking/conversion`.
- **`POST /api/tracking/discount-page-visit`** and **`POST /api/tracking/discount-page-engagement`** (2026-08-11) — partner-discount page analytics for `/discount` and `/my-account/rewards/catalogue`. Both follow the promo beacon pattern exactly: rate-limit checked **synchronously first** (60 / 5 min, keyed on the `ta_anon_id` VISITOR cookie with the IP only as fallback — see F-024 above for why per-IP is wrong under Australian CGNAT), then Zod, then request values captured synchronously, then the DB work inside `after()`. **Distinct bucket keys** (`"discount-page-visit"` / `"discount-page-engagement"`) so neither can exhaust the other's budget, and split into two routes for the same reason the promo pair is: the visit route only ever **inserts**, while the engagement route **updates in place** and so leaves no row growth for a row-count sanity check.
  - **Visit body:** `{ surface: "discount" | "catalogue", accessPct? }`. Identity is **not** taken from the body — `userId`/`signedIn` come from the server session, because those are what every join in the funnel keys on. **UTM is resolved entirely server-side** (first-touch `_ta_attr` cookie, else the landing URL from `x-forwarded-url`/`referer`), unlike the promo visit beacon which also accepts client overrides — so no unbounded attacker-controlled attribution string is written to Mongo.
  - **Engagement body:** `{ surface, accessPct?, interacted, offersOpened, lockedOffersOpened, seamRendered, seamReached, unlockClicks, portalHandoff, zeroResultSearch }`. **Cumulative totals, not deltas**, written with `$set` — which is what makes the client's three flush triggers (`visibilitychange`, `pagehide`, unmount) safe: repeat flushes converge instead of multiplying. `no_visit_row` and `no_anonymous_id` are expected outcomes, not errors, and are deliberately not logged.
  - Full behaviour, and the four things that are easy to get wrong: [docs/partner/analytics.md](../partner/analytics.md).
- `POST /api/tracking/promo-page-visit` — **rate limited: 60 requests / 5 minutes per identifier,
  where the identifier is the `ta_anon_id` VISITOR cookie and falls back to the IP only when the
  cookie is absent** (added 2026-07-28 at 20/IP; re-keyed and widened 2026-07-29, F-024 — an
  IP-keyed budget let one ad burst behind a carrier CGNAT egress IP silently suppress genuine
  visit rows for everyone behind it, and visit row counts are a must-not-change number. 60 matches
  the repo's own public-endpoint precedent, `promo/link/validate`. Note `getClientIdentifier(ip,
  forwardedFor)` returns arg 1 verbatim, so `x-real-ip` must be passed FIRST — passing
  `x-forwarded-for` in both positions keys the bucket on the whole proxy chain.)
  (`createRateLimiter("promo-page-visit", …)` + `getClientIdentifier` from
  [`src/utils/security/rateLimiter.ts`](../../src/utils/security/rateLimiter.ts)), checked
  **synchronously as the first thing in the handler** — before the Zod parse and before `after()`
  is scheduled — so an over-limit caller never reaches the DB write. Over-limit responses match the
  sibling: `{ success: false, error: "Too many requests", retryAfterSeconds }` with `429` +
  `Retry-After`. Uses a **distinct bucket key** (`"promo-page-visit"`, not
  `"promo-prize-build"`) so the two beacons have independent budgets — traffic hammering one
  cannot exhaust the other's headroom. This endpoint only ever **inserts** a new visit row (never
  `$set`-updates an existing one), so it matters slightly less than the sibling: abuse still shows
  up as visibly inflated visit counts, whereas the sibling's in-place update left zero row growth
  for a row-count sanity check to catch (see F-001 above). It was still the same free-write
  primitive — unauthenticated, keyed only on the format-checked `ta_anon_id` cookie — so it got the
  identical guard. See
  [`docs/tech-debt/panel-review-feature-drawn-tonight-tomorrow-july-assets.md`](../tech-debt/panel-review-feature-drawn-tonight-tomorrow-july-assets.md)
  F-012.
  - **Body (2026-07-31):** `{ pageType, slug, utmSource?, utmMedium?, utmCampaign? }`. The three
    UTM fields are now **bounded** — `.trim().max(200)` plus a no-control-characters regex. They
    arrive from an unauthenticated public beacon and are written straight to Mongo; the sibling
    `slug` fields always carried a `.max()` while these did not, so a visitor could stuff an
    arbitrarily long `utm_source` into a stored field (and, before the channel key became a closed
    enum, into a `new RegExp` on the read side).
  - **`referrerSlug` was REMOVED from the body** (2026-07-31). It recorded arrivals from the
    "Explore other toolsets" carousel, replaced by the in-place two-reel configurator on
    2026-07-22; nothing has written the `tools-aus:from-promo-slug` sessionStorage key it read
    since. See [promo/backend.md](../promo/backend.md#crossvisits--visitsfrom-removed-2026-07-31).
  - **UTM now resolves first-touch-first** (2026-07-31). The handler calls
    `readAttributionCookieFromRequest` **synchronously, before scheduling `after()`**, and passes
    `firstTouchUtm{Source,Medium,Campaign}` into `recordPromoVisit`; precedence is
    first-touch `_ta_attr` cookie → body value → URL param. Read on the SERVER for two reasons:
    `request` must not be touched inside `after()`, and a client read would race the write — the
    hook that WRITES `_ta_attr` mounts above the one that fires this beacon, and React runs child
    effects first. Signups and conversions already read this cookie; visits did not, which put the
    visits and signups columns of the admin Channel table on two different bases. Every row records
    which basis it used in `PromoAnalyticsVisit.utmBasis` (`"first_touch" | "landing_url"`), so a
    post-deploy attribution shift is distinguishable from a real traffic change.
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
  - Payload also carries **`interacted`** (optional boolean): did the visitor touch the builder at
    all? Persisted as `PromoAnalyticsVisit.buildInteracted`. **Absent means engaged** *at the wire
    boundary only*, so an in-flight older client or a queued `sendBeacon` from before a deploy is
    never miscounted.
    Since F-018 the beacon fires for EVERY visitor (not only engaged ones), so the presence of
    `builtPrizeSlug` no longer distinguishes engagement — this flag does. It cannot be derived
    from the two counters: cash is a toggle, not a reel card, so a cash-only visitor sits at 0/0,
    and a `?toolbox=`/`?toolset=` URL arrival re-hydrates a previously-switched build at 0/0 too.
    - **The default is resolved exactly ONCE, here in the route** (fixed 2026-07-31), as
      `interacted: validatedData.interacted !== false`. Every layer below is now **required**:
      `PrizeBuildCapture.interacted`, `PromoAnalyticsService.recordPrizeBuild`'s arg and
      `PromoAnalyticsRepository.updateVisitBuild`'s arg are all non-optional, so a caller that
      drops the field fails to compile. Previously all three re-applied their own `!== false`
      fallback **and this route rebuilt the payload field-by-field without forwarding it** — so
      the default fired on 100% of writes, `buildInteracted` was `true` on every row that has ever
      existed, and the admin **Builds** column counted exposure while being labelled engagement.
      Production measurement: 1,754 of 1,941 build rows carry zero reel switches. There is
      deliberately no backfill (engagement is not retro-derivable); see
      [promo/backend.md](../promo/backend.md#builds-was-exposure-not-engagement--buildvisitors--builds--buildchangerate-2026-07-31).
      Covered by the `wiring guard: interacted survives service -> repository -> $set` case in
      `npm run test:prize-build`.
  - **Rate limited: 60 requests / 5 minutes, keyed on the `ta_anon_id` visitor cookie** (IP only as
    a fallback — see the sibling above and F-024) (`createRateLimiter("promo-prize-build",
    …)` + `getClientIdentifier` from
    [`src/utils/security/rateLimiter.ts`](../../src/utils/security/rateLimiter.ts)), checked
    **synchronously as the first thing in the handler** — before the Zod parse and before `after()`
    is scheduled — so an over-limit caller never reaches the DB write. Over-limit responses are
    `{ success: false, error: "Too many requests", retryAfterSeconds }` with `429` + `Retry-After`.
    This mattered more here than on the sibling `promo-page-visit` beacon (which now carries the
    identical guard under its own bucket key — see F-012 below): that endpoint only ever inserts a
    new row, so abuse at least shows up as inflated visit counts. This endpoint **updates an
    existing row in place via
    `$set`**, so unlimited-volume abuse rewrites `builtPrizeSlug` / `toolboxSwitches` /
    `toolsetSwitches` attribution with **zero row growth** — every visit-count sanity check stays
    green while `topBuiltPrize`, `buildDistribution`, and the builder→signup→conversion funnel
    quietly rot. A real visitor's beacon is debounced ~1s and flushed once on unload, so even heavy
    reel-fiddling produces only a handful of requests per page view — 20/5min leaves large headroom
    for genuine use. See
    [`docs/tech-debt/panel-review-feature-drawn-tonight-tomorrow-july-assets.md`](../tech-debt/panel-review-feature-drawn-tonight-tomorrow-july-assets.md)
    F-001.
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
