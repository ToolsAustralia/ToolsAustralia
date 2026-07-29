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

## Platform scoping is mandatory on `AdDestination` + `LandingPageMetricsDaily`

Both collections now carry a `platform` discriminator (`"meta" | "tiktok"`). **Every** read and
write must filter on it. Two distinct failure modes, both silent:

1. **Ad ids are only unique WITHIN a platform.** An unscoped
   `AdDestination.find({ adId })` can attach a TikTok ad's landing URL to a Meta ad with the
   same numeric id. Nothing errors; the spend just lands on the wrong URL.
2. **`recomputeForDateRange` deletes before it inserts.** Its filter is
   `{platform, adAccountId, date}`. Unscoped, a TikTok recompute deletes that day's **Meta**
   rows. `LandingPageMetricsDaily` has **no TTL**, so this is permanent data loss — recoverable
   only while the source insights survive their own 60-day TTL.

`SpendByUrlAggregationService` takes `platform` as its **first** parameter on every public
method for exactly this reason: it can't be forgotten at a call site without a type error.
The Meta-only surfaces (`/api/admin/analytics/spend-by-url`, its `/detail` sibling, and both
Norm mirrors) pass the literal `"meta"`.

`AdDestination` pins `collection: "metaaddestinations"`. Do not "tidy" that away — Mongoose
would otherwise derive `addestinations`, and every Meta URL would resolve to `unknown://`
overnight with no error.

## Querying the wrong platform's insights collection fails SILENTLY

`getSpendByUrlDetailForCanonicalUrls` took a `platform` parameter but read
`MetaAdInsightsDaily` unconditionally (fixed 2026-07-29). A TikTok drill-down therefore looked
up TikTok ad ids in **Meta's** collection, matched nothing, and rendered "0 ads" beneath a row
that plainly showed spend.

The reason this class of bug is dangerous: ad ids are only unique *within* a platform, so
querying the wrong collection returns an **empty set, never an error**. Nothing throws, no test
fails, and the UI renders a confident zero. Any read that takes `platform` must select its
collection from it — grep for `MetaAdInsightsDaily.` / `MetaAdDestination.` inside a
platform-aware function before assuming it's scoped.

## The Advertising card reads SNAPSHOTS, and snapshots never self-heal

The admin Overview's Advertising card does not query `TikTokAdInsightsDaily` for historical
ranges — it sums `DashboardStatsDailySnapshot.adChannels`, written once per day by the
`dashboard-stats-daily-snapshot` cron. `tiktokAdChannelProvider` returns `{status:"empty"}`
when a day has no insight rows and `{status:"error"}` when creds are unset; in both cases **no
`tiktok` key is written at all**, and the card renders "Awaiting sync".

Consequence: backfilling `TikTokAdInsightsDaily` for past days does **not** fix the Advertising
card. The snapshots for those days were written when the data didn't exist and are never
revisited. You must also re-run:

```bash
npm run backfill:dashboard-stats-snapshots -- --start-date 2026-07-24 --end-date 2026-07-28
```

(idempotent upsert by date; `--dry-run` first). Applied to production 2026-07-29 — before it,
prod snapshots contained only a `facebook` key on every day in the range.

Two things this does NOT fix, by design: days before the platform had any spend keep no
`tiktok` key (correct — there was nothing to record), and **future** snapshots only gain a
`tiktok` key if the deployment's env actually has `TIKTOK_ADVERTISER_ID` +
`TIKTOK_MARKETING_ACCESS_TOKEN`; without them the provider returns `error` and preserves
whatever was stored.

## Spend-by-URL caveats

(Migrated from `docs/spend-by-url-feature.md` — _TODO: read root and merge._)

Brief: ad-spend data comes from Meta Marketing API; conversion data from internal events. Joins are fuzzy because UTM ↔ ad-id mapping isn't always clean.

## Migrated stubs

- `docs/METRICS_DATA_SOURCES.md` → _TODO_
- `docs/DATA_SOURCES_EXPLANATION.md` → _TODO_
- `docs/dashboard-redesign-implementation.md` → _TODO_

Read all three in the next refresh and merge.
