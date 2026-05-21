# Staff Roles & Permissions (RBAC) — Design

**Date:** 2026-05-20
**Branch:** feature/user-roles
**Status:** Approved design — implementation in progress (Phases 1-3 done, Phase 4 + design preview remaining)

> **2026-05-20 Update — three-userType model.** The original spec had `userType: "customer" | "staff"` and treated Admin users as a flavor of staff. That was wrong — Admin is the **super-role** and must be able to navigate everywhere (customer AND admin pages), just like the Discord server owner. The corrected model uses `userType: "customer" | "staff" | "admin"`. Only `"staff"` (custom roles created via Settings) is blocked from customer-purchase flows. See "Staff vs customer separation" section below for the corrected logic.

## Problem

Today every staff member uses `User.role: "admin"`, which is an all-or-nothing flag. The ads, design, and email-marketing teams currently can't be given the admin panel without also handing them the keys to everything. The 40+ `session.user.role === "admin"` checks scattered across route handlers and components are also a maintenance hazard — adding a single new staff capability today requires editing dozens of files.

## Goals

1. The owner (Admin) can create new roles in the admin Settings tab without a code deploy.
2. Each role is a named bundle of read/write toggles per admin area (Discord-style).
3. Inviting a staff member is a single action: enter email + pick role → SendGrid invite → invitee sets password → can log in to `/admin`.
4. Staff accounts (custom roles) are walled off from customer-purchase flows. **Admin users are exempt** — they can navigate everywhere. If a non-Admin staff member also wants to buy as a customer, they create a separate account.
5. Replace all 40+ ad-hoc `role === "admin"` checks with a single permission helper, so future capability changes happen in one place.

## Non-goals (explicit YAGNI)

These were considered and ruled out for MVP. Each is a small additive change later if a real need emerges.

