import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  AdminUserDetail,
  AdminUserDetailResponse,
  AdminUserPaymentEventsPage,
  AdminUserUpdatePayload,
  AdminUsersResponse,
  UserActionRequest,
  UserActionResponse,
  UserFilters,
} from "@/types/admin";
import type { TrendData } from "@/types/admin/trend-types";
import { appendUserFiltersToSearchParams } from "@/utils/admin/appendUserFiltersToSearchParams";

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
    | "membership_upgrade"
    | "subscription_past_due";
  /** Combined "FirstName LastName" string used by the admin UI. */
  user: string;
  /** First name as a separate field (kept in sync with the service-side
   * interface in `src/services/admin/dashboardSlices.ts`). PII-safe consumers
   * prefer this over splitting `user` on whitespace — preserves compound
   * first names like "Jean Pierre". `null` for System events. */
  firstName: string | null;
  userId?: string;
  action: string;
  time: string;
  status: "success" | "info" | "warning" | "error";
  amount?: number;
  timestamp: Date;
  /** For mini-draw purchases: link to /mini-draws/[id] */
  miniDrawId?: string;
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

// Revenue breakdown item with optional trend
export type RevenueBreakdownItem =
  | number
  | {
      revenue: number;
      purchaseCount: number;
      userCount: number;
      trend?: TrendData;
    };

// Types for admin dashboard stats
export interface AdminDashboardStats {
  users: {
    total: number;
    totalTrend?: TrendData;
    activeSubscriptions: number;
    newInRange: number;
    newInRangeTrend?: TrendData;
    profileCompletion: number;
    cancelledMemberships: number;
    cancelledMembershipsTrend?: TrendData;
    totalScheduledCancellation: number;
    dropOffRate: number;
    dropOffRateTrend?: TrendData;
    periodChurnRate?: number;
    membershipRenewals?: {
      expectedInRange: number;
      succeededInRange: number;
      succeededDistinctMembers: number;
      failedInvoicesInRange: number;
      becamePastDueInRange: number;
    };
    cancellationImpact?: {
      estimatedMonthlyRevenue: number;
    };
  };
  revenue: {
    total: number;
    totalTrend?: TrendData;
    breakdown: {
      subscriptions: number; // Backward compatibility: membershipPurchase + membershipRenewal
      oneTimePackages: number; // Backward compatibility: oneTimePurchase + additionalOneTimePurchase + miniDraw + upsell
      // Detailed breakdown - supports both number (legacy) and object (new) formats
      membershipPurchase: RevenueBreakdownItem;
      membershipRenewal: RevenueBreakdownItem;
      oneTimePurchase: RevenueBreakdownItem;
      additionalOneTimePurchase: RevenueBreakdownItem;
      miniDraw: RevenueBreakdownItem;
      upsell: RevenueBreakdownItem;
    };
  };
  majorDraw: {
    totalEntries: number;
    activeDraws: number;
  };
  conversionRate: number;
  conversionRateTrend?: TrendData;
  facebookAds?: {
    spend: number;
    spendTrend?: TrendData;
    roas: number;
    roasTrend?: TrendData;
  };
  dateRange?: {
    start: string;
    end: string;
    range: string;
  };
  enhanced?: {
    averageOrderValue: number;
    customerAcquisitionCost: number;
    revenuePerUser: number;
    conversionRate: number;
    miniDrawPerformance: {
      totalRevenue: number;
      totalSales: number;
      averageRevenuePerDraw: number;
    };
    conversionFunnel: {
      visitors: number;
      signups: number;
      payingCustomers: number;
      conversionRates: {
        visitorToSignup: number;
        signupToPaying: number;
        overall: number;
      };
    };
  };
}

// Types for membership by package
export interface MembershipByPackageItem {
  packageId: string;
  packageName: string;
  activeCount: number;
  cancelledCount: number;
  pastDueCount: number;
  activeRevenue: number;
  pastDueRevenue: number;
}

export interface MembershipByPackageSummary {
  totalActiveCount: number;
  totalPastDueCount: number;
  totalActiveRevenue: number;
  totalPastDueRevenue: number;
  snapshotPartial?: boolean;
  /** Set when caller asked for a snapshot date but no snapshot row existed; live data returned instead. */
  snapshotMissing?: boolean;
}

export interface MembershipByPackageData {
  packages: MembershipByPackageItem[];
  summary: MembershipByPackageSummary;
  meta?: {
    membershipAsOfMode: "live" | "snapshot";
    asOf: string | null;
  };
}

