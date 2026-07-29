# MER table (Marketing Efficiency Ratio per draw)

A dashboard Overview section showing **New Revenue ÷ Ad Spend per major draw**, with a
per-platform breakdown. Requested by the client to judge channel efficiency (esp. "is
TikTok worth investing in?").

## Definitions

- **MER** = `New Revenue ÷ Ad Spend` (the client wrote it inverted; it's the standard
  blended Marketing Efficiency Ratio).
- **New Revenue** = acquisition revenue, i.e. **Total Revenue − subscription renewals**
  ("Updates" in the client's wording). This is exactly the `newRevenue` already produced
  by the dashboard-stats pipeline (`attributedRevenue[*].newRevenue`, renewals excluded
  in `revenueAggregator`).
- **Blended** numerator = Σ `newRevenue` across **all** attributed platforms incl.
  `direct`/`other` — NOT the paid-channel-only basis the Advertising card's blended ROAS
  uses. This is deliberate: MER divides *all* front-door acquisition revenue by *all* ad
  spend, which is what makes it attribution-robust.
- **Ratios never average across days.** Spend and revenue are summed over the draw window
  first, then divided (see `readStatsForRange`, which already recomputes channel ratios
  from summed totals).

## Scope: which draws

Starts at the draw that began **28 Apr 2026 (AEST)** — when payment→platform attribution
(`PaymentEvent.convertingPlatform`) went live. Earlier draws have no per-platform
attribution (everything would read as `direct`), so they are excluded. Cutoff constant:
`MER_TABLE_START_UTC` in `merByDrawService.ts` (`2026-04-27T14:00Z` = 28 Apr 00:00 AEST).
Draw windows come from `MajorDraw.activationDate → drawDate` (the 28th→27th production
cadence); most-recent draw on top; the active/frozen draw is flagged `inProgress`.

## Data path (high reuse, no new aggregation engine)

```
MajorDraw (activationDate ≥ cutoff, status active/frozen/completed, sort drawDate desc)
   └─ per draw → readStatsForRange({ activationDate, drawDate })   # existing range reader
        ├─ adChannels      : { facebook: { spend } }   # Meta only today
        └─ attributedRevenue : per-platform { newRevenue }
   └─ computeDrawMerRow(...)  # pure, DB-free, unit-tested
```

- `readStatsForRange` sums completed AEST days from `DashboardStatsDailySnapshot` and
  computes today/missing days live; it stops enumerating at "today", so a future
  `drawDate` (the in-progress draw) is safe.
- `PLATFORM_TO_AD_CHANNEL_KEY` bridges `meta→facebook` etc. for the per-platform spend join.

## Files

| Layer | File |
|---|---|
| Types (shared server/client contract) | `src/types/admin/mer.ts` |
| Pure computation (unit-tested) | `src/services/admin/mer/computeDrawMer.ts` |
| Service (draw enumeration + range reads) | `src/services/admin/mer/merByDrawService.ts` |
| Route `GET /api/admin/analytics/mer-by-draw` (perm `overview.view`) | `src/app/api/admin/analytics/mer-by-draw/route.ts` |
| Query hook | `src/hooks/queries/useMerByDraw.ts` |
| Presentation model (platform config, toggle, sort, formatting) | `src/app/admin/component/overview/sections/merByDrawModel.ts` |
| Card (sortable + click-to-expand + platform toggle) | `src/app/admin/component/overview/sections/MerByDrawCard.tsx` |
| Test | `src/services/admin/mer/__tests__/computeDrawMer.test.ts` (`npm run test:mer`) |

The card is wired into `DashboardOverview.tsx` above the charts row (the "Revenue overview"
area chart + "Active memberships" donut), directly under the Revenue-breakdown/Advertising
row. It is **self-contained** — it owns its per-draw windows and intentionally ignores the
page date filter.

## UI

Top-level columns: `Period | New Revenue | Ad Spend | New MER | Ad Spend (⟨platform⟩) | New MER (⟨platform⟩)`.
The last two are driven by a **platform toggle (default TikTok**, switchable to Meta/Snapchat).
Every column is sortable; default sort is period descending. Clicking a row **expands** a
per-platform breakdown (Meta/TikTok/Snapchat/Klaviyo/Direct). Owned channels (Klaviyo,
Direct) show `—` for spend/MER.

## Known limitation — Snapchat spend (TikTok resolved 2026-07-24)

**TikTok spend is now wired** (panel F-001): `AD_CHANNEL_PROVIDERS = [facebookAdChannelProvider, tiktokAdChannelProvider]` — the TikTok provider sums each AEST day's synced `TikTokAdInsightsDaily` rows, so TikTok MER becomes a real number automatically once the nightly `/api/cron/sync-tiktok-ads` has data (blocked on the Marketing-API token re-authorization as of 2026-07-24; backfill via `npm run seed:tiktok-insights`). Until rows exist, TikTok spend still reads **"Awaiting sync"** and MER `—`.

**Snapchat** remains spend-less: attributed *revenue* but no spend feed. Adding it later is the same one-provider append (`adChannelProviders.ts`), after which the column/row fills in automatically with no UI change. Google/Other are folded into the blended numerator but get no dedicated breakdown row (typically ~0, no brand logo).

## Norm

This is a new admin read endpoint. It is **not** mirrored to the internal-norm/OpenClaw
gateway yet (CLAUDE.md rule 10) — flagged for the owner to decide.
