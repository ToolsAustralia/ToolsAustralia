# Roles

A Role is a named bundle of permissions stored in MongoDB. The admin Settings → Roles screen creates and edits them.

## Schema (`src/models/Role.ts`)

| Field | Type | Notes |
|---|---|---|
| `name` | String, unique, ≤60 chars | Displayed in UI |
| `permissions` | String[] | Subset of `PERMISSIONS` from `src/lib/permissions.ts`. Unknown values fail schema validation. |
| `isSystem` | Boolean | `true` for seeded roles (Admin). System roles cannot be deleted or renamed via the UI. |
| `createdBy` | ObjectId → User | Staff user who created this role. `null` for seeded roles. |

## Seeded roles

Created by `scripts/migrate-seed-staff-roles.ts`:

- **Admin** — every permission, `isSystem: true`. Backfill links existing `role: "admin"` users here.
- **Ads Manager** — `facebookAds.{view,edit}`, `pageAnalytics.view`, `promoAnalytics.view`, `abTesting.view`, `overview.view`. `isSystem: false` (deletable; serves as a starter template).

## Last-admin protection

The role editor disables the `settings.edit` checkbox when editing any system role, and the staff list disables removing the currently-logged-in admin. This is best-effort UI; the DB allows the foot-gun.
