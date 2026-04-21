"use client";

import { useSession } from "next-auth/react";
import { useMyAccountData } from "@/hooks/queries/useUserQueries";
import { getActivePackage, type ActivePackage } from "@/utils/membership/get-active-package";

/**
 * Single source of truth for “which package is active” on customer-facing surfaces.
 */
export function useActivePackage(): ActivePackage | null {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { data: accountData } = useMyAccountData(userId);
  const user = accountData?.user;
  if (!user) return null;
  return getActivePackage(user);
}
