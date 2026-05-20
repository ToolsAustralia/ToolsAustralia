# Roles API

CRUD over the `Role` collection (`src/models/Role.ts`). All endpoints live under `/api/admin/roles/**` and require an authenticated **admin** or **staff with `settings.*` permission** (see [staff-permissions-mapping.md](./staff-permissions-mapping.md)).

| Method | Path | Permission | Response |
|---|---|---|---|
| GET | `/api/admin/roles` | `settings.view` | `{ success, data: { roles: Role[], catalog: Permission[] } }` |
| POST | `/api/admin/roles` | `settings.edit` | `201 { success, data: { id } }` |
| PATCH | `/api/admin/roles/:id` | `settings.edit` | `{ success }` |
| DELETE | `/api/admin/roles/:id` | `settings.edit` | `{ success }` |

## GET shape

Each role returned in `data.roles` carries:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Mongo `_id` as string |
| `name` | string | Trimmed, unique, ≤60 chars |
| `permissions` | `string[]` | Subset of `data.catalog` |
| `isSystem` | boolean | `true` for the seeded Admin role |
| `memberCount` | number | Result of an aggregation against `User.roleId` |
| `createdAt`, `updatedAt` | ISO date | Mongoose timestamps |

`data.catalog` is the full hardcoded permission list from `src/lib/permissions.ts` — the UI uses it to render the per-area view/edit grid.

## System-role guards

- `isSystem: true` roles **cannot be renamed** via PATCH (`403 "Cannot rename a system role"`).
- The **Admin role's permissions are immutable** via PATCH (`403 "Admin role permissions are managed by the seed script"`). Use `npm run migrate:seed-staff-roles` to add new permissions to Admin when the catalog grows.
- `isSystem: true` roles **cannot be deleted** (`403 "Cannot delete a system role"`).

## Member protection

A role with `memberCount > 0` cannot be deleted — the API returns `409 "Cannot delete: N staff member(s) still hold this role"`. Move staff off the role first via `PATCH /api/admin/staff/:id`.

## Validation

- `name` is trimmed, required, max 60 chars.
- `permissions` is validated against the in-process catalog (`isValidPermission`). Unknown strings cause `400 "Contains unknown permissions"`.
- Duplicate names cause `409 "A role with that name already exists"` (Mongo `E11000`).
