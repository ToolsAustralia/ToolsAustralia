/**
 * Upsell React Query hooks
 *
 * This file contains all hooks for upsell data fetching and mutations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { apiGet, apiPost } from "@/lib/queries";
import { upsellPackages } from "@/data/upsellPackages";

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

  return useMutation({
    mutationFn: async ({
      offerId,
      useDefaultPayment,
      paymentMethodId,
      originalPurchaseContext,
    }: {
      offerId: string;
      useDefaultPayment: boolean;
      paymentMethodId?: string;
      userId: string;
      originalPurchaseContext?: { miniDrawId?: string; miniDrawName?: string };
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
        ...(originalPurchaseContext && { originalPurchaseContext }),
      });
      return response;
    },
    onMutate: async ({ offerId, userId }) => {
      const actualUserId = userId;
      console.log("🔥 ONMUTATE TRIGGERED: Upsell purchase starting", { offerId });

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

      // Get the upsell package data to calculate optimistic updates
      // Use static data since upsell packages are not loaded in React Query cache
      const selectedPackage = upsellPackages.find((pkg) => pkg.id === offerId);
      console.log("🔍 DEBUG: Upsell packages from static data:", upsellPackages);
      console.log("🔍 DEBUG: Looking for offerId:", offerId);
      console.log("🔍 DEBUG: Selected package found:", selectedPackage);

      if (selectedPackage) {
        // Upsells are NOT included in the promo system
        // Only "one-time-packages" and "mini-packages" have promos
        const entryCount = selectedPackage.entriesCount || 0;
        console.log(`🚀 OPTIMISTIC UPDATE: Adding ${entryCount} entries from upsell`);

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
            oneTimeEntries: ((oldData.oneTimeEntries as number) || 0) + entryCount,
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
      console.log(`🎉 PAYMENT SUCCESS: Upsell purchase completed`);

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

      // Invalidate queries to sync with server
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.current });
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(actualUserId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account("current-user") });
    },
    onError: (error, variables, context) => {
      console.error("Failed to purchase upsell:", error);

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

export const useAcceptUpsellOffer = () => {
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.all("current-user") });
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