// Types for projected income
export interface ProjectedIncomeData {
  projectedIncome: number;
  activeSubscriptions: number;
  nextMonthStart: string;
  nextMonthEnd: string;
  renewingOn27thCount: number;
  renewingOn27thRevenue: number;
  renewingOn27thDate: string;
  pastDueCount: number;
  pastDueRevenue: number;
}

// Types for upcoming Stripe renewals
export type UpcomingRenewalsRange = 0 | 3 | 7 | 27; // 0 = today, 27 = renewing today through 27th

export interface UpcomingRenewalItem {
  subscriptionId: string;
  customerId: string;
  customerEmail?: string;
  customerName?: string;
  userId?: string;
  renewalDate: string;
  renewalDateFormatted: string;
  amountCents: number;
  amountFormatted: string;
}

export interface UpcomingRenewalsData {
  renewals: UpcomingRenewalItem[];
  total: number;
  page: number;
  limit: number;
  totalRevenue: number;
}

// Types for revenue details
export type RevenueCategory =
  | "membership-purchase"
  | "membership-renewal"
  | "one-time-purchase"
  | "additional-one-time"
  | "mini-draw"
  | "upsell";

export interface RevenueDetailPurchase {
  paymentEventId: string;
  timestamp: string;
  amount: number;
  packageId?: string;
  packageName?: string;
  billingReason?: string;
}

export interface RevenueDetailUser {
  userId: string;
  userInfo: {
    firstName: string;
    lastName: string;
    email: string;
    mobile?: string;
  };
  purchases: RevenueDetailPurchase[];
  totalContributed: number;
  purchaseCount: number;
}

