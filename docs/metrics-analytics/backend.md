# Metrics-Analytics — Backend

## Services

| Service dir | Role |
|---|---|
| [src/services/metrics/](../../src/services/metrics/) | Metrics computation (per-user, per-day) |
| [src/services/analytics/](../../src/services/analytics/) | Cross-domain analytics aggregation |

### UserMetricsService

`getUserMetrics(query: UserMetricsQuery)` — accepts an optional `asOfDate?: Date | null` in the query.

**2026-08-17 — timeout fix + measured baseline.** `/api/admin/metrics/users` had been returning **504 in production on every request** (`Task timed out after 10 seconds`; `useUserMetrics` retries twice, so one panel expand cost ~36s of spinner and then rendered the empty state). It had never once succeeded at production data volume. What the investigation established, all measured against production via `npm run verify:user-metrics`:

- **The queries were never the problem.** All five, all-time, sequential: **833ms** raw-driver / **904ms** through the service, against **927 users** and **2,304 payment events**. A `$facet` rewrite was specced and then **rejected as overengineering** — see the spec's §3.7 and the revisit threshold in §9.
- **The route had `maxDuration: 10`** (the `api/**` catch-all in `vercel.json`) while `src/lib/mongodb.ts` uses `serverSelectionTimeoutMS: 10000` plus a `[1000, 2000, 4000]` TLS retry ladder. **A function whose budget is smaller than its own connection-failure path cannot report a connection error — it can only 504.** Both this route and `/api/internal/norm/v1/metrics/users` (same service, same cap — silently broken too) now get `maxDuration: 60`.
- **Why it was undiagnosable:** every diagnostic in the connection path used `console.log`/`console.warn`, which `next.config.ts` `removeConsole` strips from production builds. Those are now `console.error`.
- **The unaccounted ~7s is NOT attributed.** It could not be measured from outside the function. `getUserMetrics` therefore emits a single `console.error` with a per-stage breakdown when total elapsed ≥ 2s (`SLOW_REQUEST_MS`); a healthy request logs nothing. **If 504s persist, that log names the stage — that is the designed next step.**

Hardening shipped alongside (real improvements, explicitly *not* the cure): the four independent branches now run in `Promise.all` (only `users → referralEvents` is a true dependency); `purchaseHistory` uses the new `aggregateNetBenefitsSummaryWithMatch()` `$group` instead of fetching 2,304 documents to sum a price; and `PaymentEvent` gained `{ eventType: 1, timestamp: -1 }` — no index led with `eventType`, so every net-revenue `$match` range-scanned `timestamp` and filtered in memory. Net effect: all-time `getUserMetrics` **904ms → 722ms**, cold path 2.73s → 1.53s, with `purchaseHistory` output asserted byte-identical to the document-loop path in the same verify run.

**`gender` bucket** — `getUserMetrics` returns `gender: Record<"Male"|"Female"|"Not set", number>` from the optional `User.gender` field, counted in the existing in-memory loop (`gender` added to the `.select()` list). `"Not set"` means unknown and conflates "declined" with "never asked", so no consumer may present it as a gender.

- **Live mode** (`asOfDate` is `null`/omitted): `membershipStatus.active`, `.cancelled`, `.pastDue` are computed by walking every User's `subscription` field for users created in the date range.
- **Snapshot mode** (`asOfDate` is set): after the User-loop, standing counts are overridden from `MembershipDailySnapshot` rows for the matching date key (formatted in `Australia/Sydney` tz as `yyyy-MM-dd`). `cancelledCount + scheduledCancelCount` are merged into the `cancelled` bucket. If no snapshot rows exist for the date, the live User-loop values survive (graceful degradation).
- `membershipStatus.renewed` is always a range-driven delta from `PaymentEvent` (`subscription_cycle` events) — never overridden by snapshot.

### MetricsDebugService

[`getMetricsDebugSnapshot(daysBack = 7)`](../../src/services/metrics/MetricsDebugService.ts) — diagnostic helper extracted from `/api/admin/metrics/debug` when the route was wired through Norm. Returns a count of `BenefitsGranted` `PaymentEvent` rows in the last `daysBack` days plus a 10-row sample. `paymentEvents.totalRevenue` is sample-only (not the full window) — the route uses this for "does data exist?" debugging, not for revenue reporting. `daysBack` is clamped `[1, 365]` server-side.

Consumed by:
- `GET /api/admin/metrics/debug` (admin diagnostic — engineer-facing)
- `GET /api/internal/norm/v1/metrics/debug` (Norm engineer-facing diagnostic)

