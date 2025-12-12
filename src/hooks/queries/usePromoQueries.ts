import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BonusEntryPromo,
  BonusEntryPromoType,
  CreateBonusEntryPromoPayload,
  UpdateBonusEntryPromoPayload,
  BonusEntryPromoListResponse,
  BonusEntryPromoResponse,
} from "@/types/admin";

// Types
export type PromoType = "membership-packages" | "one-time-packages" | "mini-packages";

export interface ActivePromo {
  id: string;
  type: PromoType;
  multiplier: 2 | 3 | 5 | 10;
  startDate: string;
  endDate: string;
  duration: number;
  isActive: boolean;
  timeRemaining: number; // in milliseconds (not used in toggle system, kept for backward compatibility)
  isExpired: boolean; // not used in toggle system, kept for backward compatibility
  createdAt?: string;
  createdBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

// PromoHistory interface removed - history tracking no longer used in toggle system

// CreatePromoData interface removed - replaced with TogglePromoData

export interface TogglePromoData {
  type: PromoType;
  multiplier: 2 | 3 | 5 | 10 | null; // 2x, 3x, 5x, 10x, or null (OFF)
}

// API functions
const fetchActivePromos = async (): Promise<ActivePromo[]> => {
  const response = await fetch("/api/admin/promo/active", {
    method: "POST", // Using POST for public access
  });

  if (!response.ok) {
    throw new Error("Failed to fetch active promos");
  }

  const result = await response.json();
  return result.data || [];
};

const fetchAdminActivePromos = async (): Promise<ActivePromo[]> => {
  const response = await fetch("/api/admin/promo/active", {
    method: "GET", // Using GET for admin access
  });

  if (!response.ok) {
    throw new Error("Failed to fetch admin active promos");
  }

  const result = await response.json();
  return result.data || [];
};

// createPromo and endPromo functions removed - replaced with togglePromo in toggle system
// fetchPromoHistory function removed - history tracking no longer used in toggle system

const togglePromo = async (
  data: TogglePromoData
): Promise<{ success: boolean; data?: ActivePromo | null; message: string }> => {
  const response = await fetch("/api/admin/promo/toggle", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to toggle promo");
  }

  return result;
};

// React Query hooks
export const useActivePromos = () => {
  return useQuery({
    queryKey: ["promos", "active"],
    queryFn: fetchActivePromos,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refetch every 30 seconds for countdown accuracy
    refetchIntervalInBackground: true, // Continue refetching even when tab is not active
  });
};

export const useAdminActivePromos = () => {
  return useQuery({
    queryKey: ["promos", "admin", "active"],
    queryFn: fetchAdminActivePromos,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refetch every 30 seconds for countdown accuracy
    refetchIntervalInBackground: true, // Continue refetching even when tab is not active
  });
};

export const usePromoMultiplier = (packageType: "membership" | "one-time" | "mini") => {
  const { data: promos } = useActivePromos();

  if (!promos || promos.length === 0) {
    return 1; // No active promo
  }

  // Find active promo for the package type (updated for toggle system - no expiration check)
  const promoType =
    packageType === "membership"
      ? "membership-packages"
      : packageType === "one-time"
      ? "one-time-packages"
      : "mini-packages";
  const activePromo = promos.find((promo) => promo.type === promoType && promo.isActive);

  return activePromo ? activePromo.multiplier : 1;
};

export const usePromoByType = (type: PromoType) => {
  const { data: promos, ...rest } = useActivePromos();

  // Updated for toggle system - no expiration check
  const promo = promos?.find((p) => p.type === type && p.isActive) || null;

  return {
    data: promo,
    ...rest,
  };
};

// useCreatePromo hook removed - replaced with useTogglePromo

export const useTogglePromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: togglePromo,
    onSuccess: () => {
      // Invalidate and refetch all promo-related queries
      queryClient.invalidateQueries({ queryKey: ["promos", "active"] });
      queryClient.invalidateQueries({ queryKey: ["promos", "admin", "active"] });
    },
  });
};

// useEndPromo hook removed - replaced with useTogglePromo (toggle to null to turn off)

