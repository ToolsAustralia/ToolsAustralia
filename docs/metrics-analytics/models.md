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
- `state: Record<string, number>` — counts keyed by AU state/territory code (`NSW`, `VIC`, `QLD`, `WA`, `SA`, `TAS`, `ACT`, `NT`) plus a synthetic `Unknown` bucket for users with no `state` value. The service initializes every valid code to `0` so the table/chart shape stays stable. Source field: `User.state` (schema validates uppercase AU codes).
- `membershipByPackage: MembershipPackageBreakdown[]` where `MembershipPackageBreakdown = { packageId, packageName, total, active, pastDue, cancelled }`. One row per `MembershipPackage` of `type === "subscription"`. The per-package counts mirror the same classification ladder used for the flat `membershipStatus` rollup, so per-package totals reconcile with the standing aggregate.

See [architecture.md](./architecture.md#usermetrics-shape-additions-2026-05-04) for the aggregation pipeline that populates these.
