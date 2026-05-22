# Staff Activity Logging — Design

**Status:** Approved 2026-05-20. Awaiting implementation plan.

**Context:** Builds on the user-roles RBAC system (catalog at 44 permissions, force-session-restart shipped, UI hiding for forbidden actions shipped). The pre-existing `/api/admin/activity-log` aggregates *customer* events (signups, purchases, draws) — this spec adds a separate audit trail of *staff* mutations.

## Goal

Record every meaningful action a staff or admin user takes (and every forbidden attempt) so the owner can answer "who changed this?" and "is anyone trying to do things they shouldn't?". Surface the log in the admin UI behind a new `audit.view` permission so it can be granted to a role or kept locked to the super-admin.

## Non-goals

- Not a general-purpose application-event stream. Customer events stay in the existing `/api/admin/activity-log` aggregator.
- Not a database-level change audit. No row-version history, no before/after diffs (deliberately punted — `users.edit` already gates the broad set of profile edits; finer-grained forensics can be a future enhancement).
- Not a replacement for Sentry-style error tracking. Log rows record application intent, not stack traces.

## Capture strategy

Wrap the existing `requirePermission` helper. Each mutation route opts in by switching to `requirePermissionWithAudit(...)`. The helper returns a `log()` closure the route handler invokes after the action succeeds (`log(200)` / `log(201)`); on a 403 the helper writes the row itself before returning the `NextResponse`. View/list routes stay on plain `requirePermission` — we don't want to spam the log with every GET.

**Phase 1 scope:** every mutation route in the admin surface (~50 handlers), spanning users, promos, draws, mini-draws, affiliates, error-reports, ab-testing, submissions, team, and the small bag of one-offs (klaviyo draw-reset, allowlist, partner applications, cloudinary upload, contact submissions). One pass, complete coverage from day one.

**Out of scope for Phase 1:** the `requireAdminUser` family in `src/lib/api-auth.ts` (used by allowlist routes) — those are a separate migration since they don't go through `requirePermission` at all.

## Data model

New collection backed by `src/models/StaffActivity.ts`:

```ts
interface IStaffActivity {
  actorId:        mongoose.Types.ObjectId; // User._id
  actorEmail:     string;                  // snapshot — survives user deletion
  actorRoleName:  string;                  // snapshot — survives role rename / delete
  action:         string;                  // permission string, e.g. "users.charge"
  method:         "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path:           string;                  // pathname only, e.g. "/api/admin/users/abc/charge-past-due"
  resourceType?:  string;                  // handler-supplied, e.g. "User", "Role", "Promo"
  resourceId?:    string;                  // resource Mongo id when applicable
  status:         number;                  // 200 / 201 / 403
  timestamp:      Date;                    // TTL field
}
```

Snapshotting `actorEmail` and `actorRoleName` is intentional — when Maya gets removed or her "Customer Support" role gets renamed, historical log rows still read `"maya@example.com (Customer Support)"`. Without snapshots, deletions would corrupt the audit history.

**Indexes:**

| Index | Purpose |
|---|---|
| `{ timestamp: 1 }` with `expireAfterSeconds: 180 * 86400` | 180-day TTL — Mongo prunes automatically |
| `{ actorId: 1, timestamp: -1 }` | Per-actor history (filter "what did Maya do?") |
| `{ resourceType: 1, resourceId: 1, timestamp: -1 }` | Per-resource history (the embedded view in `UserDetailModal`) |
| `{ action: 1, timestamp: -1 }` | Filter by action type |

Retention is **180 days** via the TTL index. Tweakable later by changing one number; not env-configurable in Phase 1.

## Capture helper

New file `src/lib/audit-log.ts`:

