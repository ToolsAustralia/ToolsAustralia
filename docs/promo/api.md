# Promo — API

## Routes

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/promo/**` | Promo CRUD, activation, list |
| _TODO_ | `/api/codes/**` | Promo code validation / redemption |

> _TODO: read [src/app/api/promo/](../../src/app/api/promo/) and [src/app/api/codes/](../../src/app/api/codes/) handlers and document each._

## Related tracking endpoints

`POST /api/tracking/promo-prize-build` — attaches the "build your prize" configurator's result to
an existing visit row. It lives under `src/app/api/tracking/**` (the `tracking` domain, not
`promo`), so it's documented in full at [docs/tracking/api.md](../tracking/api.md); the
functional core it delegates to is documented here at
[backend.md](backend.md#prize-build-core--recordprizebuild-2026-07-27).

## Cross-domain admin routes

Under `/api/admin/**` (in [admin](../admin/)):
- Promo creation / scheduling
- Banner text management
- Analytics dashboards

`GET /api/admin/promo-analytics` (route lives under the `admin` domain, see
[docs/admin/api.md](../admin/api.md)) returns, as of 2026-07-31:

- `byPage` — each row carries `visits`, `buildVisitors` (build **exposure**), `builds` (build
  **engagement**), `buildChangeRate`, `topBuiltPrize`, `buildDistribution`, signups, conversions,
  revenue and three rates. `crossVisits` was **removed**.
- `byChannel` — **renamed from `byUTMSource`**. Keyed on the canonical `ConvertingPlatform` rather
  than a raw `utm_source`; rows carry `channel` + `channelLabel`.
- `byBuiltPrize` — cross-page, grouped by the combination actually built, not by landing page.
- `dateRange` — now `{ start, end, visitsRetainedFrom, clampedToRetention }`.

`GET /api/admin/promo-analytics/channel-detail` takes **`channel`** (a closed enum of
`CHANNEL_KEYS`), not `utmSource`, and returns `channel` / `channelLabel` / `summary` / `byPage` /
`byCampaign` / `rawSources`. `GET /api/admin/promo-analytics/page-detail` returns
`buildBreakdown` in place of the removed `visitsFrom`. All three now gate on `pageAnalytics.view`
(was `promos.view`). Rationale for every one of these:
[backend.md](backend.md#page-analytics-repair--2026-07-31).
