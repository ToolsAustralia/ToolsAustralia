# Infrastructure — API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health/` | Public | Liveness check |
| GET/POST | `/api/cron/**` | Cron secret | Scheduled jobs |
| POST | `/api/upload/**` | Session | Cloudinary upload signing |
| GET | `/api/images/**` | Public/session | Image serving |

> _TODO: read each handler under [src/app/api/health/](../../src/app/api/health/), [src/app/api/cron/](../../src/app/api/cron/), [src/app/api/upload/](../../src/app/api/upload/), [src/app/api/images/](../../src/app/api/images/) and document._

## Known cron routes

| Path | Schedule (UTC) | `maxDuration` / `memory` | Purpose |
|---|---|---|---|
| `/api/cron/dashboard-stats-daily-snapshot` | `0 14 * * *` and `0 15 * * *` | 300s / 1024MB | Re-upserts 90-day sliding window of `DashboardStatsDailySnapshot` rows. Idempotent. Second fire heals first-run failures. |
| `/api/cron/cancellation-retention-resume` | `0 16 * * *` | 300s / 1024MB | Clears stale `pauseReason="retention"` metadata on Stripe subscriptions after the 30-day retention pause window has elapsed. See [architecture.md](./architecture.md#vercel-cron-schedules). |
| `/api/cron/cancellation-retention-maturity` | `0 17 * * *` | 300s / 1024MB | Matures saved cancellation-flow events ≥90 days old: sets `retention90` to `retained`/`churned` based on the member's CURRENT subscription state. Read-only on user/subscription. Idempotent. See [architecture.md](./architecture.md#vercel-cron-schedules). |
| `/api/cron/reconcile-major-draw-entries` | `30 16 * * *` | 300s / 1024MB | Self-heals membership renewals that failed to credit the active `MajorDraw` (the swallowed-`addToMajorDraw` bug). Delegates to [`reconcileActiveMajorDrawEntries`](../../src/utils/draws/reconcile-major-draw-entries.ts). Heals only confirmed gaps (latest in-window renewal has empty `drawGrants` + active sub + not refunded + draw < actual grant), idempotent. Runs after the ~14:00–15:00 UTC anchor-billing spike. See `docs/draws/gotchas.md`. |

See [architecture.md](./architecture.md#vercel-cron-schedules) for the full cron table.

## Cancellation Retention Resume Cron

### Purpose

Prevents a production bug: if `metadata.pauseReason="retention"` is left on a Stripe subscription after the voluntary 30-day pause ends, a later failed-renewal recovery pause on the same subscription will carry the stale `pauseReason`, and `decideClearPause` in `pauseCollectionPolicy.ts` will refuse to clear it — locking the member in an unrecoverable paused state that blocks billing recovery.

### Auth

`Bearer ${CRON_SECRET}`. When `CRON_SECRET` is unset (local dev), all requests are authorized.

### Candidate query

Queries `User` collection for `{ "retentionOffersConsumed.pause30d": true, stripeSubscriptionId: { $exists: true, $ne: null } }`. Projects only `_id` and `stripeSubscriptionId`. This set is bounded by total members who have ever accepted the pause offer (a small subset of total users). No additional timestamp filter is applied; each candidate triggers one `stripe.subscriptions.retrieve` to check current state.

**Future scale note:** if this population grows to 100k+, add a `retentionPausedAt` date field to `User` and filter `retentionPausedAt < (now - 30 days)` to skip users still within their pause window without a Stripe call.

### Per-subscription decision (`shouldClearRetentionMarker`)

Pure exported helper (unit-tested in `src/app/api/cron/__tests__/cancellation-retention-resume.test.ts`):

- Returns `false` immediately if `pauseReason !== "retention"` (idempotent no-op for already-cleared subs).
- Returns `true` if `pause_collection` is already null (Stripe auto-resumed but metadata is stale).
- Returns `true` if `pauseResumesAt` ISO parses to a time ≤ now (window elapsed).
- Returns `false` if `pauseResumesAt` is unparseable (conservative: treat as not elapsed, do nothing).
- Returns `false` if the window is still in the future and pause_collection is still active (do not clear mid-window).

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
{ "processed": 42, "cleared": 3, "errors": [] }
```

- `processed`: total candidates retrieved from the DB and checked against Stripe.
- `cleared`: subscriptions where the retention marker was successfully removed.
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
