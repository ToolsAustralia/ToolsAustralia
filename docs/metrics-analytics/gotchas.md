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

## The dashboard entry hold has to expire on its own

[src/utils/dashboard-entry-hold.ts](../../src/utils/dashboard-entry-hold.ts) freezes the
major-draw entry buckets from a purchase's `onMutate` so the wallet makes one animated jump
after the success overlay closes rather than twitching mid-flow. The trap is that the hold is
**module-level** global state, while its only success-side release lived in
`useDashboardEntryDisplay` — a hook that exists only while `/my-account` is mounted. The
purchase modals are mounted globally, so a purchase started from anywhere else armed a hold
with nobody left to observe the overlay closing: the member's entry count stayed pinned at its
pre-purchase value for the rest of the SPA session, healing only on a hard refresh.

The fix is a hard ceiling on the hold's lifetime — `HOLD_MAX_MS = 30_000`, armed as a
`setTimeout(clearDashboardEntryHold, …)` inside `armDashboardEntryHold` and cancelled by
`clearDashboardEntryHold`, so re-arming restarts the timer instead of stacking timers. 30s is
double the ~5–15s webhook grant window, so on the dashboard the real release still wins and the
animation is unchanged; everywhere else the timer *is* the release.

The transferable rule: predicted/optimistic state that lives at module scope must own its own
lifetime. If the only thing that can clear it is a component effect, every path where that
component never mounts leaves the UI asserting a stale number indefinitely.

## Never arm the hold from a cold cache

`armDashboardEntryHoldFromUserStatsCache` used to fabricate `{0, 0, 0}` when the cached
`queryKeys.majorDraw.userStats` value was missing or not an object. Zero is not a neutral
default here — the hold's entire job is to render the captured snapshot in place of live data,
so a fabricated zero snapshot froze the wallet at "no entries" immediately after a **successful**
purchase. It now returns without arming anything, because a cold cache and a user whose stats
query legitimately resolves to `null` are indistinguishable at that call site, and with no hold
`useDashboardEntryDisplay` falls through to the live values — which are at worst not yet updated,
never wrong.

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

## The Advertising card reads SNAPSHOTS, not the insights collections

The admin Overview's Advertising card does not query `TikTokAdInsightsDaily`/`MetaAdInsightsDaily`
for a historical range — it sums `DashboardStatsDailySnapshot.adChannels`, written by the
`dashboard-stats-daily-snapshot` cron. `tiktokAdChannelProvider` returns `{status:"empty"}` when
a day has no insight rows and `{status:"error"}` when creds are unset; in both cases **no
`tiktok` key is written**, and the card renders "Awaiting sync" — which is honest, but reads to
a human like a broken integration.

**The snapshot cron rewrites a 90-day SLIDING WINDOW** (`SLIDING_WINDOW_DAYS = 90` in
[the cron route](../../src/app/api/cron/dashboard-stats-daily-snapshot/route.ts)), so snapshots
DO self-heal — a day gains its `tiktok` key on the next nightly run once insight rows exist for
it. Two preconditions, and both were false in production until 2026-07-29:

1. `TikTokAdInsightsDaily` must actually have rows for that day. Prod had **zero** until the
   token went live and the history was backfilled, so every nightly run wrote `empty`.
2. The deployment's env must have `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN`, or
   the provider returns `error` and preserves whatever was stored (i.e. nothing).

So the usual fix is to backfill the INSIGHTS and let the nightly window catch up. To make it
visible immediately instead of waiting a day:

```bash
npm run backfill:dashboard-stats-snapshots -- --start-date 2026-07-24 --end-date 2026-07-28
```

(idempotent upsert by date; `--dry-run` first). Run on production 2026-07-29 for exactly that
reason — the 90-day window would have healed those days on its own that night.

Days before the platform had any spend keep no `tiktok` key permanently, which is correct:
there was nothing to record.

Ordering note: `sync-tiktok-ads` runs `45 2 * * *` UTC and the snapshot cron `0 14/15 * * *`
UTC, so on any given day the insights land before the snapshots that read them.

## Spend-by-URL caveats

(Migrated from `docs/spend-by-url-feature.md` — _TODO: read root and merge._)

Brief: ad-spend data comes from Meta Marketing API; conversion data from internal events. Joins are fuzzy because UTM ↔ ad-id mapping isn't always clean.

## Migrated stubs

- `docs/METRICS_DATA_SOURCES.md` → _TODO_
- `docs/DATA_SOURCES_EXPLANATION.md` → _TODO_
- `docs/dashboard-redesign-implementation.md` → _TODO_

Read all three in the next refresh and merge.
