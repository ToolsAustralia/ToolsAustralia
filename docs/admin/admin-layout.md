# Admin layout guard

`src/app/admin/layout.tsx` is the **server-side** gate for everything under `/admin`. It calls `getServerSession`, redirects unauthenticated users to login, and redirects non-staff to `/`.

The legacy bridge (`session.user.role === "admin"`) is still allowed in until Phase 5 cleanup deletes the legacy `role` field.

Per-action permission gating (e.g. who can edit users vs view them) happens at the API-route level via `requirePermission()`, not here.

## Sidebar filtering

`AdminSidebar.tsx` filters its tab list through `usePermissions().has(tab.requires)`. Tabs the current staff user cannot view never render.

Each tab declares its required permission inline via the `requires` field on the `adminTabGroups` array entries. To add a new tab, add the entry with the appropriate `<area>.view` permission. Groups with no visible tabs are omitted from the sidebar entirely.

Tabs that don't have a dedicated permission area in the catalog (e.g. `tiktok-ads`, `snapchat-ads`, `blocked-transactions`) map to the closest related area (`facebookAds.view` or `settings.view`).