export interface RevenueDetailResponse {
  success: boolean;
  data: {
    category: RevenueCategory;
    totalRevenue: number;
    totalPurchases: number;
    totalUsers: number;
    users: RevenueDetailUser[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      limit: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

export interface AdminDashboardResponse {
  success: boolean;
  data: AdminDashboardStats;
}

// Types for major draws for date range selection
export interface MajorDrawForDateRange {
  _id: string;
  name: string;
  activationDate: string;
  drawDate: string;
  status: string;
}

/**
 * Hook to fetch admin dashboard statistics
 * @param dateRange - Date range filter: "today" | "yesterday" | "all-time" | "custom"
 * @param startDate - Start date for custom range (ISO string)
 * @param endDate - End date for custom range (ISO string)
 */
export function useAdminDashboardStats(
  dateRange: "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw" = "today",
  startDate?: string,
  endDate?: string
) {
  return useQuery<AdminDashboardStats>({
    queryKey: ["admin", "dashboard", "stats", dateRange, startDate, endDate],
    queryFn: async (): Promise<AdminDashboardStats> => {
      const params = new URLSearchParams({ dateRange });
      // Append dates for custom and draw-based ranges
      if ((dateRange === "custom" || dateRange === "current-draw" || dateRange === "last-draw") && startDate && endDate) {
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
 * Hook to fetch recent activities for admin dashboard with infinite scroll
 */
export function useRecentActivitiesInfinite(limit = 20) {
  return useInfiniteQuery<
    { data: RecentActivity[]; pagination: { page: number; limit: number; total: number; hasMore: boolean } },
    Error
  >({
    queryKey: ["admin", "dashboard", "recent-activities-infinite", limit],
    queryFn: async ({ pageParam = 1 }): Promise<{ data: RecentActivity[]; pagination: { page: number; limit: number; total: number; hasMore: boolean } }> => {
      const response = await fetch(`/api/admin/dashboard/recent-activities?page=${pageParam}&limit=${limit}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch recent activities: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch recent activities");
      }

      return { data: result.data, pagination: result.pagination };
    },
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch activity log (paginated, infinite scroll)
 */
export interface ActivityLogItem {
  id: string;
  type:
    | "user_signup"
    | "membership_purchase"
    | "one_time_purchase"
    | "draw_complete"
    | "high_value_order"
    | "system_alert"
    | "membership_upgrade"
    | "subscription_past_due";
  user: string;
  userId?: string;
  action: string;
  time: string;
  status: "success" | "info" | "warning" | "error";
  amount?: number;
  timestamp: Date;
  miniDrawId?: string;
}

export function useActivityLogInfinite(limit = 25, typeFilter?: string, searchTerm?: string) {
  return useInfiniteQuery<
    {
      activities: ActivityLogItem[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    },
    Error
  >({
    queryKey: ["admin", "activity-log-infinite", limit, typeFilter, searchTerm],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: String(limit),
      });
      if (typeFilter) params.append("type", typeFilter);
      if (searchTerm) params.append("search", searchTerm);

      const response = await fetch(`/api/admin/activity-log?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch activity log: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch activity log");
      }

      return result.data;
    },
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined;
    },
    initialPageParam: 1,
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Hook to fetch recent activities for admin dashboard (legacy - non-paginated)
 */
export function useRecentActivities() {
  return useQuery<RecentActivity[]>({
    queryKey: ["admin", "dashboard", "recent-activities"],
    queryFn: async (): Promise<RecentActivity[]> => {
      const response = await fetch("/api/admin/dashboard/recent-activities?limit=20");

      if (!response.ok) {
        throw new Error(`Failed to fetch recent activities: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch recent activities");
      }

      return result.data;
    },
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
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
  period: "days" | "months" | "years" | "major-draws" = "months",
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

/**
 * Hook to fetch major draws for date range selection
 * Returns draws with activationDate and drawDate for use in custom date range modal
 */
export function useMajorDrawsForDateRange() {
  return useQuery<MajorDrawForDateRange[]>({
    queryKey: ["admin", "major-draws", "date-range"],
    queryFn: async (): Promise<MajorDrawForDateRange[]> => {
      const response = await fetch(
        "/api/admin/major-draw/history?limit=100&sortBy=drawDate&sortOrder=desc"
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch major draws: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch major draws");
      }

      // Filter draws that have both activationDate and drawDate
      return (result.data?.draws || []).filter(
        (draw: MajorDrawForDateRange) => draw.activationDate && draw.drawDate
      );
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch current and last draw date ranges
 * Returns formatted dates as YYYY-MM-DD strings for API compatibility
 */
export function useCurrentAndLastDrawDates() {
  return useQuery<{
    currentDraw: { startDate: string; endDate: string; name: string } | null;
    lastDraw: { startDate: string; endDate: string; name: string } | null;
  }>({
    queryKey: ["admin", "major-draw", "current-and-last"],
    queryFn: async () => {
      const response = await fetch("/api/admin/major-draw/current-and-last");

      if (!response.ok) {
        throw new Error(`Failed to fetch draw dates: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch draw dates");
      }

      const { currentDraw, lastDraw } = result.data;

      // Format dates and handle null cases
      return {
        currentDraw: currentDraw?.activationDate && currentDraw?.drawDate
          ? {
              startDate: currentDraw.activationDate,
              endDate: currentDraw.drawDate,
              name: currentDraw.name,
            }
          : null,
        lastDraw: lastDraw?.activationDate && lastDraw?.drawDate
          ? {
              startDate: lastDraw.activationDate,
              endDate: lastDraw.drawDate,
              name: lastDraw.name,
            }
          : null,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch projected income for next month
 * Based on active subscriptions with auto-renewal enabled
 */
export function useProjectedIncome() {
  return useQuery<ProjectedIncomeData>({
    queryKey: ["admin", "projected-income"],
    queryFn: async (): Promise<ProjectedIncomeData> => {
      const response = await fetch("/api/admin/dashboard/projected-income");

      if (!response.ok) {
        throw new Error("Failed to fetch projected income");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch projected income");
      }

      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    retry: 2,
  });
}

export function useMembershipByPackage(
  dateRange: "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw" = "today",
  startDate?: string,
  endDate?: string
) {
  return useQuery<MembershipByPackageData>({
    queryKey: ["admin", "membership-by-package", dateRange, startDate, endDate],
    queryFn: async (): Promise<MembershipByPackageData> => {
      const params = new URLSearchParams();
      params.set("dateRange", dateRange);
      if (
        (dateRange === "custom" || dateRange === "current-draw" || dateRange === "last-draw") &&
        startDate &&
        endDate
      ) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }

      const response = await fetch(`/api/admin/dashboard/membership-by-package?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch membership by package");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch membership by package");
      }

      return {
        ...result.data,
        ...(result.meta ? { meta: result.meta } : {}),
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch upcoming subscription renewals (DB-first, paginated)
 */
export function useUpcomingRenewals(
  range: UpcomingRenewalsRange = 7,
  page: number = 1,
  limit: number = 50,
  enabled: boolean = true
) {
  return useQuery<UpcomingRenewalsData>({
    queryKey: ["admin", "upcoming-renewals", range, page, limit],
    enabled,
    queryFn: async (): Promise<UpcomingRenewalsData> => {
      const params = new URLSearchParams({ range: String(range), page: String(page), limit: String(limit) });
      const response = await fetch(`/api/admin/dashboard/upcoming-renewals?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch upcoming renewals");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch upcoming renewals");
      }

      return result.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Hook to fetch detailed revenue data for a specific category
 * @param category - Revenue category to fetch details for
 * @param dateRange - Date range filter
 * @param startDate - Start date for custom range (ISO string)
 * @param endDate - End date for custom range (ISO string)
 * @param page - Page number (default: 1)
 * @param limit - Items per page (default: 50)
 */
export function useRevenueDetails(
  category: RevenueCategory | null,
  dateRange: "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw" = "today",
  startDate?: string,
  endDate?: string,
  page: number = 1,
  limit: number = 50
) {
  return useQuery<RevenueDetailResponse["data"]>({
    queryKey: ["admin", "dashboard", "revenue-details", category, dateRange, startDate, endDate, page, limit],
    queryFn: async (): Promise<RevenueDetailResponse["data"]> => {
      if (!category) {
        throw new Error("Category is required");
      }

      const params = new URLSearchParams({
        category,
        dateRange,
        page: page.toString(),
        limit: limit.toString(),
      });

      if ((dateRange === "custom" || dateRange === "current-draw" || dateRange === "last-draw") && startDate && endDate) {
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const response = await fetch(`/api/admin/dashboard/revenue-details?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch revenue details: ${response.statusText}`);
      }

      const result: RevenueDetailResponse = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch revenue details");
      }

      return result.data;
    },
    enabled: !!category, // Only run query if category is provided
    staleTime: 2 * 60 * 1000, // 2 minutes - revenue details can be slightly stale
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

// ========================================
// USER MANAGEMENT HOOKS
// ========================================

/**
 * Hook to fetch paginated list of users with search and filtering
 * @param filters - UserFilters (membershipPackage, subscriptionStatus, autoRenew, page, limit, search, etc.)
 * @param options - Optional { enabled } to conditionally run the query (e.g. when modal is open)
 */
export function useAdminUsers(
  filters: UserFilters = {},
  options?: { enabled?: boolean }
) {
  return useQuery<AdminUsersResponse["data"]>({
    queryKey: ["admin", "users", "list", filters],
    queryFn: async (): Promise<AdminUsersResponse["data"]> => {
      const searchParams = new URLSearchParams();
      appendUserFiltersToSearchParams(searchParams, filters);

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
    enabled: options?.enabled !== false,
    staleTime: 2 * 60 * 1000, // 2 minutes - user list can be slightly stale
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch detailed user profile
 */
export const ADMIN_USER_PAYMENT_EVENTS_PAGE_SIZE = 25;

/**
 * Paginated payment events for admin user detail Activity tab (infinite scroll).
 */
export function useAdminUserPaymentEventsInfinite(userId: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["admin", "users", userId, "payment-events", ADMIN_USER_PAYMENT_EVENTS_PAGE_SIZE],
    queryFn: async ({ pageParam }): Promise<AdminUserPaymentEventsPage> => {
      const page = typeof pageParam === "number" ? pageParam : 1;
      const response = await fetch(
        `/api/admin/users/${userId}/payment-events?page=${page}&limit=${ADMIN_USER_PAYMENT_EVENTS_PAGE_SIZE}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch payment events: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch payment events");
      }

      return result.data as AdminUserPaymentEventsPage;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: !!userId && enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
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

export type AdminUpdateUserResult = { data: AdminUserDetail; warning?: string };

/**
 * Hook to update a user's profile from the admin dashboard
 */
export function useAdminUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation<AdminUpdateUserResult, Error, { userId: string; payload: AdminUserUpdatePayload }>({
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

      return { data: result.data, warning: result.warning };
    },
    onSuccess: (_result, variables) => {
      // Refresh the detail view with the latest data
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "detail", variables.userId],
      });

      queryClient.invalidateQueries({
        queryKey: ["admin", "users", variables.userId, "payment-events"],
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

export interface AdminCancelSubscriptionResult {
  cancelledImmediately: boolean;
  subscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  endDate: string | null;
  isPastDue: boolean;
}

/**
 * Hook to cancel a user's subscription (admin only)
 */
export function useAdminCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation<
    AdminCancelSubscriptionResult,
    Error,
    { userId: string; cancelAtPeriodEnd?: boolean }
  >({
    mutationFn: async ({ userId, cancelAtPeriodEnd = true }) => {
      const response = await fetch(`/api/admin/users/${userId}/cancel-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelAtPeriodEnd }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `Failed to cancel subscription: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to cancel subscription");
      }

      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "detail", variables.userId],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin", "users", "list"],
      });
    },
    onError: (error) => {
      console.error("Admin cancel subscription failed:", error);
    },
  });
}
