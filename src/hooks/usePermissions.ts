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
