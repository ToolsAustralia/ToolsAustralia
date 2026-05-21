/**
 * Membership React Query hooks
 *
 * This file contains all hooks for membership data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost, apiPut } from "@/lib/queries";
import { useAttribution } from "@/hooks/useAttribution";
import { freezeRefetchIntervals } from "@/lib/purchaseCooldown";
import { usePurchaseInvalidation } from "@/hooks/usePurchaseInvalidation";
import {
  armDashboardEntryHoldFromUserStatsCache,
  clearDashboardEntryHold,
} from "@/utils/dashboard-entry-hold";

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
  /** One per user checkout action; sent to Stripe for PaymentIntent idempotency (retries / duplicate requests). */
  idempotencyKey?: string;
  referralCode?: string;
  affiliateCode?: string;
  promoLinkCode?: string;
  campaignCode?: string;
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
  const attribution = useAttribution();
  const invalidatePurchaseCaches = usePurchaseInvalidation();

  return useMutation({
    mutationFn: async ({
      packageId,
      paymentMethodId,
      idempotencyKey,
      referralCode,
      affiliateCode,
      promoLinkCode,
      campaignCode,
    }: MembershipPurchaseData) => {
      const response = await apiPost<MembershipResponse>("/api/stripe/create-one-time-purchase-existing-user", {
        packageId,
        paymentMethodId,
        idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
        referralCode,
        affiliateCode,
        promoLinkCode,
        campaignCode,
        ...(attribution && { attribution }),
      });
      return response;
    },
    onMutate: async ({ packageId, userId }) => {
      const actualUserId = userId;

      await queryClient.cancelQueries({ queryKey: queryKeys.majorDraw.current });
      await queryClient.cancelQueries({ queryKey: queryKeys.majorDraw.userStats(actualUserId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.users.account(actualUserId) });

      // 10s rather than 5s: the async webhook worker writes accumulatedEntries
      // ~5–15s after Stripe delivery. A 5s freeze releases background polls
      // before benefits land, letting a stale fetch overwrite the optimistic
      // cache. 10s bridges the typical worker window.
      freezeRefetchIntervals(queryClient, actualUserId, 10000);

      const previousMajorDraw = queryClient.getQueryData(queryKeys.majorDraw.current);
      const previousUserStats = queryClient.getQueryData(queryKeys.majorDraw.userStats(actualUserId));
      const previousUserAccount = queryClient.getQueryData(queryKeys.users.account(actualUserId));

      armDashboardEntryHoldFromUserStatsCache(previousUserStats);

      return { previousMajorDraw, previousUserStats, previousUserAccount, actualUserId };
    },
    onSuccess: (data, variables, context) => {
      const actualUserId = context?.actualUserId ?? variables.userId;

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

      queryClient.setQueryData(queryKeys.users.account(actualUserId), (old: unknown) => {
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

      // Two-pass refetch: 3s catches fast worker completions (typical ~5s),
      // 8s catches the slower tail (P99 ~12–15s). If the immediate
      // invalidatePurchaseCaches below races the worker and writes stale data
      // into the cache, the 8s pass overwrites it with the correct
      // webhook-written state.
      const syncFromServer = async (label: string) => {
        try {
          const [majorDrawResponse, userStatsResponse] = await Promise.all([
            fetch("/api/major-draw").then((res) => res.json()),
            fetch(`/api/users/${actualUserId}/my-account`).then((res) => res.json()),
          ]);

          if (majorDrawResponse.success) {
            queryClient.setQueryData(queryKeys.majorDraw.current, majorDrawResponse.data.majorDraw);
          }

          if (userStatsResponse.success) {
            queryClient.setQueryData(queryKeys.users.account(actualUserId), userStatsResponse.data);
          }
        } catch (error) {
          console.error(`❌ HYBRID VALIDATION (${label}): Failed to sync with server:`, error);
        }
      };
      setTimeout(() => void syncFromServer("3s"), 3000);
      setTimeout(() => void syncFromServer("8s"), 8000);

      invalidatePurchaseCaches(actualUserId);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.setQueryData(queryKeys.memberships.user(actualUserId), data.data.membership);
    },
    onError: (error, variables, context) => {
      console.error("Failed to purchase membership:", error);
      clearDashboardEntryHold();

      const actualUserId = context?.actualUserId ?? variables.userId;

      if (context?.previousMajorDraw !== undefined) {
        queryClient.setQueryData(queryKeys.majorDraw.current, context.previousMajorDraw);
      }
      if (context?.previousUserStats !== undefined) {
        queryClient.setQueryData(queryKeys.majorDraw.userStats(actualUserId), context.previousUserStats);
      }
      if (context?.previousUserAccount !== undefined) {
        queryClient.setQueryData(queryKeys.users.account(actualUserId), context.previousUserAccount);
      }
    },
  });
};

export const useCancelSubscription = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const response = await apiPost<{ success: boolean; data: MembershipSubscription }>(
        `/api/memberships/subscriptions/${subscriptionId}/cancel`,
        {}
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (!userId) return;
      queryClient.setQueryData(
        queryKeys.memberships.subscriptions(userId),
        (old: MembershipSubscription[] = []) => {
          return old.map((sub) => (sub._id === data._id ? data : sub));
        }
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.user(userId) });
    },
  });
};

export const useReactivateSubscription = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const response = await apiPost<{ success: boolean; data: MembershipSubscription }>(
        `/api/memberships/subscriptions/${subscriptionId}/reactivate`,
        {}
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (!userId) return;
      queryClient.setQueryData(
        queryKeys.memberships.subscriptions(userId),
        (old: MembershipSubscription[] = []) => {
          return old.map((sub) => (sub._id === data._id ? data : sub));
        }
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.user(userId) });
    },
  });
};

export const useUpdateSubscription = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

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
      if (!userId) return;
      queryClient.setQueryData(
        queryKeys.memberships.subscriptions(userId),
        (old: MembershipSubscription[] = []) => {
          return old.map((sub) => (sub._id === data._id ? data : sub));
        }
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.user(userId) });
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
