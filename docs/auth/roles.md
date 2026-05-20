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

## User model additions

The `User` collection gained six staff-related fields (`src/models/User.ts`):

| Field | Type | Notes |
|---|---|---|
| `roleId` | ObjectId → Role, nullable | `null` for customers; set for staff |
| `userType` | "customer" \| "staff" | Derived from invite; defaults "customer" |
| `inviteToken` | String, unique sparse | Single-use; cleared on setup |
| `inviteTokenExpires` | Date | 7 days from invite |
| `invitedBy` | ObjectId → User | Audit |
| `invitedAt` | Date | Audit |

Three indexes were added: `userType: 1` (filter staff vs customers), `roleId: 1` (sparse, find all users with a given role), and `inviteToken: 1` (sparse + unique, fast token lookup during invite setup).

Legacy `role: "user" | "admin"` is **kept for one deploy cycle** and dropped in a follow-up PR (Phase 5 of the spec).
