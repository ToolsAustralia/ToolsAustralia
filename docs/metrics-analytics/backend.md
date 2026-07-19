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
joining `MetaAdInsightsDaily` (per-ad daily spend/revenue) with `MetaAdDestination` (per-ad landing URL) on `adId`.
Triggered by the Meta sync crons (`/api/cron/sync-meta-ads` hourly-gated, `/api/cron/sync-meta-spend-by-url` nightly, both trailing 8-day windows) and the admin "Sync from Meta" button (14-day window).

### Pure doc builder + packagesFocus split (2026-07-17)

The per-day aggregation math is extracted into the exported pure function
`buildLandingPageDailyDocs({ adAccountId, date, computedAt, insights, destByAd })` (same service file) so it is unit-testable without Mongo — `npm run test:landing-page-focus` covers it.

While accumulating row totals it also accumulates the **`packagesFocus`** split per resolved row: each ad is classified via
[`derivePackagesFocusForDestination`](../../src/utils/metrics/packages-focus.ts) —
`one-time` iff the ad's primary raw URL carries `?packages=one-time`, else `membership`; unresolved destinations (`unknown://meta-ad/<id>`, missing doc, no raw URLs) are `unclassified` and contribute to **no** subdoc. See models.md for reader semantics.

Read side: `getAggregatedSpendByUrl` sums the subdoc across days when present; `getSpendByUrlListFormatted` maps it to dollar-level `packagesFocus` totals per row (`spend/spendCents/revenue/revenueCents/conversions/roas`), additively — rows without the split are byte-identical to pre-feature output.

### Spend-by-url detail rows: campaign hierarchy + focus (2026-07-17)

`getSpendByUrlDetailForCanonicalUrls` / `getSpendByUrlDetailFormatted` rows now also carry `campaignId/campaignName/adsetId/adsetName` (denormalized from the insights rows, latest-non-null-wins) and a required `packagesFocus: "membership" | "one-time" | "unclassified"` derived per ad from its `MetaAdDestination` (unresolved/`unknown://` → `unclassified`). Additive; consumed by the Prize Performance drill-down modal's campaign tree. Hook types (`src/hooks/queries/useSpendByUrlAnalytics.ts`) and Norm schemas (`analytics-spend.ts`) mirror the shape in lockstep.

### `PackagesFocusBreakdownService` (2026-07-17)

[src/services/analytics/PackagesFocusBreakdownService.ts](../../src/services/analytics/PackagesFocusBreakdownService.ts) — data source for the Ad Spend / ROAS KPI drill-down (`GET /api/admin/analytics/packages-focus`, mirrored to Norm). `summary` sums the materialized `packagesFocus` subdocs (any range; rows without a subdoc → `unclassified`, plus a residue guard for split/total spend divergence); `detail` builds a campaign→adset→ad tree per bucket from the live insights×destination join, with `availableSince` = the account's oldest retained insights date (unbounded indexed `findOne`, range-independent) and `complete = availableSince <= startDate`. `platform` is a first-class discriminator — `tiktok` returns `supported:false` / `awaiting-url-mapping` until a TikTok destination resolver ships. Full endpoint contract: [docs/admin/api.md](../admin/api.md).

### On-read freshness — near-real-time without forking sources (2026-07-17)

[src/services/meta/spendByUrlFreshness.ts](../../src/services/meta/spendByUrlFreshness.ts) — `ensureSpendByUrlFreshness(adAccountId, since, until)` runs before every spend-by-url read (admin list/detail routes, their Norm mirrors, and `PackagesFocusBreakdownService`). When the requested range touches the trailing 1–2 AEST days and the materialized rows are older than **5 minutes**, it refreshes just that window — insights sync (one Meta page in practice) → destination resolve for **missing adIds only** (the cron still refetches all creatives to catch URL edits) → per-day aggregate rebuild — then the read proceeds from Mongo as usual. So the dashboard no longer waits for the sync cron; the cron demotes to a history + Meta-restatement backstop (its 8-day trailing window still converges revised figures for older days, which on-read never re-pulls).

Tail protection: the Meta insights fetch retries rate limits with backoff capped at 120s/wait, so every ensure call carries a hard **12s time budget** — on expiry the read serves the stored (stale-but-consistent) data while the refresh finishes in the background for the next read. Failures log via `console.error` and never fail the read. Pure decision logic (`resolveOnReadRefreshWindow`, `isFreshEnough`) is unit-tested: `npm run test:spend-freshness`. Affected routes export `maxDuration = 60`.

### `packages-focus` derivation util

[src/utils/metrics/packages-focus.ts](../../src/utils/metrics/packages-focus.ts) — pure, shared by the aggregation and (later tasks) the breakdown endpoint + spend-by-url detail. Exports `PackagesFocus` (`"membership" | "one-time"`), `PackagesFocusBucket` (+ `"unclassified"`), `derivePackagesFocusFromUrl`, `resolvePrimaryRawUrl` (first `rawUrls` entry whose canonicalization matches `canonicalUrl`, fallback `rawUrls[0]`), `derivePackagesFocusForDestination`. Classification is **binary** — `packages=one-time` → one-time, everything else (absent/invalid/explicit `membership`) → membership; param parsing reuses `parseMembershipPackagesTab`. Tests: `npm run test:packages-focus`.

## Dashboard redesign

(Migrated stub from `docs/dashboard-redesign-implementation.md` — _TODO: read root._)
