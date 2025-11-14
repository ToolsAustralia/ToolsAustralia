/**
 * Membership React Query hooks
 *
 * This file contains all hooks for membership data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost, apiPut } from "@/lib/queries";
import { getOneTimePackages } from "@/data/membershipPackages";

// Types
export interface MembershipPackage {
  _id: string;
  name: string;
  type: "subscription" | "one-time";
  price: number;
  description: string;
  features: string[];
  entriesPerMonth?: number;
  totalEntries?: number;
  shopDiscountPercent?: number;
  partnerDiscountDays?: number;
  isActive: boolean;
  isPopular?: boolean;
  stripePriceId?: string;
  stripeProductId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserMembership {
  _id: string;
  userId: string;
  packageId: string;
  type: "subscription" | "one-time";
  isActive: boolean;
  startDate: string;
  endDate?: string;
  autoRenew: boolean;
  stripeSubscriptionId?: string;
  packageData: MembershipPackage;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipSubscription {
  _id: string;
  userId: string;
  packageId: string;
  isActive: boolean;
  startDate: string;
  endDate?: string;
  autoRenew: boolean;
  stripeSubscriptionId?: string;
  packageData: MembershipPackage;
  nextBillingDate?: string;
  billingCycle: "monthly" | "yearly";
  status: "active" | "cancelled" | "past_due" | "unpaid";
}

export interface OneTimeMembership {
  _id: string;
  userId: string;
  packageId: string;
  isActive: boolean;
  purchaseDate: string;
  packageData: MembershipPackage;
  totalEntries: number;
  usedEntries: number;
  remainingEntries: number;
}

export interface MembershipPurchaseData {
  packageId: string;
  paymentMethodId?: string;
  referralCode?: string;
  userId: string; // Add userId parameter
}

export interface MembershipResponse {
  success: boolean;
  data: {
    membership: UserMembership;
    paymentIntent?: {
      id: string;
      client_secret: string;
      status: string;
    };
  };
}

// Hooks
export const useMembershipPackages = () => {
  return useQuery({
    queryKey: queryKeys.memberships.packages,
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MembershipPackage[] }>("/api/memberships/packages");
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
};

export const useUserMembership = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.memberships.user(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: UserMembership | null }>("/api/memberships/user");
      return response.data;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
  });
};

export const useMembershipSubscriptions = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.memberships.subscriptions(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: MembershipSubscription[] }>(
        "/api/memberships/subscriptions"
      );
      return response.data;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
  });
};

export const useOneTimeMemberships = (userId?: string) => {
  return useQuery({
    queryKey: queryKeys.memberships.oneTime(userId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: OneTimeMembership[] }>("/api/memberships/one-time");
      return response.data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
};

// Mutations
export const usePurchaseMembership = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ packageId, paymentMethodId, referralCode }: MembershipPurchaseData) => {
      const response = await apiPost<MembershipResponse>("/api/stripe/create-one-time-purchase-existing-user", {
        packageId,
        paymentMethodId,
        referralCode,
      });
      return response;
    },
    onMutate: async ({ packageId, userId }) => {
      const actualUserId = userId;
      console.log("🔥 ONMUTATE TRIGGERED: Membership purchase starting", { packageId });

      // Cancel outgoing refetches and disable refetch intervals temporarily
      await queryClient.cancelQueries({ queryKey: queryKeys.majorDraw.current });
      await queryClient.cancelQueries({ queryKey: queryKeys.majorDraw.userStats(actualUserId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.users.account("current-user") });

      // Temporarily disable refetch intervals to prevent overriding optimistic updates
      queryClient.setQueryDefaults(queryKeys.majorDraw.current, {
        refetchInterval: false,
        refetchIntervalInBackground: false,
      });
      queryClient.setQueryDefaults(queryKeys.majorDraw.userStats(actualUserId), {
        refetchInterval: false,
        refetchIntervalInBackground: false,
      });

      // Snapshot previous values
      const previousMajorDraw = queryClient.getQueryData(queryKeys.majorDraw.current);
      const previousUserStats = queryClient.getQueryData(queryKeys.majorDraw.userStats(actualUserId));
      const previousUserAccount = queryClient.getQueryData(queryKeys.users.account("current-user"));

      // Get the package data to calculate optimistic updates
      // Use static data since membership packages are not loaded in React Query cache
      const packages = getOneTimePackages();
      const selectedPackage = packages?.find((pkg) => pkg._id === packageId);
      console.log("🔍 DEBUG: Membership packages from static data:", packages);
      console.log("🔍 DEBUG: Looking for packageId:", packageId);
      console.log("🔍 DEBUG: Selected package found:", selectedPackage);

      if (selectedPackage) {
        // Get active promo from React Query cache
        const activePromos = queryClient.getQueryData<
          Array<{ type: string; multiplier: number; isActive: boolean; isExpired: boolean }>
        >(["promos", "active"]);
        const oneTimePromo = activePromos?.find((p) => p.type === "one-time-packages" && p.isActive && !p.isExpired);
        const promoMultiplier = oneTimePromo?.multiplier || 1;

        // Calculate entry count with promo applied
        const baseEntries = selectedPackage.totalEntries || 0;
        const entryCount = baseEntries * promoMultiplier;

        console.log(`🚀 OPTIMISTIC UPDATE: Adding ${entryCount} entries to major draw`, {
          baseEntries,
          promoMultiplier,
          hasPromo: !!oneTimePromo,
          finalEntries: entryCount,
        });

        // Optimistically update major draw data (useCurrentMajorDraw expects MajorDraw object)
        queryClient.setQueryData(queryKeys.majorDraw.current, (old: unknown) => {
          if (!old || typeof old !== "object") {
            console.log("❌ No existing major draw data for optimistic update");
            return old;
          }
          const oldData = old as Record<string, unknown>;

          // useCurrentMajorDraw expects a MajorDraw object, not the full API response
          const newData = {
            ...oldData,
            totalEntries: ((oldData.totalEntries as number) || 0) + entryCount,
            isProcessing: true, // Add processing flag
          };

          console.log(`✅ OPTIMISTIC UPDATE: Updated major draw data:`, {
            oldTotalEntries: oldData.totalEntries,
            newTotalEntries: newData.totalEntries,
            entryCount,
            isProcessing: true,
          });

          return newData;
        });

        // Optimistically update user stats
        console.log(
          "🔍 OPTIMISTIC UPDATE: Updating user stats with query key:",
          queryKeys.majorDraw.userStats(actualUserId)
        );
        queryClient.setQueryData(queryKeys.majorDraw.userStats(actualUserId), (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as Record<string, unknown>;
          const newData = {
            ...oldData,
            totalEntries: ((oldData.totalEntries as number) || 0) + entryCount,
            currentDrawEntries: ((oldData.currentDrawEntries as number) || 0) + entryCount,
            membershipEntries: ((oldData.membershipEntries as number) || 0) + entryCount,
            isProcessing: true,
            pendingEntries: entryCount,
          };
          console.log(`✅ OPTIMISTIC UPDATE: Updated user stats:`, {
            oldTotalEntries: oldData.totalEntries,
            newTotalEntries: newData.totalEntries,
            entryCount,
          });
          return newData;
        });

        // Optimistically update user account data
        queryClient.setQueryData(queryKeys.users.account("current-user"), (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const oldData = old as Record<string, unknown>;
          const oldUser = oldData.user as Record<string, unknown>;
          const newData = {
            ...oldData,
            user: {
              ...oldUser,
              accumulatedEntries: ((oldUser.accumulatedEntries as number) || 0) + entryCount,
              entryWallet: ((oldUser.entryWallet as number) || 0) + entryCount,
              isProcessing: true,
            },
          };
          console.log(`✅ OPTIMISTIC UPDATE: Updated user account:`, {
            oldAccumulatedEntries: oldUser.accumulatedEntries,
            newAccumulatedEntries: newData.user.accumulatedEntries,
            entryCount,
          });
          return newData;
        });
      }

      return { previousMajorDraw, previousUserStats, previousUserAccount, actualUserId };
    },
    onSuccess: (data, variables, context) => {
      console.log(`🎉 PAYMENT SUCCESS: Membership purchase completed`);

      // Get the actual user ID from context
      const actualUserId = context?.actualUserId || "current-user";

      // Clear processing flags immediately
      queryClient.setQueryData(queryKeys.majorDraw.current, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldData = old as Record<string, unknown>;
        return {
          ...oldData,
          isProcessing: false,
        };
      });

      queryClient.setQueryData(queryKeys.majorDraw.userStats(actualUserId), (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldData = old as Record<string, unknown>;
        return {
          ...oldData,
          isProcessing: false,
          pendingEntries: 0,
        };
      });

      queryClient.setQueryData(queryKeys.users.account("current-user"), (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldData = old as Record<string, unknown>;
        return {
          ...oldData,
          user: {
            ...(oldData.user as Record<string, unknown>),
            isProcessing: false,
          },
        };
      });

      // Re-enable refetch intervals after successful payment
      queryClient.setQueryDefaults(queryKeys.majorDraw.current, {
        refetchInterval: 2 * 60 * 1000, // 2 minutes
        refetchIntervalInBackground: true,
      });
      queryClient.setQueryDefaults(queryKeys.majorDraw.userStats("current-user"), {
        refetchInterval: 1 * 60 * 1000, // 1 minute
        refetchIntervalInBackground: true,
      });

      // HYBRID APPROACH: Set up webhook validation
      setTimeout(async () => {
        console.log(`🔄 HYBRID VALIDATION: Checking server data after 3 seconds`);
        try {
          // Fetch fresh data from server to validate optimistic updates
          const [majorDrawResponse, userStatsResponse] = await Promise.all([
            fetch("/api/major-draw").then((res) => res.json()),
            fetch(`/api/users/${actualUserId}/my-account`).then((res) => res.json()),
          ]);

          // Update cache with server data if different
          if (majorDrawResponse.success) {
            queryClient.setQueryData(queryKeys.majorDraw.current, majorDrawResponse.data.majorDraw);
            console.log(`✅ HYBRID VALIDATION: Major draw data synced with server`);
          }

          if (userStatsResponse.success) {
            queryClient.setQueryData(queryKeys.users.account("current-user"), userStatsResponse.data);
            console.log(`✅ HYBRID VALIDATION: User account data synced with server`);
          }
        } catch (error) {
          console.error(`❌ HYBRID VALIDATION: Failed to sync with server:`, error);
        }
      }, 3000); // 3 seconds delay to allow webhook to complete

      // Invalidate membership-related queries to sync with server
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.packages });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.current });
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(actualUserId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current-user") });

      // Update user data cache if available
      queryClient.setQueryData(queryKeys.memberships.user("current-user"), data.data.membership);
    },
    onError: (error, variables, context) => {
      console.error("Failed to purchase membership:", error);

      // Get the actual user ID from context
      const actualUserId = context?.actualUserId || "current-user";

      // Re-enable refetch intervals on error
      queryClient.setQueryDefaults(queryKeys.majorDraw.current, {
        refetchInterval: 2 * 60 * 1000, // 2 minutes
        refetchIntervalInBackground: true,
      });
      queryClient.setQueryDefaults(queryKeys.majorDraw.userStats(actualUserId), {
        refetchInterval: 1 * 60 * 1000, // 1 minute
        refetchIntervalInBackground: true,
      });

      // Rollback optimistic updates
      if (context?.previousMajorDraw) {
        queryClient.setQueryData(queryKeys.majorDraw.current, context.previousMajorDraw);
      }
      if (context?.previousUserStats) {
        queryClient.setQueryData(queryKeys.majorDraw.userStats(actualUserId), context.previousUserStats);
      }
      if (context?.previousUserAccount) {
        queryClient.setQueryData(queryKeys.users.account("current-user"), context.previousUserAccount);
      }
    },
  });
};

export const useCancelSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const response = await apiPost<{ success: boolean; data: MembershipSubscription }>(
        `/api/memberships/subscriptions/${subscriptionId}/cancel`,
        {}
      );
      return response.data;
    },
    onSuccess: (data) => {
      // Update subscription in cache
      queryClient.setQueryData(
        queryKeys.memberships.subscriptions("current-user"),
        (old: MembershipSubscription[] = []) => {
          return old.map((sub) => (sub._id === data._id ? data : sub));
        }
      );

      // Invalidate user membership
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.user("current-user") });
    },
  });
};

export const useReactivateSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const response = await apiPost<{ success: boolean; data: MembershipSubscription }>(
        `/api/memberships/subscriptions/${subscriptionId}/reactivate`,
        {}
      );
      return response.data;
    },
    onSuccess: (data) => {
      // Update subscription in cache
      queryClient.setQueryData(
        queryKeys.memberships.subscriptions("current-user"),
        (old: MembershipSubscription[] = []) => {
          return old.map((sub) => (sub._id === data._id ? data : sub));
        }
      );

      // Invalidate user membership
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.user("current-user") });
    },
  });
};

export const useUpdateSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ subscriptionId, packageId }: { subscriptionId: string; packageId: string }) => {
      const response = await apiPut<{ success: boolean; data: MembershipSubscription }>(
        `/api/memberships/subscriptions/${subscriptionId}`,
        {
          packageId,
        }
      );
      return response.data;
    },
    onSuccess: (data) => {
      // Update subscription in cache
      queryClient.setQueryData(
        queryKeys.memberships.subscriptions("current-user"),
        (old: MembershipSubscription[] = []) => {
          return old.map((sub) => (sub._id === data._id ? data : sub));
        }
      );

      // Invalidate user membership
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.user("current-user") });
    },
  });
};

// Utility hooks
export const useMembershipStatus = (userId?: string) => {
  const { data: userMembership } = useUserMembership(userId);
  const { data: subscriptions } = useMembershipSubscriptions(userId);
  const { data: oneTimeMemberships } = useOneTimeMemberships(userId);

  const hasActiveSubscription = subscriptions?.some((sub) => sub.isActive && sub.status === "active") || false;
  const hasActiveOneTime = oneTimeMemberships?.some((membership) => membership.isActive) || false;

  return {
    hasActiveMembership: hasActiveSubscription || hasActiveOneTime,
    hasActiveSubscription,
    hasActiveOneTime,
    currentMembership: userMembership,
    activeSubscriptions: subscriptions?.filter((sub) => sub.isActive) || [],
    activeOneTimeMemberships: oneTimeMemberships?.filter((membership) => membership.isActive) || [],
    membershipTier: userMembership?.packageData?.name || "None",
    totalEntries: oneTimeMemberships?.reduce((sum, membership) => sum + membership.remainingEntries, 0) || 0,
  };
};

export const useMembershipPrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchMembershipPackages = () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.memberships.packages,
      queryFn: async () => {
        const response = await apiGet<{ success: boolean; data: MembershipPackage[] }>("/api/memberships/packages");
        return response.data;
      },
      staleTime: 30 * 60 * 1000,
    });
  };

  const prefetchUserMembership = (userId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.memberships.user(userId),
      queryFn: async () => {
        const response = await apiGet<{ success: boolean; data: UserMembership | null }>("/api/memberships/user");
        return response.data;
      },
      staleTime: 2 * 60 * 1000,
    });
  };

  return { prefetchMembershipPackages, prefetchUserMembership };
};
