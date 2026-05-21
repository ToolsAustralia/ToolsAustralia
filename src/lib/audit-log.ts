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
 * Build the audit row's `actorRoleName` snapshot. Preference order:
 *   1. session.user.roleName — set when the user has a custom Role.
 *   2. session.user.userType === "admin" → "Admin" (seeded super-role).
 *   3. Legacy bridge: session.user.role === "admin" → "Admin (legacy)" so
 *      historical rows distinguish the pre-RBAC super-admin path from the
 *      seeded staff Admin role. Phase 5 cleanup removes the bridge.
 *   4. session.user.userType === "staff" → "Staff" (no role assigned yet).
 *   5. Last-resort "Unknown" so the field is never empty.
 */
function resolveActorRoleName(user: Session["user"]): string {
  if (user.roleName) return user.roleName;
  if (user.userType === "admin") return "Admin";
  if (user.role === "admin") return "Admin (legacy)";
  if (user.userType === "staff") return "Staff";
  return "Unknown";
}

/**
 * Drop-in replacement for `requirePermission` that also writes one row to
 * the StaffActivity collection. Logs:
 *  - successful actions (when the route handler calls `log(status)` after
 *    the work completes)
 *  - forbidden attempts (status 403) by *logged-in* users who lack the
 *    required permission. Anonymous 401s do NOT write a row — there's no
 *    actor to attribute the attempt to, and route handlers will see a 401
 *    NextResponse from `requirePermission` regardless. If you need to track
 *    anonymous probe traffic, use rate limiting or middleware, not this
 *    helper.
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
    // Permission denied. Resolve the session: if `session?.user?.id` exists
    // the guard returned 403 (logged-in but missing the right permission) and
    // we write the forbidden row. If session is null the guard returned 401
    // (unauthenticated) and we skip the write — no actor to attribute it to.
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      await safeLog({
        actorId: session.user.id,
        actorEmail: session.user.email ?? "unknown",
        actorRoleName: resolveActorRoleName(session.user),
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
        actorRoleName: resolveActorRoleName(guard.session.user),
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

/**
 * Test-only dependency injection. In production both fields are unset and
 * the real connectDB / StaffActivity.create() are used. Tests inject throwing
 * stubs to prove the catch covers BOTH I/O paths (connect + create), not just
 * the model write.
 */
interface SafeLogDeps {
  connect?: () => Promise<unknown>;
  create?: (input: SafeLogInput) => Promise<unknown>;
}

async function safeLog(input: SafeLogInput, deps?: SafeLogDeps): Promise<void> {
  try {
    if (deps?.connect) {
      await deps.connect();
    } else {
      await connectDB();
    }
    if (deps?.create) {
      await deps.create(input);
    } else {
      await StaffActivity.create(input);
    }
  } catch (err) {
    // Best-effort. A logging failure must never break the action.
    // Using console.error (not console.log) so it survives next.config's
    // compiler.removeConsole in production builds. ErrorReport is for
    // user-facing errors; audit-log failures are infra noise only.
    console.error("[audit-log] failed to record activity:", err);
  }
}

/**
 * Test-only re-export. Kept as a `__`-prefixed alias so tests can call
 * `safeLog` with stub I/O without exposing it in autocomplete for production
 * code-paths. Production callers go through `requirePermissionWithAudit` and
 * never see this.
 */
export const __safeLogForTest = safeLog;
