# Infrastructure — API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health/` | Public | Liveness check |
| GET/POST | `/api/cron/**` | Cron secret | Scheduled jobs |
| POST | `/api/upload/**` | Session | Cloudinary upload signing |
| GET | `/api/images/**` | Public/session | Image serving |

> _TODO: read each handler under [src/app/api/health/](../../src/app/api/health/), [src/app/api/cron/](../../src/app/api/cron/), [src/app/api/upload/](../../src/app/api/upload/), [src/app/api/images/](../../src/app/api/images/) and document._

## Known cron routes

| Path | Schedule (UTC) | `maxDuration` | Purpose |
|---|---|---|---|
| `/api/cron/major-draw-transition` | `15 18 * * *` | 300s | Advances draw lifecycle (activate/freeze/complete) + creates the next queued draw 7 days out. Backstop only — the same transition service also runs on-demand from webhook handlers and page views, so this cron just guarantees a daily pass even with zero traffic. **Moved off `0 14 * * *` on 2026-08-24** to clear the renewal-webhook-burst hour; delaying the backstop by a few hours is safe because it is not the primary trigger. See [gotchas.md](./gotchas.md). |
| `/api/cron/process-partner-discount-queues` | `45 18 * * *` | 300s | Sweeps every user's partner-discount queue: expires finished periods, activates the next queued item, reconciles membership vs one-time tiers, prunes old expired rows. **Moved off `0 15 * * *` on 2026-08-24** to clear the renewal-webhook-burst hour. See [gotchas.md](./gotchas.md). |
| `/api/cron/dashboard-stats-daily-snapshot` | `30 17 * * *`, `30 20 * * *` **and `20 3 * * *`** | 300s | Re-upserts a 90-day sliding window of `DashboardStatsDailySnapshot` rows — the last 90 **COMPLETE** AEST days, ending at yesterday. Idempotent. Second fire heals first-run failures. **The in-progress day is never written** (fixed 2026-08-25: it used to be, and the 03:20 fire froze a half-finished day that the reader then served as authoritative from midnight — see [gotchas.md](./gotchas.md)). Consequence: between 14:00 UTC and the 17:30 UTC fire the just-closed day has no snapshot and is computed live. **Moved off `0 14`/`0 15`, then off `0 18`/`0 19`, on 2026-08-24** — `0 14`/`0 15` are the ~900-membership renewal-webhook burst and its trailing Stripe payment wave (2,235 / 3,551 events respectively); `0 18`/`0 19` was reverted within the same task after review caught that `sync-meta-ads`/`sync-tiktok-ads` are hourly-fired but gated IN-HANDLER to Sydney wall-clock slots {3,6,9,12,15,18,21}:00, and 19:00 UTC is exactly the Sydney-06:00 slot during AEDT — this cron reads the ad-insights tables those syncs are mid-write on, so landing on their slot is an ordering hazard, not just a load one. `30 17`/`30 20` UTC dodges this structurally: those syncs only do real work at minute 0 (or local 23:59), so a `:30` UTC time can never collide regardless of DST regime. See [gotchas.md](./gotchas.md) for the full incident writeup. **The third (03:20 UTC) fire is an ORDERING fix, not redundancy** — it runs after `sync-tiktok-ads` so the day just closed is re-derived from TikTok settled figures. See the ordering note below. |
| `/api/cron/cancellation-retention-resume` | `0 16 * * *` | 300s | Backstop for the `paused` retention-pause state (flips `active→paused` at `pausedFrom`; **payment-gated** restore `paused→active` when Stripe has resumed — only restores to `active` on a confirmed PAID resume invoice, mirrors `past_due`/`unpaid`) + clears stale `pauseReason="retention"` metadata after the pause window (next cycle boundary) elapses. Webhook is the primary driver; this catches missed events. See [architecture.md](./architecture.md#vercel-cron-schedules). |
| `/api/cron/cancellation-retention-maturity` | `0 17 * * *` | 300s | Matures saved cancellation-flow events ≥90 days old: sets `retention90` to `retained`/`churned` based on the member's CURRENT subscription state. Read-only on user/subscription. Idempotent. See [architecture.md](./architecture.md#vercel-cron-schedules). |
| `/api/cron/reconcile-major-draw-entries` | `30 16 * * *` | 300s | Self-heals membership renewals that failed to credit the active `MajorDraw` (the swallowed-`addToMajorDraw` bug). Delegates to [`reconcileActiveMajorDrawEntries`](../../src/utils/draws/reconcile-major-draw-entries.ts). Heals only confirmed gaps (latest in-window renewal has empty `drawGrants` + active sub + not refunded + draw < actual grant), idempotent. Runs after the ~14:00–15:00 UTC anchor-billing spike. See `docs/draws/gotchas.md`. |
| `/api/cron/reconcile-renewal-grants` | `40 3 * * *` | 60s | Detects renewals Stripe was paid for whose entry grant never landed — the only check in the repo that does not start from a `BenefitsGranted` PaymentEvent, and therefore the only one that can see a renewal which died before writing one. Also reports every `dead` `stripewebhookqueue` row. Read-only (no Mongo write, no Stripe call). **Auth fails CLOSED**: unlike most siblings it does *not* do `if (!cronSecret) return true` — a missing `CRON_SECRET` is a 401. Delegates to [`runRenewalGrantReconciliation`](../../src/services/reconciliation/renewalGrantReconciler.ts). Scheduled at 03:40 UTC deliberately away from the 14:00/15:00 UTC anchor-24 renewal burst. See `docs/billing-stripe/architecture.md`. |
| `/api/cron/sync-tiktok-ads` | `0 * * * *` + `59 12,13 * * *` (gated to Sydney-local 3-hourly slots + 23:59, **as of 2026-08-11**; was `45 2 * * *` nightly) | 300s | 3-hourly re-sync of a trailing 8-day window of the **full** TikTok spend-by-URL pipeline — insights → ad→landing-URL destinations → per-URL daily aggregates (delegates to `runSpendByUrlSync`; the TikTok analogue of `sync-meta-ads`). Bearer `CRON_SECRET` gate. No-ops (`200 { skipped: true, reason: "env" }`) when the TikTok Marketing-API env (`TIKTOK_ADVERTISER_ID` / `TIKTOK_MARKETING_ACCESS_TOKEN`) is unset. See below. |

See [architecture.md](./architecture.md#vercel-cron-schedules) for the full cron table.

## Cancellation Retention Resume Cron

### Purpose

Two jobs, both **backstops** to the Stripe webhook (`handleSubscriptionUpdated` / `handleInvoicePaymentSucceeded`), which is the PRIMARY driver of the `active↔paused` flips for the 30-day `pause_30d` retention-pause membership state (see [subscription/backend.md → RetentionPauseService](../subscription/backend.md#retention-pause-the-paused-membership-state)):

1. **Drive the `paused` membership state when the webhook misses an event.** Because Stripe keeps the subscription `status:"active"` during a `pause_collection`, the app owns the DB `paused` state (`subscription.status="paused"` + `isActive=false`). This cron flips `active→paused` once the freeze window has started and restores `paused→active` when Stripe has already resumed — idempotent + Stripe-truth-based.
2. **Clear stale retention metadata.** Prevents a production bug: if `metadata.pauseReason="retention"` is left on a Stripe subscription after the pause window (next cycle boundary) ends, a later failed-renewal recovery pause on the same subscription would carry the stale `pauseReason`, and `decideClearPause` in `pauseCollectionPolicy.ts` would refuse to clear it — locking the member in an unrecoverable paused state that blocks billing recovery.

### Auth

`Bearer ${CRON_SECRET}`. When `CRON_SECRET` is unset (local dev), all requests are authorized.

### Candidate query

Queries `User` collection for `{ "retentionOffersConsumed.pause30d": true, stripeSubscriptionId: { $exists: true, $ne: null } }`. Projects `_id`, `stripeSubscriptionId`, and the pause-state fields `subscription.status` / `subscription.pausedFrom` / `subscription.pausedUntil` (needed for the flip/restore decisions). This set is bounded by total members who have ever accepted the pause offer (a small subset of total users). No additional timestamp filter is applied; each candidate triggers one `stripe.subscriptions.retrieve` to check current state.

**Future scale note:** if this population grows to 100k+, add a `retentionPausedAt` date field to `User` and filter `retentionPausedAt < (now - 1 month)` to skip users still within their pause window without a Stripe call.

### Per-subscription decision (`shouldClearRetentionMarker`)

Pure exported helper (unit-tested in `src/app/api/cron/__tests__/cancellation-retention-resume.test.ts`):

- Returns `false` immediately if `pauseReason !== "retention"` (idempotent no-op for already-cleared subs).
- Returns `true` if `pause_collection` is already null (Stripe auto-resumed but metadata is stale).
- Returns `true` if `pauseResumesAt` ISO parses to a time ≤ now (window elapsed).
- Returns `false` if `pauseResumesAt` is unparseable (conservative: treat as not elapsed, do nothing).
- Returns `false` if the window is still in the future and pause_collection is still active (do not clear mid-window).

### Actions: flip / restore the `paused` membership state (backstop)

Before the metadata-clear decision, each candidate is reconciled against live Stripe (both branches idempotent — the webhook is the primary driver):

- **(a) Flip `active→paused`.** If the sub carries a live retention pause (`pauseReason==="retention"` + `pause_collection` present), the DB status is not yet `paused`, and the freeze window has started (`pausedFrom <= now < pausedUntil`): set `subscription.status="paused"` + `isActive=false` (`flipped++`).
- **(b) Restore `paused→active` (payment-gated).** Else if the DB says `paused` but Stripe has already resumed (`pause_collection` gone): mirror Stripe's status — it only restores to `active` on a confirmed PAID resume invoice (`active`/`trialing` → `active` + `isActive=true`); a failed/unsettled resume mirrors `past_due`/`unpaid`/`canceled`, and an unsettled subscription is left `paused` for the payment webhook to finish. On restore it unsets `pausedFrom`/`pausedUntil` (`restored++`). The primary restore is still `invoice.payment_succeeded`.

### Actions taken when clearing

1. If `pause_collection` is still present (Stripe hasn't auto-resumed): call `resumeAfterSuccessfulRenewalPayment(subId)` — defensive and idempotent.
2. Always: `stripe.subscriptions.update(subId, { metadata: { pauseReason: "", pauseResumesAt: "" } })` — setting keys to `""` removes them from Stripe metadata. This ensures `decideClearPause` will no longer see `pauseReason === "retention"` on this subscription.

### Idempotency

- A sub with `pauseReason` already absent (empty or unset) is skipped by the `shouldClearRetentionMarker` check → no Stripe writes.
- Mid-window runs (window not elapsed, pause active) are no-ops.
- Re-running after a successful clear is a no-op.

### Error isolation

Each subscription is processed in a `try/catch`. Errors are collected in `errors[]` and logged via `console.error`. A single bad subscription never aborts the rest of the batch.

### Response shape

```json
{ "processed": 42, "cleared": 3, "flipped": 1, "restored": 2, "errors": [] }
```

- `processed`: total candidates retrieved from the DB and checked against Stripe.
- `cleared`: subscriptions where the retention marker was successfully removed.
- `flipped`: subscriptions flipped `active→paused` by the backstop (window started, webhook missed it).
- `restored`: subscriptions restored `paused→active` by the backstop (Stripe already resumed).
- `errors`: per-subscription error messages (non-fatal).

## Cancellation Retention Maturity Cron

`GET /api/cron/cancellation-retention-maturity` — `src/app/api/cron/cancellation-retention-maturity/route.ts`. Daily at `0 17 * * *` (one hour after the resume cron at `0 16 * * *`, deliberately staggered to spread load).

### Purpose

"Matures" the 90-day retention outcome of saved cancellation flows. When a member is saved (accepts a retention offer instead of cancelling), the question "did the save actually stick?" can only be answered 90 days later. This cron back-fills `CancellationFlowEvent.retention90` so the admin analytics panel can show a real retained-vs-churned split for matured saves (`summarizeCancellationEvents` in `src/services/admin/cancellationFlowAnalytics.ts` only counts `retention90` for events whose `savedAt <= now - 90d`).

### Auth

`Bearer ${CRON_SECRET}` (copied verbatim from the resume cron). When `CRON_SECRET` is unset (local dev), all requests are authorized.

### Candidate query (`maturedFilter(now)`)

Pure exported helper, returns the Mongo filter:

```js
{ outcome: "saved", savedAt: { $lte: <now - 90d> }, retention90: null }
```

- Bounded by the `savedAt <= now - 90d` window — never an unbounded scan; the compound index `{ outcome:1, savedAt:1, retention90:1 }` on `CancellationFlowEvent` serves it directly.
- The `$lte` cutoff is **exactly** `now - 90d`, identical to the `matured` cutoff in `summarizeCancellationEvents`, so the admin panel reflects this cron's writes the moment they land.
- `.limit(5000)` safety cap — generous; the date window already bounds the set. Only guards a pathological backlog (cron down for months).

### Per-event decision (`isRetained(user)`)

Pure exported helper (unit-tested). Mirrors the canonical "active recurring subscriber" predicate `getActiveSubscriptionFilter` (`src/utils/admin/userFilterBuilder.ts:42`) field-for-field:

- user account active → `isActive === true`
- subscription active → `subscription.isActive === true`
- will auto-renew → `subscription.autoRenew !== false` (true OR undefined; default true)
- Stripe status → `subscription.status ∈ {active, trialing}`

`retention90 = "retained"` iff all hold, else `"churned"`. A missing user (deleted account) → `isRetained(null) === false` → **churned** (a deleted user has no active recurring subscription, so the save did not durably retain a paying member).

### Read-only on subscription

This cron **never** calls Stripe and **never** mutates `User` or any subscription. The only write is `$set: { retention90 }` on `CancellationFlowEvent`.

### Idempotency

`updateOne({ _id, retention90: null }, { $set: { retention90 } })`. The `retention90: null` in both the candidate filter AND the update filter makes the job idempotent: once an event is matured it is never re-selected, and a concurrent run's update is a no-op once the value is set (the value is immutable thereafter).

### Error isolation

Each event is processed in a `try/catch`. Errors are collected in `errors[]` and logged via `console.error`. A single bad event never aborts the rest of the batch.

### Response shape

```json
{ "processed": 42, "retained": 30, "churned": 12, "errors": [] }
```

- `processed`: matured events selected this run.
- `retained` / `churned`: split written this run.
- `errors`: per-event error messages (non-fatal).

## `/api/cron/sync-meta-ads` (2026-06-02) — Prize-performance Meta sync

Runs `runMetaSpendByUrlSync` over a trailing 7-day window so the admin Prize-performance table stays fresh. Auth: `Authorization: Bearer ${CRON_SECRET}` (standard cron pattern). **DST-correct self-gating:** Vercel cron is UTC and DST-unaware, so the handler over-invokes and gates against the real `Australia/Sydney` wall clock — it runs only when local time is one of `03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00` or `23:59`, returning `200 { skipped: true }` otherwise. `vercel.json` schedules `0 * * * *` (hourly — covers the 3-hourly slots for both AEST UTC+10 and AEDT UTC+11) plus `59 12,13 * * *` (covers the 23:59 slot across both offsets; 23:59 AEDT = 12:59 UTC, 23:59 AEST = 13:59 UTC). A manual "Sync" button on the Prize-performance card hits the same underlying `POST /api/admin/analytics/spend-by-url/sync`.

> **Security fix (2026-07-16):** `/api/cron/sync-meta-spend-by-url` (the separate `30 2 * * *` daily spend-sync route) was previously **unauthenticated** — it ran a heavy paginated Meta Marketing API download + Mongo bulk write with no `CRON_SECRET` check, so any caller could trigger it. It now takes `NextRequest` and enforces the same `Authorization: Bearer ${CRON_SECRET}` gate as `sync-meta-ads` and the other cron routes. See [gotchas.md § Cron auth bypass](./gotchas.md).

## `/api/cron/sync-tiktok-ads` (2026-07-16) — Nightly TikTok ad-insights sync

`GET /api/cron/sync-tiktok-ads` — `src/app/api/cron/sync-tiktok-ads/route.ts`. Scheduled `45 2 * * *` (`maxDuration: 300s`). The TikTok analogue of `sync-meta-ads`: re-pulls a trailing 8-day window (`since = now - 7d`, `until = now`, `Australia/Sydney`-formatted) and runs the **full spend-by-URL pipeline** via `runSpendByUrlSync(tiktokSpendByUrlDescriptor(), …)` — insights into `TikTokAdInsightsDaily`, then ad→landing-URL destinations into `AdDestination`, then the per-URL daily rebuild into `LandingPageMetricsDaily`. The wide re-pull captures TikTok's later revisions to recent days.

> **⚠️ ORDERING INVARIANT (2026-08-11): `dashboard-stats-daily-snapshot` must run AFTER this.**
> An AEST day ends at 14:00 UTC and the snapshot's first two fires (`30 17`/`30 20 * * *` UTC as of
> 2026-08-24, moved off `0 14`/`0 15` to clear the renewal-surge hour — see architecture.md) still
> land well before this sync's next settled run, and TikTok keeps attributing conversions well
> past midnight (these ad sets are 7-day-click / 1-day-view). So an early snapshot always
> captured TikTok **mid-attribution** and froze a partial number, which the overview Advertising
> card then showed as "Yesterday".
>
> Measured on production for AEST 2026-08-10 — the snapshot said spend **$386.82** / revenue
> **$40.00** / ROAS **0.103**, while the actual settled TikTok data was **$410.93** / **$90.00** /
> **0.219** (an exact match to TikTok Ads Manager, per ad set). Every OLDER day matched exactly;
> only the freshest one was short, which is what made this invisible — the history looked right.
>
> Fixed by adding a third `dashboard-stats-daily-snapshot` fire at **`20 3 * * *`** (35 min after
> this sync starts; `maxDuration` is 300s). Safe because that write is an idempotent 90-day
> sliding window whose `mergeAdChannels` prefers a successful fetch and only preserves the stored
> value when a provider *errors*.
>
> **If you reschedule this cron, reschedule the snapshot with it.** Do NOT instead move this sync
> earlier: before 14:00 UTC the AEST day has not closed, so an earlier sync would record a
> genuinely incomplete day rather than a settled one. Later is the only correct direction.

**It ran insights-only until 2026-07-29**, which meant `LandingPageMetricsDaily` stayed permanently empty for TikTok in production: the Ad Spend drill-down and Prize Performance read the rollup rather than the raw insights, so TikTok rendered `$0` everywhere with no error anywhere. The pipeline is now shared with Meta, so the two cannot drift again. The response gained `destinationsUpserted` / `destinationCoverage` / `aggregateRowsWritten` in its log line; sub-80% destination coverage `console.error`s (spend filed under `unknown://tiktok-ad/<id>` reaches no `/promotions` page). Auth: `Authorization: Bearer ${CRON_SECRET}` (skipped when `CRON_SECRET` is unset, local dev). Returns `200 { ok: false, skipped: true, reason: "env" }` when `isTikTokAdInsightsConfigured()` is false (TikTok Marketing-API creds `TIKTOK_ADVERTISER_ID` / `TIKTOK_MARKETING_ACCESS_TOKEN` absent), else `{ ok: true, rowsUpserted, adIds, durationMs }`. **Status recording (2026-07-24, panel F-002):** every run upserts the single `TikTokSyncRun` doc (`recordTikTokSyncRun` — outcome ok/error + TikTok's errorCode/errorMessage from `TikTokReportError` + window + duration; best-effort, never throws) so the admin UI can render a truthful "failing since…" state; API failures still return `500` (Vercel cron monitoring stays red). **Metric-name tripwire (panel F-005):** when a successful sync's window totals show clicks but zero conversions AND zero revenue (`metricNamesSuspect`), the route logs `WARNING metric-names-suspect` and adds `warning: "metric-names-suspect"` to the JSON — the signature of the assumed metric names not matching this account, which would otherwise persist as confident zeros. The contract (throw-on-failure + the tripwire) is pinned by `npm run test:tiktok-sync-contract`. **Account-assumption guard (panel F-006):** after a successful sync the route calls `checkTikTokAccountAssumptions()` and, on a mismatch, logs it and adds `assumptionsWarning` to the JSON — the sync stores spend as AUD cents and buckets hours as Australia/Sydney, so a currency or reporting-timezone change would silently corrupt every figure. Best-effort and post-sync: it needs a scope the report call doesn't, and must never block or fail the sync. **History/backfill:** the cron only reaches 8 days back — anything older is captured once via `npm run seed:tiktok-insights -- --days=N` (`scripts/seed-tiktok-insights.ts`, clone of `seed-meta-insights.ts`; `:dry` variant fetches + reports without writing and prints the live `raw` metric keys for the F-005 metric-name check). Run `--days=60` on token day.