- Per-user permission overrides on top of role
- Role inheritance / nested roles
- Multi-role per user (a user has exactly one role)
- Audit log of permission changes
- 2FA enforcement for staff accounts
- "Delete" as a separate permission from "edit" (most areas don't have a meaningful split)
- Self-service role creation by non-Admin staff
- Time-bound or scheduled role grants

## Architecture

### Permission catalog (hardcoded)

```ts
// src/lib/permissions.ts
export const AREAS = [
  "overview", "users", "promos", "facebookAds", "pageAnalytics", "promoAnalytics",
  "submissions", "miniDraws", "majorDraw", "drawResults", "upcomingDraws",
  "affiliates", "errorReports", "abTesting", "settings",
] as const;
export type Area = typeof AREAS[number];

export const PERMISSIONS = AREAS.flatMap((a) => [`${a}.view`, `${a}.edit`]);
// ~30 strings total
```

**Why hardcoded:** every permission corresponds to actual code paths that gate things. The admin UI can't create a permission for a code path that doesn't exist. The UI *bundles* existing permissions into named roles — that's where flexibility lives.

Adding a new admin area later means: add the string to `AREAS`, gate the new routes/components on the new permission, and admins can immediately grant it via the role editor. One file change, no migration.

### Role model

```ts
// src/models/Role.ts
{
  _id: ObjectId;
  name: string;                     // unique, trimmed
  permissions: string[];            // subset of PERMISSIONS
  isSystem: boolean;                // true for seeded "Admin" — cannot delete or rename
  createdBy: ObjectId | null;       // staff user who created it (null for seeded)
  createdAt: Date;
  updatedAt: Date;
}
// Indexes: { name: 1 } unique
```

### User model changes (additive)

```ts
// src/models/User.ts (additions only)
roleId?: ObjectId | null;                              // null = customer
userType: "customer" | "staff" | "admin";              // default "customer"
inviteToken?: string;                                  // reuses passwordResetToken machinery
inviteTokenExpires?: Date;
invitedBy?: ObjectId;                                  // for audit/UI display
invitedAt?: Date;
```

**userType semantics:**

| `userType` | Set when | Customer pages (`/shop`, `/my-account`, etc.) | Admin pages (`/admin/**`) |
|---|---|---|---|
| `"customer"` | No `roleId` | ✅ access | ❌ redirect to `/` |
| `"staff"` | `roleId` points to a custom role (Ads Manager, Customer Support, Designer, etc.) | ❌ redirect to `/admin` | ✅ access (filtered by role's permissions) |
| `"admin"` | `roleId` points to the seeded Admin role | ✅ access (super-role, no block) | ✅ access (all permissions) |

The Admin role is the **only** role that maps users to `userType: "admin"`. If a custom role grants all 30 permissions, the user is still `"staff"` and still blocked from customer pages — by design, to keep the boundary clear. If you ever need a second super-role, add an `isFullAccess` boolean to `Role` then.

The legacy `role: "user" | "admin"` field is kept for one deploy cycle, then dropped (see Migration).

### Permission check helpers

One server helper and one client hook replace all current `role === "admin"` checks.

```ts
// src/lib/api-auth.ts (extends existing file)
export async function requirePermission(perm: string): Promise<
  { session: Session } | NextResponse  // returns NextResponse(401|403) on failure
>;

export async function userHasPermission(userId: string, perm: string): Promise<boolean>;

// src/hooks/usePermissions.ts (new client hook)
export function usePermissions(): {
  has: (perm: string) => boolean;
  hasAny: (...perms: string[]) => boolean;
  isLoading: boolean;
};
```

The NextAuth session callback (`src/lib/auth.ts`) is extended once to load the user's role + permission set on session creation, cached on the session token. Client checks never refetch — they read the session.

### Staff vs customer route gating

**Block list** — staff users (any user with `userType === "staff"`) are redirected silently to `/admin` if they attempt:

```
/my-account/**
/affiliate/**
/shop/**
/checkout/**
/purchase-success/**
/major-draw/**
/mini-draws/**
/mini-draw-success/**
/upsell-success/**
/rewards/**
/membership/**
/partner/**
```

Implemented in `src/middleware.ts` (a single matcher block, ~10 lines). Public marketing pages (home, /contact, /faq, /terms, /privacy, /draw-results, /winners) remain accessible to staff — they're just public content.

**Admin route gating** — `src/app/admin/layout.tsx` gains a server-side guard: if `session.user.userType !== "staff"`, redirect to `/`. The current client-side `useEffect` redirect in `src/app/admin/page.tsx` is removed (it was a security smell — content rendered before the redirect fired).

### Invite + setup flow

```
POST /api/admin/staff/invite
  body: { email, firstName, lastName, roleId }
  perm:  settings.edit
  → creates User(
      email, firstName, lastName,
      roleId,
      userType: "staff",
      isActive: false,
      isEmailVerified: false,
      inviteToken: crypto.randomUUID(),
      inviteTokenExpires: now + 7 days,
      invitedBy: session.user.id,
      invitedAt: now,
    )
  → SendGrid: new "Staff invitation" transactional template
  → link: https://<host>/staff-setup/<inviteToken>

GET  /staff-setup/[token]
  public page: shows email + role name, asks for password (twice)

POST /api/auth/staff-setup
  body: { token, password }
  → validates inviteToken + not expired
  → sets password, isActive=true, isEmailVerified=true, clears invite fields
  → returns success; client redirects to /admin sign-in
```

Reuses the existing password-reset token pattern (already in `User.ts`) and SendGrid integration. The only new infrastructure is one HTML email template at the repo root (`staff-invite-email-template.html`) and the two endpoints above.

**Resending invites:** if a staff user has `isActive: false` and a valid `inviteToken`, the Settings → Staff list shows a "Resend invite" button that regenerates the token + resends the email.

**Deactivation:** removing a staff user sets `userType: "customer"`, clears `roleId`, sets `isActive: false`. They keep their account row (audit trail) but can no longer log into anything. There is no separate "delete staff" action.

### Settings → Staff Management UI

Three screens added under the existing Settings tab. No new top-level admin routes.

**1. Roles list** (`/admin/settings?section=roles`)
- Table: Name | Permissions (count) | Members (count) | Actions
- Actions: Edit (always), Delete (disabled if `isSystem: true` or `Members > 0`)
- "+ New role" button → opens role editor in create mode

**2. Role editor** (modal or inline panel)
- Name input
- Permission grid: rows = areas, columns = View | Edit
- Two toggles per row. Editing a system role: name input disabled, "Edit" checkbox for `settings` disabled (can't lock yourself out)
- Save / Cancel

**3. Staff list** (`/admin/settings?section=staff`)
- Table: Name | Email | Role (dropdown) | Status (Invited / Active / Inactive) | Actions
- Actions: Resend invite (if pending), Change role (inline dropdown, autosave), Remove staff (confirm modal)
- "+ Invite" button → modal with email/name/role

All three screens are gated behind `settings.edit`. Only Admin (and any custom role you grant `settings.edit` to) sees them.

### Sidebar filtering

`src/app/admin/component/AdminSidebar.tsx` — each `adminTabs` entry gets a `requires: string` field naming the `.view` permission. The render filters `adminTabs` through `usePermissions().has(tab.requires)`. Tabs the user can't view simply don't appear.

```ts
const adminTabs = [
  { id: "overview",    label: "Overview",      icon: BarChart3,     requires: "overview.view" },
  { id: "users",       label: "Users",         icon: Users,         requires: "users.view"    },
  { id: "facebook-ads",label: "Facebook Ads",  icon: TrendingUp,    requires: "facebookAds.view" },
  // ...
];
```

### Replacing 40+ ad-hoc checks

Every occurrence of `session.user.role !== "admin"` becomes either:

```ts
// server: route handler
const guard = await requirePermission("users.view");
if (guard instanceof NextResponse) return guard;
const { session } = guard;
```

```tsx
// client: component
const { has } = usePermissions();
if (!has("users.edit")) return <Forbidden />;
```

This is mechanical — a single PR doing the find/replace across all 40+ files. Per CLAUDE.md the lint and type-check must pass; no behavior change is intended in this PR.

## Migration plan

**Phase 1 — Foundational (no behavior change)**
- Add `src/lib/permissions.ts` (the constant catalog)
- Add `src/models/Role.ts`
- Add `User.roleId`, `User.userType`, invite-token fields
- Extend NextAuth session callback to populate permissions on the session token
- Add `requirePermission` / `userHasPermission` / `usePermissions` helpers
- Seed two roles via migration script:
  - **Admin** — all `PERMISSIONS`, `isSystem: true`
  - **Ads Manager** — `facebookAds.{view,edit}`, `pageAnalytics.view`, `promoAnalytics.view`, `abTesting.view`, `overview.view`, `isSystem: false`
- Backfill: every user with `role: "admin"` gets `roleId: Admin._id`, `userType: "staff"`. Every other user gets `userType: "customer"`.

**Phase 2 — Replace authorization checks**
- Mechanical find/replace of all 40+ `role === "admin"` checks → `requirePermission` / `usePermissions`
- Manual review on each call site: pick the appropriate `.view` vs `.edit` permission
- No new features; this is pure refactor

**Phase 3 — Route gating**
- Middleware staff block-list for customer-purchase routes
- `/admin/layout.tsx` server-side staff guard
- Remove client-side `useEffect` redirect from `/admin/page.tsx`
- Sidebar tab filtering via `requires`

**Phase 4 — Settings UI + invite flow**
- Roles list / role editor / staff list screens under Settings
- `POST /api/admin/staff/invite` + `POST /api/auth/staff-setup` + `/staff-setup/[token]` page
- New SendGrid invite template

**Phase 5 — Cleanup (separate PR, weeks later)**
- Drop legacy `User.role` field once Phases 1–4 have been stable in production for at least one deploy cycle
- Drop the legacy `role: 1` index on User

Phases 1–4 are one feature branch (this branch). Phase 5 is a follow-up PR.

## Failure modes & decisions

**A staff user with `roleId` is deleted/deactivated mid-session.** Session token has cached permissions. They keep access until the NextAuth session refresh interval expires (default 24h on this app). For MVP this is acceptable — Settings → Staff "Remove" is a deliberate action, and 24h is the existing session refresh window. If we ever need instant revocation, add a `tokenVersion` field on User and check it on every `requirePermission`. Not now.

**Admin removes the `settings.edit` permission from the last role that has it.** The role editor disables the `settings.edit` checkbox for *any* system role and warns when editing the role that the current admin is using. This is not bulletproof (admin could still demote themselves via the database), but it covers the realistic foot-gun.

**Invite token used after expiry.** `POST /api/auth/staff-setup` returns 410 Gone with a generic message. The Staff list UI shows the invite is expired and offers Resend.

**Invite token used twice.** Token is single-use — cleared on successful setup. Second attempt returns 410.

**Existing `role: "admin"` user logs in mid-migration before backfill completes.** Backfill script must run as part of Phase 1 deploy, before the new permission checks ship. The fallback path: if `roleId == null` but legacy `role == "admin"`, the helper treats them as having all permissions (one-deploy-cycle bridge). This bridge is removed in Phase 5.

**Staff user tries to register as a customer with the same email.** Email is unique on User. They'll need a different email — same constraint as today.

## Files to be added / modified

**Added:**
- `src/lib/permissions.ts` — permission catalog
- `src/models/Role.ts` — Role collection schema
- `src/hooks/usePermissions.ts` — client permission check
- `src/app/staff-setup/[token]/page.tsx` — invitee password-setup page (public)
- `src/app/api/admin/staff/route.ts` — GET list + POST invite (one file, two methods)
- `src/app/api/admin/staff/[id]/route.ts` — PATCH role + DELETE (deactivate) staff
- `src/app/api/admin/roles/route.ts` — GET list + POST create
- `src/app/api/admin/roles/[id]/route.ts` — PATCH + DELETE
- `src/app/api/auth/staff-setup/route.ts` — POST password setup from invite token
- `src/components/admin/settings/RolesManagement.tsx` — list + editor modal inlined
- `src/components/admin/settings/StaffManagement.tsx` — list + invite modal inlined
- `staff-invite-email-template.html` (repo root)
- `scripts/migrate-seed-staff-roles.ts` — seeds Admin + Ads Manager, backfills `userType` and `roleId` on existing users (one combined script)

**Modified:**
- `src/models/User.ts` — add roleId, userType, invite fields
- `src/lib/auth.ts` — session callback loads permissions
- `src/lib/api-auth.ts` — add `requirePermission`, `userHasPermission`
- `src/middleware.ts` — staff block-list for customer routes
- `src/app/admin/layout.tsx` — server-side staff guard
- `src/app/admin/page.tsx` — remove client-side redirect
- `src/app/admin/component/AdminSidebar.tsx` — `requires` per tab, filter by permission
- `src/types/admin.ts` — extend session/user types
- `src/lib/email/index.ts` (or equivalent) — wire staff-invite template
- ~40 files under `src/app/api/admin/**` and `src/app/api/**` — replace role checks
- A handful of client components that check `session.user.role === "admin"`

**Documentation to update (per CLAUDE.md Domain Manifest):**
- `docs/auth/` — Role + permissions model, staff vs customer split
- `docs/admin/` — Settings → Staff management screens
- `docs/email/` — staff-invite template
- `docs/security-csp/` — middleware staff route-gating change

## Open implementation questions (decide during plan-writing, not now)

- Should the role editor allow editing the seeded "Admin" role's name? — Default: no (`isSystem` locks name + delete + the `settings.edit` permission).
- Where to put the "+ Invite" button in the Settings tab? — Default: header of the Staff sub-tab.
- Should the invite email show the role name to the invitee? — Default: yes, so they know what they're being granted before clicking.
- Rate-limit on `POST /api/admin/staff/invite`? — Default: yes, 20/hour per inviting admin (reuse existing rate-limiting from `src/lib/rate-limiting/`).
