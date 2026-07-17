# Metrics-Analytics — Models

## `LandingPageMetricsDaily`

[src/models/LandingPageMetricsDaily.ts](../../src/models/LandingPageMetricsDaily.ts) — materialized aggregate: Meta ad spend + delivery metrics per **canonical landing URL** per day. Rebuilt per-date (delete+insertMany) by `SpendByUrlAggregationService.recomputeForDateRange` from `MetaAdInsightsDaily` × `MetaAdDestination`. No TTL — this collection is the permanent record that outlives the per-ad insights TTL (~60d prod).

Fields: `adAccountId`, `date` (`YYYY-MM-DD`), `canonicalUrl` (query/hash stripped; `unknown://meta-ad/<adId>` when the destination is unresolved), `spendCents`, `impressions`, `clicks`, `conversions`, `revenueCents` (both Meta-reported), `adIds[]`, `computedAt`. Unique index `{adAccountId, date, canonicalUrl}`.

### `packagesFocus` split (added 2026-07-17)

Optional embedded subdoc `packagesFocus?: { membership, "one-time" }`, each side an `ILandingFocusMetrics` (`spendCents / impressions / clicks / conversions / revenueCents`). It splits the row's totals by the **landing-URL packages focus** of each contributing ad: an ad is `one-time` iff its primary raw URL carries `?packages=one-time`; **everything else is `membership`** (ads never use `?packages=membership` — the default is expressed by omission). The split lives *inside* the row because `canonicalizeLandingUrl` strips query strings, so both URL variants collapse into one `canonicalUrl` row.

Semantics readers must respect:
- Focus subtotals sum to the row totals for resolved rows (classification derives from `MetaAdDestination.rawUrls` via [src/utils/metrics/packages-focus.ts](../../src/utils/metrics/packages-focus.ts)).
- `unknown://` rows and rows written **before** this feature carry **no** subdoc — read them as the **`unclassified`** bucket, never as membership.
- Row key/index unchanged; the field is additive, so pre-existing consumers are unaffected.

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
