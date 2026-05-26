# Tracking — Models

| Model | Path | Purpose |
|---|---|---|
| `MetaAdDestination` | [src/models/MetaAdDestination.ts](../../src/models/MetaAdDestination.ts) | Meta ad destination config |
| `MetaAdInsightsDaily` | [src/models/MetaAdInsightsDaily.ts](../../src/models/MetaAdInsightsDaily.ts) | Daily ad insights snapshots from Meta Marketing API (extended with health monitoring fields: `linkClicks`, `adsetBudgetCents`, `campaignObjective`, `learningStatus`, `lastSignificantEdit`) |

> _TODO: pull schemas._

## TikTokAdInsightsDaily

[`src/models/TikTokAdInsightsDaily.ts`](../../src/models/TikTokAdInsightsDaily.ts). Daily ad-level insights from TikTok Marketing API. Same shape as `MetaAdInsightsDaily`. Unique key: `(adAccountId, date, adId)`. No sync service writes to this yet — sync ships in a follow-up spec.

## SnapchatAdInsightsDaily

[`src/models/SnapchatAdInsightsDaily.ts`](../../src/models/SnapchatAdInsightsDaily.ts). Same shape and same status as TikTok.

## FacebookAdsHealthSnooze

[`src/models/FacebookAdsHealthSnooze.ts`](../../src/models/FacebookAdsHealthSnooze.ts). Per-user, per-ad snooze for the Facebook Ads Health view's "Investigate" verdict. Includes TTL index for automatic expiration.

## FacebookAdsHealthSettings

[`src/models/FacebookAdsHealthSettings.ts`](../../src/models/FacebookAdsHealthSettings.ts). Singleton settings document for the Facebook Ads Health verdict engine. One document with `scope='global'`, lazy-initialised with defaults on first read by the settings service.

## Facebook Ads Health Services

[`src/services/facebook-ads-health/`](../../src/services/facebook-ads-health/) contains the verdict engine for analyzing Facebook ad performance:

- **types.ts** — Shared types: `Verdict` ("scale" | "hold" | "investigate" | "cut"), `MetaAdInsightsRow`, `VerdictResult`, etc.
- **computeVerdict** (Task 6) — Decision engine applying tunable rules to insights rows.
- **insightsAggregator** (Task 18) — Builds `MetaAdInsightsRow` from `MetaAdInsightsDaily` snapshots, windows, and trends.
