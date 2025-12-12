import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AdminUserDetail,
  AdminUserDetailResponse,
  AdminUserUpdatePayload,
  AdminUsersResponse,
  UserActionRequest,
  UserActionResponse,
  UserFilters,
} from "@/types/admin";

// Types for recent activities
export interface RecentActivity {
  id: string;
  type:
    | "user_signup"
    | "membership_purchase"
    | "one_time_purchase"
    | "draw_complete"
    | "high_value_order"
    | "system_alert"
    | "membership_upgrade";
  user: string;
  action: string;
  time: string;
  status: "success" | "info" | "warning" | "error";
  amount?: number;
  timestamp: Date;
}

// Types for revenue breakdown
export interface ChartData {
  date: string; // Date label (e.g., "Jan 15", "2024", "Jan")
  dateKey: string; // ISO date string for filtering (e.g., "2025-01-15T00:00:00.000Z")
  oneTime: number; // One-time packages (excluding mini-draw)
  memberships: number; // Subscription packages
  miniDraw: number; // Mini-draw packages
  total: number;
}

export interface RevenueBreakdownResponse {
  chartData: ChartData[];
  totals: {
    total: number;
    oneTime: number;
    memberships: number;
    miniDraw: number;
  };
  growthRate: number;
  period: "days" | "months" | "years";
}

// Types for admin dashboard stats
export interface AdminDashboardStats {
  users: {
    total: number;
    activeSubscriptions: number;
    newInRange: number;
    profileCompletion: number;
  };
  revenue: {
    total: number;
    breakdown: {
      subscriptions: number;
      oneTimePackages: number;
    };
  };
  majorDraw: {
    totalEntries: number;
    activeDraws: number;
  };
  conversionRate: number;
  facebookAds?: {
    spend: number;
    roas: number;
  };
  dateRange?: {
    start: string;
    end: string;
    range: string;
  };
}

export interface AdminDashboardResponse {
  success: boolean;
  data: AdminDashboardStats;
}

/**
 * Hook to fetch admin dashboard statistics
 * @param dateRange - Date range filter: "today" | "yesterday" | "all-time" | "custom"
 * @param startDate - Start date for custom range (ISO string)
 * @param endDate - End date for custom range (ISO string)
 */
export function useAdminDashboardStats(
  dateRange: "today" | "yesterday" | "all-time" | "custom" = "today",
  startDate?: string,
  endDate?: string
) {
  return useQuery<AdminDashboardStats>({
    queryKey: ["admin", "dashboard", "stats", dateRange, startDate, endDate],
    queryFn: async (): Promise<AdminDashboardStats> => {
      const params = new URLSearchParams({ dateRange });
      if (dateRange === "custom" && startDate && endDate) {
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const response = await fetch(`/api/admin/dashboard/stats?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch admin stats: ${response.statusText}`);
      }

      const result: AdminDashboardResponse = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch admin dashboard stats");
      }

      return result.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - admin stats can be slightly stale
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch recent activities for admin dashboard
 */
export function useRecentActivities() {
  return useQuery<RecentActivity[]>({
    queryKey: ["admin", "dashboard", "recent-activities"],
    queryFn: async (): Promise<RecentActivity[]> => {
      const response = await fetch("/api/admin/dashboard/recent-activities");

      if (!response.ok) {
        throw new Error(`Failed to fetch recent activities: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch recent activities");
      }

      return result.data;
    },
    staleTime: 1 * 60 * 1000, // 1 minute - activities should be fresh
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 2 * 60 * 1000, // Auto-refresh every 2 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch revenue breakdown for admin dashboard
 * @param period - Time period: "days" | "months" | "years" (default: "months")
 * @param startDate - Start date for custom range (ISO string)
 * @param endDate - End date for custom range (ISO string)
 */
export function useRevenueBreakdown(
  period: "days" | "months" | "years" = "months",
  startDate?: string,
  endDate?: string
) {
  return useQuery<RevenueBreakdownResponse>({
    queryKey: ["admin", "dashboard", "revenue-breakdown", period, startDate, endDate],
    queryFn: async (): Promise<RevenueBreakdownResponse> => {
      const params = new URLSearchParams({ period });
      if (startDate && endDate) {
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const response = await fetch(`/api/admin/dashboard/revenue-breakdown?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch revenue breakdown: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch revenue breakdown");
      }

      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - revenue data can be slightly stale
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 10 * 60 * 1000, // Auto-refresh every 10 minutes
    retry: 2,
  });
}

// ========================================
// USER MANAGEMENT HOOKS
// ========================================

/**
 * Hook to fetch paginated list of users with search and filtering
 */
export function useAdminUsers(filters: UserFilters = {}) {
  return useQuery<AdminUsersResponse["data"]>({
    queryKey: ["admin", "users", "list", filters],
    queryFn: async (): Promise<AdminUsersResponse["data"]> => {
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
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - user list can be slightly stale
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch detailed user profile
 */
export function useAdminUserDetail(userId: string) {
  return useQuery<AdminUserDetail>({
    queryKey: ["admin", "users", "detail", userId],
    queryFn: async (): Promise<AdminUserDetail> => {
      const response = await fetch(`/api/admin/users/${userId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch user details: ${response.statusText}`);
      }

      const result: AdminUserDetailResponse = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch user details");
      }

      return result.data;
    },
    enabled: !!userId, // Only run query if userId is provided
    staleTime: 1 * 60 * 1000, // 1 minute - user details should be fresh
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

/**
 * Hook for performing admin actions on users
 */
export function useAdminUserActions() {
  const queryClient = useQueryClient();

  return useMutation<UserActionResponse, Error, { userId: string; actionData: UserActionRequest }>({
    mutationFn: async ({ userId, actionData }): Promise<UserActionResponse> => {
      const response = await fetch(`/api/admin/users/${userId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(actionData),
      });

      if (!response.ok) {
        throw new Error(`Failed to perform action: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to perform action");
      }

      return result.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch user details
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "detail", variables.userId],
      });

      // Invalidate user list if status was changed
      if (variables.actionData.action === "toggle_status") {
        queryClient.invalidateQueries({
          queryKey: ["admin", "users", "list"],
        });
      }

      // Invalidate dashboard stats if user was activated/deactivated
      if (variables.actionData.action === "toggle_status") {
        queryClient.invalidateQueries({
          queryKey: ["admin", "dashboard", "stats"],
        });
      }
    },
    onError: (error) => {
      console.error("User action failed:", error);
    },
  });
}

/**
 * Hook to update a user's profile from the admin dashboard
 */
export function useAdminUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation<AdminUserDetail, Error, { userId: string; payload: AdminUserUpdatePayload }>({
    mutationFn: async ({ userId, payload }) => {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = `Failed to update user: ${response.statusText}`;

        try {
          const errorBody = await response.json();
          if (errorBody?.error) {
            message = errorBody.error;
          }
        } catch (parseError) {
          console.warn("Unable to parse update error response", parseError);
        }

        throw new Error(message);
      }

      const result: AdminUserDetailResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to update user");
      }

      return result.data;
    },
    onSuccess: (_data, variables) => {
      // Refresh the detail view with the latest data
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "detail", variables.userId],
      });

      // Update the list so summary information stays in sync
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "list"],
      });
    },
    onError: (error) => {
      console.error("User update failed:", error);
    },
  });
}
