/**
 * Hook for fetching and managing user list
 */

import { useQuery } from "@tanstack/react-query";
import { getUsers, searchUsers } from "../services/usersService";
import type { UserFilters } from "@/types/admin";

/**
 * Hook to fetch paginated list of users with search and filtering
 */
export function useUsers(filters: UserFilters = {}) {
  return useQuery({
    queryKey: ["admin", "users", "list", filters],
    queryFn: () => getUsers(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes - user list can be slightly stale
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

/**
 * Hook to search users by query term
 */
export function useUserSearch(params: { q: string; page?: number; limit?: number; majorDrawId?: string }) {
  return useQuery({
    queryKey: ["admin", "users", "search", params],
    queryFn: () => searchUsers(params),
    enabled: !!params.q && params.q.trim().length > 0,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}




