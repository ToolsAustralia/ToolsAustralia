# Permissions Catalog

The permission catalog (`src/lib/permissions.ts`) is the **single source of truth** for what permissions exist in the system. Every permission corresponds to a real code gate; the admin UI can only *bundle* existing permissions into roles — it cannot invent new ones.

## Shape

Permissions are strings of the form `<area>.<action>` where:
- `area` is one of 15 admin areas (see `AREAS`)
- `action` is `view` or `edit`

Total: 30 permissions.

## Adding a new area

1. Add the area name to the `AREAS` tuple in `src/lib/permissions.ts`.
2. Gate the new code path on `<area>.view` or `<area>.edit` via `requirePermission()` (server) or `usePermissions().has()` (client).
3. Optionally grant the new permissions to the seeded Admin role via a one-off script (Admin auto-gains every permission on seed; existing custom roles do not auto-gain new permissions — by design).

## Areas

| Area | Notes |
|---|---|
| `overview` | Admin dashboard landing |
| `users` | Customer user management |
| `promos` | Promo creation & toggling |
| `facebookAds` | Facebook Ads management |
| `pageAnalytics` | Page analytics dashboard |
| `promoAnalytics` | Promo-specific analytics |
| `submissions` | Contact form submissions |
| `miniDraws` | Mini-draw management |
| `majorDraw` | Major draw operations |
| `drawResults` | Past draw results admin view |
| `upcomingDraws` | Upcoming draws calendar |
| `affiliates` | Affiliate program admin |
| `errorReports` | Error report viewing |
| `abTesting` | A/B test management |
| `settings` | Admin settings (includes Roles & Staff sub-tabs) |
