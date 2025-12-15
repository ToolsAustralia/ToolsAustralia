/**
 * Client-side service for user action API calls
 * Handles all HTTP requests for user actions (update, delete, etc.)
 */

import type {
  AdminUserUpdatePayload,
  AdminUserDetailResponse,
  UserActionRequest,
  UserActionResponse,
} from "@/types/admin";

/**
 * Update user profile
 */
export async function updateUser(
  userId: string,
  data: AdminUserUpdatePayload
): Promise<AdminUserDetailResponse["data"]> {
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to update user: ${response.statusText}`);
  }

  const result: AdminUserDetailResponse = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to update user");
  }

  return result.data;
}

/**
 * Execute a user action (resend verification, reset password, etc.)
 */
export async function executeUserAction(userId: string, actionData: UserActionRequest): Promise<UserActionResponse> {
  const response = await fetch(`/api/admin/users/${userId}/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(actionData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to perform action: ${response.statusText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to perform action");
  }

  return result.data;
}

/**
 * Delete a user permanently
 */
export async function deleteUser(userId: string) {
  const response = await fetch(`/api/admin/users/${userId}/delete`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to delete user: ${response.statusText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to delete user");
  }

  return result.data;
}



