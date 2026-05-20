# Staff Permissions Mapping

This document maps each admin API route group to the RBAC permission(s) required to access it.
Updated as each task in the user-roles migration replaces legacy `session.user.role === "admin"` checks.

| Route group | HTTP methods | Permission required |
|---|---|---|
| `/api/admin/users` (list) | GET | `users.view` |
| `/api/admin/users/[id]` | GET | `users.view` |
| `/api/admin/users/[id]` | PATCH | `users.edit` |
| `/api/admin/users/[id]/actions` | POST | `users.edit` |
| `/api/admin/users/[id]/cancel-subscription` | POST | `users.edit` |
| `/api/admin/users/[id]/delete` | DELETE | `users.edit` |
| `/api/admin/users/[id]/deletion-summary` | GET | `users.view` |
| `/api/admin/users/search` | GET | `users.view` |
| `/api/admin/users/export` | GET | `users.view` |

## Notes

- Routes not yet migrated (e.g. `charge-past-due`, `force-charge`, `payment-events`, `recover-past-due-invoice`) still use the legacy `session.user.role === "admin"` check and will be updated in subsequent tasks.
- The `requirePermission()` helper (`src/lib/api-auth-permissions.ts`) includes a legacy bridge: existing `admin`-role users without a `roleId` are granted every permission during the transition window.
