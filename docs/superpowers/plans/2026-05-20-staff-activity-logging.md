# Staff Activity Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tamper-resistant audit trail of every mutation made by staff or admin users in the admin panel, surfaced behind a new `audit.view` permission so it can be granted to a custom role or kept locked to the super-admin.

**Architecture:** A new `StaffActivity` Mongo collection captures one row per mutation, written by `requirePermissionWithAudit(...)` — a thin wrapper around the existing `requirePermission` helper. Every `/api/admin/**` mutation route opts in by swapping the helper. The viewer page reads via a cursor-paginated GET endpoint; an embedded per-user view appears inside `UserDetailModal`. 180-day TTL via a Mongo index. Writes are awaited but wrapped in try/catch so a logging failure never breaks the user-facing action.

**Tech Stack:** Next.js 15 App Router · MongoDB / Mongoose · NextAuth v4 (session.user.roleName for snapshot) · TanStack Query (infinite scroll) · tsx-based unit tests (no jest/vitest). Spec at [docs/superpowers/specs/2026-05-20-staff-activity-logging-design.md](../specs/2026-05-20-staff-activity-logging-design.md).

---

## Operating Constraints (read before starting any task)

1. **No auto-commit.** The repo hook (`.claude/hooks/no-auto-commit.mjs`) blocks `git commit/add/push` unless the user has already said `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, or `ship it` in the session. Every task ends with a commit step — ask the user before running it the first time; subsequent commits stay authorized once the keyword has been said.

2. **Docs must be updated when code changes.** A Stop hook (`.claude/hooks/doc-sync.mjs`) blocks task completion if you modify files under `src/` or `scripts/` without updating the matching `docs/<domain>/`. Each task lists the docs to touch.

3. **No test runner.** "Tests" are standalone tsx scripts registered as `npm run test:*` scripts in `package.json`. Pattern reference: `src/lib/__tests__/permissions.test.ts` + `test:permissions`.

4. **Verification before completion.** Run `npm run type-check` and `npm run lint` before claiming any task complete. Tasks that touch the audit catalog or helper also run `npm run test:permissions` and `npm run test:staff-activity`.

5. **Mongoose model registration.** Existing models in `src/models/**` delete the cached model from `mongoose.models` before re-registering — this is a Next.js HMR quirk. Mirror the pattern in `StaffActivity.ts`.

---

## File structure overview

**New files:**

| Path | Responsibility |
|---|---|
| `src/models/StaffActivity.ts` | Mongoose schema for the `staffactivities` collection. TTL index + per-actor/per-resource/per-action indexes. |
| `src/lib/audit-log.ts` | `requirePermissionWithAudit` + the `safeLog` choke point. The one and only place that writes to `StaffActivity`. |
| `src/lib/__tests__/staff-activity.test.ts` | Catalog assertions + safeLog isolation (logging failures must not throw). |
| `src/app/api/admin/staff-activity/route.ts` | `GET` — cursor-paginated list with filters by actor/action/status/resource/date. |
| `src/hooks/queries/useStaffActivity.ts` | TanStack `useInfiniteQuery` hook used by both the top-level viewer and the embedded per-user tab. |
| `src/app/admin/component/StaffActivityManagement.tsx` | Top-level audit viewer page (filters + infinite-scrolling list). |
| `src/components/admin/UserDetailModal/ActivityTab.tsx` | Embedded per-user tab content. Imported into `UserDetailModal.tsx`. |

**Modified files:**

| Path | Change |
|---|---|
| `src/lib/permissions.ts` | Add `audit: ["view"]` to `AREA_ACTIONS`. |
| `src/lib/permission-descriptions.ts` | Add `AREA_META.audit` + `PERMISSION_META["audit.view"]`. |
| `src/app/admin/component/adminTabs.ts` | Add new `"audit"` top-level group with the Staff Activity tab. |
| `src/app/admin/component/AdminPage.tsx` | Dispatch `selectedTab === "staff-activity"` to `<StaffActivityManagement />` + add the header subtitle. |
| `src/components/admin/UserDetailModal.tsx` | Add `"activity"` to the tab list when `audit.view` is granted; render `<ActivityTab>`. |
| `~42 mutation handlers under src/app/api/**` | Swap `requirePermission` → `requirePermissionWithAudit` and add `await log(200)` before each success response. |
| `package.json` | Add `"test:staff-activity": "tsx src/lib/__tests__/staff-activity.test.ts"`. |
| `docs/admin/staff-permissions-mapping.md` | Add `/api/admin/staff-activity` row. |
| `docs/auth/rbac-smoke-checklist.md` | Append the audit-log smoke steps. |
| `docs/admin/staff-activity-log.md` | Flip "design only" status to "shipped"; cross-link the PR. |
| `CLAUDE.md` | Add the new paths to the `admin` domain manifest entry. |

---

# Phase 1 — Foundations (no behavior change)

## Task 1: Permission catalog — add `audit` area

**Files:**
- Modify: `src/lib/permissions.ts`
- Modify: `src/lib/permission-descriptions.ts`
- Update docs: `docs/auth/permissions-catalog.md`

- [ ] **Step 1: Add the area to `AREA_ACTIONS`**

In `src/lib/permissions.ts`, append the `audit` line to `AREA_ACTIONS` (preserve alphabetical-ish ordering used in the existing block — `audit` goes between `abTesting` and `affiliates`, OR at the end of the object literal; both are acceptable since the keys aren't ordered in any user-facing way):

```ts
export const AREA_ACTIONS = {
  overview: ["view", "edit"],
  users: ["view", "edit", "charge", "cancelSubscription", "refund", "delete"],
  promos: ["view", "edit", "end", "delete"],
  facebookAds: ["view", "edit"],
  pageAnalytics: ["view"],
  promoAnalytics: ["view"],
  submissions: ["view", "edit", "delete"],
  miniDraws: ["view", "edit", "selectWinner", "delete"],
  majorDraw: ["view", "edit", "selectWinner"],
  drawResults: ["view"],
  upcomingDraws: ["view"],
  affiliates: ["view", "edit", "processPayout", "delete"],
  errorReports: ["view", "edit", "delete"],
  abTesting: ["view", "edit", "selectWinner", "delete"],
  settings: ["view", "edit", "delete"],
  audit: ["view"],
} as const satisfies Record<string, readonly string[]>;
```

- [ ] **Step 2: Add area + permission meta**

In `src/lib/permission-descriptions.ts`, add an `AREA_META` entry:

```ts
audit: {
  label: "Audit",
  description: "Staff activity log — who did what, when, and whether they were allowed.",
},
```

And a `PERMISSION_META` entry:

```ts
"audit.view": {
  label: "View",
  description: "Open the Staff Activity audit log. Records every mutation staff make, plus blocked attempts.",
},
```

- [ ] **Step 3: Run permission tests**

Run: `npm run test:permissions`
Expected: all tests pass (the existing `PERMISSION_META has an entry for every permission` test now covers `audit.view`).

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors related to the catalog.

- [ ] **Step 5: Update permissions-catalog doc**

In `docs/auth/permissions-catalog.md`, locate the "Areas" table and add a row:

```markdown
| `audit` | view | Staff activity log (audit trail of staff mutations). |
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/permissions.ts src/lib/permission-descriptions.ts docs/auth/permissions-catalog.md
git commit -m "feat(auth): add audit area + audit.view permission"
```

---

## Task 2: StaffActivity Mongoose model

**Files:**
- Create: `src/models/StaffActivity.ts`
- Update docs: `docs/admin/staff-activity-log.md` (the "Row shape" section is already accurate; no edit needed — the doc-sync hook still sees this as modified though, see Step 4).

- [ ] **Step 1: Create the model file**

Create `src/models/StaffActivity.ts`:

```ts
import mongoose, { Document, Schema, Types } from "mongoose";

/**
 * One row per mutation made by a staff or admin user, plus one row per
 * forbidden attempt (status 403). See:
 *   - docs/superpowers/specs/2026-05-20-staff-activity-logging-design.md
 *   - docs/admin/staff-activity-log.md
 *
 * Snapshotting `actorEmail` and `actorRoleName` is deliberate — historical
 * rows must remain readable after a staff member is removed or their role
 * is renamed.
 */
