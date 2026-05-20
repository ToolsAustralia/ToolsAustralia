# Admin layout guard

`src/app/admin/layout.tsx` is the **server-side** gate for everything under `/admin`. It calls `getServerSession`, redirects unauthenticated users to login, and redirects non-staff to `/`.

The legacy bridge (`session.user.role === "admin"`) is still allowed in until Phase 5 cleanup deletes the legacy `role` field.

Per-action permission gating (e.g. who can edit users vs view them) happens at the API-route level via `requirePermission()`, not here.

## Sidebar filtering

`AdminSidebar.tsx` filters its tab list through `usePermissions().has(tab.requires)`. Tabs the current staff user cannot view never render.

Each tab declares its required permission inline via the `requires` field on the `adminTabGroups` array entries. To add a new tab, add the entry with the appropriate `<area>.view` permission. Groups with no visible tabs are omitted from the sidebar entirely.

Tabs that don't have a dedicated permission area in the catalog (e.g. `tiktok-ads`, `snapchat-ads`, `blocked-transactions`) map to the closest related area (`facebookAds.view` or `settings.view`).

## Settings preview route (dev-only design mockup)

`/admin/settings/preview` renders a static visual mockup of the Roles + Staff screens with mock data from `src/components/admin/settings/preview/mockData.ts` — no DB calls, no mutations. The page is gated behind the admin layout's staff/admin guard and a `usePermissions().has("settings.view")` check. Both light and dark themes are supported via the existing `dark:` Tailwind classes.

The preview locks the visual direction before Tasks 20/21 build the real, API-integrated versions. The Discord-inspired structure (left-rail roles list + permission sections with toggleable Discord-style rows on Roles; member-list cards with role-color avatars on Staff) is carried into the real components at `src/components/admin/settings/RolesManagement.tsx` and `StaffManagement.tsx`.

## Settings → Roles management

`src/components/admin/settings/RolesManagement.tsx` is the real, API-backed roles editor. It reads from `/api/admin/roles`, batches permission toggles into a single PATCH on save (so flipping ten toggles is one network call, not ten), and exposes a small color-preset picker for the Discord-style role chip. The Admin role's permissions are read-only here and the seed script is the only writer.

Save semantics:
- Toggle changes are kept in local component state until the user presses **Save** — a top-right button enabled only when the form is dirty.
- **Discard** rolls the editor back to the server state.
- Creating a new role pops up a small modal (name + preset color). New roles start with zero permissions; the owner toggles them on after creation.
- Deleting checks `memberCount` client-side and refuses on the server too (`409`).
- All mutations invalidate the `["admin", "roles"]` query so the sidebar and member counts stay current.

The preview route can stay live in dev for quick visual reference or be removed once production is shipped — decide during the cleanup PR.