// usePromoHistory hook removed - history tracking no longer used in toggle system

// Utility hook to get the highest priority promo for banner display
export const useHighestPriorityPromo = () => {
  const { data: promos } = useActivePromos();

  if (!promos || promos.length === 0) {
    return null;
  }

  // Sort by multiplier (highest first) and return the first active promo (updated for toggle system)
  const sortedPromos = promos.filter((promo) => promo.isActive).sort((a, b) => b.multiplier - a.multiplier);

  return sortedPromos[0] || null;
};

// Utility hook to format time remaining
export const useFormattedTimeRemaining = (timeRemaining: number) => {
  const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

  return {
    days,
    hours,
    minutes,
    seconds,
    formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
    shortFormatted: days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`,
  };
};

// ========================================
// BONUS ENTRY PROMO HOOKS
// ========================================

// API functions for bonus entry promos
const fetchBonusEntryPromos = async (filters?: {
  type?: BonusEntryPromoType;
  isActive?: boolean;
}): Promise<BonusEntryPromo[]> => {
  const params = new URLSearchParams();
  if (filters?.type) params.append("type", filters.type);
  if (filters?.isActive !== undefined) params.append("isActive", String(filters.isActive));

  const response = await fetch(`/api/admin/promo/bonus-entry/list?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch bonus entry promos");
  }

  const result: BonusEntryPromoListResponse = await response.json();
  return result.data || [];
};

const fetchActiveBonusEntryPromo = async (type: BonusEntryPromoType): Promise<BonusEntryPromo | null> => {
  const response = await fetch(`/api/admin/promo/bonus-entry/active?type=${type}`);

  if (!response.ok) {
    throw new Error("Failed to fetch active bonus entry promo");
  }

  const result: BonusEntryPromoResponse = await response.json();
  return result.data || null;
};

const createBonusEntryPromo = async (
  data: CreateBonusEntryPromoPayload
): Promise<{ success: boolean; data?: BonusEntryPromo; message: string }> => {
  const response = await fetch("/api/admin/promo/bonus-entry/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to create bonus entry promo");
  }

  return result;
};

const updateBonusEntryPromo = async (
  id: string,
  data: UpdateBonusEntryPromoPayload
): Promise<{ success: boolean; data?: BonusEntryPromo; message: string }> => {
  const response = await fetch(`/api/admin/promo/bonus-entry/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to update bonus entry promo");
  }

  return result;
};

const deleteBonusEntryPromo = async (id: string): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`/api/admin/promo/bonus-entry/${id}`, {
    method: "DELETE",
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to delete bonus entry promo");
  }

  return result;
};

// React Query hooks for bonus entry promos
export const useBonusEntryPromos = (filters?: { type?: BonusEntryPromoType; isActive?: boolean }) => {
  return useQuery({
    queryKey: ["bonus-entry-promos", filters],
    queryFn: () => fetchBonusEntryPromos(filters),
    staleTime: 30000, // 30 seconds
  });
};

export const useActiveBonusEntryPromo = (type: BonusEntryPromoType) => {
  return useQuery({
    queryKey: ["bonus-entry-promos", "active", type],
    queryFn: () => fetchActiveBonusEntryPromo(type),
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refetch every 30 seconds to check if promo is still active
  });
};

export const useCreateBonusEntryPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createBonusEntryPromo,
    onSuccess: () => {
      // Invalidate and refetch all bonus entry promo queries
      queryClient.invalidateQueries({ queryKey: ["bonus-entry-promos"] });
    },
  });
};

export const useUpdateBonusEntryPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBonusEntryPromoPayload }) => updateBonusEntryPromo(id, data),
    onSuccess: () => {
      // Invalidate and refetch all bonus entry promo queries
      queryClient.invalidateQueries({ queryKey: ["bonus-entry-promos"] });
    },
  });
};

export const useDeleteBonusEntryPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteBonusEntryPromo,
    onSuccess: () => {
      // Invalidate and refetch all bonus entry promo queries
      queryClient.invalidateQueries({ queryKey: ["bonus-entry-promos"] });
    },
  });
};
