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
| `/api/admin/promo/active` | GET | `promos.view` |
| `/api/admin/promo/active` | POST | _(public — no auth)_ |
| `/api/admin/promo/alternating-multiplier` | GET | `promos.view` |
| `/api/admin/promo/alternating-multiplier` | POST | `promos.edit` |
| `/api/admin/promo/alternating-multiplier/[id]` | PATCH | `promos.edit` |
| `/api/admin/promo/alternating-multiplier/[id]` | DELETE | `promos.edit` |
| `/api/admin/promo/banner-text` | GET | `promos.view` |
| `/api/admin/promo/banner-text` | POST | `promos.edit` |
| `/api/admin/promo/banner-text/active` | GET | _(public — no auth)_ |
| `/api/admin/promo/banner-text/[id]` | PUT | `promos.edit` |
| `/api/admin/promo/banner-text/[id]` | DELETE | `promos.edit` |
| `/api/admin/promo/bonus-entry/active` | GET | `promos.view` |
| `/api/admin/promo/bonus-entry/create` | POST | `promos.edit` |
| `/api/admin/promo/bonus-entry/list` | GET | `promos.view` |
| `/api/admin/promo/bonus-entry/[id]` | PATCH | `promos.edit` |
| `/api/admin/promo/bonus-entry/[id]` | DELETE | `promos.edit` |
| `/api/admin/promo/create` | POST | `promos.edit` |
| `/api/admin/promo/effective` | GET | `promos.view` |
| `/api/admin/promo/end` | POST | `promos.edit` |
| `/api/admin/promo/history` | GET | `promos.view` |
| `/api/admin/promo/toggle` | POST | `promos.edit` |
| `/api/admin/promo/link/list` | GET | `promos.view` |
| `/api/admin/promo/link/create` | POST | `promos.edit` |
| `/api/admin/promo/link/[id]` | PATCH | `promos.edit` |
| `/api/admin/promo/link/[id]` | DELETE | `promos.edit` |
| `/api/admin/promo/scheduled/list` | GET | `promos.view` |
| `/api/admin/promo/scheduled/create` | POST | `promos.edit` |
| `/api/admin/promo/scheduled/apply-month` | POST | `promos.edit` |
| `/api/admin/promo/scheduled/[id]` | PATCH | `promos.edit` |
| `/api/admin/promo/scheduled/[id]` | DELETE | `promos.edit` |

## Notes

- Routes not yet migrated (e.g. `charge-past-due`, `force-charge`, `payment-events`, `recover-past-due-invoice`) still use the legacy `session.user.role === "admin"` check and will be updated in subsequent tasks.
- The `requirePermission()` helper (`src/lib/api-auth-permissions.ts`) includes a legacy bridge: existing `admin`-role users without a `roleId` are granted every permission during the transition window.
