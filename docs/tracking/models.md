# Tracking — Models

| Model | Path | Purpose |
|---|---|---|
| `MetaAdDestination` | [src/models/MetaAdDestination.ts](../../src/models/MetaAdDestination.ts) | Meta ad destination config |
| `MetaAdInsightsDaily` | [src/models/MetaAdInsightsDaily.ts](../../src/models/MetaAdInsightsDaily.ts) | Daily ad insights snapshots from Meta Marketing API. Typed fields: `spendCents`, `impressions`, `clicks`, `linkClicks`, `conversions`, `revenueCents`, `reach`, `frequency`, `cpmCents`, `adsetBudgetCents`, `campaignObjective`, `learningStatus`, `lastSignificantEdit`. TTL index on `syncedAt`: 35d (dev) / 60d (prod). Nightly cron re-upserts the last 8 days refreshing the TTL clock. Seed script: `npm run seed:meta-insights`. |

> _TODO: pull schemas._

## TikTokAdInsightsDaily

[`src/models/TikTokAdInsightsDaily.ts`](../../src/models/TikTokAdInsightsDaily.ts). Daily ad-level insights from TikTok Marketing API. Same shape as `MetaAdInsightsDaily`. Unique key: `(adAccountId, date, adId)` (`adAccountId` holds the TikTok `advertiser_id`). **Now written** by `TikTokInsightsSyncService` (admin domain, [`src/services/admin/tiktok/`](../../src/services/admin/tiktok/)), fed nightly by the `/api/cron/sync-tiktok-ads` cron (history/backfill via `npm run seed:tiktok-insights`); read by the admin TikTok per-ad breakdown **and** (2026-07-24) by `tiktokAdChannelProvider` (dashboard-stats `adChannels` — per-AEST-day sums feeding the overview Advertising card / blended ROAS / MER). TTL index on `syncedAt`: 35d (dev) / 60d (prod), mirroring `MetaAdInsightsDaily` — anchored to `syncedAt` so the nightly re-upsert of the trailing window refreshes the clock on touched rows (active ads stay alive past 60d). `conversions`/`revenueCents` are TikTok-reported (the platform's own attribution), NOT a join of first-party `PaymentEvent` sales.

## TikTokSyncRun

[`src/models/TikTokSyncRun.ts`](../../src/models/TikTokSyncRun.ts) (2026-07-24, panel F-002). **One document per job** (`jobKey` unique; today always `"sync-tiktok-ads"`), upserted by the cron on **every** run — success AND failure: `outcome: "ok" | "error"`, TikTok's own `errorCode`/`errorMessage` (e.g. 40001 permission error, extracted from `TikTokReportError`), `rowsUpserted`, synced `since`/`until`, `durationMs`, `finishedAt`. Exists because serverless invocations share no memory: without a persisted last-run outcome the admin UI cannot distinguish "configured but the sync is FAILING" from "genuinely no spend yet". Read via `getTikTokSyncHealth()` ([`src/services/admin/tiktok/tiktokSyncStatus.ts`](../../src/services/admin/tiktok/tiktokSyncStatus.ts)); naming mirrors `ChargeJobRun`.

## SnapchatAdInsightsDaily

[`src/models/SnapchatAdInsightsDaily.ts`](../../src/models/SnapchatAdInsightsDaily.ts). Same shape as TikTok, but still an orphaned shell — **no sync service writes to this collection yet** (unlike TikTok, which now has `TikTokInsightsSyncService`).

## FacebookAdsHealthSnooze

[`src/models/FacebookAdsHealthSnooze.ts`](../../src/models/FacebookAdsHealthSnooze.ts). Per-user, per-ad snooze for the Facebook Ads Health view's "Investigate" verdict. Includes TTL index for automatic expiration.

## FacebookAdsHealthSettings

[`src/models/FacebookAdsHealthSettings.ts`](../../src/models/FacebookAdsHealthSettings.ts). Singleton settings document for the Facebook Ads Health verdict engine. One document with `scope='global'`, lazy-initialised with defaults on first read by the settings service.

## Facebook Ads Health Services

[`src/services/facebook-ads-health/`](../../src/services/facebook-ads-health/) contains the verdict engine for analyzing Facebook ad performance:

- **types.ts** — Shared types: `Verdict` ("scale" | "hold" | "investigate" | "cut"), `MetaAdInsightsRow`, `VerdictResult`, etc.
- **verdictEngine.ts** — Decision engine with 4-verdict pipeline: CUT → INVESTIGATE → SCALE → HOLD.
  - **CUT**: fires on any of: LearningLimited ≥3d with spend floor, spend ≥ 2×CPA multiplier with 0 conv or bad CPA, non-purchase-capable campaign objective.
  - **INVESTIGATE**: fires when all three groups pass — (a) "Was healthy": best 7d in last 14d had ≥50 conv AND ROAS ≥ breakeven; (b) "Now broken": ROAS dropped >roasDropTriggerPct WoW with ≥50 conv in both weeks, OR status reverted from Active; (c) "Recent edit": lastSignificantEdit ≤7d ago. Requires ≥50 conv in both comparison weeks (stat-confidence floor).
  - **SCALE**: fires when adset is Active, ≥50 conv/7d, ROAS ≥ breakeven, no edit within postEditWaitHours, ROAS stable WoW.
  - **HOLD**: default when none of the above fire.
- **insightsAggregator** (Task 18, updated Task 22, mongo-first Task 23) — Builds `MetaAdInsightsRow` via a cache-aside strategy: past days are read from `MetaAdInsightsDaily` in MongoDB (fast, indexed on `{adAccountId, date}`); today's partial row is live-fetched via `fetchFacebookAdInsightsDaily`; adset metadata (learning status, last_significant_edit) is always live via `fetchAdsetMetadata`. All three fetches run in `Promise.all`. Known tradeoff: `daysInLearningLimited` is best-effort (0 or 1 based on current state) because Meta's live API does not return historical learning status per day.

## `KlaviyoSyncState` (2026-08-26)

Single-document state for the Klaviyo profile reconciliation sweep
([`src/models/KlaviyoSyncState.ts`](src/models/KlaviyoSyncState.ts), `_id` is always
`"klaviyo-profile-sweep"`).

| field | meaning |
|---|---|
| `watermark` | newest `user.updatedAt` the sweep has successfully covered |
| `fullPassCursor` | rotating cursor for the scheduled `?mode=full` pass; advances each run, wraps on completion |
| `lastRunAt` / `lastRunProcessed` / `lastRunFailed` | last run's outcome, for inspection |

The watermark advances **only after a fully clean run** — that is what makes a failed run
self-healing rather than a permanent silent gap. `timestamps: false`: this document's own
mtime carries no meaning.

A `full`-mode run never persists `watermark`, so a repair pass cannot rewind the live cursor.
The **scheduled** hourly full pass advances `fullPassCursor` instead; the **ops backfill**
passes `afterUpdatedAt` explicitly and touches neither. Without the rotating cursor a full
pass restarts from epoch every time and never covers more than its first page.

## `User.klaviyoSyncedAt` (2026-08-26)

When **we** last wrote this user's profile to Klaviyo. Written by the sweep with
`{ timestamps: false }` so it does not bump `updatedAt` (which would re-dirty the user and
stop the sweep converging).

Deliberately not derived from Klaviyo's own `updated` field — that moves whenever Klaviyo runs
predictive analytics, so it cannot answer "when did *we* last write this profile?".

Backed by `UserSchema.index({ updatedAt: 1 })`, which the sweep's selector and its backlog
gauge both require.
