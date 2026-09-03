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

`src/app/admin/component/SettingsTab.tsx` is the small wrapper rendered for `selectedTab === "team"` inside `AdminPage.tsx`. It owns the **Staff / Roles / Logs** sub-nav and delegates to the three management components. Each sub-tab is per-permission gated: Staff and Roles require `settings.view`; Logs requires `audit.view`. A staff member with only `audit.view` sees only the Logs sub-tab; a staff member with only `settings.view` sees only Staff + Roles. The component is named `SettingsTab` for historical reasons (the tab was originally called "Settings"); the file can be renamed in a follow-up if anyone trips on it.

The sidebar gates the parent Team entry on `settings.view`, so an `audit.view`-only role currently needs `settings.view` to be granted as well to reach the page. This is the documented trade-off for keeping the Team group in the sidebar to a single entry rather than splitting Audit out again.

Sub-nav layout: a horizontal scrollable bar at the top of the page. On mobile the icons + labels remain inline; if more sub-tabs are added later, the bar already supports horizontal overflow scroll.

## Staff Activity (Audit log — "Logs" sub-tab)

`src/app/admin/component/StaffActivityManagement.tsx` is the audit viewer rendered inside `SettingsTab` as the **Logs** sub-tab (it is no longer a top-level admin tab). It lists every row from the `StaffActivity` collection (see [staff-activity-log.md](./staff-activity-log.md)) newest-first with cursor-paginated infinite scroll. Filter chips toggle between all rows, 200 successes, and 403 forbidden attempts. The free-text search filters client-side across actor email, role name, and request path — server-side full-text is deferred per the spec.

Forbidden (403) rows are highlighted with a faint red background and a "403 Forbidden" badge so privilege drift is easy to spot at a glance.

The sub-tab is hidden when the viewer lacks `audit.view`; if the viewer reaches the underlying GET endpoint directly without the permission, the API returns 403.

## Mobile responsiveness (Discord-style)

Roles management uses a master-detail layout. On `md+` viewports the list of roles sits in a fixed-width sidebar with the editor to its right. On smaller viewports the list takes the full width; selecting a role slides the editor in over the list with a back-arrow in the editor header to return. Implementation lives in `src/components/admin/settings/RolesManagement.tsx` via a `mobileView` state (`'list' | 'editor'`).

Staff rows stack into two rows on mobile (identity + status above, role selector + actions below) and collapse to a single horizontal row on `sm+`. Implementation in `src/components/admin/settings/StaffManagement.tsx`.

## Date filter lives in the header at every breakpoint (2026-09-02)

The date-range control now **portals into the admin header slot on desktop as well as mobile**.
The slot (`ADMIN_DATE_TOOLBAR_SLOT_ID`, rendered by `AdminPage`) sits inside the
`flex-shrink-0` header, **above** the `flex-1 overflow-y-auto` scroll container — so anything
portalled into it is permanently visible for free, at any scroll position, with no positioning
tricks.

**What this replaced.** Desktop had *two* different broken behaviours:

| Surface | Before | Problem |
| --- | --- | --- |
| `AdminDateRangeToolbar` (Overview, All-Platforms, TikTok, Snapchat, Repeat Purchases) | inline + `sticky top-0` with negative insets | Floated over the cards it was meant to sit above |
| Six hand-rolled sites (Receipts, Blocked Transactions, Past-Due Charges, Cancellation Flow, Facebook Ads, Promo Analytics) | inline beside the section `<h2>` | Scrolled away entirely |

Both are gone. Every consumer now follows the same two-branch rule:

```tsx
{slotEl ? createPortal(<AdminLayoutDateRangeShell>{control}</AdminLayoutDateRangeShell>, slotEl)
        : /* inline fallback — first paint only, before the slot mounts */}
```

⚠️ **The slot div must never be `lg:hidden`.** Consumers portal into it unconditionally, and
portalling into a `display: none` element makes the filter **vanish entirely on desktop** — no
error, nothing in the console. This is the single highest-risk line in the change.

**Renames** (the old names asserted "mobile", which is now false):

| Was | Now |
| --- | --- |
| `adminMobileDateToolbarSlot.ts` | `adminDateToolbarSlot.ts` |
| `useAdminMobileDateToolbarSlot` | `useAdminDateToolbarSlot` |
| `AdminMobileLayoutDateRangeShell` | `AdminLayoutDateRangeShell` |
| `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` | `ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR` |
| `ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID` | `ADMIN_DATE_TOOLBAR_SLOT_ID` |

The DOM **id string** stays `"admin-mobile-date-toolbar-slot"` — it is internal, has no external
consumers, and renaming it buys nothing but a chance to miss a reference. The hook no longer
returns `isLgUp`: the breakpoint is not part of the placement decision any more.

`receipts`, `blocked-transactions` and `past-due-history` were **added** to
`ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR` — they render their own date control and previously had no
header slot to portal into. Klaviyo and A/B Testing stay deliberately absent (neither uses this
filter; adding them would mount an empty header slot).

`AdminLayoutDateRangeShell` is `w-full` below `lg` and `lg:w-auto` above, because the desktop
header lays the slot out next to the theme toggle and a full-width child would push it off the row.

## Collapsible desktop sidebar (2026-09-02)

A toggle on the sidebar's right edge collapses it from `17.5rem` to a `3.75rem` icon rail.
Collapsed, each of the eight groups renders **only its `groupIcon`**; hovering (or focusing) it
opens a flyout listing that group's permission-filtered tabs. Group icons — not per-tab icons —
because the nav is already organised by group and 25 tab icons would need their own scrollbar,
defeating the point.

**State lives in `AdminPage`**, not `AdminSidebar`: the collapsed *width* is on the wrapper
`AdminPage` renders, so it has to know anyway. `AdminSidebar` takes `collapsed` +
`onToggleCollapsed` and stays presentational. Persisted in
`localStorage["admin-sidebar-collapsed"]` — a chrome preference should outlive the tab, unlike
group expansion which stays in `sessionStorage["admin-sidebar-expanded"]`. Two keys, two
lifetimes, deliberately not merged.

⚠️ Read `localStorage` in an **effect**, never in the `useState` initialiser — the server has no
`localStorage`, so initialising from it renders a different tree on the client and trips
hydration.

**Two silent traps, both of which look fine in review:**

1. **The nav's `overflow-y-auto` clips the flyout.** A scroll container clips absolutely-
   positioned children, so the flyout renders and is simply invisible — no error. The nav
   switches to `overflow-visible` while collapsed; eight icons fit any `lg` viewport, so there
   is nothing to scroll.
2. **The attention dot must survive collapsing.** Operations (unviewed submissions) and Draws
   (mini draws at capacity) carry badges whose entire job is to be seen. Collapsed, they move to
   the icon's top-right with a ring in the sidebar background. Hiding them behind a hover would
   defeat the badge.

The flyout also needs an invisible **hover bridge** across its `ml-2` gap, or it dismisses as the
pointer travels from icon to panel.

**Mobile is untouched** — it keeps the full-width drawer and receives neither prop. A hover rail
is a dead control on touch.

The tab row is rendered by a single shared `renderTabButton(tab, attachRef)` used by both the
expanded nav and the flyout, so the two cannot drift. `attachRef` is false inside a flyout:
`tabButtonRefs` drives the scrollIntoView that keeps the active tab visible in the expanded nav,
and a hidden flyout would otherwise overwrite that ref with an unscrollable element.
