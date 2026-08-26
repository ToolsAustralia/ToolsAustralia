/**
 * User-related React Query hooks
 *
 * This file contains all hooks for user data fetching and mutations.
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPut, apiPost } from "@/lib/queries";

// Types
export interface UserData {
  /** Optional profile field. Unset = unknown; see src/data/genders.ts. */
  gender?: string;
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  mobile?: string;
  state?: string;
  profession?: string;
  birthdate?: string; // ISO date string
  profileSetupCompleted?: boolean;
  /**
   * Delivery address from the customer's last COMPLETED shop order, used to prefill
   * checkout. Written only by finalizeShopOrder on a paid order.
   *
   * Distinct from `state` above, which is draw eligibility, not a postal address.
   */
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    deliveryInstructions?: string;
  };
  subscription?: {
    packageId: string;
    isActive: boolean;
    startDate: string;
    endDate?: string;
    autoRenew: boolean;
    status?: string; // Stripe status: active, past_due, unpaid, cancelled, etc.
  };
  oneTimePackages: Array<{
    packageId: string;
    isActive: boolean;
    purchaseDate: string;
  }>;
  subscriptionPackageData?: {
    _id: string;
    name: string;
    type: "subscription" | "one-time";
    price: number;
    description: string;
    features: string[];
    entriesPerMonth?: number;
    shopDiscountPercent?: number;
    partnerDiscountDays?: number;
    isActive: boolean;
  };
  enrichedOneTimePackages?: Array<{
    packageId: string;
    isActive: boolean;
    purchaseDate: string;
    packageData: {
      _id: string;
      name: string;
      type: "subscription" | "one-time";
      price: number;
      description: string;
      features: string[];
      totalEntries?: number;
      shopDiscountPercent?: number;
      partnerDiscountDays?: number;
      isActive: boolean;
    };
  }>;
  entryWallet: number;
  rewardsPoints: number;
  accumulatedEntries: number;
  isEmailVerified: boolean;
  hasPassword?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  savedPaymentMethods?: Array<{
    paymentMethodId: string;
    isDefault: boolean;
    createdAt: string;
  }>;
}

export interface MyAccountData {
  user: UserData;
  // Mirrors MY_ACCOUNT_MINI_DRAW_FIELDS — no `endDate` (phantom MiniDraw field; the model
  // has no such path). Keep in lockstep with src/utils/dashboard/my-account-projection.ts.
  activeMiniDraws: Array<{
    _id: string;
    name: string;
    description: string;
    prize: {
      name: string;
      description: string;
      value: number;
      images: string[];
    };
    isActive: boolean;
  }>;
  // Mirrors MY_ACCOUNT_ORDER_FIELDS — no `items` (phantom Order field; line items live under
  // `products`/`tickets`). Keep in lockstep with src/utils/dashboard/my-account-projection.ts.
  recentOrders: Array<{
    _id: string;
    orderNumber: string;
    totalAmount: number;
    status: string;
    createdAt: string;
  }>;
  insights: {
    // NOTE: totalSpent sums `totalAmount` over the 10 most recent orders regardless of status
    // (includes cancelled/pending) and is capped at 10 — it is NOT true lifetime spend.
    totalSpent: number;
    activeDrawsCount: number;
    memberSince: number;
    membershipTier: string;
  };
}

export interface UpdateUserProfileData {
  firstName?: string;
  lastName?: string;
  mobile?: string;
  state?: string;
  profession?: string;
  birthdate?: string;
  profileSetupCompleted?: boolean;
}

// Hooks
export const useUserData = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.users.detail(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: UserData }>(`/api/users/${userId}`);
      return response.data;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });
};

export const useMyAccountData = (userId?: string, options?: { poll?: boolean }) => {
  return useQuery({
    queryKey: queryKeys.users.account(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MyAccountData }>(`/api/users/${userId}/my-account`);
      return response.data;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes - reuse cache across my-account pages
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
    // Polling is OPT-IN (page-scoped): only the UserProvider passes { poll: true },
    // and only while the member is on /my-account. Every other caller shares the
    // cache key and receives the polled data without its own interval.
    refetchInterval: options?.poll ? 2 * 60 * 1000 : false,
    refetchIntervalInBackground: false, // Pause polling on hidden tabs; user-visible refetch resumes when tab is focused (refetchOnWindowFocus is false here, but refetchInterval ticks resume)
    refetchOnWindowFocus: false, // Avoid refetch on every tab switch when data is fresh
    refetchOnMount: true, // Refetch on mount only when data is stale
  });
};

