# Metrics-Analytics — Gotchas

## Backfill rows aren't 1:1 with stripe rows

`MembershipRenewalCycle` rows with `confidence: "backfill"` were reconstructed from invoices that pre-date cycle tracking. They may have approximated `dueAt` or `amountPaidCents`. Filter them out for accuracy-sensitive reads.

## Late-arriving conversions

A user might convert hours after the daily aggregation runs. The dashboard for "today" might miss them until the next aggregation cycle. UX should communicate "data delay up to 24 hours."

## Spend-by-URL caveats

(Migrated from `docs/spend-by-url-feature.md` — _TODO: read root and merge._)

Brief: ad-spend data comes from Meta Marketing API; conversion data from internal events. Joins are fuzzy because UTM ↔ ad-id mapping isn't always clean.

## Migrated stubs

- `docs/METRICS_DATA_SOURCES.md` → _TODO_
- `docs/DATA_SOURCES_EXPLANATION.md` → _TODO_
- `docs/dashboard-redesign-implementation.md` → _TODO_

Read all three in the next refresh and merge.
