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
- **verdictEngine.ts** — Decision engine with 4-verdict pipeline: CUT → INVESTIGATE → SCALE → HOLD.
  - **CUT**: fires on any of: LearningLimited ≥3d with spend floor, spend ≥ 2×CPA multiplier with 0 conv or bad CPA, non-purchase-capable campaign objective.
  - **INVESTIGATE**: fires when all three groups pass — (a) "Was healthy": best 7d in last 14d had ≥50 conv AND ROAS ≥ breakeven; (b) "Now broken": ROAS dropped >roasDropTriggerPct WoW with ≥50 conv in both weeks, OR status reverted from Active; (c) "Recent edit": lastSignificantEdit ≤7d ago. Requires ≥50 conv in both comparison weeks (stat-confidence floor).
  - **SCALE**: fires when adset is Active, ≥50 conv/7d, ROAS ≥ breakeven, no edit within postEditWaitHours, ROAS stable WoW.
  - **HOLD**: default when none of the above fire.
- **insightsAggregator** (Task 18, updated Task 22) — Builds `MetaAdInsightsRow` by fetching live from Meta's Marketing API via `fetchFacebookAdInsightsDaily` + `fetchAdsetMetadata`. No Mongo dependency — always shows real data regardless of cron state. Known tradeoff: `daysInLearningLimited` is best-effort (0 or 1 based on current state) because Meta's live API does not return historical learning status per day.