```ts
import type { NextRequest, NextResponse as _NextResponse } from "next/server";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import type { Session } from "next-auth";
import type { Permission } from "@/lib/permissions";
import StaffActivity from "@/models/StaffActivity";
import connectDB from "@/lib/mongodb";

export interface AuditContext {
  resourceType?: string;
  resourceId?: string;
}

type LogFn = (status: number) => Promise<void>;

export async function requirePermissionWithAudit(
  permission: Permission,
  req: NextRequest,
  context: AuditContext = {}
): Promise<{ session: Session; log: LogFn } | NextResponse> {
  const guard = await requirePermission(permission);
  const pathname = new URL(req.url).pathname;
  const method = req.method as IStaffActivity["method"];

  if (guard instanceof NextResponse) {
    // Forbidden — record the blocked attempt before returning.
    await safeLog({
      actorSession: null, // resolved inside safeLog via getServerSession
      action: permission,
      method,
      path: pathname,
      context,
      status: 403,
    });
    return guard;
  }

  return {
    session: guard.session,
    log: async (status: number) => {
      await safeLog({
        actorSession: guard.session,
        action: permission,
        method,
        path: pathname,
        context,
        status,
      });
    },
  };
}

async function safeLog(input: {
  actorSession: Session | null;
  action: string;
  method: string;
  path: string;
  context: AuditContext;
  status: number;
}): Promise<void> {
  try {
    const session = input.actorSession ?? (await getServerSessionOrNull());
    if (!session?.user?.id) return; // can't attribute — skip
    await connectDB();
    await StaffActivity.create({
      actorId: session.user.id,
      actorEmail: session.user.email ?? "unknown",
      actorRoleName: session.user.roleName ?? (session.user.userType === "admin" ? "Admin" : "Staff"),
      action: input.action,
      method: input.method,
      path: input.path,
      resourceType: input.context.resourceType,
      resourceId: input.context.resourceId,
      status: input.status,
      timestamp: new Date(),
    });
  } catch (err) {
    // Best-effort. A logging failure must never break the action.
    console.error("[audit-log] failed to record activity:", err);
  }
}
```

**Awaited but best-effort.** The `safeLog` call is `await`ed inside the route handler so it works in Vercel's serverless environment where post-response work gets killed. The `try/catch` ensures Mongo hiccups never break the user-facing action. Adds ~5–20 ms per mutation.

## Route migration

Every mutation handler swaps:

```ts
// before
const guard = await requirePermission("users.cancelSubscription");
if (guard instanceof NextResponse) return guard;
const { session } = guard;
// ... do the work, return NextResponse.json(...)
```

to:

```ts
// after
const guard = await requirePermissionWithAudit("users.cancelSubscription", request, {
  resourceType: "User",
  resourceId: userId,
});
if (guard instanceof NextResponse) return guard;
const { session, log } = guard;
// ... do the work
await log(200);
return NextResponse.json(...);
```

The migration is mechanical but touches ~50 files. The implementation plan will batch these by area.

**Resource context conventions:**

| Area | resourceType | resourceId source |
|---|---|---|
| users | "User" | URL param `[id]` |
| promos (and sub-entities) | "Promo" / "PromoLink" / "PromoBannerText" / "ScheduledPromo" / "AlternatingPromoMultiplier" / "BonusEntryPromo" | URL param `[id]` |
| affiliates | "Affiliate" | URL param `[id]` |
| majorDraw | "MajorDraw" | URL param or active-draw id |
| miniDraws | "MiniDraw" | URL param `[id]` |
| errorReports | "ErrorReport" | URL param `[id]` (or bulk ids in metadata — out of scope for Phase 1) |
| abTesting | "Experiment" | URL param `[id]` |
| submissions | "ContactSubmission" / "PartnerApplication" | URL param `[id]` |
| settings (roles/staff) | "Role" / "User" | URL param `[id]` |

Routes that don't have a single resource (bulk operations, sync jobs) omit `resourceType` and `resourceId` — the action + path still tells the story.

## Permission catalog

```ts
// AREA_ACTIONS in src/lib/permissions.ts
audit: ["view"],
```

```ts
// src/lib/permission-descriptions.ts
AREA_META["audit"] = {
  label: "Audit",
  description: "Staff activity log — who did what, when, and whether they were allowed.",
};

PERMISSION_META["audit.view"] = {
  label: "View",
  description: "Open the Staff Activity audit log. Records every mutation staff make, plus blocked attempts.",
};
```

