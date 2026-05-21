/**
 * Upsell React Query hooks
 *
 * This file contains all hooks for upsell data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost } from "@/lib/queries";
import { useAttribution } from "@/hooks/useAttribution";
import { freezeRefetchIntervals } from "@/lib/purchaseCooldown";
import { usePurchaseInvalidation } from "@/hooks/usePurchaseInvalidation";
import {
  armDashboardEntryHoldFromUserStatsCache,
  clearDashboardEntryHold,
} from "@/utils/dashboard-entry-hold";

// Types
export interface UpsellOffer {
  _id: string;
  name: string;
  description: string;
  type: "membership" | "product" | "mini-draw";
  targetAudience: "all" | "non-members" | "members" | "specific-membership";
  triggerEvent: "cart-abandonment" | "checkout-complete" | "membership-expired" | "product-view" | "mini-draw-entry";
  conditions: {
    minCartValue?: number;
    maxCartValue?: number;
    membershipTypes?: string[];
    productCategories?: string[];
    timeDelay?: number; // in minutes
  };
  offer: {
    title: string;
    description: string;
    discountType: "percentage" | "fixed" | "free-shipping";
    discountValue: number;
    validFor: number; // in days
    maxUses?: number;
    maxUsesPerUser?: number;
  };
  presentation: {
    modalType: "popup" | "slide-in" | "banner";
    position: "center" | "top" | "bottom" | "right" | "left";
    showCloseButton: boolean;
    allowDismiss: boolean;
    autoShow: boolean;
    delay: number; // in seconds
  };
  tracking: {
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
  };
  isActive: boolean;
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsellAnalytics {
  totalOffers: number;
  activeOffers: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  averageConversionRate: number;
  topPerformingOffers: Array<{
    offerId: string;
    name: string;
    impressions: number;
    conversions: number;
    conversionRate: number;
    revenue: number;
  }>;
  performanceByType: Record<
    string,
    {
      impressions: number;
      conversions: number;
      conversionRate: number;
      revenue: number;
    }
  >;
  dailyPerformance: Array<{
    date: string;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
  }>;
}

export interface UpsellTrackingData {
  offerId: string;
  userId?: string;
  sessionId: string;
  event: "impression" | "click" | "conversion" | "dismiss";
  metadata?: Record<string, unknown>;
}

export interface UpsellOfferParams extends Record<string, unknown> {
  userId?: string;
  cartValue?: number;
  membershipType?: string;
  productCategory?: string;
  triggerEvent?: string;
}

// Hooks
export const useUpsellOffers = (params: UpsellOfferParams = {}) => {
  return useQuery({
    queryKey: queryKeys.upsell.offers(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();

      // Add params to query string
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });

      const response = await apiGet<{ success: boolean; data: UpsellOffer[] }>(
        `/api/upsell/offers?${queryParams.toString()}`
      );
      return response.data;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on focus for upsells
  });
};

export const useUpsellAnalytics = (params: UpsellOfferParams = {}) => {
  return useQuery({
    queryKey: queryKeys.upsell.analytics(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();

      // Add params to query string
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });

      const response = await apiGet<{ success: boolean; data: UpsellAnalytics }>(
        `/api/upsell/analytics?${queryParams.toString()}`
      );
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
};

export const useUpsellTracking = (offerId?: string) => {
  return useQuery({
    queryKey: queryKeys.upsell.tracking(offerId!),
    queryFn: async () => {
      const response = await apiGet<{ success: boolean; data: UpsellTrackingData[] }>(
        `/api/upsell/tracking/${offerId}`
      );
      return response.data;
    },
    enabled: !!offerId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  });
};

// Mutations
export const useTrackUpsellEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trackingData: UpsellTrackingData) => {
      const response = await apiPost<{ success: boolean; data: UpsellTrackingData }>("/api/upsell/track", trackingData);
      return response.data;
    },
    onSuccess: (data) => {
      // Update tracking data in cache
      queryClient.setQueryData(queryKeys.upsell.tracking(data.offerId), (old: UpsellTrackingData[] = []) => {
        return [...old, data];
      });

      // Invalidate analytics to reflect new data
      queryClient.invalidateQueries({ queryKey: queryKeys.upsell.analytics({}) });
    },
    retry: 1, // Don't retry tracking calls too much
  });
};

export const usePurchaseUpsell = () => {
  const queryClient = useQueryClient();
  const attribution = useAttribution();
  const invalidatePurchaseCaches = usePurchaseInvalidation();

  return useMutation({
    mutationFn: async ({
      offerId,
      useDefaultPayment,
      paymentMethodId,
      idempotencyKey,
      originalPurchaseContext,
    }: {
      offerId: string;
      useDefaultPayment: boolean;
      paymentMethodId?: string;
      idempotencyKey?: string;
      userId: string;
      originalPurchaseContext?: {
        paymentIntentId?: string;
        packageId?: string;
        packageName?: string;
        packageType?: "membership" | "one-time" | "mini-draw";
        price?: number;
        entries?: number;
        baseEntries?: number;
        promoMultiplier?: number; // ✅ CRITICAL: Store multiplier from original purchase for correct upsell calculation
        miniDrawId?: string;
        miniDrawName?: string;
      };
    }) => {
      const response = await apiPost<{
        success: boolean;
        message: string;
        data: {
          entriesAdded: number;
          packageName: string;
          source: string;
          paymentIntentId: string;
          processingStatus: string;
        };
      }>("/api/upsell/purchase", {
        offerId,
        useDefaultPayment,
        paymentMethodId,
        idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
        ...(originalPurchaseContext && { originalPurchaseContext }),
        ...(attribution && { attribution }),
      });
      return response;
    },
    onMutate: async ({ userId }) => {
      const actualUserId = userId;

      await queryClient.cancelQueries({ queryKey: queryKeys.majorDraw.current });
      await queryClient.cancelQueries({ queryKey: queryKeys.majorDraw.userStats(actualUserId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.users.account(actualUserId) });

      // 10s rather than 5s: the async webhook worker writes accumulatedEntries
      // ~5–15s after Stripe delivery. See useMembershipQueries for full rationale.
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

      // Two-pass refetch (3s + 8s) — see useMembershipQueries for rationale.
      // Catches both fast worker completions and the slower P99 tail.
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
    },
    onError: (error, variables, context) => {
      console.error("Failed to purchase upsell:", error);
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

export const useAcceptUpsellOffer = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  return useMutation({
    mutationFn: async ({
      offerId,
      userId,
      metadata,
    }: {
      offerId: string;
      userId?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const response = await apiPost<{ success: boolean; data: unknown }>("/api/upsell/accept", {
        offerId,
        userId,
        metadata,
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Track the conversion
      queryClient.invalidateQueries({ queryKey: queryKeys.upsell.tracking(variables.offerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.upsell.analytics({}) });

      // Invalidate user-related queries since they might have changed
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.packages });
      if (userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.cart.all(userId) });
      }
    },
  });
};

export const useDismissUpsellOffer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ offerId, userId, reason }: { offerId: string; userId?: string; reason?: string }) => {
      const response = await apiPost<{ success: boolean; data: unknown }>("/api/upsell/dismiss", {
        offerId,
        userId,
        reason,
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Track the dismissal
      queryClient.invalidateQueries({ queryKey: queryKeys.upsell.tracking(variables.offerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.upsell.analytics({}) });
    },
  });
};

// Utility hooks
export const useUpsellManager = () => {
  const { data: offers } = useUpsellOffers({});
  const trackEvent = useTrackUpsellEvent();
  const acceptOffer = useAcceptUpsellOffer();
  const dismissOffer = useDismissUpsellOffer();

  const getEligibleOffers = (params: UpsellOfferParams) => {
    if (!offers) return [];

    return offers.filter((offer) => {
      // Check if offer is active
      if (!offer.isActive) return false;

      // Check date range
      const now = new Date();
      if (new Date(offer.startDate) > now) return false;
      if (offer.endDate && new Date(offer.endDate) < now) return false;

      // Check target audience
      if (offer.targetAudience === "non-members" && params.membershipType) return false;
      if (offer.targetAudience === "members" && !params.membershipType) return false;

      // Check conditions
      if (offer.conditions.minCartValue && (params.cartValue || 0) < offer.conditions.minCartValue) return false;
      if (offer.conditions.maxCartValue && (params.cartValue || 0) > offer.conditions.maxCartValue) return false;

      return true;
    });
  };

  const trackImpression = (offerId: string, userId?: string, metadata?: Record<string, unknown>) => {
    trackEvent.mutate({
      offerId,
      userId,
      sessionId: "current-session", // This should be generated properly
      event: "impression",
      metadata,
    });
  };

  const trackClick = (offerId: string, userId?: string, metadata?: Record<string, unknown>) => {
    trackEvent.mutate({
      offerId,
      userId,
      sessionId: "current-session",
      event: "click",
      metadata,
    });
  };

  const handleAcceptOffer = (offerId: string, userId?: string, metadata?: Record<string, unknown>) => {
    trackClick(offerId, userId, metadata);
    acceptOffer.mutate({ offerId, userId, metadata });
  };

  const handleDismissOffer = (offerId: string, userId?: string, reason?: string) => {
    dismissOffer.mutate({ offerId, userId, reason });
  };

  return {
    offers,
    getEligibleOffers,
    trackImpression,
    trackClick,
    handleAcceptOffer,
    handleDismissOffer,
    isLoading: trackEvent.isPending || acceptOffer.isPending || dismissOffer.isPending,
  };
};

export const useUpsellPrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchUpsellOffers = (params: UpsellOfferParams) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.upsell.offers(params),
      queryFn: async () => {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
          }
        });

        const response = await apiGet<{ success: boolean; data: UpsellOffer[] }>(
          `/api/upsell/offers?${queryParams.toString()}`
        );
        return response.data;
      },
      staleTime: 1 * 60 * 1000,
    });
  };

  return { prefetchUpsellOffers };
};
