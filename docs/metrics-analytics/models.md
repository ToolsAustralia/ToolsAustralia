# Metrics-Analytics — Models

## `LandingPageMetricsDaily`

[src/models/LandingPageMetricsDaily.ts](../../src/models/LandingPageMetricsDaily.ts) — daily per-page metric aggregations.

> _TODO: pull schema (likely fields: date, pagePath, visits, conversions, revenue, ...)._

## Reads from other domains

- `PaymentEvent` (revenue events)
- `MembershipRenewalCycle` (renewal analytics)
- `MembershipStatusHistory` (state-transition analytics)
- `PromoAnalyticsVisit` (promo page conversions)
- `MetaAdInsightsDaily` (ad-spend joins)

## `UserMetrics` (TS interface)

Defined in [src/types/metrics/UserMetrics.ts](../../src/types/metrics/UserMetrics.ts). Notable fields (added 2026-05-04):

- `ageGroup: Record<AgeGroupLabel, number>` — counts keyed by the buckets exported from [src/utils/metrics/age-grouping.ts](../../src/utils/metrics/age-grouping.ts) (`18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+`, `Unknown`).
- `ageGroupPurchased: Record<AgeGroupLabel, number>` — same bucket keys as `ageGroup`, but only counts users whose `processedPayments` array is non-empty. Used to render a per-age-group purchased / conversion column alongside the raw `ageGroup` count in the admin metrics UI.
- `membershipByPackage: MembershipPackageBreakdown[]` where `MembershipPackageBreakdown = { packageId, packageName, total, active, pastDue, cancelled }`. One row per `MembershipPackage` of `type === "subscription"`. The per-package counts mirror the same classification ladder used for the flat `membershipStatus` rollup, so per-package totals reconcile with the standing aggregate.

See [architecture.md](./architecture.md#usermetrics-shape-additions-2026-05-04) for the aggregation pipeline that populates these.
