# Metrics-Analytics — Rules

## R1. Aggregations are per-day, not per-event

Don't query raw event collections for dashboard reads. Use `LandingPageMetricsDaily` (or the equivalent materialised collection) — pre-aggregated for performance.

## R2. Confidence levels matter

Some renewal-cycle data has `confidence: "stripe"` (canonical) vs `"backfill"` (reconstructed). Filter to `confidence: "stripe"` for analytics that compare expected-vs-actual, otherwise backfill noise distorts.

## R3. Don't materialise PII

Aggregations are anonymous-friendly. Don't write user names / emails into metric rows.

## R4. Late-arriving events ok

Events that arrive after the daily aggregation cron must trigger a re-aggregation of that day, OR be flagged as "to be reprocessed." Don't silently drop.

## R5. Schema validation at boundary

Metric API responses use Zod schemas from `src/schemas/metrics/`. Don't return raw documents.
