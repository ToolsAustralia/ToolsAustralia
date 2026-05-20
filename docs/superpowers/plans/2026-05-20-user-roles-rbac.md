# Staff Roles & Permissions (RBAC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `User.role: "user" | "admin"` enum with a DB-driven role system where the owner can create custom roles in the admin Settings tab and invite staff with per-area view/edit permissions, while walling **custom-role** staff accounts off from customer-purchase routes. The Admin role itself is a super-role with no restrictions.

**Architecture:** Hardcoded permission catalog in `src/lib/permissions.ts` (~30 strings, 15 areas × view/edit). A `Role` Mongo collection bundles permissions into named roles, edited via the admin UI. Each `User` gets a `roleId` (null = customer) and a `userType: "customer" | "staff" | "admin"`. **`"admin"` is the super-role** (bypasses customer-route blocks, has all permissions); **`"staff"` is any custom role** (Ads Manager, Customer Support, etc. — blocked from customer pages, permissions limited to their role's grants). All ~40 ad-hoc `session.user.role === "admin"` checks are replaced with one `requirePermission()` helper (server) plus a `usePermissions()` hook (client). NextAuth's JWT callback loads each user's permission set onto the session token so client checks never refetch.

> **2026-05-20 design correction.** This plan originally had `userType: "customer" | "staff"` only — treating the Admin role as a flavor of staff. That was wrong: Admin should bypass customer-route blocks (Discord "server owner" model). The corrected three-userType model was applied in commit `ba091711` after Phases 1-3 completed. All future tasks (16+) should assume `"customer" | "staff" | "admin"`. Files already migrated: `src/models/User.ts`, `src/types/global.d.ts`, `src/lib/auth.ts`, `src/lib/api-auth-permissions.ts`, `src/hooks/usePermissions.ts`, `src/middleware.ts`, `src/app/admin/layout.tsx`, `scripts/migrate-seed-staff-roles.ts`.

**Tech Stack:** Next.js 15 App Router, MongoDB + Mongoose 8, NextAuth v4 (JWT strategy), SendGrid for transactional email, Zod for input validation, TanStack Query for client data.

---

## Operating Constraints (read before starting any task)

1. **No auto-commit.** The repo has a hook (`.claude/hooks/no-auto-commit.mjs`) that blocks `git commit`/`add`/`push` unless the user has explicitly authorized commits this session with one of: `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`. Every task in this plan ends with a commit step — **ask the user before running it** until they've authorized commits for the session. After authorization, continue without re-asking.

2. **Docs must be updated when code changes.** A Stop hook (`.claude/hooks/doc-sync.mjs`) blocks task completion if you modify files under `src/` or `scripts/` without updating the matching `docs/<domain>/`. Each task in this plan lists the docs to touch.

3. **No test runner.** This repo has no jest/vitest. "Tests" are standalone tsx scripts under `src/**/__tests__/*.test.ts`, registered as npm scripts in `package.json`. Pattern reference: `src/utils/billing/__tests__/anchor-billing.test.ts` + the `test:anchor-billing` script. For pure-logic helpers (permission catalog, requirePermission), this plan adds tsx test scripts. For routes/UI, verification is `npm run type-check && npm run lint` plus manual curl/browser checks.

4. **Verification before completion.** Before claiming any task complete, run `npm run type-check` and `npm run lint`. If a task adds a test script, run that too. Do not mark a step complete without seeing the expected output.

5. **DRY, YAGNI, frequent commits.** One logical change per commit. Don't speculate beyond the spec.

---

## File Structure Overview

**New files:**

| Path | Responsibility |
|---|---|
| `src/lib/permissions.ts` | Hardcoded permission catalog (AREAS + PERMISSIONS) + tiny pure helpers |
| `src/lib/__tests__/permissions.test.ts` | Test script for permission catalog invariants |
| `src/models/Role.ts` | Mongoose schema for `Role` collection |
| `src/lib/api-auth-permissions.ts` | `requirePermission` + `userHasPermission` server helpers (separate file because `src/lib/api-auth.ts` is already large) |
| `src/lib/__tests__/api-auth-permissions.test.ts` | Test script for permission helpers |
| `src/hooks/usePermissions.ts` | Client hook reading session permissions |
| `scripts/migrate-seed-staff-roles.ts` | Seeds Admin + Ads Manager roles; backfills `userType` + `roleId` on existing users |
| `staff-invite-email-template.html` (repo root) | SendGrid HTML template |
| `src/lib/email/staff-invite.ts` | Helper to send the staff invite email |
| `src/app/api/admin/roles/route.ts` | GET (list) + POST (create) |
| `src/app/api/admin/roles/[id]/route.ts` | PATCH + DELETE |
| `src/app/api/admin/staff/route.ts` | GET (list staff) + POST (invite) |
| `src/app/api/admin/staff/[id]/route.ts` | PATCH (change role) + DELETE (deactivate) |
| `src/app/api/auth/staff-setup/route.ts` | POST: complete invite (set password, activate) |
| `src/app/staff-setup/[token]/page.tsx` | Public password-setup page for invitees |
| `src/components/admin/settings/RolesManagement.tsx` | Roles list + inline editor modal |
| `src/components/admin/settings/StaffManagement.tsx` | Staff list + invite modal |

**Modified files:**

| Path | Change |
|---|---|
| `src/models/User.ts` | Add `roleId`, `userType`, `inviteToken`, `inviteTokenExpires`, `invitedBy`, `invitedAt` fields |
| `src/types/global.d.ts` | Extend `Session.user` and `JWT` with `permissions: string[]`, `userType`, `roleId` |
| `src/lib/auth.ts` | JWT callback loads role permissions; session callback exposes them |
| `src/middleware.ts` | Staff route block-list (silent redirect to /admin) |
| `src/app/admin/layout.tsx` | Server-side staff guard (replaces client redirect) |
| `src/app/admin/page.tsx` | Remove obsolete client-side role check |
| `src/app/admin/component/AdminSidebar.tsx` | Add `requires` per tab + filter by `usePermissions().has(...)` |
| `src/app/admin/component/AdminPage.tsx` | If Settings tab opens to sections, add Roles/Staff sub-routes |
| `package.json` | Add `test:permissions` + `test:api-auth-permissions` + `migrate:seed-staff-roles` scripts |
| ~30 files containing `session.user.role === "admin"` | Replaced with `requirePermission(...)` or `usePermissions().has(...)` |

**Documentation to update (per `CLAUDE.md` Domain Manifest):**

- `docs/auth/` — Role model, permissions, staff vs customer, invite flow
- `docs/admin/` — Settings → Staff/Roles screens
- `docs/email/` — Staff-invite template
- `docs/security-csp/` — Middleware staff block-list

---

# Phase 1 — Foundations (no behavior change)

## Task 1: Permission catalog

**Files:**
- Create: `src/lib/permissions.ts`
- Create: `src/lib/__tests__/permissions.test.ts`
- Modify: `package.json` (add `test:permissions` script)
- Update docs: `docs/auth/` (new file `docs/auth/permissions-catalog.md` describing AREAS + PERMISSIONS)

- [ ] **Step 1: Write the test first**

Create `src/lib/__tests__/permissions.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  AREAS,
  PERMISSIONS,
  ALL_PERMISSIONS,
  isValidPermission,
  permissionFor,
} from "@/lib/permissions";

let failures = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
};

test("AREAS contains the 15 expected areas", () => {
  assert.equal(AREAS.length, 15);
  assert.ok(AREAS.includes("users"));
  assert.ok(AREAS.includes("settings"));
});

test("PERMISSIONS contains view + edit for every area", () => {
  assert.equal(PERMISSIONS.length, AREAS.length * 2);
  for (const a of AREAS) {
    assert.ok(PERMISSIONS.includes(`${a}.view`), `missing ${a}.view`);
    assert.ok(PERMISSIONS.includes(`${a}.edit`), `missing ${a}.edit`);
  }
});

test("ALL_PERMISSIONS is a Set with same size as PERMISSIONS", () => {
  assert.equal(ALL_PERMISSIONS.size, PERMISSIONS.length);
});

test("isValidPermission accepts known and rejects unknown", () => {
  assert.equal(isValidPermission("users.view"), true);
  assert.equal(isValidPermission("users.delete"), false);
  assert.equal(isValidPermission(""), false);
});

test("permissionFor returns correct strings", () => {
  assert.deepEqual(permissionFor("users"), { view: "users.view", edit: "users.edit" });
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
```

- [ ] **Step 2: Add the test script to package.json**

Add to `"scripts"` in `package.json`:
```json
"test:permissions": "tsx src/lib/__tests__/permissions.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:permissions`
Expected: FAIL with module-not-found or cannot resolve `@/lib/permissions`.

- [ ] **Step 4: Implement the permission catalog**

Create `src/lib/permissions.ts`:

```ts
export const AREAS = [
  "overview",
  "users",
  "promos",
  "facebookAds",
  "pageAnalytics",
  "promoAnalytics",
  "submissions",
  "miniDraws",
  "majorDraw",
  "drawResults",
  "upcomingDraws",
  "affiliates",
  "errorReports",
  "abTesting",
  "settings",
] as const;

export type Area = (typeof AREAS)[number];
export type Action = "view" | "edit";
export type Permission = `${Area}.${Action}`;

export const PERMISSIONS: Permission[] = AREAS.flatMap((a) => [
  `${a}.view` as Permission,
  `${a}.edit` as Permission,
]);

export const ALL_PERMISSIONS: ReadonlySet<Permission> = new Set(PERMISSIONS);

export function isValidPermission(p: string): p is Permission {
  return ALL_PERMISSIONS.has(p as Permission);
}

export function permissionFor(area: Area): { view: Permission; edit: Permission } {
  return { view: `${area}.view`, edit: `${area}.edit` };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:permissions`
Expected: `All tests passed`

- [ ] **Step 6: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 7: Write `docs/auth/permissions-catalog.md`**

Create the doc with this content:

```markdown
# Permissions Catalog

The permission catalog (`src/lib/permissions.ts`) is the **single source of truth** for what permissions exist in the system. Every permission corresponds to a real code gate; the admin UI can only *bundle* existing permissions into roles — it cannot invent new ones.

## Shape

Permissions are strings of the form `<area>.<action>` where:
- `area` is one of 15 admin areas (see `AREAS`)
- `action` is `view` or `edit`

Total: 30 permissions.

## Adding a new area

1. Add the area name to the `AREAS` tuple in `src/lib/permissions.ts`.
2. Gate the new code path on `<area>.view` or `<area>.edit` via `requirePermission()` (server) or `usePermissions().has()` (client).
3. Optionally grant the new permissions to the seeded Admin role via a one-off script (Admin auto-gains every permission on seed; existing custom roles do not auto-gain new permissions — by design).

## Areas

| Area | Notes |
|---|---|
| `overview` | Admin dashboard landing |
| `users` | Customer user management |
| `promos` | Promo creation & toggling |
| `facebookAds` | Facebook Ads management |
| `pageAnalytics` | Page analytics dashboard |
| `promoAnalytics` | Promo-specific analytics |
| `submissions` | Contact form submissions |
| `miniDraws` | Mini-draw management |
| `majorDraw` | Major draw operations |
| `drawResults` | Past draw results admin view |
| `upcomingDraws` | Upcoming draws calendar |
| `affiliates` | Affiliate program admin |
| `errorReports` | Error report viewing |
| `abTesting` | A/B test management |
| `settings` | Admin settings (includes Roles & Staff sub-tabs) |
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/permissions.ts src/lib/__tests__/permissions.test.ts package.json docs/auth/permissions-catalog.md
git commit -m "feat(auth): add hardcoded permission catalog"
```

---

## Task 2: Role model

**Files:**
- Create: `src/models/Role.ts`
- Update docs: `docs/auth/` (append `roles.md` describing the Role collection)

- [ ] **Step 1: Implement the Role model**

Create `src/models/Role.ts`:

```ts
import mongoose, { Document, Schema, Types } from "mongoose";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export interface IRole extends Document {
  _id: Types.ObjectId;
  name: string;
  permissions: string[];
  isSystem: boolean;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: [true, "Role name is required"],
      trim: true,
      maxlength: [60, "Role name cannot be more than 60 characters"],
      unique: true,
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (perms: string[]) => perms.every((p) => ALL_PERMISSIONS.has(p as never)),
        message: (props) =>
          `Permission list contains unknown values: ${JSON.stringify(props.value)}`,
      },
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
    strictQuery: true,
  }
);

RoleSchema.index({ name: 1 }, { unique: true });

if (mongoose.models.Role) {
  delete mongoose.models.Role;
}

export default mongoose.model<IRole>("Role", RoleSchema);
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no errors. (No data yet, no test script — the validator is exercised by the integration tests in later tasks.)

- [ ] **Step 3: Write `docs/auth/roles.md`**

Create `docs/auth/roles.md`:

```markdown
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
```

- [ ] **Step 4: Commit**

```bash
git add src/models/Role.ts docs/auth/roles.md
git commit -m "feat(auth): add Role model"
```

---

## Task 3: User model schema additions

**Files:**
- Modify: `src/models/User.ts`
- Update docs: `docs/auth/` (add note in `roles.md` about User changes, or create `docs/auth/staff-users.md`)

- [ ] **Step 1: Add fields to the IUser interface**

In `src/models/User.ts`, in the `IUser` interface (currently ends around line 260), add (before `createdAt: Date`):

```ts
  // Staff RBAC (see docs/auth/roles.md)
  roleId?: mongoose.Types.ObjectId | null; // null = customer
  userType: "customer" | "staff";          // default "customer"

  // Staff invitation flow
  inviteToken?: string;
  inviteTokenExpires?: Date;
  invitedBy?: mongoose.Types.ObjectId;
  invitedAt?: Date;
```

- [ ] **Step 2: Add the schema fields**

In the same file, in the `UserSchema` definition, add (place near `role`, around lines 330-334):

```ts
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      default: null,
      sparse: true,
    },
    userType: {
      type: String,
      enum: ["customer", "staff"],
      default: "customer",
      required: true,
    },
    inviteToken: {
      type: String,
      trim: true,
    },
    inviteTokenExpires: Date,
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    invitedAt: Date,
```

- [ ] **Step 3: Add indexes**

In `src/models/User.ts`, in the indexes section (currently around line 1037+), add:

```ts
UserSchema.index({ userType: 1 });
UserSchema.index({ roleId: 1 }, { sparse: true });
UserSchema.index({ inviteToken: 1 }, { sparse: true, unique: true });
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 5: Update docs**

