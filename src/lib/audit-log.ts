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

async function safeLog(
  input: SafeLogInput,
  modelOverride?: { create: (input: SafeLogInput) => Promise<unknown> }
): Promise<void> {
  try {
    if (modelOverride) {
      await modelOverride.create(input);
    } else {
      await connectDB();
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
 * `safeLog` with a stub model without exposing it in autocomplete for
 * production code-paths. Production callers go through
 * `requirePermissionWithAudit` and never see this.
 */
export const __safeLogForTest = safeLog;