export const useUserDashboard = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.users.dashboard(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: unknown }>(`/api/users/${userId}/dashboard`);
      return response.data;
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 minutes
  });
};

// Mutations
export const useUpdateUserProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: UpdateUserProfileData }) => {
      const response = await apiPut<{ success: boolean; data: UserData }>(`/api/users/${userId}`, data);
      return response.data;
    },
    onMutate: async ({ userId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.detail(userId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.users.account(userId) });

      const previousDetail = queryClient.getQueryData<UserData>(queryKeys.users.detail(userId));
      const previousAccount = queryClient.getQueryData<MyAccountData>(queryKeys.users.account(userId));

      queryClient.setQueryData(queryKeys.users.detail(userId), (old: UserData | undefined) =>
        old ? { ...old, ...data } : old
      );
      queryClient.setQueryData(queryKeys.users.account(userId), (old: MyAccountData | undefined) =>
        old ? { ...old, user: { ...old.user, ...data } } : old
      );

      return { previousDetail, previousAccount };
    },
    onError: (error, variables, context) => {
      console.error("Failed to update user profile:", error);
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.users.detail(variables.userId), context.previousDetail);
      }
      if (context?.previousAccount) {
        queryClient.setQueryData(queryKeys.users.account(variables.userId), context.previousAccount);
      }
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKeys.users.detail(variables.userId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(variables.userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.dashboard(variables.userId) });
    },
  });
};

export const useUpdateUserPreferences = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, preferences }: { userId: string; preferences: unknown }) => {
      const response = await apiPut<{ success: boolean; data: UserData }>(
        `/api/users/${userId}/preferences`,
        preferences
      );
      return response.data;
    },
    onMutate: async ({ userId, preferences }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.detail(userId) });
      const previousDetail = queryClient.getQueryData<UserData>(queryKeys.users.detail(userId));
      const patch = preferences as Partial<UserData>;

      queryClient.setQueryData(queryKeys.users.detail(userId), (old: UserData | undefined) =>
        old ? { ...old, ...patch } : old
      );

      return { previousDetail };
    },
    onError: (_error, variables, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.users.detail(variables.userId), context.previousDetail);
      }
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKeys.users.detail(variables.userId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(variables.userId) });
    },
  });
};

export const useCompleteUserSetup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ setupData }: { userId: string; setupData: unknown }) => {
      const response = await apiPost<{ success: boolean; data: UserData }>(`/api/user/setup`, setupData);
      return response.data;
    },
    onMutate: async ({ userId, setupData }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.detail(userId) });
      const previousDetail = queryClient.getQueryData<UserData>(queryKeys.users.detail(userId));
      const patch = setupData as Partial<UserData>;

      queryClient.setQueryData(queryKeys.users.detail(userId), (old: UserData | undefined) =>
        old ? { ...old, ...patch } : old
      );

      return { previousDetail };
    },
    onError: (_error, variables, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.users.detail(variables.userId), context.previousDetail);
      }
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKeys.users.detail(variables.userId), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
};

// Utility hooks
export const useUserMembership = (userId?: string) => {
  const { data: userData } = useUserData(userId);

  // Stable reference: consumed by the memoized UserContext value — a fresh object
  // per render would defeat that memo and re-render every context consumer.
  return useMemo(
    () => ({
      hasActiveSubscription: userData?.subscription?.isActive || false,
      hasActiveOneTimePackages: userData?.oneTimePackages?.some((pkg) => pkg.isActive) || false,
      membershipTier: userData?.subscriptionPackageData?.name || "None",
      entryWallet: userData?.entryWallet || 0,
      rewardsPoints: userData?.rewardsPoints || 0,
      accumulatedEntries: userData?.accumulatedEntries || 0,
    }),
    [userData]
  );
};

export const useUserStats = (userId?: string) => {
  const { data: accountData } = useMyAccountData(userId);

  // Stable reference: consumed by the memoized UserContext value (see above).
  return useMemo(
    () => ({
      totalSpent: accountData?.insights?.totalSpent || 0,
      activeDrawsCount: accountData?.activeMiniDraws?.length || 0,
      recentOrdersCount: accountData?.recentOrders?.length || 0,
      memberSince: accountData?.insights?.memberSince || 0,
      membershipTier: accountData?.insights?.membershipTier || "None",
    }),
    [accountData]
  );
};
