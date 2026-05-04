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
