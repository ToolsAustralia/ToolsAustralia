# Admin — Architecture

## Layout

| Path | Role |
|---|---|
| [src/app/admin/](../../src/app/admin/) | Admin panel pages (tab-based, `/admin/[tab]`) |
| [src/components/admin/](../../src/components/admin/) | Admin-specific components (UserDetailModal, ChargePastDueModal, etc.) |
| [src/app/api/admin/](../../src/app/api/admin/) | Admin API routes — catch-all for routes not owned by another domain |
| [src/features/admin/](../../src/features/admin/) | Admin feature modules |
| [src/server/admin/](../../src/server/admin/) | Server-only admin code (e.g. `chargePastDueShared.ts`) |
| [src/hooks/useAdminMobileDateToolbarSlot.ts](../../src/hooks/useAdminMobileDateToolbarSlot.ts) | Admin-specific UX hook |

## Auth

Per [auth rules R1-R2](../auth/rules.md): middleware gates `/admin/**` PAGES; per-handler `requireAdmin(session)` gates `/api/admin/**` ROUTES. Both layers required.

## Tabbed admin panel

`/admin/[tab]/` — single dynamic route hosts the tabbed interface. Each tab renders a different feature surface (users, payments, draws, promo, errors, etc.).

## Key admin features

- User detail modal (with subscription tab → cancel subscription)
- Charge past-due modal (bulk retry failed renewals)
- Error reports triage
- Promo / campaign management (see also: `PromoPurchaseEntriesPreview` for live per-package entry preview in Toggle Promos modal)
- Affiliate management
- Draw management
- Dashboard stats daily snapshot — `src/services/admin/dashboard-stats/` subsystem. See [backend.md](./backend.md#services) and [models.md](./models.md#dashboardstatsdailysnapshot).

## User Detail Modal

### Draw entry picker (Activity tab → Edit Entries)

The "Manage Draw Entries" form (admin edit mode in the Activity tab) uses
`src/components/admin/DrawSelect.tsx` to pick draws by name and image
instead of pasting ObjectIds. Two hooks back it:

- `useAdminMajorDrawsList` → `GET /api/admin/major-draw/history?limit=100`
- `useAdminMiniDrawsList`  → `GET /api/admin/mini-draw/list?limit=100`

Both are lazy (`enabled` bound to `activeEditTab === "activity"`) and cached
for 5 minutes. The payload sent to the existing
`/api/admin/users/[id]` route is unchanged — `drawId` / `miniDrawId` are
still ObjectId strings.