Super-admin (`userType: "admin"`) bypasses all permission checks, so they always see the log without granting `audit.view` to the Admin role. Catalog grows from 44 → 45 permissions.

## API surface

**`GET /api/admin/staff-activity`** — gated by `requirePermission("audit.view")`. Query params:

- `actorId` — filter to one staff member
- `action` — filter by permission string
- `status` — `200` (success) or `403` (forbidden)
- `resourceType` + `resourceId` — filter to a single resource (drives the embedded UserDetailModal tab)
- `from` / `to` — ISO date range
- `cursor` — opaque pagination cursor (timestamp of the last seen row)
- `limit` — default 25, max 100

Returns `{ success: true, data: { rows: StaffActivityRow[], nextCursor: string | null } }`.

Note: this endpoint reads from `StaffActivity` and itself does NOT log to the audit collection (it's a read, and view permissions are sidebar-gated). The handler uses plain `requirePermission`, not `requirePermissionWithAudit`.

## UI

### Top-level page

`src/app/admin/component/StaffActivityManagement.tsx` rendered at `/admin/staff-activity` via the dynamic `[tab]` route. New sidebar group `"audit"` added at the bottom of `adminTabs.ts`:

```ts
{
  id: "audit",
  label: "Audit",
  groupIcon: ScrollText,
  tabs: [
    { id: "staff-activity", label: "Staff Activity", icon: ScrollText, requires: "audit.view" },
  ],
},
```

The page mirrors the existing customer activity log: infinite scroll, top filter bar (actor / action / status / date range), one row per entry. Forbidden (403) rows get a red ⚠️ badge so they stand out for review. Click a row to expand inline (path + resource id). No editing — audit logs are immutable; the TTL index is the only deletion path.

### Embedded per-user view

A new `"activity"` tab inside `UserDetailModal.tsx` (alongside Overview / Subscription / Activity-customer / etc.) calls `GET /api/admin/staff-activity?resourceType=User&resourceId=<id>` and renders a stripped-down version of the same row component. Visible only when the viewer has `audit.view`.

## Testing

Pattern matches the existing `tsx` test scripts (no jest/vitest in this repo).

**`src/lib/__tests__/staff-activity.test.ts`** wired via `npm run test:staff-activity`:

1. **Catalog smoke** — assert `AREA_ACTIONS.audit` exists, `audit.view` is in `PERMISSIONS`, and both have entries in `AREA_META` / `PERMISSION_META`.
2. **safeLog isolation** — call `safeLog` with a stubbed `StaffActivity.create` that throws; assert `safeLog` resolves (doesn't throw) so the route handler is never blocked by a logging failure.
3. **Permission catalog cross-check** — `requirePermissionWithAudit` exported and its return type discriminates between the `NextResponse` and `{ session, log }` cases.

**Manual smoke checklist** (added to `docs/auth/rbac-smoke-checklist.md`):

- Sign in as Admin → hit a few mutation endpoints (cancel sub, end promo, change a role's permissions) → confirm rows appear in `/admin/staff-activity` within a few seconds.
- Sign in as Customer Support (no `users.delete`) → attempt `DELETE /api/admin/users/<id>/delete` via curl → confirm a 403 row lands in the log with the red ⚠️ badge.
- Open a user in `UserDetailModal` → switch to the Activity tab → confirm only rows where `resourceType: "User"` + matching `resourceId` appear.
- Confirm a role without `audit.view` does NOT see the Audit sidebar group (filtering already covered by `usePermissions().has(...)`).
- Confirm `GET /api/admin/staff-activity` returns 403 for a role without `audit.view`.

## File inventory

**New files:**

| Path | Purpose |
|---|---|
| `src/models/StaffActivity.ts` | Mongoose schema + TTL index |
| `src/lib/audit-log.ts` | `requirePermissionWithAudit` + `safeLog` |
| `src/lib/__tests__/staff-activity.test.ts` | Catalog smoke + safeLog isolation |
| `src/app/api/admin/staff-activity/route.ts` | GET list endpoint with filters + cursor pagination |
| `src/app/admin/component/StaffActivityManagement.tsx` | Top-level audit page |
| `src/hooks/queries/useStaffActivity.ts` | TanStack Query hook for the list + infinite scroll |

**Modified files:**

| Path | Change |
|---|---|
| `src/lib/permissions.ts` | `audit: ["view"]` |
| `src/lib/permission-descriptions.ts` | `AREA_META.audit` + `PERMISSION_META["audit.view"]` |
| `src/app/admin/component/adminTabs.ts` | New "audit" group with the Staff Activity tab |
| `src/app/admin/component/AdminPage.tsx` | Dispatch `selectedTab === "staff-activity"` → `<StaffActivityManagement />` |
| `src/components/admin/UserDetailModal.tsx` | New Activity tab when `audit.view` is granted |
| `~50 mutation route handlers under src/app/api/admin/**` | Swap `requirePermission` → `requirePermissionWithAudit` |
| `docs/admin/staff-permissions-mapping.md` | New rows for `/api/admin/staff-activity` |
| `docs/auth/rbac-smoke-checklist.md` | Append the manual smoke steps |
| `package.json` | New `test:staff-activity` script |

## Open questions for the implementation plan

- **Phasing:** the spec calls for "all mutations in Phase 1" — the implementation plan can group the route migration into 5–6 batches (one commit per batch) so review stays manageable.

## Held back from Phase 1 (with rationale)

Each item below was discussed during brainstorming and consciously punted. Anyone picking up the feature later can read this section to know what's *not* being built and why — so they don't reinvent the discussion.

| Held back | Rationale | What it would take to ship later |
|---|---|---|
| **Before/after diff capture** (`changes: { field: { from, to } }` on each row) | Adds 200–2000 bytes per row and requires loading the pre-mutation document inside every route handler. The action + path + status already answers "who did what?"; the diff is only needed for the deeper question "what exactly changed?". Defer until a forensic incident makes the gap concrete. | Add a `changes` field to the schema. In `requirePermissionWithAudit`, accept an optional `captureDiff(oldDoc, newDoc) => Record<string, {from, to}>` callback. The biggest cost is plumbing pre-mutation snapshots through each handler — probably 30–60 mins per area. |
| **IP address + user-agent capture** | Useful for security forensics ("the deletion came from this IP") but only valuable once you have a reason to look. Easy to add (the request carries both), but it inflates every row by ~150 bytes and we're not currently triaging by network signature. | Read `req.headers.get("x-forwarded-for")` and `req.headers.get("user-agent")` inside `safeLog`, store as optional fields. <30 min. |
| **Logging customer-facing reads of customer data** (e.g. opening a UserDetailModal) | The spec only instruments mutations. Reads of customer profiles are arguably worth logging for privacy compliance (who looked at whose data?). Out of scope for Phase 1 because (a) read traffic is high-volume and would dominate the log, and (b) no current privacy requirement forces it. | Gate behind a new `audit.logReads` toggle (env var or role permission) so it can be enabled later without bloating every install. New permission area would be `audit: ["view", "logReads"]`. |
| **Per-resource Activity tab inside `AffiliateDetailModal`, `ExperimentDetailModal`, and other detail modals** | Phase 1 ships the embedded view only inside `UserDetailModal` because customers are the most common forensic target. The other detail modals follow the same pattern — they just need a copy of the tab implementation. | Each modal: ~30 min. Reuse the `useStaffActivity` hook with `resourceType` matching the modal's domain (Affiliate / Experiment / Promo / etc.). |
| **N-row expansion for bulk operations** (e.g. `error-reports/bulk-delete` deleting 50 reports logs one row, not 50) | Bulk routes operate on N ids. Logging one row per affected id would correctly reflect the audit trail but multiplies write volume. The single-row alternative captures the action + path; the id list could go in a future `metadata` field. | Add an optional `metadata: Mixed` field to `StaffActivity`. In bulk handlers, pass `{ resourceIds: [...] }` through `requirePermissionWithAudit` context or a separate logBulk helper. The trade-off is a heavier write per bulk action versus losing the granular trail. |
| **Allowlist routes** (`/api/admin/allowlist/**`) | These still use the legacy `requireAdminUser` helper (`src/lib/api-auth.ts`), not `requirePermission`. They're outside the RBAC pipeline so the audit wrapper can't be slotted in without first migrating them. | Migrate the allowlist routes to `requirePermission("users.edit")` (or a more specific permission), then swap to `requirePermissionWithAudit`. Estimated 1–2 hours. |
| **Email/Slack alerts on suspicious 403s** | A custom-role staff member repeatedly hitting `users.delete` is a signal worth surfacing actively. Phase 1 just records the rows; an alerting layer is out of scope. | Background job (Vercel cron) that queries `StaffActivity` for 403 spikes per actor over a rolling window and pings via SendGrid + Slack webhook. ~2–3 hours. |
| **Configurable retention** | Phase 1 hardcodes the 180-day TTL. Different deployments may want different windows (compliance regimes vary). | Replace the TTL constant with `process.env.AUDIT_LOG_TTL_DAYS ?? 180`. The Mongo TTL index does need to be rebuilt if the value changes — note the operational caveat in `docs/admin/staff-activity-log.md`. 15 min code + docs. |
| **Cursor-based filtering by free-text resource name** | The list endpoint filters by `actorId` / `action` / `status` / `resourceType` + `resourceId`. There's no full-text search across actor names or resource labels. | Add a `search` query param that joins against `User.firstName + lastName` and `Role.name`. Cost is one extra `$lookup` per page — moderate. |
| **Export to CSV** | The viewer is browse-only in Phase 1. Audit exports for compliance reports are a natural follow-up. | Mirror `/api/admin/users/export` with a streaming CSV writer gated by a new `audit.export` permission. ~1 hour. |
| **UI for purging on demand** | The TTL handles regular cleanup. An admin "purge rows older than X" action is unusual but legitimate (e.g. GDPR right-to-erasure on a former staff member). | Add `DELETE /api/admin/staff-activity` with `before` + `actorId` query params, gated by a new `audit.delete` permission. ~1 hour. Doc the GDPR rationale so future maintainers don't strip it as YAGNI. |

## Future work checklist

Mirror of the table above as a flat task list for tracking. Pick any of these up as separate small PRs once Phase 1 lands and you've used the audit log in anger:

- [ ] Capture before/after diffs (`StaffActivity.changes`)
- [ ] Capture IP + user-agent on each row
- [ ] Optional read logging (`audit.logReads`)
- [ ] Embedded Activity tab in `AffiliateDetailModal`
- [ ] Embedded Activity tab in `ExperimentDetailModal`
- [ ] Embedded Activity tab in `MajorDraw` + `MiniDraw` detail surfaces
- [ ] N-row expansion (or metadata.resourceIds) for bulk operations
- [ ] Migrate `requireAdminUser` allowlist routes into the audit pipeline
- [ ] Suspicious-pattern alerts (403 spikes by actor)
- [ ] Configurable retention via env var
- [ ] Full-text search across actor + resource names
- [ ] CSV export (gated by `audit.export`)
- [ ] On-demand purge (gated by `audit.delete`, GDPR rationale)

## Ongoing documentation home

This spec captures the *design*. Once Phase 1 ships, the living documentation moves to:

- **`docs/admin/staff-activity-log.md`** — user-facing reference (what the tab does, how to read a row, how the permission gates work). The doc-sync hook keeps it in lockstep with the code under the `admin` domain.
- **`docs/auth/rbac-smoke-checklist.md`** — appended with the manual smoke steps from this spec's Testing section.
- **`docs/admin/staff-permissions-mapping.md`** — the new `/api/admin/staff-activity` GET endpoint gets a row.
- **CLAUDE.md Domain Manifest** — `src/lib/audit-log.ts`, `src/models/StaffActivity.ts`, and `src/app/api/admin/staff-activity/**` need to land in either the `auth` domain (since they're permission-adjacent) or the `admin` domain (since they're surfaced in the admin UI). Implementation plan picks one — recommend `admin` because the audit feature is a property of the admin panel, not of authentication itself.

When future enhancements land, update this spec's "Future work checklist" by checking off the relevant item AND link to the PR that delivered it — the spec stays the index of "what this feature looks like as of today."
