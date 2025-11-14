import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

// Interface for active period data from API
interface ActivePeriod {
  isActive: boolean;
  source: "subscription" | "one-time" | "mini-draw" | "upsell" | null;
  packageName: string | null;
  endsAt: Date | null;
  daysRemaining: number;
  hoursRemaining: number;
}

// Interface for queued item data from API
interface QueuedItem {
  packageName: string;
  packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
  daysOfAccess: number;
  hoursOfAccess: number;
  purchaseDate: Date;
  queuePosition: number;
  expiryDate: Date;
}

// Interface for queue summary from API
interface QueueSummary {
  activePeriod: ActivePeriod;
  queuedItems: QueuedItem[];
  totalQueuedDays: number;
  totalQueuedItems: number;
  summary: {
    hasActiveAccess: boolean;
    hasQueuedItems: boolean;
    nextActivationDate: Date | null;
    totalDaysOfAccessRemaining: number;
    isActiveSubscription: boolean;
    subscriptionBenefits?: {
      shopDiscountPercent: number;
      packageName: string;
      subscriptionType: string;
    };
  };
}

// API response interface
interface PartnerDiscountQueueResponse {
  success: boolean;
  data: QueueSummary;
  error?: string;
}

// Fetch function for partner discount queue
const fetchPartnerDiscountQueue = async (): Promise<QueueSummary> => {
  const response = await fetch("/api/partner-discount/queue");

  if (!response.ok) {
    throw new Error("Failed to fetch partner discount queue");
  }

  const result: PartnerDiscountQueueResponse = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Unknown error");
  }

  return result.data;
};

// Custom hook for partner discount queue
export const usePartnerDiscountQueue = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["partnerDiscountQueue"],
    queryFn: fetchPartnerDiscountQueue,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Invalidate and refetch function
  const refetchQueue = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["partnerDiscountQueue"] });
  }, [queryClient]);

  // Optimistic update function
  const addOptimisticQueueItem = (packageData: {
    packageName: string;
    packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
    discountDays: number;
    discountHours: number;
  }) => {
    if (!query.data) return;

    const optimisticItem: QueuedItem = {
      packageName: packageData.packageName,
      packageType: packageData.packageType,
      daysOfAccess: packageData.discountDays,
      hoursOfAccess: packageData.discountHours,
      purchaseDate: new Date(),
      queuePosition: query.data.totalQueuedItems + 1,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 12 months from now
    };

    // Update cache optimistically
    queryClient.setQueryData(["partnerDiscountQueue"], {
      ...query.data,
      queuedItems: [...query.data.queuedItems, optimisticItem],
      totalQueuedDays: query.data.totalQueuedDays + packageData.discountDays,
      totalQueuedItems: query.data.totalQueuedItems + 1,
      summary: {
        ...query.data.summary,
        hasQueuedItems: true,
        totalDaysOfAccessRemaining: query.data.summary.totalDaysOfAccessRemaining + packageData.discountDays,
      },
    });

    // Refetch real data in background
    setTimeout(() => {
      refetchQueue();
    }, 1000);
  };

  return {
    ...query,
    refetchQueue,
    addOptimisticQueueItem,
  };
};

// Export types for use in components
export type { QueueSummary, ActivePeriod, QueuedItem };
