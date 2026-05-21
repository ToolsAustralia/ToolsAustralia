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

The `User` collection gained seven staff-related fields (`src/models/User.ts`):

| Field | Type | Notes |
|---|---|---|
| `roleId` | ObjectId → Role, nullable | `null` for customers; set for staff and admin |
| `userType` | "customer" \| "staff" \| "admin" | Derived from invite; defaults "customer". `"admin"` is the super-role (seeded Admin role only). |
| `serviceAccount` | Boolean, default `false` | True for non-human service accounts (e.g. Norm AI). Intended to filter out non-human accounts from the human-staff list (filter wiring lands later). |
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
  userType: "customer" | "staff" | "admin",
  roleId: string | null,
  permissions: string[],                       // strings from PERMISSIONS
}
```

Permissions are loaded from DB on login and refreshed at most every 5 minutes (`PERM_TTL_MS` in `src/lib/auth.ts`) or immediately when the user's `roleId` changes — **but the role-change refresh alone leaves a window where a demoted admin keeps their old powers for up to 5 minutes**. To force instant revocation, the system also tracks `User.tokenVersion`: every time a staff member's effective permissions change (role reassignment, removal, or an edit to the role's permission list), the affected user's `tokenVersion` is incremented. The JWT callback compares the value stamped on the token against the DB value on every request — on mismatch it sets `token.deleted = true` and the session callback returns `null`, which logs the user out on their very next page load.

Bump points:

| Endpoint | When | How |
|---|---|---|
| `PATCH /api/admin/staff/[id]` | `roleId` changes | `user.tokenVersion += 1` |
| `DELETE /api/admin/staff/[id]` | demote staff → customer | `user.tokenVersion += 1` |
| `PATCH /api/admin/roles/[id]` | `permissions` array changes | `User.updateMany({ roleId }, { $inc: { tokenVersion: 1 } })` — bulk-bumps every holder of the role in one write |

A user who has never had their `tokenVersion` stamped (token issued before the feature shipped) is backfilled silently — the first JWT callback after deploy stamps the current value and any future mismatch becomes actionable.

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

### Super-admin bypass

Users with `userType === "admin"` (i.e. linked to the seeded Admin role) bypass all permission checks in `requirePermission` and `userHasPermission`. They always receive `{ session }` / `true` regardless of the requested permission. This is the correct behaviour for the super-role.

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

## Staff invite + setup

1. An admin POSTs `{ email, firstName, lastName, roleId }` to `/api/admin/staff`.
2. The server creates a `User` with `isActive: false`, the resolved `userType` (`"admin"` if the target role is **Admin**, otherwise `"staff"`), the chosen `roleId`, and a single-use `inviteToken` whose `inviteTokenExpires` is 7 days from now.
3. SendGrid sends the invite email (`src/lib/email/staff-invite.ts`) with a link to `${NEXTAUTH_URL}/staff-setup/${inviteToken}`.
4. The invitee opens the link. The setup page (`src/app/staff-setup/[token]/page.tsx`) calls `GET /api/auth/staff-setup?token=...` to fetch the invitee's first name + email, then renders the password form.
5. On submit, `POST /api/auth/staff-setup` with `{ token, password }` hashes the password (bcrypt, 12 rounds — matching the rest of the auth surface), flips `isActive` and `isEmailVerified` to true, clears the invite token, and returns the email so the page can redirect to `/login?email=…&staffSetup=ok`.
6. The user logs in via the normal `/login` flow; the JWT callback loads their permissions and lands them in `/admin`.

The invite token endpoint always returns `410 "Invalid or used invite link"` for unknown / used / non-staff tokens — the response is identical so it can't be used to enumerate emails. Expired tokens get a more specific message because expiry isn't a security secret (admin can resend).

The setup route is public — middleware doesn't gate it (it's outside `protectedRoutes` / `adminRoutes` and not in `STAFF_BLOCKED_PREFIXES`).