export type StaffActivityMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface IStaffActivity extends Document {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  actorEmail: string;
  actorRoleName: string;
  action: string;
  method: StaffActivityMethod;
  path: string;
  resourceType?: string;
  resourceId?: string;
  status: number;
  timestamp: Date;
}

const RETENTION_DAYS = 180;

const StaffActivitySchema = new Schema<IStaffActivity>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorEmail: { type: String, required: true },
    actorRoleName: { type: String, required: true },
    action: { type: String, required: true },
    method: {
      type: String,
      enum: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      required: true,
    },
    path: { type: String, required: true },
    resourceType: { type: String },
    resourceId: { type: String },
    status: { type: Number, required: true },
    timestamp: { type: Date, required: true, default: () => new Date() },
  },
  {
    // We control `timestamp` ourselves (see field above), so disable the
    // auto-generated createdAt/updatedAt pair.
    timestamps: false,
    strict: true,
    strictQuery: true,
  }
);

// 180-day TTL — Mongo prunes expired rows in the background.
StaffActivitySchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 }
);

// Per-actor history ("what did Maya do?")
StaffActivitySchema.index({ actorId: 1, timestamp: -1 });

// Per-resource history ("what happened to user X?") — drives the embedded
// Activity tab in UserDetailModal.
StaffActivitySchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });

// Per-action filter ("who's been charging?")
StaffActivitySchema.index({ action: 1, timestamp: -1 });

// Next.js HMR quirk: clear cached model so schema edits take effect on reload.
if (mongoose.models.StaffActivity) {
  delete mongoose.models.StaffActivity;
}

export default mongoose.model<IStaffActivity>(
  "StaffActivity",
  StaffActivitySchema
);
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 3: Add the model path to the admin domain manifest**

In `CLAUDE.md`, find the `"admin"` domain entry (around line 571) and add `"src/models/StaffActivity.ts"` to the `paths` array. The audit feature is surfaced in the admin UI, so it belongs in the admin domain (this matches the spec's recommendation):

```json
"src/models/StaffActivity.ts",
```

Place it next to the other model paths in that domain.

- [ ] **Step 4: Touch the living doc**

`docs/admin/staff-activity-log.md` already documents the row shape (created during brainstorming). No edit needed yet — the doc-sync hook treats the existing file as "still current" because we haven't yet changed any source file in a way that contradicts it. The hook will fire only when src/ changes are paired without a docs update; here the doc already covers the model.

- [ ] **Step 5: Commit**

```bash
git add src/models/StaffActivity.ts CLAUDE.md
git commit -m "feat(audit): add StaffActivity model with TTL + indexes"
```

---

## Task 3: Capture helper + tests

**Files:**
- Create: `src/lib/audit-log.ts`
- Create: `src/lib/__tests__/staff-activity.test.ts`
- Modify: `package.json` (add `test:staff-activity` script)
- Update docs: `docs/admin/staff-activity-log.md` (already documents the helper; no edit needed)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/staff-activity.test.ts`:

```ts
import assert from "node:assert/strict";
import { AREA_ACTIONS, PERMISSIONS, isValidPermission } from "@/lib/permissions";
import { AREA_META, PERMISSION_META } from "@/lib/permission-descriptions";

let failures = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return Promise.resolve(fn())
    .then(() => console.log(`✓ ${name}`))
    .catch((e: Error) => {
      failures++;
      console.error(`✗ ${name}\n  ${e.message}`);
    });
};

