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
