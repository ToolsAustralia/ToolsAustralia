# A/B Testing — Rules

## R1. No client-side flicker

Variants must be resolved server-side. The page renders the right variant on first paint. NEVER swap variants client-side after mount — users will see the swap.

## R2. Sticky per (experimentId, userId)

Once assigned, a user always sees the same variant for the lifetime of the experiment. Don't re-roll on each visit.

## R3. Dedupe conversions

Same user firing the same conversion event twice (refresh, double-submit) MUST be counted once. Dedupe at the tracking write or at the aggregation read — pick one and document.

## R4. Don't change variant ratios mid-experiment

Once an experiment is live, changing 50/50 to 70/30 invalidates the data. Start fresh experiments instead.

## R5. Significance at read-time, not write-time

Conversion rows are atomic facts. Statistical significance is computed at dashboard read — not stored. Allows back-testing different significance methods.

## R6. Don't mix variants per route

A single page renders one variant. Don't try to A/B test sub-component variants independently of the page-level variant — interaction effects break analysis.

## R7. PII-free analysis

Aggregations work with anonymous user ids. Never attach PII to conversion events for analysis purposes.