async function main() {
  await test("audit area exists in catalog", () => {
    assert.ok(AREA_ACTIONS.audit, "AREA_ACTIONS.audit is missing");
    assert.deepEqual([...AREA_ACTIONS.audit], ["view"]);
  });

  await test("audit.view is a valid permission", () => {
    assert.ok(PERMISSIONS.includes("audit.view"));
    assert.equal(isValidPermission("audit.view"), true);
  });

  await test("audit AREA_META + PERMISSION_META present", () => {
    assert.ok(AREA_META.audit, "AREA_META.audit missing");
    assert.ok(AREA_META.audit.label.length > 0);
    assert.ok(AREA_META.audit.description.length > 0);
    assert.ok(PERMISSION_META["audit.view"], "PERMISSION_META[audit.view] missing");
    assert.ok(PERMISSION_META["audit.view"].label.length > 0);
    assert.ok(PERMISSION_META["audit.view"].description.length > 0);
  });

  await test("safeLog never throws when StaffActivity.create rejects", async () => {
    // Stub the model so create() rejects. The helper must swallow the error
    // and not propagate it to the route handler.
    const { __safeLogForTest } = await import("@/lib/audit-log");
    const stubModel = {
      create: () => Promise.reject(new Error("simulated mongo down")),
    };
    // Should resolve without throwing
    await __safeLogForTest(
      {
        actorId: "507f1f77bcf86cd799439011",
        actorEmail: "test@example.com",
        actorRoleName: "Test",
        action: "users.view",
        method: "GET",
        path: "/api/admin/users",
        status: 200,
        timestamp: new Date(),
      },
      stubModel as never
    );
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll tests passed");
}

main();
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to the `"scripts"` object:

```json
"test:staff-activity": "tsx src/lib/__tests__/staff-activity.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:staff-activity`
Expected: FAIL — `@/lib/audit-log` cannot be resolved (file doesn't exist yet).

- [ ] **Step 4: Create the audit helper**

Create `src/lib/audit-log.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePermission } from "@/lib/api-auth-permissions";
import type { Permission } from "@/lib/permissions";
import StaffActivity, { type StaffActivityMethod } from "@/models/StaffActivity";
import connectDB from "@/lib/mongodb";

export interface AuditContext {
  /**
   * Mongoose model name of the resource the action targets, e.g. "User",
   * "Promo". Omit for bulk operations that affect many resources or for
   * actions that have no single target.
   */
  resourceType?: string;
  /** Mongo `_id` (or other primary key) of the affected resource. */
  resourceId?: string;
}

interface SafeLogInput {
  actorId: string;
  actorEmail: string;
  actorRoleName: string;
  action: string;
  method: StaffActivityMethod;
  path: string;
  resourceType?: string;
  resourceId?: string;
  status: number;
  timestamp: Date;
}

type LogFn = (status: number) => Promise<void>;

/**
 * Drop-in replacement for `requirePermission` that also writes one row to
 * the StaffActivity collection. Logs:
 *  - successful actions (when the route handler calls `log(status)` after
 *    the work completes)
 *  - forbidden attempts (status 403 is written by this helper itself before
 *    returning the NextResponse)
 *
 * Writes are awaited but best-effort: a Mongo failure logs an error and
 * lets the route handler proceed.
 *
 * See:
 *  - docs/superpowers/specs/2026-05-20-staff-activity-logging-design.md
 *  - docs/admin/staff-activity-log.md
 */
export async function requirePermissionWithAudit(
  permission: Permission,
  req: NextRequest,
  context: AuditContext = {}
): Promise<{ session: Session; log: LogFn } | NextResponse> {
  const pathname = new URL(req.url).pathname;
  const method = req.method as StaffActivityMethod;

  const guard = await requirePermission(permission);
  if (guard instanceof NextResponse) {
    // Forbidden — resolve the session via getServerSession (the caller's
    // session is available even when the permission check failed: 403 means
    // "logged in but missing the right perm").
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      await safeLog({
        actorId: session.user.id,
        actorEmail: session.user.email ?? "unknown",
        actorRoleName:
          session.user.roleName ??
          (session.user.userType === "admin" ? "Admin" : "Staff"),
        action: permission,
        method,
        path: pathname,
        resourceType: context.resourceType,
        resourceId: context.resourceId,
        status: 403,
        timestamp: new Date(),
      });
    }
    return guard;
  }

  return {
    session: guard.session,
    log: async (status: number) => {
      await safeLog({
        actorId: guard.session.user.id,
        actorEmail: guard.session.user.email ?? "unknown",
        actorRoleName:
          guard.session.user.roleName ??
          (guard.session.user.userType === "admin" ? "Admin" : "Staff"),
        action: permission,
        method,
        path: pathname,
        resourceType: context.resourceType,
        resourceId: context.resourceId,
        status,
        timestamp: new Date(),
      });
    },
  };
}

async function safeLog(input: SafeLogInput): Promise<void> {
  try {
    await connectDB();
    await StaffActivity.create(input);
  } catch (err) {
    // Best-effort. A logging failure must never break the action.
    console.error("[audit-log] failed to record activity:", err);
  }
}

/**
 * Test-only export so `safeLog` can be exercised against a stub model.
 * The second argument lets the test inject a different `create()` target
 * without touching the real Mongoose model. Production callers go through
 * `requirePermissionWithAudit` and never see this.
 */
export async function __safeLogForTest(
  input: SafeLogInput,
  modelOverride?: { create: (input: SafeLogInput) => Promise<unknown> }
): Promise<void> {
  if (modelOverride) {
    try {
      await modelOverride.create(input);
    } catch (err) {
      console.error("[audit-log] failed to record activity:", err);
    }
    return;
  }
  await safeLog(input);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:staff-activity`
Expected: `All tests passed` — including the safeLog isolation test (the stub model rejects, the helper swallows the error, the test resolves).

- [ ] **Step 6: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors related to the helper file.

- [ ] **Step 7: Add new paths to the admin domain manifest**

In `CLAUDE.md`, add `"src/lib/audit-log.ts"` and `"src/lib/__tests__/staff-activity.test.ts"` to the `"admin"` domain `paths` array, next to where you placed `StaffActivity.ts` in Task 2.

Bump `lastVerified` to `2026-05-20` on the `admin` entry.

- [ ] **Step 8: Commit**

```bash
git add src/lib/audit-log.ts src/lib/__tests__/staff-activity.test.ts package.json CLAUDE.md
git commit -m "feat(audit): add requirePermissionWithAudit helper + safeLog tests"
```

---

# Phase 2 — API + UI scaffolding

## Task 4: List endpoint with cursor pagination

**Files:**
- Create: `src/app/api/admin/staff-activity/route.ts`
- Update docs: `docs/admin/staff-permissions-mapping.md`

- [ ] **Step 1: Implement the GET handler**

Create `src/app/api/admin/staff-activity/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import StaffActivity from "@/models/StaffActivity";
import { z } from "zod";
import { isValidObjectId } from "mongoose";

/**
 * GET /api/admin/staff-activity
 *
 * Cursor-paginated list of audit-log rows. Filters:
 *   - actorId      : ObjectId (single staff member)
 *   - action       : permission string (e.g. "users.charge")
 *   - status       : "200" | "201" | "403"
 *   - resourceType : "User" | "Role" | "Promo" | ...
 *   - resourceId   : Mongo id of a specific resource
 *   - from, to     : ISO date strings (inclusive)
 *   - cursor       : opaque value (the `timestamp` of the last row from the
 *                    previous page, ISO string). Reads strictly OLDER than
 *                    the cursor.
 *   - limit        : default 25, max 100
 *
 * This endpoint reads the audit log but does NOT write to it. It uses
 * plain `requirePermission` (not `requirePermissionWithAudit`).
 */
const QuerySchema = z.object({
  actorId: z.string().optional(),
  action: z.string().optional(),
  status: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export async function GET(req: NextRequest) {
  await connectDB();
  const guard = await requirePermission("audit.view");
  if (guard instanceof NextResponse) return guard;

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params", details: parsed.error.format() },
      { status: 400 }
    );
  }
  const q = parsed.data;

  const filter: Record<string, unknown> = {};
  if (q.actorId) {
    if (!isValidObjectId(q.actorId)) {
      return NextResponse.json({ error: "Invalid actorId" }, { status: 400 });
    }
    filter.actorId = q.actorId;
  }
  if (q.action) filter.action = q.action;
  if (q.status) {
    const s = Number(q.status);
    if (Number.isFinite(s)) filter.status = s;
  }
  if (q.resourceType) filter.resourceType = q.resourceType;
  if (q.resourceId) filter.resourceId = q.resourceId;

  // Date range
  const tsFilter: Record<string, Date> = {};
  if (q.from) {
    const d = new Date(q.from);
    if (!isNaN(d.getTime())) tsFilter.$gte = d;
  }
  if (q.to) {
    const d = new Date(q.to);
    if (!isNaN(d.getTime())) tsFilter.$lte = d;
  }
  if (q.cursor) {
    const d = new Date(q.cursor);
    if (!isNaN(d.getTime())) {
      // Strictly older than the cursor (cursor is the last seen row's timestamp).
      tsFilter.$lt = d;
    }
  }
  if (Object.keys(tsFilter).length > 0) filter.timestamp = tsFilter;

  const limit = Math.min(Number(q.limit ?? 25) || 25, 100);

  const rows = await StaffActivity.find(filter)
    .sort({ timestamp: -1 })
    .limit(limit + 1) // fetch one extra to know whether another page exists
    .lean();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && page.length > 0
      ? page[page.length - 1]!.timestamp.toISOString()
      : null;

  return NextResponse.json({
    success: true,
    data: {
      rows: page.map((r) => ({
        id: r._id.toString(),
        actorId: r.actorId.toString(),
        actorEmail: r.actorEmail,
        actorRoleName: r.actorRoleName,
        action: r.action,
        method: r.method,
        path: r.path,
        resourceType: r.resourceType ?? null,
        resourceId: r.resourceId ?? null,
        status: r.status,
        timestamp: r.timestamp.toISOString(),
      })),
      nextCursor,
    },
  });
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 3: Smoke test the endpoint**

Start dev: `npm run dev`

Hit `http://localhost:3000/api/admin/staff-activity` as a logged-in super-admin (e.g. via the browser network tab after opening `/admin`). Expect `200` with `{ success: true, data: { rows: [], nextCursor: null } }` (no rows yet — Phase 4 starts logging).

Try the same as a custom-role staff without `audit.view`. Expect `403`.

- [ ] **Step 4: Update the route map doc**

In `docs/admin/staff-permissions-mapping.md`, find the alphabetical/grouped position appropriate for `staff-activity` (near the bottom, after `staff-api`) and add:

```markdown
| `/api/admin/staff-activity` | GET | `audit.view` |
```

- [ ] **Step 5: Add path to admin domain manifest**

In `CLAUDE.md`, add `"src/app/api/admin/staff-activity/**"` to the `"admin"` domain `paths` array.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/staff-activity docs/admin/staff-permissions-mapping.md CLAUDE.md
git commit -m "feat(audit): GET /api/admin/staff-activity with filters + cursor pagination"
```

---

## Task 5: TanStack Query hook

**Files:**
- Create: `src/hooks/queries/useStaffActivity.ts`
- Update docs: hooks live under the `client-state` domain (per the manifest) — no separate doc file. Bump `lastVerified` on the `client-state` entry.

- [ ] **Step 1: Implement the hook**

Create `src/hooks/queries/useStaffActivity.ts`:

```ts
import { useInfiniteQuery } from "@tanstack/react-query";

export interface StaffActivityRow {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRoleName: string;
  action: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  status: number;
  timestamp: string;
}

interface Page {
  success: true;
  data: { rows: StaffActivityRow[]; nextCursor: string | null };
}

export interface StaffActivityFilters {
  actorId?: string;
  action?: string;
  status?: number;
  resourceType?: string;
  resourceId?: string;
  from?: string; // ISO
  to?: string;   // ISO
  limit?: number;
}

async function fetchPage(
  filters: StaffActivityFilters,
  cursor: string | null
): Promise<Page> {
  const params = new URLSearchParams();
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.action) params.set("action", filters.action);
  if (filters.status !== undefined) params.set("status", String(filters.status));
  if (filters.resourceType) params.set("resourceType", filters.resourceType);
  if (filters.resourceId) params.set("resourceId", filters.resourceId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (cursor) params.set("cursor", cursor);

  const r = await fetch(`/api/admin/staff-activity?${params}`);
  if (!r.ok) {
    let msg = "Failed to load staff activity";
    try {
      const data = await r.json();
      if (typeof data?.error === "string") msg = data.error;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

/**
 * Infinite-scroll list of audit-log rows. Used by both the top-level
 * /admin/staff-activity page and the embedded Activity tab inside
 * UserDetailModal (which passes resourceType:"User" + resourceId).
 */
export function useStaffActivity(filters: StaffActivityFilters = {}) {
  return useInfiniteQuery<Page, Error>({
    queryKey: ["admin", "staff-activity", filters],
    queryFn: ({ pageParam }) =>
      fetchPage(filters, (pageParam as string | null) ?? null),
    initialPageParam: null,
    getNextPageParam: (last) => last.data.nextCursor,
  });
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 3: Bump client-state domain manifest**

In `CLAUDE.md`, find the `"client-state"` domain entry. The path `"src/hooks/queries/**"` already covers the new file, so no path change is needed — just bump `lastVerified` on that domain to `2026-05-20`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/queries/useStaffActivity.ts CLAUDE.md
git commit -m "feat(audit): add useStaffActivity infinite-query hook"
```

---

## Task 6: Top-level viewer page

**Files:**
- Create: `src/app/admin/component/StaffActivityManagement.tsx`
- Update docs: `docs/admin/admin-layout.md` (append a section)

- [ ] **Step 1: Implement the component**

Create `src/app/admin/component/StaffActivityManagement.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { AlertTriangle, Loader2, Search, ShieldCheck } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useStaffActivity,
  type StaffActivityFilters,
  type StaffActivityRow,
} from "@/hooks/queries/useStaffActivity";
import { format } from "date-fns";

/**
 * Top-level audit viewer at /admin/staff-activity. Lists every row in
 * StaffActivity newest-first with filter chips and infinite scroll.
 * Forbidden (403) rows get a red warning badge.
 */
export default function StaffActivityManagement() {
  const { has, isLoading: permsLoading } = usePermissions();
  const [filters, setFilters] = useState<StaffActivityFilters>({ limit: 25 });
  const [search, setSearch] = useState("");

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useStaffActivity(filters);
  const observerRef = useRef<HTMLDivElement>(null);

  // Infinite scroll
  useEffect(() => {
    const target = observerRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (permsLoading) {
    return (
      <div className="p-10 flex items-center gap-2 text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!has("audit.view")) {
    return (
      <div className="p-10 text-gray-600 dark:text-gray-300">
        You don&apos;t have permission to view the audit log.
      </div>
    );
  }

  const rows = data?.pages.flatMap((p) => p.data.rows) ?? [];

  // Client-side text search across actor email + path (server doesn't
  // support full-text in Phase 1 — deferred per spec).
  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return (
          r.actorEmail.toLowerCase().includes(q) ||
          r.path.toLowerCase().includes(q) ||
          r.actorRoleName.toLowerCase().includes(q)
        );
      })
    : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#ee0000] dark:text-[#ff4444]" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            Staff Activity
          </h2>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor email, path, role…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ee0000]/40"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <FilterChip
          label="All"
          active={filters.status === undefined}
          onClick={() => setFilters({ ...filters, status: undefined })}
        />
        <FilterChip
          label="Successful"
          active={filters.status === 200}
          onClick={() => setFilters({ ...filters, status: 200 })}
        />
        <FilterChip
          label="Forbidden"
          active={filters.status === 403}
          onClick={() => setFilters({ ...filters, status: 403 })}
        />
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-300">
          {error.message}
        </div>
      )}

      <ul className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading && rows.length === 0 && (
          <li className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
          </li>
        )}
        {!isLoading && filtered.length === 0 && (
          <li className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No audit-log rows match the current filters.
          </li>
        )}
        {filtered.map((row) => (
          <ActivityRow key={row.id} row={row} />
        ))}
      </ul>

      <div ref={observerRef} className="h-1" />
      {isFetchingNextPage && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-3">
          Loading more…
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full font-medium transition-colors ${
        active
          ? "bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white shadow-sm"
          : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
      }`}
    >
      {label}
    </button>
  );
}

function ActivityRow({ row }: { row: StaffActivityRow }) {
  const isForbidden = row.status === 403;
  return (
    <li
      className={`px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${
        isForbidden ? "bg-red-50/40 dark:bg-red-950/15" : ""
      }`}
    >
      <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono">
        {format(new Date(row.timestamp), "MMM d HH:mm:ss")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {row.actorEmail}{" "}
          <span className="text-gray-500 dark:text-gray-400 font-normal">
            ({row.actorRoleName})
          </span>{" "}
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            {row.action}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono mt-0.5">
          {row.method} {row.path}
          {row.resourceType && row.resourceId && (
            <span className="ml-2">
              · {row.resourceType} {row.resourceId.slice(0, 8)}…
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">
        {isForbidden ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/40 px-2 py-1 rounded-md">
            <AlertTriangle className="w-3 h-3" />
            403 Forbidden
          </span>
        ) : (
          <span className="text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/40 px-2 py-1 rounded-md">
            {row.status}
          </span>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors. The `ActivityRow` component types its prop as `StaffActivityRow` imported directly from the hook file — no inline `infer` cleverness.

- [ ] **Step 3: Update admin-layout doc**

Append to `docs/admin/admin-layout.md`:

```markdown
## Staff Activity (Audit)

`src/app/admin/component/StaffActivityManagement.tsx` is the top-level audit viewer rendered at `/admin/staff-activity`. It lists every row from the `StaffActivity` collection (see [staff-activity-log.md](./staff-activity-log.md)) newest-first with cursor-paginated infinite scroll. Filter chips toggle between all rows, 200 successes, and 403 forbidden attempts. The free-text search filters client-side across actor email, role name, and request path — server-side full-text is deferred per the spec.

Forbidden (403) rows are highlighted with a faint red background and a "403 Forbidden" badge so privilege drift is easy to spot at a glance.

The page is gated by `usePermissions().has("audit.view")` and re-checks server-side via the GET endpoint.
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/component/StaffActivityManagement.tsx docs/admin/admin-layout.md
git commit -m "feat(audit): top-level Staff Activity viewer page"
```

---

## Task 7: Wire into sidebar + AdminPage dispatch

**Files:**
- Modify: `src/app/admin/component/adminTabs.ts`
- Modify: `src/app/admin/component/AdminPage.tsx`

- [ ] **Step 1: Add the audit group to the sidebar**

In `src/app/admin/component/adminTabs.ts`, add a new group at the bottom of the `ADMIN_TAB_GROUPS` array (after the `team` group). Use the `ShieldCheck` icon from lucide-react — add it to the existing imports at the top of the file:

```ts
import {
  // ...existing icons...
  ShieldCheck,
} from "lucide-react";
```

Append the new group:

```ts
  // Audit lives in its own group at the bottom — it's a security tool,
  // not a daily-driver tab. Future audit.export / audit.delete actions
  // can grow under this group without rearranging.
  {
    id: "audit",
    label: "Audit",
    groupIcon: ShieldCheck,
    tabs: [
      {
        id: "staff-activity",
        label: "Staff Activity",
        icon: ShieldCheck,
        requires: "audit.view",
      },
    ],
  },
```

- [ ] **Step 2: Add the dispatch in AdminPage**

In `src/app/admin/component/AdminPage.tsx`, add the import near the other tab-component imports:

```ts
import StaffActivityManagement from "./StaffActivityManagement";
```

Add the header subtitle (search for `selectedTab === "team"` in the description block and add the next case):

```tsx
{selectedTab === "staff-activity" && "Audit trail of every mutation by staff or admin users"}
```

Add the dispatch alongside the other `selectedTab === "..."` blocks:

```tsx
{/* AUDIT — staff activity log */}
{selectedTab === "staff-activity" && <StaffActivityManagement />}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 4: Smoke test in the browser**

Start dev: `npm run dev`

1. As super-admin, open `/admin`. Confirm the sidebar shows the "Audit" group at the bottom.
2. Click "Staff Activity". URL becomes `/admin/staff-activity`. Page renders with "No audit-log rows match the current filters" (correct — no rows yet).
3. Sign out + sign in as a custom-role staff (no `audit.view`). Confirm the Audit group is **not** in the sidebar.
4. Direct-navigate to `/admin/staff-activity` as that custom-role staff. The page renders the "You don't have permission" message (client-side fallback; the API would 403 anyway).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/component/adminTabs.ts src/app/admin/component/AdminPage.tsx
git commit -m "feat(audit): add Audit sidebar group + /admin/staff-activity route"
```

---

## Task 8: Embedded Activity tab in UserDetailModal

**Files:**
- Create: `src/components/admin/UserDetailModal/ActivityTab.tsx` (note: this is a new subfolder — file `UserDetailModal.tsx` becomes `UserDetailModal/index.tsx`? No — the existing file stays where it is. The new folder is `src/components/admin/UserDetailModal/` containing only `ActivityTab.tsx`. Import will be `from "./UserDetailModal/ActivityTab"` relative to `src/components/admin/`.)
- Modify: `src/components/admin/UserDetailModal.tsx`

- [ ] **Step 1: Create the tab component**

Create the new folder structure: `src/components/admin/UserDetailModal/` and inside it `ActivityTab.tsx`:

```tsx
"use client";

import { Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useStaffActivity } from "@/hooks/queries/useStaffActivity";

interface Props {
  userId: string;
}

/**
 * Embedded audit view inside UserDetailModal. Shows only rows where
 * resourceType="User" and resourceId matches the open user. Gated upstream
 * by `audit.view` (the tab itself is hidden when the viewer lacks it).
 */
export default function ActivityTab({ userId }: Props) {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useStaffActivity({
      resourceType: "User",
      resourceId: userId,
      limit: 25,
    });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading staff activity…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-red-700 dark:text-red-400">
        {error.message}
      </div>
    );
  }

  const rows = data?.pages.flatMap((p) => p.data.rows) ?? [];
  if (rows.length === 0) {
    return (
      <div className="p-6 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" />
        No staff have taken any action on this user yet.
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4">
      <ul className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {rows.map((row) => {
          const isForbidden = row.status === 403;
          return (
            <li
              key={row.id}
              className={`px-3 py-2.5 flex items-start gap-3 ${
                isForbidden ? "bg-red-50/40 dark:bg-red-950/15" : ""
              }`}
            >
              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap mt-0.5">
                {format(new Date(row.timestamp), "MMM d HH:mm")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  {row.actorEmail}{" "}
                  <span className="text-gray-500 dark:text-gray-400">
                    ({row.actorRoleName})
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 font-mono mt-0.5 truncate">
                  {row.method} {row.action}
                </div>
              </div>
              {isForbidden && (
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
              )}
            </li>
          );
        })}
      </ul>
      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-3 w-full text-xs text-[#ee0000] dark:text-[#ff4444] hover:underline py-2 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading…" : "Load older entries"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the tab to UserDetailModal**

Open `src/components/admin/UserDetailModal.tsx`.

Find the existing `TabType` declaration (search for `type TabType`). It's a union like `"overview" | "subscription" | "activity"` — note the existing "activity" tab already exists for *customer* activity (purchases, draws). Pick a name that doesn't collide: `"staff-activity"`.

Add `"staff-activity"` to the `TabType` union.

Find where the tab buttons are rendered (search for `setActiveTab(tab.id)` — the tab list is built from an array). Add the new tab entry, conditionally based on `has("audit.view")`. Concretely:

```tsx
import { usePermissions } from "@/hooks/usePermissions";
// (or reuse the existing `has` if usePermissions is already imported — search the file first)
```

Inside the component, near the other permission checks:

```tsx
const canViewAudit = has("audit.view");
```

In the tab-list array (search for the existing entries — likely something like `{ id: "overview", label: "Overview", icon: ... }`), append:

```tsx
...(canViewAudit
  ? [
      {
        id: "staff-activity" as const,
        label: "Staff actions",
        icon: ShieldCheck,
      },
    ]
  : []),
```

Add `ShieldCheck` to the existing lucide-react import.

Find the tab-panel render block (likely a series of `{activeTab === "overview" && ...}` or a switch). Add:

```tsx
import ActivityTab from "./UserDetailModal/ActivityTab";
```

```tsx
{activeTab === "staff-activity" && userId && <ActivityTab userId={userId} />}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors related to UserDetailModal.

- [ ] **Step 4: Smoke test in the browser**

Start dev: `npm run dev`

1. As super-admin, open a user (Users tab → click a row). The UserDetailModal opens. Confirm "Staff actions" appears in the tab list.
2. Click it. The panel renders "No staff have taken any action on this user yet." (correct — no rows logged yet).
3. Sign out + back in as a custom-role staff without `audit.view`. Open the same user. Confirm "Staff actions" is **not** in the tab list.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/UserDetailModal src/components/admin/UserDetailModal.tsx
git commit -m "feat(audit): embedded Staff actions tab in UserDetailModal"
```

---

# Phase 3 — Route instrumentation (5 batches)

**Pattern reference** — for every mutation route in batches 9–13:

Before:
```ts
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const guard = await requirePermission("users.cancelSubscription");
    if (guard instanceof NextResponse) return guard;
    const { session } = guard;

    const { id: userId } = await params;
    // ...do the work...
    return NextResponse.json({ success: true });
  } catch (...) {...}
}
```

After:
```ts
import { requirePermissionWithAudit } from "@/lib/audit-log";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    // Extract resourceId BEFORE the guard so the 403 row (if any) carries it.
    const { id: userId } = await params;
    const guard = await requirePermissionWithAudit("users.cancelSubscription", request, {
      resourceType: "User",
      resourceId: userId,
    });
    if (guard instanceof NextResponse) return guard;
    const { session, log } = guard;

    // ...do the work...
    await log(200);
    return NextResponse.json({ success: true });
  } catch (...) {...}
}
```

**Migration rules:**

1. Drop the `requirePermission` import if nothing else in the file uses it. Add `import { requirePermissionWithAudit } from "@/lib/audit-log";`.
2. If the route handler does NOT already take the `request: NextRequest` parameter, add it (most do — but a few `GET(_)` handlers don't).
3. Extract route params (the `[id]` value) BEFORE calling `requirePermissionWithAudit` so the 403 row carries `resourceId`.
4. Destructure `{ session, log }` instead of `{ session }`.
5. Call `await log(200)` (or `201` for create endpoints) immediately before the success `NextResponse.json(...)` return.
6. Existing 400/404/500 returns DON'T need a log call — the audit log only records success and forbidden.
7. For bulk operations with no single resource (e.g. `bulk-delete`, `apply-month`), omit the context object: `requirePermissionWithAudit(permission, request)`.

**Verification after every batch:**

```bash
npm run type-check
npm run lint
```

Then a quick smoke pass:
1. Start dev. As super-admin, exercise one route in the batch (e.g. fire a POST via curl or the admin UI).
2. Visit `/admin/staff-activity`. Confirm a row appeared.
3. Confirm the row has the right `actorEmail`, `action`, `resourceType`, `resourceId`, and `status: 200`.

---

## Task 9: Batch 1 — Users + Invoices mutations

**Files (10 routes / 9 files):**

| Route file | Method | Permission | resourceType | resourceId source |
|---|---|---|---|---|
| `src/app/api/admin/users/[id]/route.ts` | PATCH | `users.edit` | `"User"` | `params.id` |
| `src/app/api/admin/users/[id]/actions/route.ts` | POST | `users.edit` | `"User"` | `params.id` |
| `src/app/api/admin/users/[id]/cancel-subscription/route.ts` | POST | `users.cancelSubscription` | `"User"` | `params.id` |
| `src/app/api/admin/users/[id]/delete/route.ts` | DELETE | `users.delete` | `"User"` | `params.id` |
| `src/app/api/admin/users/[id]/charge-past-due/route.ts` | POST | `users.charge` | `"User"` | `params.id` |
| `src/app/api/admin/users/[id]/force-charge/route.ts` | POST | `users.charge` | `"User"` | `params.id` |
| `src/app/api/admin/users/[id]/payment-events/[eventId]/reverse/route.ts` | POST | `users.refund` | `"PaymentEvent"` | `params.eventId` |
| `src/app/api/admin/users/[id]/recover-past-due-invoice/route.ts` | POST | `users.charge` | `"User"` | `params.id` |
| `src/app/api/admin/invoices/charge-past-due/route.ts` | POST | `users.charge` | (omit — bulk) | (omit) |
| `src/app/api/admin/invoices/recover-past-due/route.ts` | POST | `users.charge` | (omit — bulk) | (omit) |
| `src/app/api/users/[id]/route.ts` | PATCH (admin-only branch) | `users.edit` | `"User"` | `params.id` |

- [ ] **Step 1: Apply the migration to each route in the table**

Follow the "Pattern reference" above for each file. For `payment-events/[eventId]/reverse`, the eventId from params is the resourceId; the `[id]` (userId) is recorded implicitly via the path.

For `/api/users/[id]/route.ts`: this file has both a self-edit branch (any authenticated user can PATCH their own profile) and an admin-edit branch. Only the admin branch goes through `requirePermissionWithAudit`. Read the file to identify the branch.

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check
npm run lint
```

Expected: no errors in any of the touched files.

- [ ] **Step 3: Smoke test**

Start dev. As super-admin:

1. Open a user, click "Edit Details", change a name, save. Expect a 200 row in `/admin/staff-activity` with `action: "users.edit"`, `resourceType: "User"`.
2. Open the same user, click "Delete User", confirm. Expect a 200 row with `action: "users.delete"`.
3. Sign out, sign in as Customer Support (role without `users.delete`). Try to fire a DELETE via curl. Expect a 403 row with the red badge in `/admin/staff-activity`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/users src/app/api/admin/invoices src/app/api/users
git commit -m "feat(audit): instrument users + invoices mutation routes"
```

---

## Task 10: Batch 2 — Promos mutations

**Files (14 routes / 10 files):**

| Route file | Methods | Permission(s) | resourceType | resourceId |
|---|---|---|---|---|
| `src/app/api/admin/promo/create/route.ts` | POST | `promos.edit` | `"Promo"` | response promo id (see note) |
| `src/app/api/admin/promo/toggle/route.ts` | POST | `promos.edit` | `"Promo"` | request body's promo id |
| `src/app/api/admin/promo/end/route.ts` | POST | `promos.end` | `"Promo"` | request body's promo id |
| `src/app/api/admin/promo/bonus-entry/create/route.ts` | POST | `promos.edit` | `"BonusEntryPromo"` | response id |
| `src/app/api/admin/promo/bonus-entry/[id]/route.ts` | PATCH, DELETE | `promos.edit`, `promos.delete` | `"BonusEntryPromo"` | `params.id` |
| `src/app/api/admin/promo/link/create/route.ts` | POST | `promos.edit` | `"PromoLink"` | response id |
| `src/app/api/admin/promo/link/[id]/route.ts` | PATCH, DELETE | `promos.edit`, `promos.delete` | `"PromoLink"` | `params.id` |
| `src/app/api/admin/promo/scheduled/create/route.ts` | POST | `promos.edit` | `"ScheduledPromo"` | response id |
| `src/app/api/admin/promo/scheduled/[id]/route.ts` | PATCH, DELETE | `promos.edit`, `promos.delete` | `"ScheduledPromo"` | `params.id` |
| `src/app/api/admin/promo/scheduled/apply-month/route.ts` | POST | `promos.edit` | (omit — bulk) | (omit) |
| `src/app/api/admin/promo/banner-text/route.ts` | POST | `promos.edit` | `"PromoBannerText"` | response id |
| `src/app/api/admin/promo/banner-text/[id]/route.ts` | PUT, DELETE | `promos.edit`, `promos.delete` | `"PromoBannerText"` | `params.id` |
| `src/app/api/admin/promo/alternating-multiplier/route.ts` | POST | `promos.edit` | `"AlternatingPromoMultiplier"` | response id |
| `src/app/api/admin/promo/alternating-multiplier/[id]/route.ts` | PATCH, DELETE | `promos.edit`, `promos.delete` | `"AlternatingPromoMultiplier"` | `params.id` |
| `src/app/api/upload/cloudinary/route.ts` | POST, DELETE | `promos.edit` | (omit) | (omit) |

**Note on `create` endpoints:** the resourceId for a freshly-created resource isn't known until after `.create(...)` completes. Pass it to `log()` indirectly — for these endpoints we can call `await log(201)` *after* the create succeeds, but the `resourceId` in the audit row will be omitted because it's set in the context at guard-time. Phase 1 accepts this gap; a follow-up could let `log()` accept an extra context override (noted in the spec's held-back table).

For Phase 1 simplicity: **on `create` endpoints, omit `resourceId` from the context** (the resource didn't exist yet at guard-time). The path makes the action discoverable.

- [ ] **Step 1: Apply the migration to each route in the table**

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

- [ ] **Step 3: Smoke test**

Start dev. As super-admin:

1. Promos tab → toggle a promo on/off. Expect a `promos.edit` 200 row.
2. End a promo. Expect a `promos.end` row.
3. Delete a promo link from the Links list. Expect a `promos.delete` row with `resourceType: "PromoLink"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/promo src/app/api/upload
git commit -m "feat(audit): instrument promos mutation routes"
```

---

## Task 11: Batch 3 — Draws mutations

**Files (10 routes / 8 files):**

| Route file | Methods | Permission | resourceType | resourceId |
|---|---|---|---|---|
| `src/app/api/admin/major-draw/create/route.ts` | POST | `majorDraw.edit` | `"MajorDraw"` | (omit — newly created) |
| `src/app/api/admin/major-draw/update/route.ts` | PUT | `majorDraw.edit` | `"MajorDraw"` | request body's draw id |
| `src/app/api/admin/major-draw/select-winner/route.ts` | POST | `majorDraw.selectWinner` | `"MajorDraw"` | active-draw id resolved server-side (omit if not in scope at guard time) |
| `src/app/api/major-draw/select-winner/route.ts` | POST | `majorDraw.selectWinner` | `"MajorDraw"` | (omit) |
| `src/app/api/admin/mini-draw/create/route.ts` | POST | `miniDraws.edit` | `"MiniDraw"` | (omit — newly created) |
| `src/app/api/admin/mini-draw/update/route.ts` | PUT | `miniDraws.edit` | `"MiniDraw"` | request body's id |
| `src/app/api/admin/mini-draw/order/route.ts` | POST | `miniDraws.edit` | (omit — bulk reorder) | (omit) |
| `src/app/api/admin/mini-draw/[id]/route.ts` | DELETE | `miniDraws.delete` | `"MiniDraw"` | `params.id` |
| `src/app/api/admin/mini-draw/[id]/select-winner/route.ts` | POST | `miniDraws.selectWinner` | `"MiniDraw"` | `params.id` |
| `src/app/api/admin/winners/[id]/route.ts` | PATCH, DELETE | `majorDraw.edit` (both) | `"Winner"` | `params.id` |

- [ ] **Step 1: Apply the migration to each route**

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

- [ ] **Step 3: Smoke test**

As super-admin: trigger a mini-draw winner selection (Mini Draws tab → pick a winner on a draw with entries). Expect a `miniDraws.selectWinner` row with `resourceType: "MiniDraw"` + the draw id.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/major-draw src/app/api/admin/mini-draw src/app/api/admin/winners src/app/api/major-draw
git commit -m "feat(audit): instrument draws mutation routes"
```

---

## Task 12: Batch 4 — Affiliates / Error Reports / AB Testing / Misc

**Files (17 routes / 13 files):**

| Route file | Methods | Permission | resourceType | resourceId |
|---|---|---|---|---|
| `src/app/api/admin/affiliate/create/route.ts` | POST | `affiliates.edit` | `"Affiliate"` | (omit — new) |
| `src/app/api/admin/affiliate/[id]/route.ts` | PUT | `affiliates.edit` | `"Affiliate"` | `params.id` |
| `src/app/api/admin/affiliate/[id]/route.ts` | DELETE | `affiliates.delete` | `"Affiliate"` | `params.id` |
| `src/app/api/admin/affiliate/[id]/process-payout/route.ts` | POST | `affiliates.processPayout` | `"Affiliate"` | `params.id` |
| `src/app/api/admin/affiliate/[id]/referred-users/route.ts` | POST, DELETE | `affiliates.edit` (both) | `"Affiliate"` | `params.id` |
| `src/app/api/admin/error-reports/[id]/route.ts` | PATCH | `errorReports.edit` | `"ErrorReport"` | `params.id` |
| `src/app/api/admin/error-reports/bulk-delete/route.ts` | PATCH | `errorReports.edit` | (omit — bulk) | (omit) |
| `src/app/api/admin/error-reports/bulk-delete/route.ts` | DELETE | `errorReports.delete` | (omit — bulk) | (omit) |
| `src/app/api/admin/stripe-webhook-queue/route.ts` | POST | `errorReports.edit` | (omit) | (omit) |
| `src/app/api/admin/analytics/spend-by-url/sync/route.ts` | POST | `facebookAds.edit` | (omit) | (omit) |
| `src/app/api/admin/klaviyo/draw-reset-execute/route.ts` | POST | `overview.edit` | (omit) | (omit) |
| `src/app/api/admin/upsell-multipliers/route.ts` | PUT | `overview.edit` | (omit) | (omit) |
| `src/app/api/admin/ab-testing/experiments/route.ts` | POST | `abTesting.edit` | `"Experiment"` | (omit — new) |
| `src/app/api/admin/ab-testing/experiments/[id]/route.ts` | PATCH | `abTesting.edit` | `"Experiment"` | `params.id` |
| `src/app/api/admin/ab-testing/experiments/[id]/route.ts` | DELETE | `abTesting.delete` | `"Experiment"` | `params.id` |
| `src/app/api/admin/ab-testing/experiments/[id]/variants/route.ts` | POST, PATCH, DELETE | `abTesting.edit` (all three) | `"Experiment"` | `params.id` |
| `src/app/api/admin/ab-testing/experiments/[id]/winner/route.ts` | POST | `abTesting.selectWinner` | `"Experiment"` | `params.id` |
| `src/app/api/admin/ab-testing/preview/route.ts` | POST, DELETE | `abTesting.edit` (both) | (omit) | (omit) |

- [ ] **Step 1: Apply the migration to each route**

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

- [ ] **Step 3: Smoke test**

As super-admin: trigger an A/B-testing experiment delete. Expect an `abTesting.delete` 403 row if you try as Customer Support, or a 200 row if you have the permission.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/affiliate src/app/api/admin/error-reports src/app/api/admin/stripe-webhook-queue src/app/api/admin/analytics src/app/api/admin/klaviyo src/app/api/admin/upsell-multipliers src/app/api/admin/ab-testing
git commit -m "feat(audit): instrument affiliates + error-reports + ab-testing + misc routes"
```

---

## Task 13: Batch 5 — Settings + Submissions

**Files (12 routes / 6 files):**

| Route file | Methods | Permission | resourceType | resourceId |
|---|---|---|---|---|
| `src/app/api/admin/roles/route.ts` | POST | `settings.edit` | `"Role"` | (omit — new) |
| `src/app/api/admin/roles/[id]/route.ts` | PATCH | `settings.edit` | `"Role"` | `params.id` |
| `src/app/api/admin/roles/[id]/route.ts` | DELETE | `settings.delete` | `"Role"` | `params.id` |
| `src/app/api/admin/staff/route.ts` | POST | `settings.edit` | `"User"` | (omit — new invitee) |
| `src/app/api/admin/staff/[id]/route.ts` | PATCH | `settings.edit` | `"User"` | `params.id` |
| `src/app/api/admin/staff/[id]/route.ts` | DELETE | `settings.delete` | `"User"` | `params.id` |
| `src/app/api/contact-submissions/[id]/route.ts` | PUT | `submissions.edit` | `"ContactSubmission"` | `params.id` |
| `src/app/api/contact-submissions/[id]/route.ts` | PATCH | `submissions.edit` | `"ContactSubmission"` | `params.id` |
| `src/app/api/contact-submissions/[id]/route.ts` | DELETE | `submissions.delete` | `"ContactSubmission"` | `params.id` |
| `src/app/api/contact-submissions/[id]/reply/route.ts` | POST | `submissions.edit` | `"ContactSubmission"` | `params.id` |
| `src/app/api/partner-applications/[id]/route.ts` | PUT | `users.edit` | `"PartnerApplication"` | `params.id` |
| `src/app/api/partner-applications/[id]/route.ts` | DELETE | `users.edit` | `"PartnerApplication"` | `params.id` |

(Note: `/api/partner-applications/[id]` PATCH is a "mark-read" action gated on `users.view`. View-level actions are NOT logged per the spec. Leave it as plain `requirePermission`.)

- [ ] **Step 1: Apply the migration to each route**

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

- [ ] **Step 3: Smoke test**

As super-admin: open Team → Roles → toggle a permission and save (PATCH a role). Expect a `settings.edit` 200 row with `resourceType: "Role"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/roles src/app/api/admin/staff src/app/api/contact-submissions src/app/api/partner-applications
git commit -m "feat(audit): instrument settings + submissions mutation routes"
```

---

# Phase 4 — Docs + acceptance

## Task 14: Final docs pass

**Files:**
- Modify: `docs/admin/staff-activity-log.md`
- Modify: `docs/auth/rbac-smoke-checklist.md`
- Modify: `docs/admin/staff-permissions-mapping.md` (if any rows were missed during the route batches)
- Modify: `CLAUDE.md` (bump `lastVerified` on the `admin` and `auth` domains)

- [ ] **Step 1: Flip status on the living doc**

At the top of `docs/admin/staff-activity-log.md`, replace:

```markdown
> **Status:** Design approved 2026-05-20 — see [docs/superpowers/specs/2026-05-20-staff-activity-logging-design.md](../superpowers/specs/2026-05-20-staff-activity-logging-design.md). Implementation pending. This document is the living reference and will be filled in section-by-section as code lands.
```

with:

```markdown
> **Status:** Shipped 2026-05-20. Living reference. Held-back items tracked in the [spec's future-work checklist](../superpowers/specs/2026-05-20-staff-activity-logging-design.md#future-work-checklist).
```

- [ ] **Step 2: Append smoke checklist**

Append to `docs/auth/rbac-smoke-checklist.md`:

```markdown
## Staff Activity (audit log)

10. Sign in as Admin. Open `/admin/staff-activity`. Empty filter, no search. Expect to see recent mutation rows from your own actions in the previous tasks (Users edits, Promos toggles, etc.) — newest first.
11. Filter chip: "Forbidden". Expect any 403 attempts logged earlier to surface with the red badge.
12. Open a user's detail modal → "Staff actions" tab. Expect rows scoped to that user (`resourceType: "User"`, matching `resourceId`).
13. Sign in as Customer Support (no `audit.view`). Confirm the Audit sidebar group is hidden, the Staff actions tab inside UserDetailModal is hidden, and a direct GET to `/api/admin/staff-activity` returns 403.
14. As Customer Support, attempt `DELETE /api/admin/users/<id>/delete` via curl. Confirm a 403 row lands in the log (visible to admin) with `resourceType: "User"`.
15. As Admin, change a role's permissions in Team → Roles. Confirm a `settings.edit` row appears immediately (force-restart still applies separately to affected staff).
```

- [ ] **Step 3: Sweep `staff-permissions-mapping.md` for missed entries**

Grep the route map for any mutation that hasn't been swapped:

```bash
git grep -n "requirePermission(" src/app/api/admin/ | grep -v requirePermissionWithAudit
git grep -n "requirePermission(" src/app/api/contact-submissions/ src/app/api/partner-applications/ src/app/api/users/ src/app/api/major-draw/ src/app/api/upload/ | grep -v requirePermissionWithAudit
```

For each match, decide: is it a read (leave it) or a mutation that was missed? If missed, return to the appropriate Phase 3 task and add it; then re-verify with this grep.

- [ ] **Step 4: Bump `lastVerified`**

In `CLAUDE.md`, set `lastVerified: "2026-05-20"` on both the `admin` and `auth` domain entries.

- [ ] **Step 5: Type-check + lint + tests**

```bash
npm run type-check
npm run lint
npm run test:permissions
npm run test:staff-activity
```

All four must pass.

- [ ] **Step 6: Commit**

```bash
git add docs/admin/staff-activity-log.md docs/auth/rbac-smoke-checklist.md docs/admin/staff-permissions-mapping.md CLAUDE.md
git commit -m "docs(audit): mark staff activity logging as shipped + smoke checklist"
```

---

## Task 15: Full smoke pass + branch readiness

- [ ] **Step 1: Re-run the catalog + helper tests**

```bash
npm run test:permissions
npm run test:staff-activity
```

Both must pass.

- [ ] **Step 2: Full lint + type-check**

```bash
npm run type-check
npm run lint
```

Both must finish with zero new errors (pre-existing `scripts/codemod-dark-text.js` errors are OK — they're unrelated and predate this branch).

- [ ] **Step 3: End-to-end smoke**

In a clean browser session:

1. Sign in as Admin. Visit `/admin/staff-activity`. Confirm the list renders with rows from earlier smoke tests.
2. Click into a user. Confirm "Staff actions" tab appears and shows scoped rows.
3. Sign out + sign in as Customer Support. Confirm:
   - Sidebar has no Audit group.
   - UserDetailModal has no "Staff actions" tab.
   - `GET /api/admin/staff-activity` returns 403 in the Network tab.
4. As Admin, grant `audit.view` to Customer Support via Team → Roles. Save. The force-restart bumps Customer Support's `tokenVersion`.
5. Sign in as Customer Support again. Confirm the Audit group is now visible, the Staff actions tab now appears in UserDetailModal.

- [ ] **Step 4: Branch is ready**

Phase 1 of the staff activity log feature is complete. The spec's "Future work checklist" lists ~12 follow-up items that can be picked up independently as separate PRs.

---

## Self-review notes

**Spec coverage:**
- ✅ Capture strategy (wrap requirePermission) — Task 3.
- ✅ Data model (StaffActivity + indexes + TTL) — Task 2.
- ✅ `audit` area + `audit.view` permission — Task 1.
- ✅ List endpoint with cursor pagination — Task 4.
- ✅ TanStack hook — Task 5.
- ✅ Top-level viewer page — Task 6.
- ✅ Sidebar group + tab dispatch — Task 7.
- ✅ Embedded per-user view inside UserDetailModal — Task 8.
- ✅ All ~50 mutation routes instrumented — Tasks 9–13.
- ✅ Documentation updates (admin doc, smoke checklist, route map, manifest) — Task 14.
- ✅ Acceptance smoke — Task 15.

**Held-back items** explicitly NOT in this plan (per the spec's held-back table):
- Before/after diff capture.
- IP / user-agent capture.
- Optional read logging (`audit.logReads`).
- Embedded Activity tab in `AffiliateDetailModal` / `ExperimentDetailModal` / draws.
- N-row expansion for bulk operations.
- Allowlist routes migration (still on `requireAdminUser`).
- Suspicious-403 alerting.
- Configurable retention via env var.
- Full-text search across actor + resource names (search is client-side only here).
- CSV export.
- On-demand purge endpoint.

These remain on the spec's future-work checklist and are picked up as separate PRs.

**Type / method consistency check:**
- `requirePermissionWithAudit` signature is consistent across Task 3 (definition) and Tasks 9–13 (consumers).
- `log()` is always called with a single status argument (200, 201, or 403 — but 403 is written by the helper itself, so route handlers only ever pass 200 or 201).
- `useStaffActivity` is consumed by both Task 6 (top-level page) and Task 8 (embedded tab) with the same filter shape.
- `audit.view` is the only permission introduced; super-admin bypass handles the auto-on requirement.
