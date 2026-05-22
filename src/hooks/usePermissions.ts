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

  // Super-admin: seeded Admin role — bypasses all permission checks.
  const isSuperAdmin = session?.user?.userType === "admin";
  // Legacy bridge — Phase 5 cleanup removes this.
  const legacyAdmin =
    session?.user?.userType !== "staff" &&
    session?.user?.userType !== "admin" &&
    session?.user?.role === "admin";

  return {
    isLoading: status === "loading",
    // True for any user who can access the admin panel (staff or admin super-role).
    isStaff: session?.user?.userType === "staff" || session?.user?.userType === "admin",
    has: (perm: Permission | string): boolean => {
      if (isSuperAdmin || legacyAdmin) return true;
      return set.has(perm);
    },
    hasAny: (...perms: (Permission | string)[]): boolean => {
      if (isSuperAdmin || legacyAdmin) return true;
      return perms.some((p) => set.has(p));
    },
    hasAll: (...perms: (Permission | string)[]): boolean => {
      if (isSuperAdmin || legacyAdmin) return true;
      return perms.every((p) => set.has(p));
    },
  };
}
