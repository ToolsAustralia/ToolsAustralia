# Metrics-Analytics — Models

## `LandingPageMetricsDaily`

[src/models/LandingPageMetricsDaily.ts](../../src/models/LandingPageMetricsDaily.ts) — materialized aggregate: ad spend + delivery metrics per **canonical landing URL** per day. Rebuilt per-date (delete+insertMany) by `SpendByUrlAggregationService.recomputeForDateRange` from `<Platform>AdInsightsDaily` × `AdDestination`. No TTL — this collection is the permanent record that outlives the per-ad insights TTL (~60d prod).

Fields: `platform` (`"meta" | "tiktok"`), `adAccountId`, `date` (`YYYY-MM-DD`), `canonicalUrl` (query/hash stripped; `unknown://<platform>-ad/<adId>` when the destination is unresolved), `spendCents`, `impressions`, `clicks`, `conversions`, `revenueCents` (both platform-reported), `adIds[]`, `computedAt`. Unique index `{platform, adAccountId, date, canonicalUrl}`.

### `platform` is load-bearing, not decorative (added 2026-07-29)

`recomputeForDateRange` **deletes then re-inserts** a day's rows. Its delete filter is
`{platform, adAccountId, date}` — drop `platform` and a TikTok recompute wipes that day's
**Meta** rows. Because this collection has no TTL, those rows are gone permanently: they are
only rebuildable while the source insights still exist (60-day TTL), and not at all after that.
Every read and write of this collection must be platform-scoped. See
[gotchas.md](./gotchas.md#platform-scoping-is-mandatory-on-addestination--landingpagemetricsdaily).

Migration [scripts/migrations/2026-07-29-platform-scope-landing-page-metrics.ts](../../scripts/migrations/2026-07-29-platform-scope-landing-page-metrics.ts)
stamps every pre-existing row `platform: "meta"` and swaps the unique index. It must run
**before** any TikTok recompute — run it dry first, it aborts on duplicate keys.

### `packagesFocus` split (added 2026-07-17)

Optional embedded subdoc `packagesFocus?: { membership, "one-time" }`, each side an `ILandingFocusMetrics` (`spendCents / impressions / clicks / conversions / revenueCents`). It splits the row's totals by the **landing-URL packages focus** of each contributing ad: an ad is `one-time` iff its primary raw URL carries `?packages=one-time`; **everything else is `membership`** (ads never use `?packages=membership` — the default is expressed by omission). The split lives *inside* the row because `canonicalizeLandingUrl` strips query strings, so both URL variants collapse into one `canonicalUrl` row.

Semantics readers must respect:
- Focus subtotals sum to the row totals for resolved rows (classification derives from `AdDestination.rawUrls` via [src/utils/metrics/packages-focus.ts](../../src/utils/metrics/packages-focus.ts)).
- `unknown://` rows and rows written **before** this feature carry **no** subdoc — read them as the **`unclassified`** bucket, never as membership.
- Row key/index unchanged apart from the `platform` prefix; the subdoc itself is additive.

**Multi-URL ads resolve to `unclassified`, not a guess (2026-07-29).** An ad can carry more
than one landing URL (Meta carousels, TikTok Smart+ creatives that rotate destinations). When
those URLs **disagree** on packages focus — some `?packages=one-time`, some not —
`derivePackagesFocusForDestination` returns `"unclassified"` rather than picking the first URL's
answer. Silently crediting a split-destination ad's whole spend to one bucket is a wrong number
presented as a right one; `unclassified` is visible in the UI and prompts a fix. Ads whose
multiple URLs all agree still classify normally.

## Reads from other domains

- `PaymentEvent` (revenue events)
- `MembershipRenewalCycle` (renewal analytics)
- `MembershipStatusHistory` (state-transition analytics)
- `PromoAnalyticsVisit` (promo page conversions)
- `MetaAdInsightsDaily` (ad-spend joins)

## `UserMetrics` (TS interface)

Defined in [src/types/metrics/UserMetrics.ts](../../src/types/metrics/UserMetrics.ts). Notable fields (added 2026-05-04):

- `ageGroup: Record<AgeGroupLabel, number>` — counts keyed by the buckets exported from [src/utils/metrics/age-grouping.ts](../../src/utils/metrics/age-grouping.ts) (`18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+`, `Unknown`).
- `state: Record<string, number>` — counts keyed by AU state/territory code (`NSW`, `VIC`, `QLD`, `WA`, `SA`, `TAS`, `ACT`, `NT`) plus a synthetic `Unknown` bucket for users with no `state` value. The service initializes every valid code to `0` so the table/chart shape stays stable. Source field: `User.state` (schema validates uppercase AU codes).
- `membershipByPackage: MembershipPackageBreakdown[]` where `MembershipPackageBreakdown = { packageId, packageName, total, active, pastDue, cancelled }`. One row per `MembershipPackage` of `type === "subscription"`. The per-package counts mirror the same classification ladder used for the flat `membershipStatus` rollup, so per-package totals reconcile with the standing aggregate.

See [architecture.md](./architecture.md#usermetrics-shape-additions-2026-05-04) for the aggregation pipeline that populates these.
