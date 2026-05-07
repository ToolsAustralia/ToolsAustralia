# Metrics-Analytics — Gotchas

## `subscription.endDate` is not a cancellation signal

The Stripe webhook ([src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts)) writes `subscription.endDate` on **every** active/trialing sub — it's the next billing-period end, not a "user cancelled" marker. Classifying by `endDate` alone counts every healthy sub as cancelled.

The canonical "scheduled cancel-at-period-end" check is `status ∈ {active, trialing, past_due} && autoRenew === false && endDate set` — see the ladder in [architecture.md](./architecture.md#membership-classification-ladder). Same filter is used in [src/services/admin/MembershipAnalyticsService.ts](../../src/services/admin/MembershipAnalyticsService.ts) and [src/utils/admin/userFilterBuilder.ts](../../src/utils/admin/userFilterBuilder.ts); keep these three in sync if the rule ever changes.

## Trialing must be counted as active

The User Metrics view's "Active Memberships" card ([src/components/admin/metrics/UserMetricsView.tsx](../../src/components/admin/metrics/UserMetricsView.tsx)) reads `membershipStatus.active` from the metrics ladder. The ladder's "Active" branch must include both `status === "active"` **and** `status === "trialing"` — otherwise trialing users fall through to no bucket and the card under-counts vs. the per-user "Active" badge ([src/components/admin/ui/AdminBadge.tsx](../../src/components/admin/ui/AdminBadge.tsx)) and the dashboard "Membership by Package" KPI, both of which include trialing.

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
