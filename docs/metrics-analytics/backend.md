# Metrics-Analytics — Backend

## Services

| Service dir | Role |
|---|---|
| [src/services/metrics/](../../src/services/metrics/) | Metrics computation (per-user, per-day) |
| [src/services/analytics/](../../src/services/analytics/) | Cross-domain analytics aggregation |

### UserMetricsService

`getUserMetrics(query: UserMetricsQuery)` — accepts an optional `asOfDate?: Date | null` in the query.

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

[src/services/meta/spendByUrlFreshness.ts](../../src/services/meta/spendByUrlFreshness.ts) — **Meta-only** (its staleness probe and recompute both pass `platform: "meta"`; an unscoped probe would let a fresh TikTok recompute mask a stale Meta window). `ensureSpendByUrlFreshness(adAccountId, since, until)` runs before every spend-by-url read (admin list/detail routes, their Norm mirrors, and `PackagesFocusBreakdownService`). When the requested range touches the trailing 1–2 AEST days and the materialized rows are older than **5 minutes**, it refreshes just that window — insights sync (one Meta page in practice) → destination resolve for **missing adIds only** (the cron still refetches all creatives to catch URL edits) → per-day aggregate rebuild — then the read proceeds from Mongo as usual. So the dashboard no longer waits for the sync cron; the cron demotes to a history + Meta-restatement backstop (its 8-day trailing window still converges revised figures for older days, which on-read never re-pulls).

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