## Utils

[src/utils/metrics/](../../src/utils/metrics/) — pure helpers.

## Schemas

[src/schemas/metrics/](../../src/schemas/metrics/) — Zod schemas for metric API contracts.

## Daily aggregation (spend-by-URL)

`LandingPageMetricsDaily` rows are rebuilt per-date (delete + insertMany) by
[`SpendByUrlAggregationService.recomputeForDateRange`](../../src/services/analytics/SpendByUrlAggregationService.ts),
joining the platform's per-ad daily insights (`MetaAdInsightsDaily` / `TikTokAdInsightsDaily`) with `AdDestination` (per-ad landing URL) on `adId`.
Triggered by the Meta sync crons (`/api/cron/sync-meta-ads` hourly-gated, `/api/cron/sync-meta-spend-by-url` nightly, both trailing 8-day windows) and the admin "Sync from Meta" button (14-day window).

### One pipeline, per-platform descriptors (2026-07-29)

[src/services/analytics/runSpendByUrlSync.ts](../../src/services/analytics/runSpendByUrlSync.ts) —
`runSpendByUrlSync(descriptor, dateRange)` owns the sequencing (insights → destinations →
aggregate rebuild), the coverage warning, and the result shape. A platform contributes only a
**descriptor** supplying its two fetch steps: `metaSpendByUrlDescriptor(adAccountId, token)` and
`tiktokSpendByUrlDescriptor()` (returns `null` when `TIKTOK_ADVERTISER_ID` is unset, which
callers treat as "not enabled here", not an error). Adding a platform is a descriptor plus an
`AdDestinationResolver` — not a third copy of the orchestration, and not a third place to forget
the platform argument on the aggregate rebuild.

`runMetaSpendByUrlSync` is now a thin binding over it, keeping its original signature so the
two crons, the admin "Sync from Meta" route and the ops script don't churn.

An unconfigured platform returns `configured:false` and **skips the aggregate rebuild entirely** —
rebuilding from zero insight rows would DELETE that platform's existing rows for the window.

Coverage (`resolved ÷ requested`) is logged on every run and `console.error`s below 80%: the
pipeline keeps working when a platform changes its creative shape (unresolved ads become
`unknown://` rows), so without this the only symptom is spend quietly detaching from real pages.

Ops entry points: `npm run sync:tiktok-spend-by-url[:dry]`
([scripts/sync-tiktok-spend-by-url.ts](../../scripts/sync-tiktok-spend-by-url.ts), exit 2 on
sub-80% coverage) and the nightly `/api/cron/sync-tiktok-ads`, which **runs the full pipeline as
of 2026-07-29** — it was insights-only before, which left `LandingPageMetricsDaily` permanently
empty for TikTok in production while nothing appeared to fail.

### `platform` is the first parameter, everywhere (2026-07-29)

Every public method on the service takes `platform: "meta" | "tiktok"` **first**:
`recomputeForDateRange`, `getAggregatedSpendByUrl`, `getSpendByUrlDetail`,
`getSpendByUrlDetailForCanonicalUrls`, `getSpendByUrlListFormatted`,
`getSpendByUrlDetailFormatted`. Position-first is deliberate — a forgotten platform is a
compile error rather than a silently cross-platform query. The read path switches insights
collection on it, and `unknown://` placeholders are namespaced per platform
(`unknown://meta-ad/<id>`, `unknown://tiktok-ad/<id>`) so a placeholder can never be parsed
back as the wrong platform's ad id.

