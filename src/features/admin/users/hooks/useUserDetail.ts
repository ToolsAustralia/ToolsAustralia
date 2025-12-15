/**
 * Hook for fetching user detail
 */

import { useQuery } from "@tanstack/react-query";
import { getUserById } from "../services/usersService";
import type { AdminUserDetail } from "@/types/admin";

/**
 * Hook to fetch detailed user profile
 */
export function useUserDetail(userId: string | null) {
  return useQuery<AdminUserDetail>({
    queryKey: ["admin", "users", "detail", userId],
    queryFn: () => {
      if (!userId) {
        throw new Error("User ID is required");
      }
      return getUserById(userId);
    },
    enabled: !!userId, // Only run query if userId is provided
    staleTime: 1 * 60 * 1000, // 1 minute - user details should be fresh
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}