Append to `docs/auth/roles.md` (or create `docs/auth/staff-users.md` if cleaner):

```markdown
## User model additions

The `User` collection gained four staff-related fields (`src/models/User.ts`):

| Field | Type | Notes |
|---|---|---|
| `roleId` | ObjectId → Role, nullable | `null` for customers; set for staff |
| `userType` | "customer" \| "staff" | Derived from invite; defaults "customer" |
| `inviteToken` | String, unique sparse | Single-use; cleared on setup |
| `inviteTokenExpires` | Date | 7 days from invite |
| `invitedBy` | ObjectId → User | Audit |
| `invitedAt` | Date | Audit |

Legacy `role: "user" | "admin"` is **kept for one deploy cycle** and dropped in a follow-up PR (Phase 5 of the spec).
```

- [ ] **Step 6: Commit**

```bash
git add src/models/User.ts docs/auth/roles.md
git commit -m "feat(auth): add staff/role/invite fields to User model"
```

---

## Task 4: Extend NextAuth types + JWT/session callbacks to load permissions

**Files:**
- Modify: `src/types/global.d.ts`
- Modify: `src/lib/auth.ts`
- Update docs: `docs/auth/` (note the session shape change)

- [ ] **Step 1: Extend the NextAuth type augmentation**

In `src/types/global.d.ts`, replace the existing `declare module "next-auth"` and `declare module "next-auth/jwt"` blocks with:

```ts
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;            // legacy, kept until Phase 5 cleanup
      firstName: string;
      lastName: string;
      userType: "customer" | "staff";
      roleId: string | null;
      permissions: string[];
    };
  }

  interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    userType: "customer" | "staff";
    roleId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    firstName: string;
    lastName: string;
    userType: "customer" | "staff";
    roleId: string | null;
    permissions: string[];
    permissionsLoadedAt: number; // unix ms — when we last loaded perms from DB
    deleted?: boolean;
  }
}
```

- [ ] **Step 2: Update the credentials `authorize` returns in `src/lib/auth.ts`**

Both `CredentialsProvider` blocks return user objects. Update both to include `userType` and `roleId`. Around line 113-119 (credentials provider) and line 152-158 (auto-login provider), change the returned object to:

```ts
return {
  id: user._id.toString(),
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  userType: user.userType ?? "customer",
  roleId: user.roleId ? user.roleId.toString() : null,
};
```

For the auto-login JWT version (line 152-158), the JWT payload may not have these — add safe defaults:

```ts
return {
  id: payload.sub,
  email: payload.email,
  firstName: payload.firstName,
  lastName: payload.lastName,
  role: payload.role,
  userType: (payload as { userType?: "customer" | "staff" }).userType ?? "customer",
  roleId: (payload as { roleId?: string | null }).roleId ?? null,
};
```

- [ ] **Step 3: Update the JWT callback to load permissions**

Replace the `jwt` callback in `src/lib/auth.ts` (currently lines 170-227) with the version below. Key change: after determining `dbUser`, load the user's role (if any) and populate `token.permissions`. Refetch permissions when `permissionsLoadedAt` is older than 5 minutes OR when the role changed.

Add this import at the top of `src/lib/auth.ts`:

```ts
import Role from "@/models/Role";
```

Replace the `jwt` callback body with:

```ts
async jwt({ token, user, account }) {
  const PERM_TTL_MS = 5 * 60 * 1000;

  const loadPermissions = async (roleId: string | null): Promise<string[]> => {
    if (!roleId) return [];
    const role = await Role.findById(roleId).select("permissions").lean();
    return role?.permissions ?? [];
  };

  if (account?.provider === "google" || !token.role) {
    try {
      await connectDB();
      const dbUser = await User.findOne({ email: token.email || user?.email });
      if (dbUser) {
        token.sub = dbUser._id.toString();
        token.role = dbUser.role;
        token.firstName = dbUser.firstName;
        token.lastName = dbUser.lastName;
        token.email = dbUser.email;
        token.userType = dbUser.userType ?? "customer";
        token.roleId = dbUser.roleId ? dbUser.roleId.toString() : null;
        token.permissions = await loadPermissions(token.roleId);
        token.permissionsLoadedAt = Date.now();
      } else {
        authDebugLog("🔒 JWT invalidated: Google user no longer exists in database");
        token.deleted = true;
        return token;
      }
    } catch (error) {
      console.error("Error finding user in JWT callback:", error);
    }
  } else if (user) {
    token.role = user.role;
    token.firstName = user.firstName;
    token.lastName = user.lastName;
    token.email = user.email;
    token.userType = user.userType ?? "customer";
    token.roleId = user.roleId ?? null;
    token.permissions = await loadPermissions(token.roleId);
    token.permissionsLoadedAt = Date.now();
  } else if (token.sub && !user && !account) {
    try {
      await connectDB();
      const dbUser = await User.findById(token.sub);
      if (!dbUser || dbUser.isActive === false) {
        authDebugLog(
          `🔒 JWT invalidated: user ${token.sub} is ${!dbUser ? "missing" : "inactive"}`
        );
        token.deleted = true;
        return token;
      }

      token.email = dbUser.email;
      token.firstName = dbUser.firstName;
      token.lastName = dbUser.lastName;
      token.role = dbUser.role;
      token.userType = dbUser.userType ?? "customer";

      const dbRoleId = dbUser.roleId ? dbUser.roleId.toString() : null;
      const roleChanged = dbRoleId !== (token.roleId ?? null);
      const expired = !token.permissionsLoadedAt || Date.now() - token.permissionsLoadedAt > PERM_TTL_MS;

      if (roleChanged || expired) {
        token.roleId = dbRoleId;
        token.permissions = await loadPermissions(dbRoleId);
        token.permissionsLoadedAt = Date.now();
      }
    } catch (error) {
      console.error("Error syncing user data in JWT callback:", error);
    }
  }
  return token;
},
```

- [ ] **Step 4: Update the session callback**

Replace the `session` callback body (currently lines 229-247) with:

```ts
async session({ session, token }): Promise<any> {
  if (token?.deleted || !token?.sub) {
    authDebugLog("🔒 Session invalidated: user was deleted or token is invalid");
    return null;
  }

  session.user.id = token.sub;
  session.user.role = token.role as string;
  session.user.firstName = token.firstName as string;
  session.user.lastName = token.lastName as string;
  session.user.email = token.email as string;
  session.user.userType = (token.userType as "customer" | "staff") ?? "customer";
  session.user.roleId = (token.roleId as string | null) ?? null;
  session.user.permissions = (token.permissions as string[]) ?? [];

  return session;
},
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no errors. (You may see warnings about `dbUser.userType` being optional on documents created before this migration — the `?? "customer"` fallback handles them.)

- [ ] **Step 6: Update docs**

Append to `docs/auth/roles.md`:

```markdown
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

Permissions are loaded from DB on login and refreshed at most every 5 minutes (`PERM_TTL_MS` in `src/lib/auth.ts`) or immediately when the user's `roleId` changes. This means a permission revocation can take up to 5 minutes to propagate to the affected staff member. If we need instant revocation later, add a `User.tokenVersion` field and bump it on role change.
```

- [ ] **Step 7: Commit**

```bash
git add src/types/global.d.ts src/lib/auth.ts docs/auth/roles.md
git commit -m "feat(auth): load role permissions onto NextAuth session"
```

---

## Task 5: Permission server helpers + tests

**Files:**
- Create: `src/lib/api-auth-permissions.ts`
- Create: `src/lib/__tests__/api-auth-permissions.test.ts`
- Modify: `package.json` (add `test:api-auth-permissions`)
- Update docs: `docs/auth/` (append helper usage)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/api-auth-permissions.test.ts`:

```ts
import assert from "node:assert/strict";
import { hasPermissionInList, LEGACY_ADMIN_ALL } from "@/lib/api-auth-permissions";
import { PERMISSIONS } from "@/lib/permissions";

let failures = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}\n  ${(e as Error).message}`); }
};

test("hasPermissionInList returns true when permission is present", () => {
  assert.equal(hasPermissionInList(["users.view", "users.edit"], "users.view"), true);
});

test("hasPermissionInList returns false when permission is absent", () => {
  assert.equal(hasPermissionInList(["users.view"], "users.edit"), false);
});

test("hasPermissionInList returns false on empty list", () => {
  assert.equal(hasPermissionInList([], "users.view"), false);
});

test("LEGACY_ADMIN_ALL is the full PERMISSIONS array (frozen)", () => {
  assert.equal(LEGACY_ADMIN_ALL.length, PERMISSIONS.length);
  assert.ok(Object.isFrozen(LEGACY_ADMIN_ALL));
});

if (failures > 0) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log("\nAll tests passed");
```

Add to `package.json` scripts:
```json
"test:api-auth-permissions": "tsx src/lib/__tests__/api-auth-permissions.test.ts",
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:api-auth-permissions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/api-auth-permissions.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

export const LEGACY_ADMIN_ALL: readonly Permission[] = Object.freeze([...PERMISSIONS]);

export function hasPermissionInList(perms: string[], permission: Permission | string): boolean {
  return perms.includes(permission);
}

