import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type {
  BonusEntryPromo,
  CreateBonusEntryPromoPayload,
  UpdateBonusEntryPromoPayload,
  EffectiveForBannerResponse,
  PromoLink,
  CreatePromoLinkPayload,
  UpdatePromoLinkPayload,
} from "@/types/admin";
import type { PromoMultiplier } from "@/types/promo-multiplier";
import { useCurrentAlternatingMultipliers } from "./useAlternatingMultiplierQueries";

// Types
export interface ActivePromo {
  id: string;
  type: "one-time-packages" | "mini-packages" | "membership-packages";
  multiplier: PromoMultiplier;
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
  type: "one-time-packages" | "mini-packages" | "membership-packages";
  multiplier: PromoMultiplier | null;
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
    refetchIntervalInBackground: false, // Pause polling on hidden tabs; refetchOnWindowFocus catches up on tab focus
  });
};

export const useAdminActivePromos = () => {
  return useQuery({
    queryKey: ["promos", "admin", "active"],
    queryFn: fetchAdminActivePromos,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refetch every 30 seconds for countdown accuracy
    refetchIntervalInBackground: false, // Pause polling on hidden tabs; refetchOnWindowFocus catches up on tab focus
  });
};

export const usePromoMultiplier = (packageType: "one-time" | "mini") => {
  const { data: promos } = useActivePromos();

  if (!promos || promos.length === 0) {
    return 1; // No active promo
  }

  // Find active promo for the package type (updated for toggle system - no expiration check)
  const promoType = packageType === "one-time" ? "one-time-packages" : "mini-packages";
  const activePromo = promos.find((promo) => promo.type === promoType && promo.isActive);

  return activePromo ? activePromo.multiplier : 1;
};

export const usePromoByType = (type: "one-time-packages" | "mini-packages" | "membership-packages") => {
  const { data: promos, ...rest } = useActivePromos();

  // Updated for toggle system - no expiration check
  const promo = promos?.find((p) => p.type === type && p.isActive) || null;

  return {
    data: promo,
    ...rest,
  };
};

/**
 * Resolve multiplier using server hierarchy: Scheduled > Toggle > Alternating > null.
 * Uses GET /api/promo/alternating-multiplier/current (effective multipliers) as single source of truth
 * so client always matches server resolution.
 * @param type - Package type (full form: "membership-packages" | "one-time-packages" | "mini-packages")
 * @param context - "display" or "payment" (both return null if no promo, no defaults)
 * @returns Resolved multiplier or null if no active/alternating promo
 */
export const useResolvedMultiplier = (
  type: "one-time-packages" | "mini-packages" | "membership-packages",
  _context: "display" | "payment" = "display"
): number | null => {
  const { data: currentEffective } = useCurrentAlternatingMultipliers();

  return useMemo(() => {
    const effective = currentEffective?.data?.[type];
    if (effective !== null && effective !== undefined && effective > 0) {
      return effective;
    }
    return null;
  }, [currentEffective, type]); // context unused in body; omit to satisfy exhaustive-deps
};

const fetchEffectiveForBanner = async (): Promise<EffectiveForBannerResponse["data"]> => {
  const response = await fetch("/api/promo/effective-for-banner", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to fetch effective for banner");
  const result: EffectiveForBannerResponse = await response.json();
  return result.data;
};

/**
 * Effective multiplier + source + scheduled meta for banner (current tab uses one type).
 * Use this in PromoBanner for countdown mode and badge; other components keep useResolvedMultiplier.
 */
export const useEffectiveForBanner = () => {
  return useQuery({
    queryKey: ["promo", "effective-for-banner"],
    queryFn: fetchEffectiveForBanner,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false, // Pause polling on hidden tabs; refetchOnWindowFocus catches up on tab focus
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
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
      // Also invalidate alternating multiplier query since it depends on active promos
      queryClient.invalidateQueries({ queryKey: ["alternating-multiplier", "current"] });
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

const fetchBonusEntryPromos = async (filters?: {
  type?: "membership-packages" | "one-time-packages" | "mini-packages";
  isActive?: boolean;
}): Promise<BonusEntryPromo[]> => {
  const params = new URLSearchParams();
  if (filters?.type) params.append("type", filters.type);
  if (filters?.isActive !== undefined) params.append("isActive", String(filters.isActive));

  const response = await fetch(`/api/admin/promo/bonus-entry/list?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch bonus entry promos");
  }

  const result = await response.json();
  return result.data || [];
};

const createBonusEntryPromo = async (data: CreateBonusEntryPromoPayload): Promise<BonusEntryPromo> => {
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

  return result.data;
};

const updateBonusEntryPromo = async ({
  id,
  data,
}: {
  id: string;
  data: UpdateBonusEntryPromoPayload;
}): Promise<BonusEntryPromo> => {
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

  return result.data;
};

const deleteBonusEntryPromo = async (id: string): Promise<void> => {
  const response = await fetch(`/api/admin/promo/bonus-entry/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to delete bonus entry promo");
  }
};

export const useBonusEntryPromos = (filters?: {
  type?: "membership-packages" | "one-time-packages" | "mini-packages";
  isActive?: boolean;
}) => {
  return useQuery({
    queryKey: ["bonus-entry-promos", filters],
    queryFn: () => fetchBonusEntryPromos(filters),
    staleTime: 30000, // 30 seconds
  });
};

export const useCreateBonusEntryPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createBonusEntryPromo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bonus-entry-promos"] });
    },
  });
};

export const useUpdateBonusEntryPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateBonusEntryPromo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bonus-entry-promos"] });
    },
  });
};

export const useDeleteBonusEntryPromo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteBonusEntryPromo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bonus-entry-promos"] });
    },
  });
};

// ========================================
// PROMO LINK HOOKS
// ========================================

const fetchPromoLinks = async (filters?: { isActive?: boolean; expired?: boolean }): Promise<PromoLink[]> => {
  const params = new URLSearchParams();
  if (filters?.isActive !== undefined) params.append("isActive", String(filters.isActive));
  if (filters?.expired !== undefined) params.append("expired", String(filters.expired));

  const response = await fetch(`/api/admin/promo/link/list?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch promo links");
  }

  const result = await response.json();
  return result.data || [];
};

const createPromoLink = async (data: CreatePromoLinkPayload): Promise<PromoLink> => {
  const response = await fetch("/api/admin/promo/link/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to create promo link");
  }

  return result.data;
};

const updatePromoLink = async ({ id, data }: { id: string; data: UpdatePromoLinkPayload }): Promise<PromoLink> => {
  const response = await fetch(`/api/admin/promo/link/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to update promo link");
  }

  return result.data;
};

const deletePromoLink = async (id: string): Promise<void> => {
  const response = await fetch(`/api/admin/promo/link/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to delete promo link");
  }
};

export const usePromoLinks = (filters?: { isActive?: boolean; expired?: boolean }) => {
  return useQuery({
    queryKey: ["promo-links", filters],
    queryFn: () => fetchPromoLinks(filters),
    staleTime: 30000, // 30 seconds
  });
};

export const useCreatePromoLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPromoLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promo-links"] });
    },
  });
};

export const useUpdatePromoLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePromoLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promo-links"] });
    },
  });
};

export const useDeletePromoLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePromoLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promo-links"] });
    },
  });
};
