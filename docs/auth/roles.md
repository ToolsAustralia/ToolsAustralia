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

## Session shape

After a successful login, `session.user` carries:

```ts
{
  id, email, firstName, lastName, role,        // existing
  userType: "customer" | "staff",
  roleId: string | null,
  permissions: string[],                       // strings from PERMISSIONS
}
```

Permissions are loaded from DB on login and refreshed at most every 5 minutes (`PERM_TTL_MS` in `src/lib/auth.ts`) or immediately when the user's `roleId` changes. This means a permission revocation can take up to 5 minutes to propagate to the affected staff member. If instant revocation is needed later, add a `User.tokenVersion` field and bump it on role change.

The JWT also tracks `permissionsLoadedAt` (unix ms timestamp) to drive the TTL check on subsequent requests. Old tokens issued before this task lack this field; the `!token.permissionsLoadedAt` check in the jwt callback treats them as expired and reloads permissions immediately.

## Permission checks (server)

```ts
import { requirePermission } from "@/lib/api-auth-permissions";

export async function GET(req: NextRequest) {
  const guard = await requirePermission("users.view");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;
  // ... your logic
}
```

`requirePermission` returns either `{ session }` (allowed) or a `NextResponse` with 401/403.

### Legacy admin bridge

Until the backfill in `scripts/migrate-seed-staff-roles.ts` runs against the production DB, users with the old `role: "admin"` flag but no `roleId` (i.e. `userType !== "staff"`) are treated as having every permission. `LEGACY_ADMIN_ALL` is a frozen copy of the full `PERMISSIONS` array for reference. This bridge is removed in the Phase 5 cleanup PR.

### `userHasPermission` (non-handler contexts)

```ts
import { userHasPermission } from "@/lib/api-auth-permissions";

const allowed = await userHasPermission(userId, "users.edit");
```

Reads user + role from DB. Use sparingly — it makes a DB round-trip. Prefer `requirePermission` in route handlers where the session is already available.

## Permission checks (client)

```tsx
import { usePermissions } from "@/hooks/usePermissions";

function UsersTable() {
  const { has, isLoading } = usePermissions();
  if (isLoading) return <Spinner />;
  if (!has("users.view")) return <Forbidden />;
  return (
    <>
      <Table />
      {has("users.edit") && <EditControls />}
    </>
  );
}
```

The hook reads from the NextAuth session — no extra fetch.
