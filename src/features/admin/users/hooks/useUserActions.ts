/**
 * Hook for user actions (update, delete, etc.)
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateUser, executeUserAction, deleteUser } from "../services/userActionsService";
import type { AdminUserUpdatePayload, AdminUserDetail, UserActionRequest, UserActionResponse } from "@/types/admin";

/**
 * Hook for updating user profile
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation<AdminUserDetail, Error, { userId: string; data: AdminUserUpdatePayload }>({
    mutationFn: async ({ userId, data }) => {
      return updateUser(userId, data);
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch user details
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "detail", variables.userId],
      });
      // Invalidate user list to refresh stats
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "list"],
      });
    },
  });
}

/**
 * Hook for performing admin actions on users
 */
export function useUserActions() {
  const queryClient = useQueryClient();

  return useMutation<UserActionResponse, Error, { userId: string; actionData: UserActionRequest }>({
    mutationFn: async ({ userId, actionData }) => {
      return executeUserAction(userId, actionData);
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch user details
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "detail", variables.userId],
      });
      // Invalidate user list
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "list"],
      });
    },
  });
}

/**
 * Hook for deleting a user
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation<{ deletionSummary: unknown; cleanupReport: unknown }, Error, { userId: string }>({
    mutationFn: async ({ userId }) => {
      return deleteUser(userId);
    },
    onSuccess: () => {
      // Invalidate user list after deletion
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "list"],
      });
    },
  });
}
