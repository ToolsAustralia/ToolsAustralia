# Admin layout guard

`src/app/admin/layout.tsx` is the **server-side** gate for everything under `/admin`. It calls `getServerSession`, redirects unauthenticated users to login, and redirects non-staff to `/`.

The legacy bridge (`session.user.role === "admin"`) is still allowed in until Phase 5 cleanup deletes the legacy `role` field.

Per-action permission gating (e.g. who can edit users vs view them) happens at the API-route level via `requirePermission()`, not here.

## Sidebar filtering

`AdminSidebar.tsx` filters its tab list through `usePermissions().has(tab.requires)`. Tabs the current staff user cannot view never render.

Each tab declares its required permission inline via the `requires` field on the `adminTabGroups` array entries. To add a new tab, add the entry with the appropriate `<area>.view` permission. Groups with no visible tabs are omitted from the sidebar entirely.

Tabs that don't have a dedicated permission area in the catalog (e.g. `tiktok-ads`, `snapchat-ads`, `blocked-transactions`) map to the closest related area (`facebookAds.view` or `settings.view`).

## Team tab (top-level)

The Team tab (formerly "Settings") lives in its own top-level sidebar group at the bottom, separate from Operations. URL is `/admin/team`. The group is intentionally a stub-with-one-tab today so the owner can grow it later (API keys, integrations, audit log) without renaming or restructuring the sidebar.

Internally the permission area is still called `settings` (covers `settings.view` / `settings.edit` / `settings.delete`) because the same area-string gates a few other sidebar entries (Activity Log, Blocked Transactions, Past-Due Charges, Webhook Queue). Renaming the catalog area would force a sweep of every consumer; the UI-facing label is what changed.

## Team → Roles management

`src/components/admin/settings/RolesManagement.tsx` is the real, API-backed roles editor. It reads from `/api/admin/roles`, batches permission toggles into a single PATCH on save (so flipping ten toggles is one network call, not ten), and exposes a small color-preset picker for the Discord-style role chip. The Admin role's permissions are read-only here and the seed script is the only writer.

Save semantics:
- Toggle changes are kept in local component state until the user presses **Save** — a top-right button enabled only when the form is dirty.
- **Discard** rolls the editor back to the server state.
- Creating a new role pops up a small modal (name + preset color). New roles start with zero permissions; the owner toggles them on after creation.
- Deleting checks `memberCount` client-side and refuses on the server too (`409`).
- All mutations invalidate the `["admin", "roles"]` query so the sidebar and member counts stay current.

## Team → Staff management

`src/components/admin/settings/StaffManagement.tsx` is the API-backed staff editor. It joins `Role.color` into the GET response so each staff row gets a role-colored avatar, marks `userType: "admin"` members with a Crown icon, and disables the "Remove" action on the currently-logged-in user.

- The role dropdown auto-saves on change (single PATCH per change — the editor doesn't batch role changes since they're already atomic).
- Resend invite is a single click — generates a fresh token and re-sends via SendGrid.
- The Invite modal accepts email / first name / last name / role and notes that inviting into the **Admin** role creates a super-admin. The default selected role is the first non-Admin role to avoid accidental super-admin creation.
- Removal demotes `userType` back to `customer`, clears `roleId`, deactivates the user, and wipes any invite token. The User document is preserved for audit history.

## SettingsTab wrapper

`src/app/admin/component/SettingsTab.tsx` is the small wrapper rendered for `selectedTab === "team"` inside `AdminPage.tsx`. It owns the Staff / Roles sub-nav (Staff is default) and delegates to the two management components. The component is named `SettingsTab` for historical reasons (the tab was originally called "Settings"); the file can be renamed in a follow-up if anyone trips on it.

Sidebar already gates the tab on `settings.view`, so this component does not duplicate the permission check.

## Staff Activity (Audit)

`src/app/admin/component/StaffActivityManagement.tsx` is the top-level audit viewer rendered at `/admin/staff-activity`. It lists every row from the `StaffActivity` collection (see [staff-activity-log.md](./staff-activity-log.md)) newest-first with cursor-paginated infinite scroll. Filter chips toggle between all rows, 200 successes, and 403 forbidden attempts. The free-text search filters client-side across actor email, role name, and request path — server-side full-text is deferred per the spec.

Forbidden (403) rows are highlighted with a faint red background and a "403 Forbidden" badge so privilege drift is easy to spot at a glance.

The page is gated by `usePermissions().has("audit.view")` and re-checks server-side via the GET endpoint.
