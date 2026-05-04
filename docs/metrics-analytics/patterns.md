# Metrics-Analytics — Patterns

## P1. Read from materialised, not raw

Dashboard reads use the daily-materialised collection. Reading raw `PaymentEvent` for a dashboard scan is a performance bug.

## P2. Confidence level on event rows

When an event is auto-generated from raw data (backfill) vs ingested live (stripe webhook), tag with `confidence`. Aggregations filter by confidence depending on the question being answered.

## P3. Schema validation at API boundary

Use Zod schemas from `src/schemas/metrics/` to validate responses. Keeps types and runtime contracts in sync.

## P4. Formatting via dedicated hook

`useMetricsFormatting` centralises number formatting (currency, percentages, large numbers). Don't ad-hoc format in components.