The Meta-only HTTP surfaces (`/api/admin/analytics/spend-by-url` + `/detail`, and both Norm
mirrors) pass the literal `"meta"`. See [gotchas.md](./gotchas.md#platform-scoping-is-mandatory-on-addestination--landingpagemetricsdaily)
for why the delete-then-insert makes this data-loss-critical rather than merely untidy.

### Pure doc builder + packagesFocus split (2026-07-17)

The per-day aggregation math is extracted into the exported pure function
`buildLandingPageDailyDocs({ platform, adAccountId, date, computedAt, insights, destByAd })` (same service file) so it is unit-testable without Mongo — `npm run test:landing-page-focus` covers it. It stamps `platform` onto every doc it emits.

While accumulating row totals it also accumulates the **`packagesFocus`** split per resolved row: each ad is classified via
[`derivePackagesFocusForDestination`](../../src/utils/metrics/packages-focus.ts) —
`one-time` iff the ad's primary raw URL carries `?packages=one-time`, else `membership`; unresolved destinations (`unknown://meta-ad/<id>`, missing doc, no raw URLs) are `unclassified` and contribute to **no** subdoc. See models.md for reader semantics.

Read side: `getAggregatedSpendByUrl` sums the subdoc across days when present; `getSpendByUrlListFormatted` maps it to dollar-level `packagesFocus` totals per row (`spend/spendCents/revenue/revenueCents/conversions/roas`), additively — rows without the split are byte-identical to pre-feature output.

### `?platform=` on the spend-by-url surfaces — and why there is no "all" (2026-07-29)

`GET /api/admin/analytics/spend-by-url`, its `/detail` sibling, and both Norm mirrors accept
`?platform=meta|tiktok` (default `meta`, so existing callers are unchanged). The account id is
resolved per platform via
[adPlatformAccounts.ts](../../src/services/analytics/adPlatformAccounts.ts).

There is deliberately **no server-side `all`**. Spend is additive across platforms and safe to
sum, but `revenue` is each platform's OWN attributed value — the same purchase can be claimed
by Meta and TikTok, so a blended row inflates revenue and ROAS with nothing in the payload to
warn the reader. Callers that want a company-wide view request each platform and combine
explicitly, which forces the caveat to be visible at the point of display.

`/detail` is single-platform for a harder reason: **ad ids are only unique within a platform**,
so a merged per-ad tree would be ambiguous by construction.

The **sync** route (`POST …/spend-by-url/sync`) does take `platform: meta | tiktok | all`,
because syncing is per-platform work with no blending problem. Platforms run sequentially
inside the one 300s invocation (parallel doubles peak memory and rate-limit pressure for no
wall-clock win worth the risk), and an unconfigured platform is skipped rather than failing the
whole request — syncing Meta must not fail because TikTok is absent.

### Prize performance combines spend, never revenue (2026-07-29)

[PrizePerformanceCard](../../src/app/admin/component/overview/sections/PrizePerformanceCard.tsx)
runs one query per platform and merges per brand. Platform chips are **All / Meta / TikTok**,
defaulting to All. When a visible row actually mixes platforms, the card prints the caveat
inline: spend is the true combined total, but revenue and ROAS are per-platform attributions
added together and therefore read high. If TikTok is unconfigured, its query 500s — that must
not blank a card whose Meta half is fine, so it degrades to a "Meta only" note.

Row click opens `PrizePerformanceAdsModal` on the row's platform when the row has exactly one,
Meta when it mixes; the modal's own chips switch platform and refetch.

### Spend-by-url detail rows: campaign hierarchy + focus (2026-07-17)

`getSpendByUrlDetailForCanonicalUrls` / `getSpendByUrlDetailFormatted` rows now also carry `campaignId/campaignName/adsetId/adsetName` (denormalized from the insights rows, latest-non-null-wins) and a required `packagesFocus: "membership" | "one-time" | "unclassified"` derived per ad from its `MetaAdDestination` (unresolved/`unknown://` → `unclassified`). Additive; consumed by the Prize Performance drill-down modal's campaign tree. Hook types (`src/hooks/queries/useSpendByUrlAnalytics.ts`) and Norm schemas (`analytics-spend.ts`) mirror the shape in lockstep.

### `PackagesFocusBreakdownService` (2026-07-17)

[src/services/analytics/PackagesFocusBreakdownService.ts](../../src/services/analytics/PackagesFocusBreakdownService.ts) — data source for the Ad Spend / ROAS KPI drill-down (`GET /api/admin/analytics/packages-focus`, mirrored to Norm). `summary` sums the materialized `packagesFocus` subdocs (any range; rows without a subdoc → `unclassified`, plus a residue guard for split/total spend divergence); `detail` builds a campaign→adset→ad tree per bucket from the live insights×destination join, with `availableSince` = the account's oldest retained insights date (unbounded indexed `findOne`, range-independent) and `complete = availableSince <= startDate`. Full endpoint contract: [docs/admin/api.md](../admin/api.md).

**Both platforms take the same path (2026-07-29).** TikTok used to short-circuit to
`supported:false` / `awaiting-url-mapping`; the Smart+ id bridge in `TikTokAdDestinationService`
supplies the missing ad→URL mapping, so it now returns real buckets. `supported:false` (reason
`not-configured`) now means only that the environment has no account id for that platform —
distinct from "$0 spent", which the modal states explicitly. `buildDetail` selects the insights
collection from `platform` (the two collections share field names by construction), and the
account id is resolved per platform via
[adPlatformAccounts.ts](../../src/services/analytics/adPlatformAccounts.ts) — passing Meta's
account id to a TikTok query matches nothing and renders a confident `$0`.

On-read freshness stays **Meta-only**: TikTok's rollup is rebuilt by its nightly cron. That is
a deliberate choice (TikTok's report API is slower per call and intraday drift there is not a
reported problem), not an oversight.

### On-read freshness — near-real-time without forking sources (2026-07-17)

[src/services/meta/spendByUrlFreshness.ts](../../src/services/meta/spendByUrlFreshness.ts) — **both platforms since 2026-07-29.** `ensureSpendByUrlFreshness(platform, adAccountId, since, until)` runs before every spend-by-url read

TikTok was originally excluded on the assumption its report API was too slow for a per-read refresh. That assumption was wrong and was never measured: against the live account TikTok's `/report/integrated/get/` medians **0.33s** for a 2-day window (1-day 0.33s, 8-day 0.37s) versus Meta's **~8.7s**. Total added cost for TikTok is roughly half a second — ~0.33s insights plus ~0.2s for a 1–2 day aggregate rebuild, with the creative-API step skipped entirely unless an ad has no stored destination. `platform` is part of the in-flight/throttle key so the two platforms refresh independently, and the credential gate is per-platform (`FACEBOOK_MARKETING_ACCESS_TOKEN` vs `isTikTokAdInsightsConfigured()`), so a TikTok read on a Meta-only environment no-ops instead of attempting a doomed refresh.

The original description follows. (admin list/detail routes, their Norm mirrors, and `PackagesFocusBreakdownService`). When the requested range touches the trailing 1–2 AEST days and the materialized rows are older than **5 minutes**, it refreshes just that window — insights sync (one Meta page in practice) → destination resolve for **missing adIds only** (the cron still refetches all creatives to catch URL edits) → per-day aggregate rebuild — then the read proceeds from Mongo as usual. So the dashboard no longer waits for the sync cron; the cron demotes to a history + Meta-restatement backstop (its 8-day trailing window still converges revised figures for older days, which on-read never re-pulls).

Tail protection: the Meta insights fetch retries rate limits with backoff capped at 120s/wait, so every ensure call carries a hard **12s time budget** — on expiry the read serves the stored (stale-but-consistent) data while the refresh finishes in the background for the next read. Failures log via `console.error` and never fail the read. Pure decision logic (`resolveOnReadRefreshWindow`, `isFreshEnough`) is unit-tested: `npm run test:spend-freshness`. Affected routes export `maxDuration = 60`.

### `packages-focus` derivation util

[src/utils/metrics/packages-focus.ts](../../src/utils/metrics/packages-focus.ts) — pure, shared by the aggregation, the breakdown endpoint and spend-by-url detail. Exports `PackagesFocus` (`"membership" | "one-time"`), `PackagesFocusBucket` (+ `"unclassified"`), `derivePackagesFocusFromUrl`, `resolvePrimaryRawUrl` (first `rawUrls` entry whose canonicalization matches `canonicalUrl`, fallback `rawUrls[0]`), `derivePackagesFocusForDestination`, and `canonicalizeLandingUrl` (moved here from `src/utils/meta/` in 2026-07-29 — it is platform-neutral and TikTok needs it too). Classification is **binary** — `packages=one-time` → one-time, everything else (absent/invalid/explicit `membership`) → membership; param parsing reuses `parseMembershipPackagesTab`. Tests: `npm run test:packages-focus`.

**Multi-URL disagreement → `unclassified` (2026-07-29).** `derivePackagesFocusForDestination`
no longer classifies from the primary URL alone when a destination holds several `rawUrls`.
It classifies **every** raw URL that canonicalizes to the row's `canonicalUrl`; if they
disagree (some one-time, some not), it returns `"unclassified"`. This matters for Meta
carousels and TikTok Smart+ creatives, which legitimately rotate destinations — attributing a
split ad's entire spend to whichever URL happened to sort first is a plausible-looking wrong
number. Unanimous multi-URL destinations classify normally, so the common case is unaffected.

## Dashboard redesign

(Migrated stub from `docs/dashboard-redesign-implementation.md` — _TODO: read root._)

## Brand-lane resolution (`src/utils/metrics/brand-lane.ts`, 2026-08-19)

The single mapping from a promotion identifier to the brand row it belongs in. Two axes, both derived from `PRIZE_LANE_SLUGS` / `TOOLBOX_LANE_ORDER`:

- **toolset** — the power-tool brand (`ryobi | milwaukee | dewalt | makita | hikoki`)
- **toolbox** — the storage brand (`sidchrome | kincrome | milwaukee | gearwrench`)

**Why it is one module rather than a resolver per caller.** Brand analytics joins two sources that can only ever be keyed differently: spend comes from `LandingPageMetricsDaily` keyed on the **canonical URL** (query strings are stripped, so a visitor's `?toolbox=` selection is invisible), while outcomes come from `PaymentEvent` keyed on `data.promotionSlug` or `data.builtPrizeSlug`. Applying the *same* rules to both keys is what makes the two sides bucket identically instead of by coincidence. Fork it and a brand's ad spend and the revenue it produced land in different rows with nothing to flag it.

Four entry points, all agreeing by construction:

| Function | Input | Notes |
|---|---|---|
| `resolveBrandLaneFromBuiltPrize` | `ryobi-kincrome` | exact — a built prize names both halves |
| `resolveBrandLaneFromPromoSlug` | `/promotions/<slug>`'s slug | bare toolset slugs resolve their toolbox via `getPageDefaultPrizeSlug` |
| `resolveBrandLaneFromCanonicalUrl` | full canonical URL | extracts the slug, then defers to the above |
| `brandLaneSwitchExpr` | a Mongo field path | `$switch` for in-database bucketing |

**The page-default fallback is load-bearing.** A bare `/promotions/ryobi` has no toolbox in the identifier, so the toolbox lane resolves through `getPageDefaultPrizeSlug('ryobi')` → `ryobi-milwaukee` → `milwaukee`. That is the toolbox the ad's traffic actually saw on first paint, and it is exactly what the server records for a visitor who never touched the builder — so both sides agree by construction.

⚠️ **Known, accepted skew:** `getDefaultPrizeForToolsetSlug` prefers the Milwaukee toolbox, so bare-toolset-URL spend concentrates on Milwaukee in the toolbox view. That is the literal truth of what was advertised, not an error. The `built-prize` basis is the lens that shows how demand redistributes away from the default.

**Unrecognised inputs resolve to `null` and are DROPPED, never bucketed somewhere plausible** — notably `cash-prize` (no toolbox lane) and the `unknown://meta-ad/<id>` placeholder rows the sync writes when a platform can't resolve an ad's destination. Callers surface these as an "Unattributed" row so totals still reconcile.

**Server-safety:** this module is imported by services and repositories, so it must never import the prize-builder's `TOOLBOXES` / `TOOLSETS` constants (they live under `src/components/**`). `PRIZE_LANE_SLUGS` in `src/config/promo-landing-slugs.ts` is the server-safe registry.

`brandLaneSwitchExpr` is shared with `PromoAnalyticsRepository.getAggregatedByToolbox`, so the Page Analytics tab and the Overview's Brand Performance section cannot disagree about which lane a purchase belongs to. `npm run test:brand-lane` asserts the `$switch` and the JS resolver produce identical mappings for every registry entry in both lanes.

## `resolvePreviousCalendarMonthAest` (2026-08-19)

In `src/utils/admin/resolveAestDateWindow.ts`, beside the preset resolver. Returns the literal 1st→last day of the previous calendar month in AEST as `yyyy-MM-dd` bounds — the fixed benchmark the admin period-comparison table measures against.

**Not a replacement for `trendCalculationService.getComparisonPeriod`.** That returns the equal-length window immediately *preceding* the selection and drives the KPI trend arrows. Both are kept as separate, clearly-named functions rather than one function with a mode flag, because they answer different questions: "vs the previous equivalent stretch" versus "vs last month, a benchmark that doesn't move when you change the range".

**Anchored on the AEST calendar, never UTC.** Sydney is UTC+10/+11, so a late-UTC-evening instant is already the *next* AEST day — and on the last UTC day of a month, the AEST calendar has already rolled over. `2026-01-31T23:00Z` is 1 February in Sydney, so the previous calendar month is **January**, not December. Reading the UTC month there gives the wrong answer. Covered by `npm run test:previous-calendar-month`, which also pins the year boundary (January → previous December), leap/non-leap February, and both DST transitions.

The month arithmetic runs on calendar *numbers* pulled out of `formatInTimeZone(..., "yyyy-MM")`, so a 23h/25h DST day cannot shift either bound.
