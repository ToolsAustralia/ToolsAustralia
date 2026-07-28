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
[docs/admin/api.md](../admin/api.md)) returns, as of 2026-07-28: `byPage` (each row now also
carrying `buildDistribution`, the full built-prize distribution for that page — see
[backend.md](backend.md#read-side-gap-closure--builddistribution--getaggregatedbybuiltprize-2026-07-28)),
`byUTMSource`, and the new `byBuiltPrize` (cross-page, grouped by the combination actually built,
not by landing page).
