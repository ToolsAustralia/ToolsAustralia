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

  // Super-admin: bypass permission check entirely.
  if (session.user.userType === "admin") {
    return { session };
  }

  // Bridge for users not yet migrated to roleId (Phase 1 backfill window).
  // Legacy admins behave as if they had every permission.
  if (session.user.userType !== "staff" && session.user.role === "admin") {
    return { session };
  }

  // Not an internal user — reject.
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Staff: check specific permission.
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
  // Super-admin bypass
  if (user.userType === "admin") return true;
  // Legacy bridge
  if (user.userType !== "staff" && user.role === "admin") return true;
  if (user.userType !== "staff" || !user.roleId) return false;
  const role = await Role.findById(user.roleId).select("permissions").lean();
  return !!role?.permissions?.includes(permission);
}
