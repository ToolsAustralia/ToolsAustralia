/**
 * User-related React Query hooks
 *
 * This file contains all hooks for user data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPut, apiPost } from "@/lib/queries";

// Types
export interface UserData {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  mobile?: string;
  state?: string;
  profileSetupCompleted?: boolean;
  subscription?: {
    packageId: string;
    isActive: boolean;
    startDate: string;
    endDate?: string;
    autoRenew: boolean;
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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  savedPaymentMethods?: Array<{
    paymentMethodId: string;
    isDefault: boolean;
    createdAt: string;
  }>;
}

export interface MyAccountData {
  user: UserData;
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
    endDate: string;
    isActive: boolean;
  }>;
  recentOrders: Array<{
    _id: string;
    orderNumber: string;
    totalAmount: number;
    status: string;
    createdAt: string;
    items: Array<{
      productId: string;
      quantity: number;
      price: number;
    }>;
  }>;
  insights: {
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

export const useMyAccountData = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.users.account(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MyAccountData }>(`/api/users/${userId}/my-account`);
      return response.data;
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds - reduced for more real-time updates
    gcTime: 3 * 60 * 1000, // 3 minutes - reduced for fresher data
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 minutes for real-time updates
    refetchIntervalInBackground: true, // Allow refetch in background
    refetchOnWindowFocus: true,
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
    onSuccess: (data, variables) => {
      // Update user data in cache
      queryClient.setQueryData(queryKeys.users.detail(variables.userId), data);

      // Invalidate related queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(variables.userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.dashboard(variables.userId) });
    },
    onError: (error) => {
      console.error("Failed to update user profile:", error);
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
    onSuccess: (data, variables) => {
      // Update user data in cache
      queryClient.setQueryData(queryKeys.users.detail(variables.userId), data);
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
    onSuccess: (data, variables) => {
      // Update user data in cache
      queryClient.setQueryData(queryKeys.users.detail(variables.userId), data);

      // Invalidate all user-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
};

// Utility hooks
export const useUserMembership = (userId?: string) => {
  const { data: userData } = useUserData(userId);

  return {
    hasActiveSubscription: userData?.subscription?.isActive || false,
    hasActiveOneTimePackages: userData?.oneTimePackages?.some((pkg) => pkg.isActive) || false,
    membershipTier: userData?.subscriptionPackageData?.name || "None",
    entryWallet: userData?.entryWallet || 0,
    rewardsPoints: userData?.rewardsPoints || 0,
    accumulatedEntries: userData?.accumulatedEntries || 0,
  };
};

export const useUserStats = (userId?: string) => {
  const { data: accountData } = useMyAccountData(userId);

  return {
    totalSpent: accountData?.insights?.totalSpent || 0,
    activeDrawsCount: accountData?.activeMiniDraws?.length || 0,
    recentOrdersCount: accountData?.recentOrders?.length || 0,
    memberSince: accountData?.insights?.memberSince || 0,
    membershipTier: accountData?.insights?.membershipTier || "None",
  };
};
