/**
 * Client-side service for user-related API calls
 * Handles all HTTP requests for user management
 */

import type { AdminUserDetail, AdminUserDetailResponse, AdminUsersResponse, UserFilters } from "@/types/admin";

/**
 * Get paginated list of users with search and filtering
 */
export async function getUsers(filters: UserFilters): Promise<AdminUsersResponse["data"]> {
  const searchParams = new URLSearchParams();

  // Add filters to search params
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, value.toString());
    }
  });

  const response = await fetch(`/api/admin/users?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.statusText}`);
  }

  const result: AdminUsersResponse = await response.json();

  if (!result.success) {
    throw new Error("Failed to fetch users list");
  }

  return result.data;
}

/**
 * Get detailed user profile by ID
 */
export async function getUserById(userId: string): Promise<AdminUserDetail> {
  const response = await fetch(`/api/admin/users/${userId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch user details: ${response.statusText}`);
  }

  const result: AdminUserDetailResponse = await response.json();

  if (!result.success) {
    throw new Error("Failed to fetch user details");
  }

  return result.data;
}

/**
 * Search users by query term
 */
export async function searchUsers(params: { q: string; page?: number; limit?: number; majorDrawId?: string }) {
  const searchParams = new URLSearchParams({
    q: params.q,
    page: (params.page || 1).toString(),
    limit: (params.limit || 20).toString(),
  });

  if (params.majorDrawId) {
    searchParams.append("majorDrawId", params.majorDrawId);
  }

  const response = await fetch(`/api/admin/users/search?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to search users: ${response.statusText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error("Failed to search users");
  }

  return result.data;
}