/**
 * Server helper for route handlers.
 * Usage:
 *   const guard = await requirePermission("users.view");
 *   if (guard instanceof NextResponse) return guard;
 *   const { session } = guard;
 */
export async function requirePermission(
  permission: Permission | string
): Promise<{ session: Session } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Bridge for users not yet migrated to roleId (Phase 1 backfill window).
  // Legacy admins behave as if they had every permission.
  if (session.user.userType !== "staff" && session.user.role === "admin") {
    return { session };
  }

  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!hasPermissionInList(session.user.permissions ?? [], permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { session };
}

/**
 * Lookup-by-id variant — for non-route-handler contexts (cron jobs, scripts).
 * Reads from DB. Use sparingly.
 */
export async function userHasPermission(
  userId: string,
  permission: Permission | string
): Promise<boolean> {
  await connectDB();
  const user = await User.findById(userId).select("roleId userType role").lean();
  if (!user) return false;
  // Legacy bridge
  if (user.userType !== "staff" && user.role === "admin") return true;
  if (user.userType !== "staff" || !user.roleId) return false;
  const role = await Role.findById(user.roleId).select("permissions").lean();
  return !!role?.permissions?.includes(permission);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:api-auth-permissions`
Expected: `All tests passed`

- [ ] **Step 5: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 6: Update docs**

Append to `docs/auth/roles.md` (or create `docs/auth/permission-checks.md`):

```markdown
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

Until the backfill in `scripts/migrate-seed-staff-roles.ts` runs against the production DB, users with the old `role: "admin"` flag but no `roleId` are treated as having every permission. This bridge is removed in the Phase 5 cleanup PR.
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/api-auth-permissions.ts src/lib/__tests__/api-auth-permissions.test.ts package.json docs/auth/roles.md
git commit -m "feat(auth): add requirePermission server helper"
```

---

## Task 6: usePermissions client hook

**Files:**
- Create: `src/hooks/usePermissions.ts`
- Update docs: `docs/auth/` (append client hook usage)

- [ ] **Step 1: Implement the hook**

Create `src/hooks/usePermissions.ts`:

```ts
"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import type { Permission } from "@/lib/permissions";

export function usePermissions() {
  const { data: session, status } = useSession();

  const set = useMemo(() => {
    const perms = session?.user?.permissions ?? [];
    return new Set(perms);
  }, [session]);

  // Legacy bridge — Phase 5 cleanup removes this.
  const legacyAdmin = session?.user?.userType !== "staff" && session?.user?.role === "admin";

  return {
    isLoading: status === "loading",
    isStaff: session?.user?.userType === "staff",
    has: (perm: Permission | string): boolean => {
      if (legacyAdmin) return true;
      return set.has(perm);
    },
    hasAny: (...perms: (Permission | string)[]): boolean => {
      if (legacyAdmin) return true;
      return perms.some((p) => set.has(p));
    },
    hasAll: (...perms: (Permission | string)[]): boolean => {
      if (legacyAdmin) return true;
      return perms.every((p) => set.has(p));
    },
  };
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 3: Update docs**

Append to `docs/auth/roles.md`:

```markdown
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
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePermissions.ts docs/auth/roles.md
git commit -m "feat(auth): add usePermissions client hook"
```

---

## Task 7: Seed + backfill migration script

**Files:**
- Create: `scripts/migrate-seed-staff-roles.ts`
- Modify: `package.json` (add `migrate:seed-staff-roles` and `migrate:seed-staff-roles:dry`)
- Update docs: `docs/infrastructure/` (mention the new migration script)

- [ ] **Step 1: Implement the script**

Create `scripts/migrate-seed-staff-roles.ts`:

```ts
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../src/lib/mongodb";
import Role from "../src/models/Role";
import User from "../src/models/User";
import { PERMISSIONS } from "../src/lib/permissions";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`Starting seed/backfill (dry-run=${DRY_RUN})...`);
  await connectDB();

  // 1) Seed Admin role
  let adminRole = await Role.findOne({ name: "Admin" });
  if (!adminRole) {
    if (!DRY_RUN) {
      adminRole = await Role.create({
        name: "Admin",
        permissions: PERMISSIONS,
        isSystem: true,
        createdBy: null,
      });
    }
    console.log(`✓ Seeded Admin role (${DRY_RUN ? "dry-run" : adminRole?._id})`);
  } else {
    // Keep permissions in sync if catalog grew
    const missing = PERMISSIONS.filter((p) => !adminRole!.permissions.includes(p));
    if (missing.length > 0) {
      if (!DRY_RUN) {
        adminRole.permissions = PERMISSIONS;
        await adminRole.save();
      }
      console.log(`✓ Synced Admin role permissions (+${missing.length})`);
    } else {
      console.log("✓ Admin role already up to date");
    }
  }

  // 2) Seed Ads Manager role (starter template)
  const ADS_MANAGER_PERMS = [
    "overview.view",
    "facebookAds.view",
    "facebookAds.edit",
    "pageAnalytics.view",
    "promoAnalytics.view",
    "abTesting.view",
  ];
  const existingAds = await Role.findOne({ name: "Ads Manager" });
  if (!existingAds) {
    if (!DRY_RUN) {
      await Role.create({
        name: "Ads Manager",
        permissions: ADS_MANAGER_PERMS,
        isSystem: false,
        createdBy: null,
      });
    }
    console.log("✓ Seeded Ads Manager role");
  } else {
    console.log("✓ Ads Manager already exists — leaving as-is");
  }

  // 3) Backfill existing users
  const adminId = adminRole?._id ?? (await Role.findOne({ name: "Admin" }))!._id;

  const legacyAdmins = await User.find({ role: "admin" });
  const customerCount = await User.countDocuments({ role: { $ne: "admin" } });
  console.log(`Found ${legacyAdmins.length} legacy admin users and ${customerCount} customers`);

  for (const u of legacyAdmins) {
    if (u.roleId && u.userType === "staff") continue;
    if (!DRY_RUN) {
      u.roleId = adminId;
      u.userType = "staff";
      await u.save({ validateBeforeSave: false });
    }
    console.log(`  ↳ Linked ${u.email} → Admin role`);
  }

  if (!DRY_RUN) {
    // Set userType="customer" for everyone else that doesn't have it
    const res = await User.updateMany(
      { role: { $ne: "admin" }, userType: { $exists: false } },
      { $set: { userType: "customer" } }
    );
    console.log(`✓ Backfilled userType=customer on ${res.modifiedCount} users`);
  } else {
    console.log("  (dry-run: skipped customer backfill)");
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm scripts**

Append to `package.json` `"scripts"`:

```json
"migrate:seed-staff-roles": "tsx scripts/migrate-seed-staff-roles.ts",
"migrate:seed-staff-roles:dry": "tsx scripts/migrate-seed-staff-roles.ts --dry-run",
```

- [ ] **Step 3: Dry-run against your dev DB**

Run: `npm run migrate:seed-staff-roles:dry`
Expected: prints `✓ Seeded Admin role (dry-run)`, `✓ Seeded Ads Manager role`, `Found N legacy admin users and M customers`. No DB writes.

- [ ] **Step 4: Run the live migration on dev**

Run: `npm run migrate:seed-staff-roles`
Expected: same output but with real `ObjectId` values for the seeded roles. Confirm in Mongo Atlas that the `Role` collection has two documents and that your own `User` document now has `roleId` + `userType: "staff"`.

- [ ] **Step 5: Update docs**

Create `docs/infrastructure/migrate-seed-staff-roles.md`:

```markdown
# migrate-seed-staff-roles

`scripts/migrate-seed-staff-roles.ts` is idempotent and safe to re-run.

It does three things:
1. Creates or updates the **Admin** role with the current full permission catalog.
2. Creates the **Ads Manager** role (starter template) if missing.
3. Links existing `role: "admin"` users to the Admin role + sets `userType: "staff"`. Sets `userType: "customer"` on everyone else.

Run order during deploy of Phase 1:
1. Deploy code (additive schema; old paths still work via the legacy admin bridge in `src/lib/api-auth-permissions.ts`).
2. Run `npm run migrate:seed-staff-roles:dry` against prod and inspect the counts.
3. Run `npm run migrate:seed-staff-roles`.
4. Verify in Atlas that the `Role` collection exists and your account has `roleId` set.

The script can be re-run safely after Phase 2/3/4 are deployed — it only adds new permissions to Admin and only backfills users that haven't been touched yet.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-seed-staff-roles.ts package.json docs/infrastructure/migrate-seed-staff-roles.md
git commit -m "feat(auth): seed + backfill script for staff roles"
```

---

# Phase 2 — Replace authorization checks (mechanical refactor)

**Pattern reference** — every existing check looks like one of these:

```ts
// (A) Pure session.user.role check
const session = await getServerSession(authOptions);
if (!session?.user?.id || session.user.role !== "admin") {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

```ts
// (B) Client component check
const { data: session } = useSession();
if (session?.user?.role !== "admin") { router.push("/"); return null; }
```

**Replace (A) with:**

```ts
const guard = await requirePermission("<area>.<action>");
if (guard instanceof NextResponse) return guard;
const { session } = guard;
```

**Replace (B) with:**

```ts
const { has, isLoading, isStaff } = usePermissions();
useEffect(() => {
  if (!isLoading && (!isStaff || !has("<area>.<action>"))) router.push("/");
}, [isLoading, isStaff, has, router]);
if (isLoading) return <Spinner />;
if (!isStaff || !has("<area>.<action>")) return null;
```

**Picking the right permission per file:** The default is `<area>.edit` for any handler that creates/updates/deletes, `<area>.view` for any GET that lists or fetches. When a single route file handles both reads and writes, pick `<area>.view` at the file level and add `requirePermission("<area>.edit")` inside `POST`/`PATCH`/`DELETE` handlers.

## Task 8: Replace checks in /api/admin/users/**

**Files (modify):**
- `src/app/api/admin/users/route.ts` → guard with `users.view` (GET) and `users.edit` (any other method present)
- `src/app/api/admin/users/[id]/route.ts` → `users.view` for GET, `users.edit` for PATCH/PUT/DELETE
- `src/app/api/admin/users/[id]/actions/route.ts` → `users.edit`
- `src/app/api/admin/users/[id]/cancel-subscription/route.ts` → `users.edit`
- `src/app/api/admin/users/[id]/delete/route.ts` → `users.edit`
- `src/app/api/admin/users/[id]/deletion-summary/route.ts` → `users.view`
- `src/app/api/admin/users/search/route.ts` → `users.view`
- `src/app/api/admin/users/export/route.ts` → `users.view`

**Docs:** `docs/admin/` — add note that user-admin routes are gated by `users.view`/`users.edit`.

- [ ] **Step 1: Edit each route in turn**

For every file listed above, replace the legacy block:

```ts
const session = await getServerSession(authOptions);
if (!session?.user?.id || session.user.role !== "admin") {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

with:

```ts
import { requirePermission } from "@/lib/api-auth-permissions";
// ...
const guard = await requirePermission("users.view"); // or "users.edit" — see file list above
if (guard instanceof NextResponse) return guard;
const { session } = guard;
```

Remove the now-unused `import { getServerSession } from "next-auth"` and `import { authOptions } from "@/lib/auth"` from each file IF nothing else references them.

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors. Fix any unused-import warnings.

- [ ] **Step 3: Smoke test**

Start dev: `npm run dev`
- As your admin user: hit `/api/admin/users` → 200 with the user list.
- (After Phase 4 ships) As a non-staff user: 401 or 403.

- [ ] **Step 4: Update docs**

Create `docs/admin/staff-permissions-mapping.md`:

```markdown
# Admin route → permission mapping

| Route family | View permission | Edit permission |
|---|---|---|
| `/api/admin/users/**` | `users.view` | `users.edit` |
| `/api/admin/promo/**` | `promos.view` | `promos.edit` |
| `/api/admin/winners/**` | `majorDraw.view` | `majorDraw.edit` |
| `/api/admin/error-reports/**` | `errorReports.view` | `errorReports.edit` |
| `/api/admin/submissions/**` | `submissions.view` | `submissions.edit` |
| `/api/admin/staff/**` | `settings.view` | `settings.edit` |
| `/api/admin/roles/**` | `settings.view` | `settings.edit` |
| `/api/admin/allowlist/**` | `users.view` | `users.edit` |
| `/api/admin/stripe-webhook-queue/**` | `errorReports.view` | `errorReports.edit` |

(Append rows in later tasks as more areas are touched.)
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/users docs/admin/staff-permissions-mapping.md
git commit -m "refactor(auth): gate /api/admin/users routes with requirePermission"
```

---

## Task 9: Replace checks in /api/admin/promo/**

**Files (modify) — all under `src/app/api/admin/promo/**`:**

- `bonus-entry/[id]/route.ts`, `bonus-entry/active/route.ts`, `bonus-entry/create/route.ts`, `bonus-entry/list/route.ts`
- `create/route.ts`, `effective/route.ts`, `end/route.ts`, `history/route.ts`, `toggle/route.ts`
- `link/[id]/route.ts`, `link/create/route.ts`, `link/list/route.ts`
- `scheduled/[id]/route.ts`, `scheduled/create/route.ts`, `scheduled/list/route.ts`

**Permission:** GET → `promos.view`; POST/PATCH/DELETE → `promos.edit`. Toggle/end/create are `promos.edit`. Effective/list/history are `promos.view`.

**Docs:** Append to `docs/admin/staff-permissions-mapping.md` if missing rows.

- [ ] **Step 1: Apply the (A) replacement to each file** (same pattern as Task 8)

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 3: Smoke test the promo toggle from the admin UI**

Start dev: `npm run dev` → log in as admin → flip a promo on/off → confirm no 401/403.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/promo
git commit -m "refactor(auth): gate /api/admin/promo routes with requirePermission"
```

---

## Task 10: Replace checks in remaining /api/admin/** routes

**Files (modify):** all remaining files under `src/app/api/admin/**` that contain `session.user.role !== "admin"`. Find them with:

```
git grep -l 'session.user.role.*"admin"' src/app/api/admin/
```

Use this mapping (append unmatched rows to `docs/admin/staff-permissions-mapping.md` as you go):

| Path prefix | View | Edit |
|---|---|---|
| `/api/admin/winners/**` | `majorDraw.view` | `majorDraw.edit` |
| `/api/admin/error-reports/**` | `errorReports.view` | `errorReports.edit` |
| `/api/admin/submissions/**` | `submissions.view` | `submissions.edit` |
| `/api/admin/allowlist/**` | `users.view` | `users.edit` |
| `/api/admin/stripe-webhook-queue/**` | `errorReports.view` | `errorReports.edit` |
| Other (decide per-file) | — | — |

- [ ] **Step 1: Inventory the remaining files**

Run: `git grep -l 'role.*"admin"' src/app/api/admin/`
List every file that still contains the legacy check. Cross-reference with the table.

- [ ] **Step 2: Apply the (A) replacement to each**

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 4: Smoke test 2-3 random endpoints from your admin UI**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin docs/admin/staff-permissions-mapping.md
git commit -m "refactor(auth): gate remaining /api/admin routes with requirePermission"
```

---

## Task 11: Replace checks in non-/api/admin/** routes + cron + debug

**Files (modify):** anything outside `/api/admin/` that still references `role === "admin"`. Inventory:

```
git grep -nF 'session.user.role' src/app/api/ | grep -v '/admin/'
git grep -nF '"role":' src/app/api/
```

Likely files include:
- `src/app/api/users/[id]/route.ts` — `users.edit` if admin-only modifications
- `src/app/api/users/[id]/my-account/route.ts` — already user-self-only, leave alone unless admin override exists
- `src/app/api/upload/cloudinary/route.ts` — admin-only? If yes, `users.edit` (or a new `uploads.edit` if you'd prefer; for MVP reuse an existing area)
- `src/app/api/partner-applications/route.ts` — admin GET → `users.view`
- `src/app/api/major-draw/select-winner/route.ts` — `majorDraw.edit`
- `src/app/api/debug/check-admin/route.ts` — this is a debug endpoint; it should *check* whether the caller is admin, not gate on it. Update to return current `userType` + `permissions` + legacy `role`.

For each file: apply (A) replacement, or in `check-admin` route, just return the session shape.

- [ ] **Step 1: Inventory + edit each file**

- [ ] **Step 2: Type-check + lint + commit**

```bash
npm run type-check && npm run lint
git add src/app/api docs/admin/staff-permissions-mapping.md
git commit -m "refactor(auth): gate non-admin API routes referencing admin role"
```

---

## Task 12: Replace checks in client components

**Files (modify):**
- `src/app/admin/page.tsx` — remove the client-side redirect entirely (server guard in Task 15 replaces it)
- `src/components/admin/UsersManagement.tsx` — any role gating → use `usePermissions().has("users.view")` / `.has("users.edit")`
- `src/features/admin/users/components/UserRow.tsx` — show/hide edit buttons via `usePermissions().has("users.edit")`
- `src/components/layout/Header.tsx` — if it conditionally shows an "Admin" link, swap to `isStaff`
- Any other component still reading `session.user.role === "admin"` — inventory with `git grep -l 'role.*"admin"' src/components src/app`

- [ ] **Step 1: Inventory the components**

Run: `git grep -nF 'session?.user?.role' src/components src/app/admin`
Run: `git grep -nF 'session.user.role' src/components src/app/admin`

- [ ] **Step 2: Apply the (B) replacement to each**

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

`npm run dev`, log in as admin, click through:
- Header should still show admin link
- /admin renders normally
- Users table edit buttons visible

- [ ] **Step 5: Commit**

```bash
git add src/components src/app/admin src/features
git commit -m "refactor(auth): switch client components to usePermissions"
```

---

# Phase 3 — Route gating

## Task 13: Middleware staff block-list

**Files:**
- Modify: `src/middleware.ts`
- Update docs: `docs/security-csp/` (note middleware change)

- [ ] **Step 1: Read the existing middleware**

Open `src/middleware.ts` to confirm its current shape — it already handles CSP nonce + auth gating for pages (matcher excludes `/api`).

- [ ] **Step 2: Add the staff route block**

Inside the middleware function, after the existing auth check (where you have the `session` / token), add:

```ts
const STAFF_BLOCKED_PREFIXES = [
  "/my-account",
  "/affiliate",
  "/shop",
  "/checkout",
  "/purchase-success",
  "/major-draw",
  "/mini-draws",
  "/mini-draw-success",
  "/upsell-success",
  "/rewards",
  "/membership",
  "/partner",
];

if (
  token?.userType === "staff" &&
  STAFF_BLOCKED_PREFIXES.some((p) => req.nextUrl.pathname.startsWith(p))
) {
  const url = req.nextUrl.clone();
  url.pathname = "/admin";
  url.search = "";
  return NextResponse.redirect(url);
}
```

Adapt the variable names (`token`, `req`) to whatever the current middleware uses (it's NextAuth `withAuth` or `getToken`). If middleware reads the JWT via `getToken({ req, secret: ... })`, ensure `userType` is present on the JWT — it is, after Task 4.

- [ ] **Step 3: Manual test**

`npm run dev`:
- Sign in as the seeded staff (you, after Task 7 backfill) and visit `/my-account` → should redirect to `/admin`.
- Visit `/shop` as staff → redirect to `/admin`.
- Visit `/` as staff → renders (home is not blocked).
- Sign in as a regular customer (create one if needed) and visit `/my-account` → renders.

- [ ] **Step 4: Update docs**

Append to `docs/security-csp/middleware.md` (or create it if missing):

```markdown
## Staff route block

`src/middleware.ts` redirects staff users (`token.userType === "staff"`) to `/admin` when they attempt to load any path prefix in `STAFF_BLOCKED_PREFIXES`. This is intentional: staff accounts are not customer accounts. If a staff member wants to purchase, they must create a separate customer account.

The block-list lives inline in `middleware.ts`. To add or remove a prefix, edit the array.
```

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts docs/security-csp/middleware.md
git commit -m "feat(security): redirect staff away from customer routes"
```

---

## Task 14: Server-side admin guard + remove client redirect

**Files:**
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/app/admin/page.tsx`
- Update docs: `docs/admin/`

- [ ] **Step 1: Make admin layout async + add server guard**

Replace the body of `src/app/admin/layout.tsx` with:

```tsx
import { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminUserModalProvider } from "@/contexts/AdminUserModalContext";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Dashboard - Tools Australia",
  description: "Admin dashboard for managing Tools Australia ecommerce platform",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.userType !== "staff") {
    // Legacy bridge: a user with role:"admin" but no staff userType still gets in (Phase 5 removes this)
    if (session.user.role !== "admin") redirect("/");
  }

  return (
    <div className="h-screen-dvh overflow-hidden">
      <AdminUserModalProvider>
        <Suspense fallback={
          <div className="min-h-screen-svh flex items-center justify-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600"></div>
          </div>
        }>
          {children}
        </Suspense>
      </AdminUserModalProvider>
    </div>
  );
}
```

- [ ] **Step 2: Remove obsolete client-side redirect**

In `src/app/admin/page.tsx`, delete the `useEffect` redirect block + the `if (!session || session.user?.role !== "admin")` early-return. The layout now guarantees a staff user, so the page can render unconditionally. Keep the `useSession` call only for the user display info; replace the `null` render fallback with a simple loading spinner.

Concretely, change:

```tsx
// remove
useEffect(() => {
  if (status === "loading") return;
  if (!session || session.user?.role !== "admin") {
    router.push("/");
  }
}, [session, status, router]);

if (status === "loading") { /* spinner */ }
if (!session || session.user?.role !== "admin") return null;
```

to:

```tsx
if (status === "loading") {
  return (
    <div className="min-h-screen-svh flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600" />
    </div>
  );
}
```

(Layout already redirected non-staff away — no fallback needed here.)

- [ ] **Step 3: Manual test**

`npm run dev`:
- Sign out and visit `/admin` → redirect to `/login?callbackUrl=/admin`.
- Sign in as a regular user (no role) and visit `/admin` → redirect to `/`.
- Sign in as staff and visit `/admin` → renders.

- [ ] **Step 4: Update docs**

Append to `docs/admin/admin-layout.md` (or create it):

```markdown
# Admin layout guard

`src/app/admin/layout.tsx` is the **server-side** gate for everything under `/admin`. It calls `getServerSession`, redirects unauthenticated users to login, and redirects non-staff to `/`.

The legacy bridge (`session.user.role === "admin"`) is still allowed in until Phase 5 cleanup deletes the legacy `role` field.

Per-action permission gating (e.g. who can edit users vs view them) happens at the API-route level via `requirePermission()`, not here.
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/layout.tsx src/app/admin/page.tsx docs/admin/admin-layout.md
git commit -m "feat(admin): server-side staff guard in admin layout"
```

---

## Task 15: AdminSidebar permission filtering

**Files:**
- Modify: `src/app/admin/component/AdminSidebar.tsx`
- Update docs: `docs/admin/`

- [ ] **Step 1: Add `requires` to each adminTabs entry**

In `src/app/admin/component/AdminSidebar.tsx`, change the `adminTabs` array to:

```ts
const adminTabs = [
  { id: "overview",        label: "Overview",        icon: BarChart3,    requires: "overview.view" },
  { id: "ab-testing",      label: "A/B Testing",     icon: FlaskConical, requires: "abTesting.view" },
  { id: "facebook-ads",    label: "Facebook Ads",    icon: TrendingUp,   requires: "facebookAds.view" },
  { id: "promo-analytics", label: "Page Analytics",  icon: BarChart3,    requires: "pageAnalytics.view" },
  { id: "users",           label: "Users",           icon: Users,        requires: "users.view" },
  { id: "mini-draws",      label: "Mini Draws",      icon: Trophy,       requires: "miniDraws.view" },
  { id: "major-draw",      label: "Current Draw",    icon: Gift,         requires: "majorDraw.view" },
  { id: "draw-results",    label: "Draw Results",    icon: Trophy,       requires: "drawResults.view" },
  { id: "upcoming-draws",  label: "Upcoming Draws",  icon: Activity,     requires: "upcomingDraws.view" },
  { id: "submissions",     label: "Submissions",     icon: FileTextIcon, requires: "submissions.view" },
  { id: "promos",          label: "Promos",          icon: Zap,          requires: "promos.view" },
  { id: "affiliates",      label: "Affiliates",      icon: UserCheck,    requires: "affiliates.view" },
  { id: "error-reports",   label: "Error Reports",   icon: Bug,          requires: "errorReports.view" },
  { id: "settings",        label: "Settings",        icon: Settings,     requires: "settings.view" },
];
```

- [ ] **Step 2: Filter tabs by permission**

In the same file, inside the component, add:

```tsx
import { usePermissions } from "@/hooks/usePermissions";
// ...
const { has } = usePermissions();
const visibleTabs = adminTabs.filter((t) => has(t.requires));
```

Then replace `adminTabs.map((tab) =>` with `visibleTabs.map((tab) =>`.

- [ ] **Step 3: Manual test**

`npm run dev` → sign in as admin → all tabs visible. Then (after Phase 4 ships) sign in as Ads Manager and confirm only Overview, A/B Testing, Facebook Ads, Page Analytics are visible.

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 5: Update docs**

Append to `docs/admin/admin-layout.md`:

```markdown
## Sidebar filtering

`AdminSidebar.tsx` filters its tab list through `usePermissions().has(tab.requires)`. Tabs the current staff user cannot view never render.

Each tab declares its required permission inline via the `requires` field on the `adminTabs` array. To add a new tab, add the entry with the appropriate `<area>.view` permission.
```

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/component/AdminSidebar.tsx docs/admin/admin-layout.md
git commit -m "feat(admin): filter sidebar tabs by view permission"
```

---

# Phase 4 — Settings UI + invite flow

## Task 16: SendGrid invite template + email helper

**Files:**
- Create: `staff-invite-email-template.html` (repo root)
- Create: `src/lib/email/staff-invite.ts`
- Update docs: `docs/email/`

- [ ] **Step 1: Create the HTML template**

Create `staff-invite-email-template.html` at the repo root. Follow the visual style of an existing template (look at any `*-email-template.html` already present). Include these placeholders: `{{INVITEE_NAME}}`, `{{ROLE_NAME}}`, `{{INVITE_LINK}}`, `{{INVITER_NAME}}`, `{{EXPIRES_IN}}`. Example skeleton:

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>You've been invited to Tools Australia Admin</title></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1>You've been invited</h1>
  <p>Hi {{INVITEE_NAME}},</p>
  <p>{{INVITER_NAME}} invited you to join the Tools Australia admin team as <strong>{{ROLE_NAME}}</strong>.</p>
  <p><a href="{{INVITE_LINK}}" style="display:inline-block;padding:12px 24px;background:#ee0000;color:#fff;text-decoration:none;border-radius:6px;">Set up your account</a></p>
  <p>This link expires in {{EXPIRES_IN}}.</p>
  <p style="color:#666;font-size:12px;">If you weren't expecting this, you can safely ignore the email.</p>
</body></html>
```

- [ ] **Step 2: Create the email helper**

Create `src/lib/email/staff-invite.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export interface StaffInviteEmailParams {
  to: string;
  inviteeName: string;
  roleName: string;
  inviteLink: string;
  inviterName: string;
  expiresIn?: string; // human-readable, defaults to "7 days"
}

const TEMPLATE_PATH = path.join(process.cwd(), "staff-invite-email-template.html");

export async function sendStaffInviteEmail(p: StaffInviteEmailParams): Promise<void> {
  const tmpl = await fs.readFile(TEMPLATE_PATH, "utf8");
  const html = tmpl
    .replaceAll("{{INVITEE_NAME}}", escapeHtml(p.inviteeName))
    .replaceAll("{{ROLE_NAME}}", escapeHtml(p.roleName))
    .replaceAll("{{INVITE_LINK}}", p.inviteLink)
    .replaceAll("{{INVITER_NAME}}", escapeHtml(p.inviterName))
    .replaceAll("{{EXPIRES_IN}}", p.expiresIn ?? "7 days");

  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!from) throw new Error("SENDGRID_FROM_EMAIL is not configured");

  await sgMail.send({
    to: p.to,
    from,
    subject: `You've been invited to Tools Australia Admin (${p.roleName})`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 4: Update docs**

Create `docs/email/staff-invite.md`:

```markdown
# Staff invite email

`src/lib/email/staff-invite.ts` reads `staff-invite-email-template.html` (repo root) and sends via SendGrid.

Placeholders: `{{INVITEE_NAME}}`, `{{ROLE_NAME}}`, `{{INVITE_LINK}}`, `{{INVITER_NAME}}`, `{{EXPIRES_IN}}`.

The invite link points at `/staff-setup/<inviteToken>` on whichever host `NEXTAUTH_URL` resolves to. Tokens expire after 7 days (configured in `src/app/api/admin/staff/route.ts`).
```

- [ ] **Step 5: Commit**

```bash
git add staff-invite-email-template.html src/lib/email/staff-invite.ts docs/email/staff-invite.md
git commit -m "feat(email): add staff invite template + helper"
```

---

## Task 17: Roles CRUD API

**Files:**
- Create: `src/app/api/admin/roles/route.ts`
- Create: `src/app/api/admin/roles/[id]/route.ts`
- Update docs: `docs/admin/`

- [ ] **Step 1: Implement `src/app/api/admin/roles/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Role from "@/models/Role";
import User from "@/models/User";
import { requirePermission } from "@/lib/api-auth-permissions";
import { PERMISSIONS, isValidPermission } from "@/lib/permissions";

const CreateRoleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  permissions: z.array(z.string()).refine(
    (perms) => perms.every(isValidPermission),
    { message: "Contains unknown permissions" }
  ),
});

export async function GET() {
  const guard = await requirePermission("settings.view");
  if (guard instanceof NextResponse) return guard;

  await connectDB();
  const roles = await Role.find().sort({ isSystem: -1, name: 1 }).lean();

  const ids = roles.map((r) => r._id);
  const memberCounts = await User.aggregate([
    { $match: { roleId: { $in: ids } } },
    { $group: { _id: "$roleId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(memberCounts.map((m) => [m._id.toString(), m.count as number]));

  return NextResponse.json({
    success: true,
    data: {
      roles: roles.map((r) => ({
        id: r._id.toString(),
        name: r.name,
        permissions: r.permissions,
        isSystem: r.isSystem,
        memberCount: countMap.get(r._id.toString()) ?? 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      catalog: PERMISSIONS,
    },
  });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  const body = await req.json();
  const parsed = CreateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  await connectDB();
  try {
    const role = await Role.create({
      name: parsed.data.name,
      permissions: parsed.data.permissions,
      isSystem: false,
      createdBy: session.user.id,
    });
    return NextResponse.json({ success: true, data: { id: role._id.toString() } }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("duplicate key")) {
      return NextResponse.json({ error: "A role with that name already exists" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Implement `src/app/api/admin/roles/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Role from "@/models/Role";
import User from "@/models/User";
import { requirePermission } from "@/lib/api-auth-permissions";
import { isValidPermission } from "@/lib/permissions";

const PatchRoleSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  permissions: z.array(z.string()).refine(
    (perms) => perms.every(isValidPermission),
    { message: "Contains unknown permissions" }
  ).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();
  const parsed = PatchRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  await connectDB();
  const role = await Role.findById(id);
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (role.isSystem) {
    // System roles: name immutable, permissions immutable on Admin
    if (parsed.data.name && parsed.data.name !== role.name) {
      return NextResponse.json({ error: "Cannot rename a system role" }, { status: 403 });
    }
    if (role.name === "Admin" && parsed.data.permissions) {
      return NextResponse.json({ error: "Admin role permissions are managed by the seed script" }, { status: 403 });
    }
  }

  if (parsed.data.name !== undefined) role.name = parsed.data.name;
  if (parsed.data.permissions !== undefined) role.permissions = parsed.data.permissions;

  try {
    await role.save();
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("duplicate key")) {
      return NextResponse.json({ error: "A role with that name already exists" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;

  await connectDB();
  const role = await Role.findById(id);
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (role.isSystem) {
    return NextResponse.json({ error: "Cannot delete a system role" }, { status: 403 });
  }

  const memberCount = await User.countDocuments({ roleId: role._id });
  if (memberCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${memberCount} staff member(s) still hold this role` },
      { status: 409 }
    );
  }

  await Role.deleteOne({ _id: role._id });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual test with curl**

```bash
# List
curl -b 'next-auth.session-token=...' http://localhost:3000/api/admin/roles
# Create
curl -b '...' -X POST http://localhost:3000/api/admin/roles \
  -H 'content-type: application/json' \
  -d '{"name":"Email Marketing","permissions":["overview.view","submissions.view","submissions.edit","users.view"]}'
```

Expect 201 with `{success:true, data:{id:"..."}}`.

- [ ] **Step 5: Update docs**

Append to `docs/admin/staff-permissions-mapping.md` and create `docs/admin/roles-api.md`:

```markdown
# Roles API

| Method | Path | Permission |
|---|---|---|
| GET | /api/admin/roles | settings.view |
| POST | /api/admin/roles | settings.edit |
| PATCH | /api/admin/roles/:id | settings.edit |
| DELETE | /api/admin/roles/:id | settings.edit |

System roles (`isSystem: true`) cannot be renamed or deleted via the API. The Admin role's permissions are also immutable here — only the seed script (`migrate:seed-staff-roles`) can modify them.

A role with >0 members cannot be deleted; the UI should require moving members off first.
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/roles docs/admin/roles-api.md docs/admin/staff-permissions-mapping.md
git commit -m "feat(admin): roles CRUD API"
```

---

## Task 18: Staff list + invite API

**Files:**
- Create: `src/app/api/admin/staff/route.ts`
- Create: `src/app/api/admin/staff/[id]/route.ts`
- Update docs: `docs/admin/`

- [ ] **Step 1: Implement `src/app/api/admin/staff/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
import { requirePermission } from "@/lib/api-auth-permissions";
import { sendStaffInviteEmail } from "@/lib/email/staff-invite";

const InviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  roleId: z.string().min(1),
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  const guard = await requirePermission("settings.view");
  if (guard instanceof NextResponse) return guard;

  await connectDB();
  const staff = await User.find({ userType: "staff" })
    .select("firstName lastName email isActive isEmailVerified roleId inviteToken inviteTokenExpires invitedAt")
    .lean();

  const roleIds = [...new Set(staff.map((s) => s.roleId?.toString()).filter(Boolean) as string[])];
  const roles = await Role.find({ _id: { $in: roleIds } }).select("name").lean();
  const roleMap = new Map(roles.map((r) => [r._id.toString(), r.name]));

  return NextResponse.json({
    success: true,
    data: staff.map((s) => ({
      id: s._id.toString(),
      email: s.email,
      firstName: s.firstName,
      lastName: s.lastName,
      isActive: s.isActive,
      isEmailVerified: s.isEmailVerified,
      roleId: s.roleId?.toString() ?? null,
      roleName: s.roleId ? roleMap.get(s.roleId.toString()) ?? null : null,
      inviteStatus: !s.isActive && s.inviteToken
        ? (s.inviteTokenExpires && s.inviteTokenExpires < new Date() ? "expired" : "pending")
        : "active",
      invitedAt: s.invitedAt ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  const body = await req.json();
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  await connectDB();

  const role = await Role.findById(parsed.data.roleId).select("name").lean();
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const existing = await User.findOne({ email: parsed.data.email });
  if (existing) {
    if (existing.userType === "staff" && existing.isActive) {
      return NextResponse.json({ error: "A staff account already exists for this email" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "An account with this email already exists. Use a different email." },
      { status: 409 }
    );
  }

  const token = randomUUID();
  const expires = new Date(Date.now() + INVITE_TTL_MS);

  await User.create({
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    userType: "staff",
    roleId: parsed.data.roleId,
    role: "user", // legacy field, irrelevant for staff
    isActive: false,
    isEmailVerified: false,
    inviteToken: token,
    inviteTokenExpires: expires,
    invitedBy: session.user.id,
    invitedAt: new Date(),
  });

  const inviteLink = `${process.env.NEXTAUTH_URL}/staff-setup/${token}`;
  await sendStaffInviteEmail({
    to: parsed.data.email,
    inviteeName: parsed.data.firstName,
    roleName: role.name,
    inviteLink,
    inviterName: `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() || "Tools Australia",
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
```

- [ ] **Step 2: Implement `src/app/api/admin/staff/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
import { requirePermission } from "@/lib/api-auth-permissions";
import { sendStaffInviteEmail } from "@/lib/email/staff-invite";

const PatchSchema = z.object({
  roleId: z.string().min(1).optional(),
  resendInvite: z.boolean().optional(),
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  await connectDB();
  const user = await User.findById(id);
  if (!user || user.userType !== "staff") return NextResponse.json({ error: "Staff user not found" }, { status: 404 });

  if (parsed.data.roleId) {
    const role = await Role.findById(parsed.data.roleId);
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
    user.roleId = role._id;
  }

  if (parsed.data.resendInvite) {
    if (user.isActive) {
      return NextResponse.json({ error: "User has already activated their account" }, { status: 409 });
    }
    user.inviteToken = randomUUID();
    user.inviteTokenExpires = new Date(Date.now() + INVITE_TTL_MS);
    await user.save();

    const role = await Role.findById(user.roleId).select("name").lean();
    const inviteLink = `${process.env.NEXTAUTH_URL}/staff-setup/${user.inviteToken}`;
    await sendStaffInviteEmail({
      to: user.email,
      inviteeName: user.firstName,
      roleName: role?.name ?? "Staff",
      inviteLink,
      inviterName: `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() || "Tools Australia",
    });
    return NextResponse.json({ success: true });
  }

  await user.save();
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 403 });
  }

  await connectDB();
  const user = await User.findById(id);
  if (!user || user.userType !== "staff") return NextResponse.json({ error: "Staff user not found" }, { status: 404 });

  user.userType = "customer";
  user.roleId = null;
  user.isActive = false;
  user.inviteToken = undefined;
  user.inviteTokenExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual test**

```bash
# List staff
curl -b '...' http://localhost:3000/api/admin/staff
# Invite (use a real email you control)
curl -b '...' -X POST http://localhost:3000/api/admin/staff \
  -H 'content-type: application/json' \
  -d '{"email":"yourself+test@gmail.com","firstName":"Test","lastName":"Staff","roleId":"<ads-manager-id>"}'
```

Check inbox — invite email should arrive.

- [ ] **Step 5: Update docs**

Create `docs/admin/staff-api.md`:

```markdown
# Staff API

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | /api/admin/staff | settings.view | List all staff with role + invite status |
| POST | /api/admin/staff | settings.edit | Create staff user + send SendGrid invite. Conflicts with existing emails. |
| PATCH | /api/admin/staff/:id | settings.edit | Change role and/or resend invite |
| DELETE | /api/admin/staff/:id | settings.edit | Demotes staff → customer + deactivates. Cannot remove yourself. |

Invite token TTL is 7 days. Resending generates a fresh token; the old token is invalidated.
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/staff docs/admin/staff-api.md
git commit -m "feat(admin): staff list, invite, change-role, deactivate API"
```

---

## Task 19: Staff setup endpoint + public page

**Files:**
- Create: `src/app/api/auth/staff-setup/route.ts`
- Create: `src/app/staff-setup/[token]/page.tsx`
- Update docs: `docs/auth/`

- [ ] **Step 1: Implement the API endpoint**

Create `src/app/api/auth/staff-setup/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

const SetupSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await connectDB();
  const user = await User.findOne({ inviteToken: parsed.data.token });
  if (!user || user.userType !== "staff") {
    return NextResponse.json({ error: "Invalid or used invite link" }, { status: 410 });
  }
  if (!user.inviteTokenExpires || user.inviteTokenExpires < new Date()) {
    return NextResponse.json({ error: "This invite link has expired. Ask your admin to resend it." }, { status: 410 });
  }
  if (user.isActive) {
    return NextResponse.json({ error: "Account already activated" }, { status: 409 });
  }

  user.password = await bcrypt.hash(parsed.data.password, 10);
  user.isActive = true;
  user.isEmailVerified = true;
  user.inviteToken = undefined;
  user.inviteTokenExpires = undefined;
  await user.save();

  return NextResponse.json({ success: true, email: user.email });
}

// Public endpoint to look up the invite (so the setup page can show email + role before submission)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  await connectDB();
  const user = await User.findOne({ inviteToken: token }).select("email firstName roleId inviteTokenExpires userType isActive").lean();
  if (!user || user.userType !== "staff" || user.isActive) {
    return NextResponse.json({ error: "Invalid or used invite link" }, { status: 410 });
  }
  if (!user.inviteTokenExpires || user.inviteTokenExpires < new Date()) {
    return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
  }

  return NextResponse.json({
    success: true,
    data: {
      email: user.email,
      firstName: user.firstName,
    },
  });
}
```

- [ ] **Step 2: Implement the public setup page**

Create `src/app/staff-setup/[token]/page.tsx`:

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function StaffSetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<{ email: string; firstName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/staff-setup?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Unable to load invite");
        setInvite(data.data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/staff-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to set password");
      router.push(`/login?email=${encodeURIComponent(data.email)}&staffSetup=ok`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-center">Loading invite…</div>;
  if (error && !invite) return <div className="p-8 max-w-md mx-auto text-center"><h1 className="text-xl font-bold mb-2">Can't open this invite</h1><p>{error}</p></div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white rounded-xl shadow p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-1">Welcome, {invite?.firstName}</h1>
        <p className="text-gray-600 mb-6">Set a password for <strong>{invite?.email}</strong> to finish setting up your admin account.</p>

        <label className="block mb-3">
          <span className="text-sm font-medium">Password</span>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block mb-4">
          <span className="text-sm font-medium">Confirm password</span>
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <button type="submit" disabled={submitting}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg disabled:opacity-50">
          {submitting ? "Setting up…" : "Set password & continue"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add to middleware allow-list**

The `/staff-setup/[token]` path is public. Confirm `src/middleware.ts` doesn't gate it behind auth. If the middleware matcher includes it, add `/staff-setup` to the public paths list.

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 5: End-to-end manual test**

1. Invite yourself via the API (Task 18 curl).
2. Open the invite email link.
3. Page should show "Welcome, <name>" and your email.
4. Set a password.
5. Get redirected to `/login?email=…&staffSetup=ok`.
6. Log in. Confirm `/admin` loads.

- [ ] **Step 6: Update docs**

Append to `docs/auth/roles.md`:

```markdown
## Staff invite + setup

1. Admin POSTs to `/api/admin/staff` with email/name/roleId.
2. Server creates User(`isActive: false`, `userType: "staff"`, `roleId`, `inviteToken`, `inviteTokenExpires: now+7d`).
3. SendGrid email goes out with link `https://<host>/staff-setup/<inviteToken>`.
4. Invitee opens link → `GET /api/auth/staff-setup?token=...` loads display info.
5. Invitee submits password → `POST /api/auth/staff-setup` sets password, activates account, clears invite fields.
6. Invitee logs in normally via `/login` and lands in `/admin`.
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/auth/staff-setup src/app/staff-setup docs/auth/roles.md
git commit -m "feat(auth): public staff-setup page + activation endpoint"
```

---

## Task 19.5: Design preview for Roles & Staff UI (user review checkpoint)

**Why this task exists:** Before building the real Roles/Staff management UI (Tasks 20–22), the user wants to see and iterate on the visual design in their browser. The aesthetic target is **Discord-inspired** (chunky permission grid with toggle pills, sidebar sub-nav, role-color accents) but **tailored to the existing Tools Australia admin style** (red brand color, rounded cards, Tailwind utilities already used in `AdminSidebar.tsx`). The site has **light AND dark mode** themes — both must look intentional.

**Files:**
- Create: `src/app/admin/settings/preview/page.tsx` (dev-only preview route, accessible at `/admin/settings/preview`)
- Create: `src/components/admin/settings/preview/RolesPreview.tsx`
- Create: `src/components/admin/settings/preview/StaffPreview.tsx`
- Create: `src/components/admin/settings/preview/mockData.ts` (fake roles + staff for the preview)
- Update docs: append a "Design preview" note to `docs/admin/admin-layout.md`

**Hard scope rules:**
- No API calls. No mutations. No DB writes. Pure presentational components with mock data.
- Must render correctly in **both light and dark mode** — use the same theme primitives the existing admin pages use (`useTheme` hook + Tailwind `dark:` classes — see `docs/theme/` and `src/hooks/useTheme.ts`).
- Must be gated behind `settings.view` (using `usePermissions().has`) and behind the admin layout's staff guard — so only admins see the preview.
- Must work without any of Tasks 20/21 existing.
- Should look obviously themed for Tools Australia, not look like a generic Discord clone. Lean on `#ee0000`/`#ff4444` gradients already used in `AdminSidebar.tsx`, the rounded-xl card aesthetic, the existing Lucide icon set.

- [ ] **Step 1: Read existing theme + admin styling references**

Open these to internalize the visual vocabulary already in use:
- `src/app/admin/component/AdminSidebar.tsx` — gradients, rounded corners, hover states
- `src/hooks/useTheme.ts` and `src/contexts/ThemeContext.tsx` — how light/dark is toggled
- `src/app/globals.css` — any CSS variables for theme colors
- Any one Settings-tab subcomponent (`git grep -l 'settings' src/app/admin/component/`)

- [ ] **Step 2: Create mock data**

Create `src/components/admin/settings/preview/mockData.ts`:

```ts
export interface MockRole {
  id: string;
  name: string;
  color: string;          // hex — Discord-style role color
  permissionCount: number;
  memberCount: number;
  isSystem: boolean;
}

export interface MockStaff {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  roleName: string;
  roleColor: string;
  inviteStatus: "active" | "pending" | "expired";
  invitedAt: string | null;
  lastLogin: string | null;
}

export const MOCK_ROLES: MockRole[] = [
  { id: "r1", name: "Admin",         color: "#ee0000", permissionCount: 30, memberCount: 1, isSystem: true  },
  { id: "r2", name: "Ads Manager",   color: "#f59e0b", permissionCount: 6,  memberCount: 2, isSystem: false },
  { id: "r3", name: "Email Marketing",color: "#3b82f6", permissionCount: 4,  memberCount: 1, isSystem: false },
  { id: "r4", name: "Designer",      color: "#a855f7", permissionCount: 3,  memberCount: 0, isSystem: false },
];

export const MOCK_STAFF: MockStaff[] = [
  { id: "s1", firstName: "DJ",     lastName: "Rivera",  email: "djrrivera25@gmail.com", roleId: "r1", roleName: "Admin",        roleColor: "#ee0000", inviteStatus: "active",  invitedAt: null,                       lastLogin: "2026-05-20T08:14:00Z" },
  { id: "s2", firstName: "Maya",   lastName: "Chen",    email: "maya@example.com",      roleId: "r2", roleName: "Ads Manager",  roleColor: "#f59e0b", inviteStatus: "active",  invitedAt: "2026-04-12T10:00:00Z",     lastLogin: "2026-05-19T14:22:00Z" },
  { id: "s3", firstName: "Sam",    lastName: "Patel",   email: "sam@example.com",       roleId: "r2", roleName: "Ads Manager",  roleColor: "#f59e0b", inviteStatus: "pending", invitedAt: "2026-05-18T09:30:00Z",     lastLogin: null },
  { id: "s4", firstName: "Carlos", lastName: "Diaz",    email: "carlos@example.com",    roleId: "r3", roleName: "Email Marketing", roleColor: "#3b82f6", inviteStatus: "expired", invitedAt: "2026-04-01T12:00:00Z", lastLogin: null },
];

import { AREAS } from "@/lib/permissions";
export const MOCK_PERMISSION_GRID = AREAS.map((a) => ({
  area: a,
  // Mock: Admin has everything; Ads Manager has facebookAds/pageAnalytics/abTesting/promoAnalytics/overview.view
  adsManager: {
    view: ["overview", "facebookAds", "pageAnalytics", "promoAnalytics", "abTesting"].includes(a),
    edit: ["facebookAds"].includes(a),
  },
}));
```

- [ ] **Step 3: Build `RolesPreview.tsx`**

Create `src/components/admin/settings/preview/RolesPreview.tsx`. Requirements:
- A roles list on the left (Discord channel-list vibe): each row shows a colored dot/pill (role color), name, member count, system badge.
- Selected role's editor on the right: permission grid (rows = areas, cols = View / Edit) with **toggle pills** (not checkboxes — bigger, more tactile, Discord-style).
- "+ New Role" button at the top of the left list.
- Top-right of the editor: role color swatch, name input (disabled for system roles), delete button (disabled for system or members > 0).
- Both light and dark mode supported via `dark:` Tailwind classes. Backgrounds: `bg-white dark:bg-gray-900`, borders `border-gray-200 dark:border-gray-800`, hover states `hover:bg-gray-50 dark:hover:bg-gray-800`.
- Sidebar accent uses the brand red gradient `from-[#ee0000] to-[#ff4444]` consistently with `AdminSidebar.tsx`.

Detailed sketch (use as starting point; refine visually):

```tsx
"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { MOCK_ROLES, MOCK_PERMISSION_GRID } from "./mockData";
import { AREAS } from "@/lib/permissions";

export default function RolesPreview() {
  const [selectedId, setSelectedId] = useState<string>(MOCK_ROLES[1].id);
  const selected = MOCK_ROLES.find((r) => r.id === selectedId)!;

  return (
    <div className="flex h-[calc(100vh-200px)] bg-gray-50 dark:bg-gray-950 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
      {/* Roles list (Discord-style left rail) */}
      <aside className="w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Roles</h3>
          <button className="p-1.5 rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white hover:shadow-lg transition-shadow">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {MOCK_ROLES.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  r.id === selectedId
                    ? "bg-gray-100 dark:bg-gray-800"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-2">
                    {r.name}
                    {r.isSystem && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        System
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {r.memberCount} member{r.memberCount === 1 ? "" : "s"} · {r.permissionCount} perms
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Editor pane */}
      <section className="flex-1 overflow-y-auto p-8 bg-white dark:bg-gray-900">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="w-5 h-5 rounded" style={{ background: selected.color }} />
            <input
              defaultValue={selected.name}
              disabled={selected.isSystem}
              className="text-2xl font-bold bg-transparent outline-none text-gray-900 dark:text-gray-100 disabled:opacity-70"
            />
          </div>
          <div className="flex gap-2">
            <button
              disabled={selected.isSystem || selected.memberCount > 0}
              className="px-3 py-1.5 text-sm rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </header>

        <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-950 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left py-3 px-4">Area</th>
                <th className="py-3 px-4 w-32 text-center">View</th>
                <th className="py-3 px-4 w-32 text-center">Edit</th>
              </tr>
            </thead>
            <tbody>
              {AREAS.map((a) => {
                const row = MOCK_PERMISSION_GRID.find((r) => r.area === a)!;
                return (
                  <tr key={a} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="py-3 px-4 text-gray-900 dark:text-gray-100">
                      {a.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <TogglePill on={selected.id === "r1" ? true : row.adsManager.view} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <TogglePill on={selected.id === "r1" ? true : row.adsManager.edit} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TogglePill({ on }: { on: boolean }) {
  return (
    <button
      type="button"
      className={`relative inline-flex w-11 h-6 rounded-full transition-colors ${
        on ? "bg-gradient-to-r from-[#ee0000] to-[#ff4444]" : "bg-gray-200 dark:bg-gray-700"
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
```

- [ ] **Step 4: Build `StaffPreview.tsx`**

Mirror the Discord member-list style:
- Top bar: "+ Invite Staff" button (brand gradient, right side)
- Table-card hybrid: each staff row is a card with avatar circle (initials), name, email, role pill (colored by role), invite status badge, last-login timestamp, action icons (resend, remove).
- Same dark/light requirements.

```tsx
"use client";

import { Plus, Send, Trash2, Search } from "lucide-react";
import { MOCK_STAFF, MOCK_ROLES } from "./mockData";

export default function StaffPreview() {
  return (
    <div className="bg-gray-50 dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <header className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search staff…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white font-medium hover:shadow-lg transition-shadow">
          <Plus className="w-4 h-4" /> Invite staff
        </button>
      </header>

      <ul className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
        {MOCK_STAFF.map((s) => (
          <li key={s.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/60">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${s.roleColor}, ${s.roleColor}cc)` }}
            >
              {s.firstName[0]}{s.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {s.firstName} {s.lastName}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{s.email}</div>
            </div>

            <select
              defaultValue={s.roleId}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              {MOCK_ROLES.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>

            <StatusBadge status={s.inviteStatus} />

            <div className="flex gap-1">
              {s.inviteStatus !== "active" && (
                <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300" title="Resend invite">
                  <Send className="w-4 h-4" />
                </button>
              )}
              <button className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400" title="Remove">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "pending" | "expired" }) {
  const styles = {
    active:  "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400",
    pending: "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400",
    expired: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400",
  };
  const label = status === "active" ? "Active" : status === "pending" ? "Invited" : "Expired";
  return <span className={`text-xs font-medium px-2 py-1 rounded-md ${styles[status]}`}>{label}</span>;
}
```

- [ ] **Step 5: Wire the preview route**

Create `src/app/admin/settings/preview/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import RolesPreview from "@/components/admin/settings/preview/RolesPreview";
import StaffPreview from "@/components/admin/settings/preview/StaffPreview";

export default function SettingsPreviewPage() {
  const [tab, setTab] = useState<"staff" | "roles">("staff");
  return (
    <div className="p-6 lg:p-10 bg-white dark:bg-gray-950 min-h-screen-svh">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings — Preview</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Visual mockup for review. No data is saved.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6">
        {(["staff", "roles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? "text-[#ee0000] dark:text-[#ff4444] border-b-2 border-[#ee0000] dark:border-[#ff4444]"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "staff" ? <StaffPreview /> : <RolesPreview />}
    </div>
  );
}
```

- [ ] **Step 6: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no new errors (pre-existing repo-wide errors may exist; ensure none are in the files you created).

- [ ] **Step 7: Launch dev server and capture screenshots**

Run: `npm run dev` (let it stay running)

Manually open in your browser:
- `http://localhost:3000/admin/settings/preview` while logged in as admin
- Toggle between Staff and Roles sub-tabs
- Toggle dark/light theme using the existing theme toggle in your site
- Take 4 screenshots: Roles (light), Roles (dark), Staff (light), Staff (dark)

- [ ] **Step 8: STOP and hand control to the user**

Do **not** commit this task automatically. Report back to the controller with status `DONE_PENDING_USER_REVIEW`. The controller will show the preview URL to the user, the user will provide visual feedback, and a follow-up subagent will iterate on the design before Tasks 20/21 begin.

When the user approves the visual direction, the controller commits the preview as a snapshot and proceeds to Task 20. Tasks 20/21 will replace mock data with real API calls but **keep the approved visual structure** — meaning the code in `RolesPreview.tsx` / `StaffPreview.tsx` may be largely lifted into `RolesManagement.tsx` / `StaffManagement.tsx` with API integration added.

- [ ] **Step 9 (after user approval): Commit the preview snapshot**

```bash
git add src/app/admin/settings/preview src/components/admin/settings/preview docs/admin/admin-layout.md
git commit -m "feat(admin): design preview for Settings → Roles & Staff"
```

- [ ] **Step 10: Update docs**

Append to `docs/admin/admin-layout.md`:

```markdown
## Settings preview route (dev-only design mockup)

`/admin/settings/preview` renders a static visual mockup of the Roles + Staff screens. It uses mock data from `src/components/admin/settings/preview/mockData.ts` — no DB calls, no mutations. Both light and dark theme are supported.

The preview was used to lock the visual direction before Tasks 20/21 built the real, API-integrated versions. The real components live at `src/components/admin/settings/RolesManagement.tsx` and `StaffManagement.tsx`.

The preview route can stay live in dev for quick visual reference or be removed once production is shipped. Decide during the cleanup PR.
```

---

## Task 20: Settings → Roles management UI

**Files:**
- Create: `src/components/admin/settings/RolesManagement.tsx`
- Update docs: `docs/admin/`

- [ ] **Step 1: Implement the component**

Create `src/components/admin/settings/RolesManagement.tsx`. Structure: a top-level component renders the roles table + an inline `RoleEditorModal` for create/edit. Use TanStack Query (already in the stack) for data, and TailwindCSS to match the existing admin styling.

```tsx
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Plus } from "lucide-react";
import { AREAS, type Area, type Permission } from "@/lib/permissions";

interface Role {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  memberCount: number;
}

interface RolesResponse {
  success: true;
  data: { roles: Role[]; catalog: Permission[] };
}

export default function RolesManagement() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<RolesResponse>({
    queryKey: ["admin", "roles"],
    queryFn: () => fetch("/api/admin/roles").then((r) => r.json()),
  });
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/roles/${id}`, { method: "DELETE" }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "roles"] }),
  });

  if (isLoading || !data) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Roles</h2>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
          <Plus className="w-4 h-4" /> New role
        </button>
      </div>

      <table className="w-full">
        <thead className="text-left text-sm text-gray-600 border-b">
          <tr>
            <th className="py-2">Name</th>
            <th className="py-2">Permissions</th>
            <th className="py-2">Members</th>
            <th className="py-2 w-32">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.data.roles.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-3">
                {r.name}
                {r.isSystem && <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">System</span>}
              </td>
              <td className="py-3">{r.permissions.length}</td>
              <td className="py-3">{r.memberCount}</td>
              <td className="py-3">
                <div className="flex gap-2">
                  <button onClick={() => setEditing(r)} className="p-2 hover:bg-gray-100 rounded" title="Edit"><Pencil className="w-4 h-4" /></button>
                  <button
                    onClick={() => {
                      if (r.isSystem) return;
                      if (r.memberCount > 0) { alert("Move staff off this role first"); return; }
                      if (confirm(`Delete role "${r.name}"?`)) deleteMut.mutate(r.id);
                    }}
                    disabled={r.isSystem || r.memberCount > 0}
                    className="p-2 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Delete"
                  ><Trash2 className="w-4 h-4 text-red-600" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(creating || editing) && (
        <RoleEditorModal
          role={editing}
          catalog={data.data.catalog}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin", "roles"] });
            setCreating(false); setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RoleEditorModal({
  role, catalog, onClose, onSaved,
}: { role: Role | null; catalog: Permission[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSystem = role?.isSystem ?? false;
  const isAdminRole = role?.name === "Admin";

  function toggle(p: Permission) {
    const next = new Set(perms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPerms(next);
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      const url = role ? `/api/admin/roles/${role.id}` : "/api/admin/roles";
      const method = role ? "PATCH" : "POST";
      const body = role
        ? { permissions: Array.from(perms), ...(isSystem ? {} : { name }) }
        : { name, permissions: Array.from(perms) };
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">{role ? `Edit role: ${role.name}` : "New role"}</h3>

        <label className="block mb-4">
          <span className="text-sm font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={isSystem}
            className="mt-1 w-full border rounded-lg px-3 py-2 disabled:bg-gray-100" />
        </label>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-sm">
              <tr>
                <th className="text-left p-3">Area</th>
                <th className="p-3 w-24 text-center">View</th>
                <th className="p-3 w-24 text-center">Edit</th>
              </tr>
            </thead>
            <tbody>
              {AREAS.map((a: Area) => {
                const viewPerm = `${a}.view` as Permission;
                const editPerm = `${a}.edit` as Permission;
                // Lock settings.edit toggle on Admin role (can't lock yourself out)
                const editDisabled = isAdminRole && a === "settings";
                return (
                  <tr key={a} className="border-t">
                    <td className="p-3 capitalize">{a.replace(/([A-Z])/g, " $1").trim()}</td>
                    <td className="p-3 text-center">
                      <input type="checkbox" checked={perms.has(viewPerm)} onChange={() => toggle(viewPerm)} disabled={isAdminRole} />
                    </td>
                    <td className="p-3 text-center">
                      <input type="checkbox" checked={perms.has(editPerm)} onChange={() => toggle(editPerm)} disabled={editDisabled || isAdminRole} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || (!name && !role)}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 3: Update docs**

Append to `docs/admin/admin-layout.md`:

```markdown
## Settings → Roles

`src/components/admin/settings/RolesManagement.tsx` renders the roles table + an inline editor modal. The Admin role's checkboxes are disabled — its permissions are managed by the seed script.
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/settings/RolesManagement.tsx docs/admin/admin-layout.md
git commit -m "feat(admin): roles management UI"
```

---

## Task 21: Settings → Staff management UI

**Files:**
- Create: `src/components/admin/settings/StaffManagement.tsx`
- Update docs: `docs/admin/`

- [ ] **Step 1: Implement the component**

Create `src/components/admin/settings/StaffManagement.tsx`. Pattern mirrors Task 20.

```tsx
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Trash2 } from "lucide-react";

interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roleId: string | null;
  roleName: string | null;
  inviteStatus: "pending" | "expired" | "active";
  invitedAt: string | null;
}

interface Role { id: string; name: string }

export default function StaffManagement() {
  const qc = useQueryClient();
  const { data: staff, isLoading: staffLoading } = useQuery<{ success: true; data: StaffUser[] }>({
    queryKey: ["admin", "staff"],
    queryFn: () => fetch("/api/admin/staff").then((r) => r.json()),
  });
  const { data: rolesData } = useQuery<{ success: true; data: { roles: Role[] } }>({
    queryKey: ["admin", "roles"],
    queryFn: () => fetch("/api/admin/roles").then((r) => r.json()),
  });
  const [inviting, setInviting] = useState(false);

  const changeRole = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) =>
      fetch(`/api/admin/staff/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ roleId }) })
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "staff"] }),
  });

  const resend = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/staff/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ resendInvite: true }) })
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "staff"] }),
  });

  const removeStaff = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/staff/${id}`, { method: "DELETE" })
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "staff"] }),
  });

  if (staffLoading || !staff || !rolesData) return <div className="p-6">Loading…</div>;
  const roles = rolesData.data.roles;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Staff</h2>
        <button onClick={() => setInviting(true)} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
          <Plus className="w-4 h-4" /> Invite staff
        </button>
      </div>

      <table className="w-full">
        <thead className="text-left text-sm text-gray-600 border-b">
          <tr>
            <th className="py-2">Name</th>
            <th className="py-2">Email</th>
            <th className="py-2">Role</th>
            <th className="py-2">Status</th>
            <th className="py-2 w-40">Actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.data.map((s) => (
            <tr key={s.id} className="border-b">
              <td className="py-3">{s.firstName} {s.lastName}</td>
              <td className="py-3">{s.email}</td>
              <td className="py-3">
                <select
                  value={s.roleId ?? ""}
                  onChange={(e) => changeRole.mutate({ id: s.id, roleId: e.target.value })}
                  className="border rounded px-2 py-1"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </td>
              <td className="py-3">
                {s.inviteStatus === "active" && <span className="text-green-700 text-sm">Active</span>}
                {s.inviteStatus === "pending" && <span className="text-yellow-700 text-sm">Invited</span>}
                {s.inviteStatus === "expired" && <span className="text-red-600 text-sm">Expired</span>}
              </td>
              <td className="py-3">
                <div className="flex gap-2">
                  {!s.isActive && (
                    <button onClick={() => resend.mutate(s.id)} className="p-2 hover:bg-gray-100 rounded" title="Resend invite">
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { if (confirm(`Remove ${s.email}?`)) removeStaff.mutate(s.id); }}
                    className="p-2 hover:bg-red-50 rounded" title="Remove">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {inviting && <InviteModal roles={roles} onClose={() => setInviting(false)} onSent={() => { setInviting(false); qc.invalidateQueries({ queryKey: ["admin", "staff"] }); }} />}
    </div>
  );
}

function InviteModal({ roles, onClose, onSent }: { roles: Role[]; onClose: () => void; onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const r = await fetch("/api/admin/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, firstName, lastName, roleId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onSent();
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
        <h3 className="text-xl font-bold mb-4">Invite staff</h3>
        <div className="space-y-3">
          <label className="block"><span className="text-sm font-medium">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium">First name</span><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
            <label className="block"><span className="text-sm font-medium">Last name</span><input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
          </div>
          <label className="block"><span className="text-sm font-medium">Role</span>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={submitting || !email || !firstName || !lastName || !roleId} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">
            {submitting ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 3: Update docs**

Append to `docs/admin/admin-layout.md`:

```markdown
## Settings → Staff

`src/components/admin/settings/StaffManagement.tsx` renders the staff table, the role dropdown (autosaves on change), resend-invite, and remove-staff actions. Inviting opens a small modal calling `POST /api/admin/staff`.
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/settings/StaffManagement.tsx docs/admin/admin-layout.md
git commit -m "feat(admin): staff management UI"
```

---

## Task 22: Wire Roles & Staff into the existing Settings tab

**Files:**
- Modify: the existing Settings tab content (find with `git grep -l 'selectedTab.*settings' src/app/admin`)
- Modify: `src/app/admin/component/AdminPage.tsx` if it routes tabs to sub-components

- [ ] **Step 1: Inventory the Settings tab implementation**

Run: `git grep -nF 'settings' src/app/admin/component/AdminPage.tsx`. Find where the `settings` tab is rendered. There's likely a switch or conditional rendering block based on `selectedTab`.

- [ ] **Step 2: Add a sub-section selector**

Inside the Settings tab content, add a two-button sub-nav: "Roles" | "Staff". Render `<RolesManagement />` or `<StaffManagement />` based on local state. Default to "Staff".

Example sketch (place inside whatever component currently renders the Settings panel — adapt to actual structure):

```tsx
import { useState } from "react";
import RolesManagement from "@/components/admin/settings/RolesManagement";
import StaffManagement from "@/components/admin/settings/StaffManagement";

function SettingsTab() {
  const [section, setSection] = useState<"staff" | "roles">("staff");
  return (
    <div>
      <div className="flex gap-2 border-b mb-4 px-6 pt-6">
        <button onClick={() => setSection("staff")}
          className={`px-4 py-2 ${section === "staff" ? "border-b-2 border-red-600 font-semibold" : "text-gray-600"}`}>
          Staff
        </button>
        <button onClick={() => setSection("roles")}
          className={`px-4 py-2 ${section === "roles" ? "border-b-2 border-red-600 font-semibold" : "text-gray-600"}`}>
          Roles
        </button>
      </div>
      {section === "staff" ? <StaffManagement /> : <RolesManagement />}
    </div>
  );
}
```

- [ ] **Step 3: Manual end-to-end test**

`npm run dev`, log in as admin, go to Settings:
- See Staff + Roles tabs.
- Click "Invite staff" → invite a real email you control.
- Receive email, open link, set password.
- Log in as the invited user → only the tabs the role grants are visible.
- Go back to your admin account → demote/change role for the invited user.
- Confirm sidebar/api gating reflects the change after the permission cache TTL (or after sign-out + sign-in).

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin
git commit -m "feat(admin): wire roles + staff screens into Settings tab"
```

---

## Task 23: Domain docs final pass + smoke checklist

**Files:**
- Verify and bump `lastVerified` on all touched domains in `CLAUDE.md` Domain Manifest:
  - `auth` (touched)
  - `admin` (touched)
  - `email` (touched)
  - `security-csp` (touched)

The doc-sync hook auto-bumps `lastVerified` when docs are updated. Verify it ran for each domain. If any didn't update, manually set the date in `CLAUDE.md` to `2026-05-20`.

- [ ] **Step 1: Re-run lint + type-check + permission tests one more time**

```bash
npm run type-check
npm run lint
npm run test:permissions
npm run test:api-auth-permissions
```

All four must pass with no errors.

- [ ] **Step 2: Final end-to-end smoke checklist**

In a clean dev session:

1. Log in as the seeded admin. Confirm sidebar has every tab.
2. Visit `/my-account` → redirected to `/admin`.
3. Visit `/shop` → redirected to `/admin`.
4. Go to Settings → Roles → create a "Design" role with `promos.view` + `promos.edit` + `overview.view`.
5. Settings → Staff → invite a test address into the Design role.
6. Open the email, click setup link, set password, log in.
7. Confirm:
   - Sidebar shows only Overview + Promos.
   - `/my-account` redirects to /admin.
   - `/api/admin/users` returns 403.
   - `/api/admin/promo/create` works (200) when given a valid body.
8. Go back to admin account → change the Design user's role to Ads Manager → sign in/out as Design user → sidebar reflects new permissions.
9. Settings → Roles → confirm "Admin" cannot be deleted, cannot be renamed, and its `settings.edit` checkbox in the editor is disabled.
10. Try to delete a role with members → 409 with a clear error message.

- [ ] **Step 3: Commit any leftover doc tweaks**

```bash
git add docs CLAUDE.md
git commit -m "docs: bump lastVerified for auth/admin/email/security-csp domains"
```

- [ ] **Step 4: Branch is ready**

At this point Phases 1–4 are complete. Phase 5 (drop the legacy `User.role` field + remove the legacy admin bridge) is a follow-up PR weeks later, **after** this branch has been stable in production for at least one deploy cycle.

---

## Self-review (run after the plan is read end-to-end)

**Spec coverage check** — every spec section has tasks:

- Permission catalog → Task 1
- Role model → Task 2
- User model changes → Task 3
- Session callback / type augmentation → Task 4
- `requirePermission` + `userHasPermission` → Task 5
- `usePermissions` hook → Task 6
- Seed + backfill migration → Task 7
- Replace 40+ `role === "admin"` checks → Tasks 8–12
- Middleware staff block → Task 13
- Admin layout server guard + sidebar filtering → Tasks 14–15
- SendGrid invite + template → Task 16
- Roles CRUD API → Task 17
- Staff list / invite / role-change / deactivate APIs → Task 18
- Staff-setup endpoint + public page → Task 19
- Roles management UI → Task 20
- Staff management UI → Task 21
- Wire into Settings tab → Task 22
- Domain docs + smoke test → Task 23

**Phase 5 (legacy `role` field drop)** is intentionally not in this plan — it's a separate follow-up PR per the spec.

**Type/method consistency:** `requirePermission` returns `{ session } | NextResponse` everywhere it's referenced. `usePermissions().has()` is the only client-side check name used. `AREAS`, `PERMISSIONS`, `ALL_PERMISSIONS` are defined in Task 1 and referenced consistently. `Role.permissions` is `string[]` everywhere.

**No placeholders / no TBDs.** Every step shows the actual code to write or the actual command to run.
